-- Sync assignee CRM negotiation → linked WhatsApp chats (when tenant setting enabled).
-- Complements whatsapp_chats → crm_negotiations (sync_assignee_chat_to_negotiation).

create or replace function public.sync_negotiation_assignee_to_linked_chats(
  p_tenant_id uuid,
  p_negotiation_id uuid,
  p_source_chat_id uuid,
  p_new_assignee uuid,
  p_old_assignee uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sync boolean;
  v_actor uuid;
begin
  select coalesce(ts.sync_assignee_chat_crm, true) into v_sync
  from public.tenant_settings ts
  where ts.tenant_id = p_tenant_id;

  if not coalesce(v_sync, true) then
    return;
  end if;

  v_actor := auth.uid();

  update public.whatsapp_chats wc
  set
    assignee_id = p_new_assignee,
    assigned_at = case
      when p_new_assignee is not null then timezone('utc', now())
      else null
    end,
    assigned_by = case
      when p_new_assignee is not null then coalesce(v_actor, wc.assigned_by)
      else null
    end
  where wc.tenant_id = p_tenant_id
    and (
      wc.id = p_source_chat_id
      or wc.primary_negotiation_id = p_negotiation_id
    )
    and wc.assignee_id is distinct from p_new_assignee
    and (
      p_new_assignee is null
      and (wc.assignee_id is null or wc.assignee_id = p_old_assignee)
      or p_new_assignee is not null
      and (
        wc.assignee_id is null
        or wc.assignee_id = p_new_assignee
        or wc.assignee_id = p_old_assignee
      )
    );
end;
$$;

create or replace function public.sync_assignee_negotiation_to_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.assignee_id is not distinct from OLD.assignee_id then
    return NEW;
  end if;

  perform public.sync_negotiation_assignee_to_linked_chats(
    NEW.tenant_id,
    NEW.id,
    NEW.source_chat_id,
    NEW.assignee_id,
    OLD.assignee_id
  );

  return NEW;
end;
$$;

drop trigger if exists crm_negotiations_sync_assignee_chat on public.crm_negotiations;
create trigger crm_negotiations_sync_assignee_chat
after update of assignee_id on public.crm_negotiations
for each row
execute function public.sync_assignee_negotiation_to_chat();

-- Evita loop: só propaga chat → negociação quando o responsável realmente mudou.
create or replace function public.sync_assignee_chat_to_negotiation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sync boolean;
begin
  select coalesce(ts.sync_assignee_chat_crm, true) into v_sync
  from public.tenant_settings ts
  where ts.tenant_id = NEW.tenant_id;

  if not coalesce(v_sync, true) then
    return NEW;
  end if;

  if NEW.assignee_id is distinct from OLD.assignee_id
    and NEW.primary_negotiation_id is not null
  then
    update public.crm_negotiations n
    set
      assignee_id = NEW.assignee_id,
      updated_at = timezone('utc', now())
    where n.id = NEW.primary_negotiation_id
      and n.assignee_id is distinct from NEW.assignee_id;
  end if;

  return NEW;
end;
$$;

-- Claim: apenas atualiza negociação; trigger propaga ao chat vinculado.
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

  select n.tenant_id, n.assignee_id, n.source_chat_id
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
  set
    assignee_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = p_negotiation_id;
end;
$$;

grant execute on function public.sync_negotiation_assignee_to_linked_chats(uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.claim_crm_negotiation(uuid) to authenticated;
