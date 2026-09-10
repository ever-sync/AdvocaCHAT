-- Tighten atendimento visibility + allow seller-to-seller transfer.
-- Business rule:
-- - atendimento only sees chats assigned to themselves
-- - atendimento can transfer only their own chat to another atendimento

-- 1) Tighten whatsapp_chats SELECT policy for atendimento.
drop policy if exists "whatsapp_chats_same_tenant_select" on public.whatsapp_chats;
create policy "whatsapp_chats_same_tenant_select"
on public.whatsapp_chats
for select
using (
  public.is_same_tenant(tenant_id)
  and (
    public.current_user_role() != 'atendimento'
    or assignee_id = auth.uid()
  )
);

-- 2) Keep chat-tags junction aligned with the same visibility rule.
drop policy if exists "whatsapp_chat_tags_select" on public.whatsapp_chat_tags;
create policy "whatsapp_chat_tags_select"
on public.whatsapp_chat_tags
for select
using (
  exists (
    select 1
    from public.whatsapp_chats wc
    where wc.id = chat_id
      and public.is_same_tenant(wc.tenant_id)
      and (
        public.current_user_role() != 'atendimento'
        or wc.assignee_id = auth.uid()
      )
  )
  and exists (
    select 1
    from public.chat_tags ct
    where ct.id = tag_id
      and (ct.scope = 'global' or ct.created_by = auth.uid())
  )
);

drop policy if exists "whatsapp_chat_tags_insert" on public.whatsapp_chat_tags;
create policy "whatsapp_chat_tags_insert"
on public.whatsapp_chat_tags
for insert
with check (
  exists (
    select 1
    from public.whatsapp_chats wc
    where wc.id = chat_id
      and public.is_same_tenant(wc.tenant_id)
      and (
        public.current_user_role() != 'atendimento'
        or wc.assignee_id = auth.uid()
      )
  )
  and exists (
    select 1
    from public.chat_tags ct
    where ct.id = tag_id
      and public.is_same_tenant(ct.tenant_id)
      and (ct.scope = 'global' or ct.created_by = auth.uid())
  )
);

-- 3) Replace assign_chat to allow vendedor-to-vendedor transfer with constraints.
create or replace function public.assign_chat(
  p_chat_id uuid,
  p_assignee_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_actor_tenant uuid;
  v_chat_tenant uuid;
  v_prev uuid;
  v_target_role text;
  v_target_tenant uuid;
  v_target_status text;
begin
  select role, tenant_id
    into v_actor_role, v_actor_tenant
  from public.profiles
  where id = auth.uid();

  if v_actor_role is null then
    raise exception 'Permissão negada';
  end if;

  select tenant_id, assignee_id
    into v_chat_tenant, v_prev
  from public.whatsapp_chats
  where id = p_chat_id;

  if v_chat_tenant is null or v_chat_tenant != v_actor_tenant then
    raise exception 'Chat não encontrado';
  end if;

  -- atendimento can only transfer chats that are currently assigned to themselves.
  if v_actor_role = 'atendimento' and v_prev is distinct from auth.uid() then
    raise exception 'Permissão negada';
  end if;

  if v_actor_role not in ('admin', 'operacao', 'financeiro', 'atendimento') then
    raise exception 'Permissão negada';
  end if;

  -- target assignee must be an active atendimento in the same tenant.
  select role, tenant_id, status
    into v_target_role, v_target_tenant, v_target_status
  from public.profiles
  where id = p_assignee_id;

  if v_target_tenant is null or v_target_tenant != v_actor_tenant then
    raise exception 'Atendente destino inválido';
  end if;
  if v_target_role != 'atendimento' or v_target_status != 'active' then
    raise exception 'Atendente destino inválido';
  end if;

  if v_prev is distinct from p_assignee_id then
    insert into public.chat_transfers (
      tenant_id, chat_id, from_user_id, to_user_id, transferred_by, reason
    )
    values (
      v_actor_tenant, p_chat_id, v_prev, p_assignee_id, auth.uid(), p_reason
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
