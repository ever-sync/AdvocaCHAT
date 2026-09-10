-- Assignee + transfer history for whatsapp_chats (CRM team isolation)
--
-- Role 'atendimento' can only see chats where assignee_id = auth.uid()
-- or assignee_id IS NULL (unassigned pool).
-- Other roles (admin, operacao, financeiro) see all tenant chats.

-- 1. Assignee columns on whatsapp_chats
alter table public.whatsapp_chats
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references public.profiles(id) on delete set null;

create index if not exists whatsapp_chats_assignee_idx
  on public.whatsapp_chats (tenant_id, assignee_id)
  where assignee_id is not null;

-- 2. Transfer history
create table if not exists public.chat_transfers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  chat_id       uuid not null references public.whatsapp_chats(id) on delete cascade,
  from_user_id  uuid references public.profiles(id) on delete set null,
  to_user_id    uuid not null references public.profiles(id) on delete cascade,
  transferred_by uuid not null references public.profiles(id) on delete cascade,
  reason        text,
  transferred_at timestamptz not null default timezone('utc', now())
);

create index if not exists chat_transfers_chat_idx
  on public.chat_transfers (chat_id, transferred_at desc);

alter table public.chat_transfers enable row level security;

create policy "chat_transfers_same_tenant_select"
on public.chat_transfers for select
using (public.is_same_tenant(tenant_id));

create policy "chat_transfers_same_tenant_insert"
on public.chat_transfers for insert
with check (public.is_same_tenant(tenant_id));

-- 3. Helper: current user role (stable, cached per transaction)
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1
$$;

-- 4. Update SELECT RLS for whatsapp_chats:
--    atendimento: only assigned-to-me OR unassigned
--    other roles: all same-tenant chats
drop policy if exists "whatsapp_chats_same_tenant_select" on public.whatsapp_chats;
create policy "whatsapp_chats_same_tenant_select"
on public.whatsapp_chats for select
using (
  public.is_same_tenant(tenant_id)
  and (
    public.current_user_role() != 'atendimento'
    or assignee_id is null
    or assignee_id = auth.uid()
  )
);

-- 5. RPC: assign_chat — manual assignment by admin/operacao/financeiro
create or replace function public.assign_chat(
  p_chat_id    uuid,
  p_assignee_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role        text;
  v_tenant      uuid;
  v_chat_tenant uuid;
  v_prev        uuid;
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

  if v_prev is distinct from p_assignee_id then
    insert into public.chat_transfers (
      tenant_id, chat_id, from_user_id, to_user_id, transferred_by, reason
    ) values (
      v_tenant, p_chat_id, v_prev, p_assignee_id, auth.uid(), p_reason
    );
  end if;

  update public.whatsapp_chats
  set assignee_id = p_assignee_id,
      assigned_at = timezone('utc', now()),
      assigned_by = auth.uid()
  where id = p_chat_id;
end;
$$;

grant execute on function public.assign_chat(uuid, uuid, text) to authenticated;

-- 6. RPC: unassign_chat — remove assignee (admin/operacao/financeiro)
create or replace function public.unassign_chat(p_chat_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role        text;
  v_tenant      uuid;
  v_chat_tenant uuid;
  v_prev        uuid;
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

  if v_prev is not null then
    insert into public.chat_transfers (
      tenant_id, chat_id, from_user_id, to_user_id, transferred_by, reason
    ) values (
      v_tenant, p_chat_id, v_prev, auth.uid(), auth.uid(),
      coalesce(p_reason, 'unassigned')
    );
  end if;

  update public.whatsapp_chats
  set assignee_id = null,
      assigned_at = null,
      assigned_by = null
  where id = p_chat_id;
end;
$$;

grant execute on function public.unassign_chat(uuid, text) to authenticated;

-- 7. RPC: auto_assign_chat — round-robin by fewest open chats
create or replace function public.auto_assign_chat(p_chat_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role        text;
  v_tenant      uuid;
  v_chat_tenant uuid;
  v_prev        uuid;
  v_next        uuid;
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

  -- pick atendimento with fewest open assigned chats; tie-break by created_at (oldest first)
  select p.id into v_next
  from public.profiles p
  left join public.whatsapp_chats wc
    on wc.assignee_id = p.id
    and wc.tenant_id = v_tenant
    and wc.status = 'open'
  where p.tenant_id = v_tenant
    and p.role = 'atendimento'
    and p.status = 'active'
  group by p.id, p.created_at
  order by count(wc.id) asc, p.created_at asc
  limit 1;

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

grant execute on function public.auto_assign_chat(uuid) to authenticated;

-- 8. RPC: list_atendimento_users — for the assign dropdown
create or replace function public.list_atendimento_users()
returns table(id uuid, nome text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome, p.email
  from public.profiles p
  where p.tenant_id = public.current_tenant_id()
    and p.role = 'atendimento'
    and p.status = 'active'
  order by p.nome;
$$;

grant execute on function public.list_atendimento_users() to authenticated;
