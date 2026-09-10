-- Estende o catálogo de eventos outbound do CRM. Acrescenta:
--   - deal.assignee_changed (transferências, pool↔atendente)
--   - deal.value_changed (totalValue alterado — incluindo "diff" pra integrações)
--   - deal.qualification_changed (estrelas)
--   - deal.task_created / deal.task_completed (tarefas)
--   - deal.comment_added / deal.mention (comentários e menções a usuários)
--
-- O dispatcher e a infra de webhooks (Frente 2) seguem iguais — só novos
-- emissores de eventos. Triggers reusam `enqueue_webhook_event`, que já
-- curto-circuita quando ninguém está inscrito.

-- 1) Reescreve o trigger principal pra emitir os novos eventos do crm_negotiations.
create or replace function public.tg_webhook_crm_negotiation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
begin
  v_data := jsonb_build_object(
    'id', NEW.id, 'customer_id', NEW.customer_id, 'funnel_id', NEW.funnel_id,
    'stage_id', NEW.stage_id, 'status', NEW.status, 'total_value', NEW.total_value,
    'qualification', NEW.qualification, 'assignee_id', NEW.assignee_id,
    'closing_forecast', NEW.closing_forecast, 'created_at', NEW.created_at
  );
  if TG_OP = 'INSERT' then
    perform public.enqueue_webhook_event(NEW.tenant_id, 'deal.created', v_data);
  elsif TG_OP = 'UPDATE' then
    if NEW.stage_id is distinct from OLD.stage_id then
      perform public.enqueue_webhook_event(NEW.tenant_id, 'deal.stage_changed',
        v_data || jsonb_build_object('previous_stage_id', OLD.stage_id));
    end if;
    if NEW.status is distinct from OLD.status then
      if NEW.status = 'vendido' then
        perform public.enqueue_webhook_event(NEW.tenant_id, 'deal.won', v_data);
      elsif NEW.status = 'perdido' then
        perform public.enqueue_webhook_event(NEW.tenant_id, 'deal.lost',
          v_data || jsonb_build_object('lost_reason', NEW.lost_reason));
      end if;
    end if;
    if NEW.assignee_id is distinct from OLD.assignee_id then
      perform public.enqueue_webhook_event(NEW.tenant_id, 'deal.assignee_changed',
        v_data || jsonb_build_object('previous_assignee_id', OLD.assignee_id));
    end if;
    if NEW.total_value is distinct from OLD.total_value then
      perform public.enqueue_webhook_event(NEW.tenant_id, 'deal.value_changed',
        v_data || jsonb_build_object(
          'previous_total_value', OLD.total_value,
          'delta', coalesce(NEW.total_value, 0) - coalesce(OLD.total_value, 0)
        ));
    end if;
    if NEW.qualification is distinct from OLD.qualification then
      perform public.enqueue_webhook_event(NEW.tenant_id, 'deal.qualification_changed',
        v_data || jsonb_build_object('previous_qualification', OLD.qualification));
    end if;
  end if;
  return NEW;
end;
$$;

-- 2) Tarefas: criar e concluir.
create or replace function public.tg_webhook_crm_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
begin
  v_data := jsonb_build_object(
    'id', NEW.id, 'negotiation_id', NEW.negotiation_id, 'customer_id', NEW.customer_id,
    'assignee_id', NEW.assignee_id, 'title', NEW.title, 'due_at', NEW.due_at,
    'status', NEW.status, 'template_id', NEW.template_id, 'notes', NEW.notes,
    'created_at', NEW.created_at
  );
  if TG_OP = 'INSERT' then
    perform public.enqueue_webhook_event(NEW.tenant_id, 'deal.task_created', v_data);
  elsif TG_OP = 'UPDATE'
        and NEW.status = 'concluida'
        and (OLD.status is null or OLD.status <> 'concluida') then
    perform public.enqueue_webhook_event(NEW.tenant_id, 'deal.task_completed', v_data);
  end if;
  return NEW;
end;
$$;

drop trigger if exists webhook_crm_task on public.crm_tasks;
create trigger webhook_crm_task
after insert or update on public.crm_tasks
for each row execute function public.tg_webhook_crm_task();

-- 3) Comentários: emite `deal.comment_added` para todo comentário; quando há
-- mentions[] não-vazio, emite também `deal.mention` (uma entrega por
-- comentário com a array de mencionados — o consumidor faz fanout se quiser).
create or replace function public.tg_webhook_crm_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
begin
  if TG_OP <> 'INSERT' then
    return NEW;
  end if;
  v_data := jsonb_build_object(
    'id', NEW.id, 'negotiation_id', NEW.negotiation_id, 'created_by', NEW.created_by,
    'body', NEW.body, 'mentions', NEW.mentions, 'created_at', NEW.created_at
  );
  perform public.enqueue_webhook_event(NEW.tenant_id, 'deal.comment_added', v_data);
  if array_length(NEW.mentions, 1) > 0 then
    perform public.enqueue_webhook_event(NEW.tenant_id, 'deal.mention', v_data);
  end if;
  return NEW;
end;
$$;

drop trigger if exists webhook_crm_comment on public.crm_negotiation_comments;
create trigger webhook_crm_comment
after insert on public.crm_negotiation_comments
for each row execute function public.tg_webhook_crm_comment();
