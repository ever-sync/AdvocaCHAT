-- Fila de atendimento: configuração por tenant e pool de atendentes elegíveis.

alter table public.tenant_settings
  add column if not exists queue_max_open_chats_per_attendant integer
    check (queue_max_open_chats_per_attendant is null or queue_max_open_chats_per_attendant > 0),
  add column if not exists queue_distribution_strategy text not null default 'least_open_chats'
    check (queue_distribution_strategy in ('least_open_chats', 'round_robin'));

comment on column public.tenant_settings.queue_max_open_chats_per_attendant is
  'Limite global de conversas abertas por atendente na fila automática (null = sem limite).';
comment on column public.tenant_settings.queue_distribution_strategy is
  'least_open_chats: menor carga; round_robin: desempate por antiguidade do perfil.';

create table if not exists public.chat_queue_attendants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  max_open_chats integer check (max_open_chats is null or max_open_chats > 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, profile_id)
);

create index if not exists chat_queue_attendants_tenant_idx
  on public.chat_queue_attendants (tenant_id, enabled);

alter table public.chat_queue_attendants enable row level security;

drop policy if exists "chat_queue_attendants_select" on public.chat_queue_attendants;
create policy "chat_queue_attendants_select"
on public.chat_queue_attendants for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'view')
);

drop policy if exists "chat_queue_attendants_insert" on public.chat_queue_attendants;
create policy "chat_queue_attendants_insert"
on public.chat_queue_attendants for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
);

drop policy if exists "chat_queue_attendants_update" on public.chat_queue_attendants;
create policy "chat_queue_attendants_update"
on public.chat_queue_attendants for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "chat_queue_attendants_delete" on public.chat_queue_attendants;
create policy "chat_queue_attendants_delete"
on public.chat_queue_attendants for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
);

-- Escolhe próximo atendente elegível na fila (pool explícito ou todos os atendentes ativos).
create or replace function public.pick_queue_assignee(p_tenant_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_max_global integer;
  v_strategy text;
  v_has_pool boolean;
begin
  select
    ts.queue_max_open_chats_per_attendant,
    coalesce(ts.queue_distribution_strategy, 'least_open_chats')
  into v_max_global, v_strategy
  from public.tenant_settings ts
  where ts.tenant_id = p_tenant_id;

  select exists (
    select 1 from public.chat_queue_attendants cqa
    where cqa.tenant_id = p_tenant_id
      and cqa.enabled = true
  ) into v_has_pool;

  if v_strategy = 'round_robin' then
    return (
      select p.id
      from public.profiles p
      left join public.chat_queue_attendants cqa
        on cqa.tenant_id = p_tenant_id
        and cqa.profile_id = p.id
      left join public.whatsapp_chats wc
        on wc.assignee_id = p.id
        and wc.tenant_id = p_tenant_id
        and wc.status = 'open'
      where p.tenant_id = p_tenant_id
        and p.role = 'atendimento'
        and p.status = 'active'
        and (not v_has_pool or (cqa.enabled = true))
        group by p.id, p.created_at, cqa.max_open_chats
        having count(wc.id) < coalesce(cqa.max_open_chats, v_max_global, 2147483647)
        order by count(wc.id) asc, p.created_at asc
        limit 1
    );
  end if;

  return (
    select p.id
    from public.profiles p
    left join public.chat_queue_attendants cqa
      on cqa.tenant_id = p_tenant_id
      and cqa.profile_id = p.id
    left join public.whatsapp_chats wc
      on wc.assignee_id = p.id
      and wc.tenant_id = p_tenant_id
      and wc.status = 'open'
    where p.tenant_id = p_tenant_id
      and p.role = 'atendimento'
      and p.status = 'active'
      and (not v_has_pool or (cqa.enabled = true))
    group by p.id, cqa.max_open_chats
    having count(wc.id) < coalesce(cqa.max_open_chats, v_max_global, 2147483647)
    order by count(wc.id) asc, p.created_at asc
    limit 1
  );
end;
$$;

grant execute on function public.pick_queue_assignee(uuid) to authenticated, service_role;

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

create or replace function public.auto_assign_chat(p_chat_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_tenant uuid;
  v_chat_tenant uuid;
  v_prev uuid;
  v_next uuid;
begin
  select role, tenant_id into v_role, v_tenant
  from public.profiles where id = auth.uid();

  if v_role not in ('admin', 'operacao', 'financeiro') then
    raise exception 'Permissão negada';
  end if;

  select tenant_id, assignee_id into v_chat_tenant, v_prev
  from public.whatsapp_chats where id = p_chat_id;

  if v_chat_tenant is null or v_chat_tenant != v_tenant then
    raise exception 'Chat não encontrado';
  end if;

  v_next := public.pick_queue_assignee(v_tenant);

  if v_next is null then
    return null;
  end if;

  if v_prev is distinct from v_next then
    insert into public.chat_transfers (
      tenant_id, chat_id, from_user_id, to_user_id, transferred_by, reason
    ) values (
      v_tenant, p_chat_id, v_prev, v_next, auth.uid(), 'auto_round_robin'
    );
  end if;

  update public.whatsapp_chats
  set assignee_id = v_next,
      assigned_at = timezone('utc', now()),
      assigned_by = auth.uid()
  where id = p_chat_id;

  return v_next;
end;
$$;

-- Carga atual por atendente (gestor configura a fila).
create or replace function public.list_chat_queue_workload()
returns table (
  profile_id uuid,
  nome text,
  email text,
  open_chats bigint,
  in_queue boolean,
  queue_enabled boolean,
  max_open_chats integer
)
language sql
stable
security definer
set search_path = public
as $$
  with tenant as (
    select public.current_tenant_id() as id
  ),
  pool as (
    select cqa.profile_id, cqa.enabled, cqa.max_open_chats
    from public.chat_queue_attendants cqa
    cross join tenant t
    where cqa.tenant_id = t.id
  )
  select
    p.id as profile_id,
    p.nome,
    p.email,
    count(wc.id) filter (where wc.status = 'open') as open_chats,
    exists (select 1 from pool po where po.profile_id = p.id) as in_queue,
    coalesce((select po.enabled from pool po where po.profile_id = p.id), false) as queue_enabled,
    (select po.max_open_chats from pool po where po.profile_id = p.id) as max_open_chats
  from public.profiles p
  cross join tenant t
  left join public.whatsapp_chats wc
    on wc.assignee_id = p.id
    and wc.tenant_id = t.id
  where p.tenant_id = t.id
    and p.role = 'atendimento'
    and p.status = 'active'
  group by p.id, p.nome, p.email
  order by open_chats desc, p.nome asc;
$$;

grant execute on function public.list_chat_queue_workload() to authenticated;
