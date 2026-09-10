-- Log stage/status changes into crm_activities for customer timeline

create or replace function public.log_crm_stage_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and (
    OLD.stage_id is distinct from NEW.stage_id
    or OLD.status is distinct from NEW.status
  ) then
    insert into public.crm_stage_history (
      tenant_id, negotiation_id, from_stage_id, to_stage_id, from_status, to_status, changed_by
    ) values (
      NEW.tenant_id,
      NEW.id,
      OLD.stage_id,
      NEW.stage_id,
      OLD.status,
      NEW.status,
      auth.uid()
    );

    insert into public.crm_activities (
      tenant_id,
      customer_id,
      negotiation_id,
      chat_id,
      activity_type,
      title,
      body,
      created_by
    ) values (
      NEW.tenant_id,
      NEW.customer_id,
      NEW.id,
      NEW.source_chat_id,
      'stage_change',
      'Estágio atualizado',
      coalesce(OLD.stage_id, '?') || ' → ' || NEW.stage_id ||
        case when OLD.status is distinct from NEW.status
          then ' · status: ' || coalesce(OLD.status, '') || ' → ' || NEW.status
          else ''
        end,
      auth.uid()
    );
  end if;
  return NEW;
end;
$$;
