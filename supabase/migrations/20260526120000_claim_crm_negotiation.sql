-- Claim CRM negotiation from pool (unassigned) + optional sync to linked WhatsApp chat

create or replace function public.claim_crm_negotiation(p_negotiation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_tenant uuid;
  v_neg record;
  v_sync boolean;
begin
  select role, tenant_id into v_role, v_tenant
  from public.profiles
  where id = auth.uid();

  if v_role is null then
    raise exception 'Não autenticado';
  end if;

  if v_role not in ('atendimento', 'admin', 'operacao', 'financeiro') then
    raise exception 'Permissão negada';
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

  if not public.can_access_crm_negotiation(v_neg.assignee_id) then
    raise exception 'Permissão negada';
  end if;

  if v_neg.assignee_id is not null and v_neg.assignee_id != auth.uid() then
    raise exception 'Negócio já atribuído a outro responsável';
  end if;

  if v_neg.assignee_id = auth.uid() then
    return;
  end if;

  update public.crm_negotiations
  set assignee_id = auth.uid(),
      updated_at = timezone('utc', now())
  where id = p_negotiation_id;

  if v_neg.source_chat_id is not null then
    select coalesce(ts.sync_assignee_chat_crm, true) into v_sync
    from public.tenant_settings ts
    where ts.tenant_id = v_tenant;

    if coalesce(v_sync, true) then
      update public.whatsapp_chats
      set
        assignee_id = auth.uid(),
        assigned_at = timezone('utc', now()),
        assigned_by = auth.uid()
      where id = v_neg.source_chat_id
        and tenant_id = v_tenant
        and (assignee_id is null or assignee_id = auth.uid());
    end if;
  end if;
end;
$$;

grant execute on function public.claim_crm_negotiation(uuid) to authenticated;
