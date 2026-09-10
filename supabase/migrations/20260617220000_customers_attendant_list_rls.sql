-- Lista /clientes: atendente só vê contatos no pool ou vinculados a si; admin/gestão vê todos.

create or replace function public.customer_blocked_for_assignee_viewer(
  p_customer_id uuid,
  p_viewer_id uuid,
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_customer_id is not null
    and p_viewer_id is not null
    and p_tenant_id is not null
    and exists (
      select 1
      from (
        select n.assignee_id
        from public.crm_negotiations n
        where n.tenant_id = p_tenant_id
          and n.customer_id = p_customer_id
          and n.status = 'em_andamento'

        union all

        select wc.assignee_id
        from public.customers c
        inner join public.whatsapp_chats wc
          on wc.tenant_id = c.tenant_id
         and (
           wc.customer_id = c.id
           or (
             wc.customer_id is null
             and c.phone_jid is not null
             and btrim(c.phone_jid) <> ''
             and wc.remote_jid = c.phone_jid
           )
         )
        where c.tenant_id = p_tenant_id
          and c.id = p_customer_id
      ) links
      where links.assignee_id is not null
        and links.assignee_id is distinct from p_viewer_id
    )
    and not exists (
      select 1
      from (
        select n.assignee_id
        from public.crm_negotiations n
        where n.tenant_id = p_tenant_id
          and n.customer_id = p_customer_id
          and n.status = 'em_andamento'

        union all

        select wc.assignee_id
        from public.customers c
        inner join public.whatsapp_chats wc
          on wc.tenant_id = c.tenant_id
         and (
           wc.customer_id = c.id
           or (
             wc.customer_id is null
             and c.phone_jid is not null
             and btrim(c.phone_jid) <> ''
             and wc.remote_jid = c.phone_jid
           )
         )
        where c.tenant_id = p_tenant_id
          and c.id = p_customer_id
      ) links
      where links.assignee_id is null
        or links.assignee_id = p_viewer_id
    );
$$;

grant execute on function public.customer_blocked_for_assignee_viewer(uuid, uuid, uuid) to authenticated;

create or replace function public.customer_visible_in_attendant_list(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.customer_blocked_for_assignee_viewer(
    p_customer_id,
    auth.uid(),
    public.current_tenant_id()
  );
$$;

grant execute on function public.customer_visible_in_attendant_list(uuid) to authenticated;

-- Mantém RPC do modal de negociação alinhada à mesma regra.
create or replace function public.customer_ids_blocked_for_contact_picker(
  p_customer_ids uuid[],
  p_viewer_id uuid default auth.uid()
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_role text;
begin
  v_tenant := public.current_tenant_id();
  v_role := public.current_user_role();

  if v_tenant is null or p_viewer_id is null then
    return '{}'::uuid[];
  end if;

  if coalesce(array_length(p_customer_ids, 1), 0) = 0 then
    return '{}'::uuid[];
  end if;

  if v_role = 'atendimento' and p_viewer_id is distinct from auth.uid() then
    raise exception 'Acesso negado';
  end if;

  if v_role not in ('admin', 'operacao', 'financeiro', 'atendimento') then
    raise exception 'Acesso negado';
  end if;

  return coalesce(
    (
      select array_agg(c.id)
      from public.customers c
      where c.tenant_id = v_tenant
        and c.id = any(p_customer_ids)
        and public.customer_blocked_for_assignee_viewer(c.id, p_viewer_id, v_tenant)
    ),
    '{}'::uuid[]
  );
end;
$$;

grant execute on function public.customer_ids_blocked_for_contact_picker(uuid[], uuid) to authenticated;

drop policy if exists "customers_same_tenant_select" on public.customers;
create policy "customers_same_tenant_select"
on public.customers
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'clientes', 'view')
  and (
    public.current_user_role() in ('admin', 'operacao', 'financeiro')
    or public.customer_visible_in_attendant_list(id)
  )
);
