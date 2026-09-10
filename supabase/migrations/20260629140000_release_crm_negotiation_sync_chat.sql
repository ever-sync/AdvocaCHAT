-- Devolver negócio ao pool também limpa assignee dos chats vinculados (como no claim).

create or replace function public.release_crm_negotiation_to_pool(p_negotiation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_tenant uuid;
  v_neg record;
begin
  select role, tenant_id into v_role, v_tenant
  from public.profiles
  where id = auth.uid();

  if v_role is null then
    raise exception 'Não autenticado';
  end if;

  if v_role not in ('admin', 'operacao') then
    raise exception 'Permissão negada: apenas admin ou operação podem devolver ao pool';
  end if;

  select
    n.tenant_id,
    n.assignee_id,
    n.source_chat_id
  into v_neg
  from public.crm_negotiations n
  where n.id = p_negotiation_id;

  if v_neg.tenant_id is null or v_neg.tenant_id != v_tenant then
    raise exception 'Negociação não encontrada';
  end if;

  if v_neg.assignee_id is null then
    return;
  end if;

  update public.crm_negotiations
  set
    assignee_id = null,
    updated_at = timezone('utc', now())
  where id = p_negotiation_id;

  perform public.sync_negotiation_assignee_to_linked_chats(
    v_neg.tenant_id,
    p_negotiation_id,
    v_neg.source_chat_id,
    null,
    v_neg.assignee_id
  );
end;
$$;
