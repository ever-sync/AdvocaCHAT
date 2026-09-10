-- Lista de contatos no modal "Nova negociação": atendente não pode ver lead de outro.
-- A checagem via SELECT em crm_negotiations falha porque o RLS oculta assignee de terceiros.
-- Regra: bloqueia só se há vínculo exclusivo com outro (sem pool nem responsável = viewer).

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

  if v_tenant is null then
    return '{}'::uuid[];
  end if;

  if p_viewer_id is null then
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
        and exists (
          select 1
          from (
            select n.assignee_id
            from public.crm_negotiations n
            where n.tenant_id = v_tenant
              and n.customer_id = c.id
              and n.status = 'em_andamento'

            union all

            select wc.assignee_id
            from public.whatsapp_chats wc
            where wc.tenant_id = c.tenant_id
              and (
                wc.customer_id = c.id
                or (
                  wc.customer_id is null
                  and c.phone_jid is not null
                  and btrim(c.phone_jid) <> ''
                  and wc.remote_jid = c.phone_jid
                )
              )
          ) links
          where links.assignee_id is not null
            and links.assignee_id is distinct from p_viewer_id
        )
        and not exists (
          select 1
          from (
            select n.assignee_id
            from public.crm_negotiations n
            where n.tenant_id = v_tenant
              and n.customer_id = c.id
              and n.status = 'em_andamento'

            union all

            select wc.assignee_id
            from public.whatsapp_chats wc
            where wc.tenant_id = c.tenant_id
              and (
                wc.customer_id = c.id
                or (
                  wc.customer_id is null
                  and c.phone_jid is not null
                  and btrim(c.phone_jid) <> ''
                  and wc.remote_jid = c.phone_jid
                )
              )
          ) links
          where links.assignee_id is null
            or links.assignee_id = p_viewer_id
        )
    ),
    '{}'::uuid[]
  );
end;
$$;

grant execute on function public.customer_ids_blocked_for_contact_picker(uuid[], uuid) to authenticated;
