-- Atualização automática de last_interaction_at (mensagens WhatsApp + tarefas CRM concluídas).

-- Aplica timestamp de interação sem retroceder o valor existente.
create or replace function public.touch_crm_negotiation_interaction(
  p_negotiation_id uuid,
  p_occurred timestamptz default timezone('utc', now()),
  p_inbound_contact_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_negotiation_id is null then
    return;
  end if;

  update public.crm_negotiations n
  set
    last_interaction_at = case
      when n.last_interaction_at is null or p_occurred > n.last_interaction_at then p_occurred
      else n.last_interaction_at
    end,
    last_contact_at = case
      when p_inbound_contact_at is not null
        and (n.last_contact_at is null or p_inbound_contact_at > n.last_contact_at)
      then p_inbound_contact_at
      else n.last_contact_at
    end,
    updated_at = timezone('utc', now())
  where n.id = p_negotiation_id;
end;
$$;

grant execute on function public.touch_crm_negotiation_interaction(uuid, timestamptz, timestamptz)
  to authenticated, service_role;

-- Negociação primária do chat; se ausente, última em_andamento do mesmo cliente.
create or replace function public.resolve_negotiation_for_chat(p_chat_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat record;
  v_neg_id uuid;
begin
  select c.primary_negotiation_id, c.tenant_id, c.customer_id
  into v_chat
  from public.whatsapp_chats c
  where c.id = p_chat_id;

  if not found then
    return null;
  end if;

  v_neg_id := v_chat.primary_negotiation_id;

  if v_neg_id is not null then
    return v_neg_id;
  end if;

  if v_chat.customer_id is null then
    return null;
  end if;

  select n.id into v_neg_id
  from public.crm_negotiations n
  where n.tenant_id = v_chat.tenant_id
    and n.customer_id = v_chat.customer_id
    and n.status = 'em_andamento'
  order by n.updated_at desc nulls last, n.created_at desc
  limit 1;

  if v_neg_id is not null then
    update public.whatsapp_chats
    set primary_negotiation_id = v_neg_id
    where id = p_chat_id
      and primary_negotiation_id is null;
  end if;

  return v_neg_id;
end;
$$;

grant execute on function public.resolve_negotiation_for_chat(uuid) to authenticated, service_role;

-- Mensagens: toca negociação vinculada (com fallback por cliente).
create or replace function public.touch_crm_on_whatsapp_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg_id uuid;
  v_occurred timestamptz;
  v_chat record;
  v_sla_minutes integer;
  v_inbound_contact timestamptz;
begin
  v_occurred := coalesce(NEW.received_at, NEW.sent_at, timezone('utc', now()));

  select
    c.primary_negotiation_id,
    c.tenant_id,
    c.first_inbound_at,
    c.first_response_at,
    c.resolution,
    c.snooze_until
  into v_chat
  from public.whatsapp_chats c
  where c.id = NEW.chat_id;

  v_neg_id := public.resolve_negotiation_for_chat(NEW.chat_id);

  if v_neg_id is not null then
    v_inbound_contact := case when NEW.direction = 'inbound' then v_occurred else null end;
    perform public.touch_crm_negotiation_interaction(v_neg_id, v_occurred, v_inbound_contact);
  end if;

  if NEW.direction = 'inbound' then
    select coalesce(ts.sla_first_response_minutes, 15) into v_sla_minutes
    from public.tenant_settings ts
    where ts.tenant_id = v_chat.tenant_id;

    update public.whatsapp_chats c
    set
      first_inbound_at = coalesce(c.first_inbound_at, v_occurred),
      sla_first_response_due_at = case
        when c.first_inbound_at is null and c.first_response_at is null
        then v_occurred + make_interval(mins => v_sla_minutes)
        else c.sla_first_response_due_at
      end,
      snooze_until = null,
      resolution = case when c.resolution = 'resolved' then 'open' else coalesce(c.resolution, 'open') end,
      status = 'open'
    where c.id = NEW.chat_id;
  elsif NEW.direction = 'outbound'
    and coalesce(NEW.actor_type, 'human') = 'human'
  then
    update public.whatsapp_chats c
    set first_response_at = coalesce(c.first_response_at, v_occurred)
    where c.id = NEW.chat_id
      and c.first_inbound_at is not null
      and c.first_response_at is null;
  end if;

  return NEW;
end;
$$;

-- Tarefas concluídas contam como interação no negócio.
create or replace function public.touch_crm_on_crm_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occurred timestamptz;
  v_neg_id uuid;
begin
  if TG_OP = 'INSERT' then
    if NEW.status <> 'concluida' then
      return NEW;
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.status <> 'concluida' or OLD.status = 'concluida' then
      return NEW;
    end if;
  else
    return NEW;
  end if;

  v_occurred := coalesce(NEW.updated_at, timezone('utc', now()));

  if NEW.negotiation_id is not null then
    perform public.touch_crm_negotiation_interaction(NEW.negotiation_id, v_occurred, null);
    return NEW;
  end if;

  if NEW.customer_id is null then
    return NEW;
  end if;

  for v_neg_id in
    select n.id
    from public.crm_negotiations n
    where n.tenant_id = NEW.tenant_id
      and n.customer_id = NEW.customer_id
      and n.status = 'em_andamento'
  loop
    perform public.touch_crm_negotiation_interaction(v_neg_id, v_occurred, null);
  end loop;

  return NEW;
end;
$$;

drop trigger if exists crm_tasks_touch_negotiation on public.crm_tasks;
create trigger crm_tasks_touch_negotiation
after insert or update of status on public.crm_tasks
for each row
execute function public.touch_crm_on_crm_task_change();

-- Estágio/status manual no Kanban também renova interação.
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
    perform public.touch_crm_negotiation_interaction(NEW.id, timezone('utc', now()), null);

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

-- Backfill: última mensagem do chat → negociação sem last_interaction_at.
with last_msg as (
  select distinct on (c.primary_negotiation_id)
    c.primary_negotiation_id as neg_id,
    coalesce(m.received_at, m.sent_at, m.created_at) as occurred,
    m.direction
  from public.whatsapp_chats c
  join public.whatsapp_messages m on m.chat_id = c.id
  where c.primary_negotiation_id is not null
  order by c.primary_negotiation_id, coalesce(m.received_at, m.sent_at, m.created_at) desc
)
update public.crm_negotiations n
set
  last_interaction_at = lm.occurred,
  last_contact_at = case
    when lm.direction = 'inbound'
      and (n.last_contact_at is null or lm.occurred > n.last_contact_at)
    then lm.occurred
    else n.last_contact_at
  end
from last_msg lm
where n.id = lm.neg_id
  and n.last_interaction_at is null;
