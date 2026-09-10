-- Atendentes responsáveis por instância do WhatsApp + distribuição round-robin.
-- Configurado em Configurações → Integrações → (card da instância) → Configurações.
-- Quando chega um chat numa instância com atendentes configurados, ele é
-- distribuído em rodízio (round-robin) entre eles — ignora disponibilidade
-- (sempre os selecionados). Instância SEM atendentes → chat fica no pool.

-- ──────────────────────────────────────────────────────────────────────────────
-- Tabela
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.whatsapp_instance_attendants (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  instance_id      uuid not null references public.whatsapp_instances(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  last_assigned_at timestamptz,
  created_at       timestamptz not null default timezone('utc', now()),
  unique (instance_id, profile_id)
);

create index if not exists whatsapp_instance_attendants_instance_idx
  on public.whatsapp_instance_attendants (instance_id, last_assigned_at nulls first, created_at);
create index if not exists whatsapp_instance_attendants_tenant_idx
  on public.whatsapp_instance_attendants (tenant_id);

alter table public.whatsapp_instance_attendants enable row level security;

drop policy if exists "wia_select" on public.whatsapp_instance_attendants;
create policy "wia_select"
on public.whatsapp_instance_attendants for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "wia_insert" on public.whatsapp_instance_attendants;
create policy "wia_insert"
on public.whatsapp_instance_attendants for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
);

drop policy if exists "wia_delete" on public.whatsapp_instance_attendants;
create policy "wia_delete"
on public.whatsapp_instance_attendants for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
);

do $$
declare has_tbl boolean;
begin
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'whatsapp_instance_attendants'
  ) into has_tbl;
  if not has_tbl then
    alter publication supabase_realtime add table public.whatsapp_instance_attendants;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- RPC: substituir a seleção de atendentes da instância (gestores)
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.set_instance_attendants(
  p_instance_id uuid,
  p_profile_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_instance_tenant uuid;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then
    raise exception 'Não autenticado';
  end if;
  if not public.has_role_permission(v_tenant, 'configuracoes', 'edit') then
    raise exception 'Sem permissão para configurar atendentes';
  end if;

  select tenant_id into v_instance_tenant
  from public.whatsapp_instances
  where id = p_instance_id;
  if v_instance_tenant is null or v_instance_tenant <> v_tenant then
    raise exception 'Instância inválida';
  end if;

  delete from public.whatsapp_instance_attendants
  where instance_id = p_instance_id and tenant_id = v_tenant;

  insert into public.whatsapp_instance_attendants (tenant_id, instance_id, profile_id)
  select v_tenant, p_instance_id, p.id
  from public.profiles p
  where p.id = any(coalesce(p_profile_ids, '{}'::uuid[]))
    and p.tenant_id = v_tenant
    and p.role = 'atendimento'
  on conflict (instance_id, profile_id) do nothing;
end;
$$;

grant execute on function public.set_instance_attendants(uuid, uuid[]) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- RPC: atribuição round-robin por instância (chamada pelo edge no ingest)
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.auto_assign_instance_chat(p_chat_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_instance uuid;
  v_prev uuid;
  v_next uuid;
begin
  select tenant_id, instance_id, assignee_id
  into v_tenant, v_instance, v_prev
  from public.whatsapp_chats
  where id = p_chat_id;

  -- Já tem dono ou chat inexistente → não mexe.
  if v_tenant is null or v_prev is not null then
    return v_prev;
  end if;

  -- Round-robin: quem recebeu há mais tempo (ou nunca) vai primeiro.
  -- Ignora disponibilidade de propósito (decisão: sempre os selecionados).
  select wia.profile_id
  into v_next
  from public.whatsapp_instance_attendants wia
  join public.profiles p on p.id = wia.profile_id
  where wia.instance_id = v_instance
    and wia.tenant_id = v_tenant
    and p.status = 'active'
  order by wia.last_assigned_at asc nulls first, wia.created_at asc
  limit 1;

  -- Instância sem atendentes elegíveis → fica no pool.
  if v_next is null then
    return null;
  end if;

  update public.whatsapp_chats
  set assignee_id = v_next,
      assigned_at = timezone('utc', now()),
      assigned_by = v_next
  where id = p_chat_id
    and assignee_id is null;

  update public.whatsapp_instance_attendants
  set last_assigned_at = timezone('utc', now())
  where instance_id = v_instance and profile_id = v_next;

  insert into public.chat_transfers (
    tenant_id, chat_id, from_user_id, to_user_id, transferred_by, reason
  ) values (
    v_tenant, p_chat_id, v_prev, v_next, v_next, 'auto_instance_round_robin'
  );

  update public.crm_negotiations n
  set assignee_id = v_next
  from public.whatsapp_chats c
  where c.id = p_chat_id
    and n.id = c.primary_negotiation_id
    and n.assignee_id is null;

  return v_next;
end;
$$;

grant execute on function public.auto_assign_instance_chat(uuid) to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- A auto-atribuição global (auto_assign_on_lead) não deve roubar um chat que já
-- tem dono — assim a atribuição por instância (feita antes, no ingest) prevalece.
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.auto_assign_chat_system(p_chat_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_prev uuid;
  v_next uuid;
  v_auto boolean;
begin
  select tenant_id, assignee_id into v_tenant, v_prev
  from public.whatsapp_chats
  where id = p_chat_id;

  if v_tenant is null then
    return null;
  end if;

  -- Já tem dono (ex.: round-robin por instância) → não reatribui.
  if v_prev is not null then
    return v_prev;
  end if;

  select coalesce(ts.auto_assign_on_lead, false) into v_auto
  from public.tenant_settings ts
  where ts.tenant_id = v_tenant;

  if not v_auto then
    return v_prev;
  end if;

  v_next := public.pick_queue_assignee(v_tenant);

  if v_next is null then
    return null;
  end if;

  if v_prev is distinct from v_next then
    insert into public.chat_transfers (
      tenant_id, chat_id, from_user_id, to_user_id, transferred_by, reason
    ) values (
      v_tenant, p_chat_id, v_prev, v_next, v_next, 'auto_round_robin_system'
    );
  end if;

  update public.whatsapp_chats
  set assignee_id = v_next,
      assigned_at = timezone('utc', now()),
      assigned_by = v_next
  where id = p_chat_id;

  update public.crm_negotiations n
  set assignee_id = v_next
  from public.whatsapp_chats c
  where c.id = p_chat_id
    and n.id = c.primary_negotiation_id
    and n.assignee_id is null;

  return v_next;
end;
$$;
