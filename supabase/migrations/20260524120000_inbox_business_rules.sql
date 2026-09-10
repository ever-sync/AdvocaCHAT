-- Inbox business rules: SLA, snooze, claim, lost reason, multi-deal helpers

alter table public.tenant_settings
  add column if not exists sla_first_response_minutes integer not null default 15
    check (sla_first_response_minutes > 0 and sla_first_response_minutes <= 1440);

alter table public.whatsapp_chats
  add column if not exists first_inbound_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists sla_first_response_due_at timestamptz,
  add column if not exists snooze_until timestamptz;

create index if not exists whatsapp_chats_sla_due_idx
  on public.whatsapp_chats (tenant_id, sla_first_response_due_at)
  where first_response_at is null and sla_first_response_due_at is not null;

create index if not exists whatsapp_chats_snooze_idx
  on public.whatsapp_chats (tenant_id, snooze_until)
  where snooze_until is not null;

-- Claim: atendimento assumes unassigned chat (or already assigned to self)
create or replace function public.claim_chat(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_tenant uuid;
  v_chat record;
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

  select tenant_id, assignee_id, status
  into v_chat
  from public.whatsapp_chats
  where id = p_chat_id;

  if v_chat.tenant_id is null or v_chat.tenant_id != v_tenant then
    raise exception 'Chat não encontrado';
  end if;

  if v_chat.assignee_id is not null and v_chat.assignee_id != auth.uid() then
    raise exception 'Conversa já atribuída a outro responsável';
  end if;

  if v_chat.assignee_id = auth.uid() then
    return;
  end if;

  insert into public.chat_transfers (
    tenant_id, chat_id, from_user_id, to_user_id, transferred_by, reason
  ) values (
    v_tenant, p_chat_id, null, auth.uid(), auth.uid(), 'claim'
  );

  update public.whatsapp_chats
  set
    assignee_id = auth.uid(),
    assigned_at = timezone('utc', now()),
    assigned_by = auth.uid(),
    status = 'open',
    resolution = case when resolution = 'resolved' then 'open' else coalesce(resolution, 'open') end
  where id = p_chat_id;
end;
$$;

grant execute on function public.claim_chat(uuid) to authenticated;

-- Snooze conversation until a datetime
create or replace function public.snooze_chat(
  p_chat_id uuid,
  p_until timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_assignee uuid;
  v_role text;
begin
  if p_until is null or p_until <= timezone('utc', now()) then
    raise exception 'Informe um horário futuro para adiar';
  end if;

  select role, tenant_id into v_role, v_tenant
  from public.profiles
  where id = auth.uid();

  select tenant_id, assignee_id into v_tenant, v_assignee
  from public.whatsapp_chats
  where id = p_chat_id;

  if v_tenant is null or v_tenant != (select tenant_id from public.profiles where id = auth.uid()) then
    raise exception 'Chat não encontrado';
  end if;

  if v_role = 'atendimento' and v_assignee is not null and v_assignee != auth.uid() then
    raise exception 'Permissão negada';
  end if;

  update public.whatsapp_chats
  set
    snooze_until = p_until,
    resolution = 'pending'
  where id = p_chat_id;
end;
$$;

grant execute on function public.snooze_chat(uuid, timestamptz) to authenticated;

create or replace function public.clear_chat_snooze(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.whatsapp_chats
  set snooze_until = null
  where id = p_chat_id
    and tenant_id = public.current_tenant_id();
end;
$$;

grant execute on function public.clear_chat_snooze(uuid) to authenticated;

-- Link chat to an existing negotiation (multi-deal)
create or replace function public.link_chat_negotiation(
  p_chat_id uuid,
  p_negotiation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_chat record;
  v_neg record;
begin
  select tenant_id into v_tenant from public.profiles where id = auth.uid();

  select id, tenant_id, customer_id into v_chat
  from public.whatsapp_chats
  where id = p_chat_id;

  select id, tenant_id, customer_id, status into v_neg
  from public.crm_negotiations
  where id = p_negotiation_id;

  if v_chat.id is null or v_chat.tenant_id != v_tenant then
    raise exception 'Chat não encontrado';
  end if;

  if v_neg.id is null or v_neg.tenant_id != v_tenant then
    raise exception 'Negociação não encontrada';
  end if;

  if v_chat.customer_id is null or v_neg.customer_id is distinct from v_chat.customer_id then
    raise exception 'Negociação não pertence ao cliente desta conversa';
  end if;

  update public.crm_negotiations
  set source_chat_id = coalesce(source_chat_id, p_chat_id)
  where id = p_negotiation_id;

  update public.whatsapp_chats
  set primary_negotiation_id = p_negotiation_id
  where id = p_chat_id;
end;
$$;

grant execute on function public.link_chat_negotiation(uuid, uuid) to authenticated;

-- ensure_lead_from_chat: optional force new deal
create or replace function public.ensure_lead_from_chat(
  p_chat_id uuid,
  p_auto_assign boolean default false,
  p_force_new boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat record;
  v_neg_id uuid;
  v_funnel_id text;
  v_stage_id text;
  v_title text;
begin
  select
    c.id,
    c.tenant_id,
    c.customer_id,
    c.display_name,
    c.assignee_id,
    c.primary_negotiation_id,
    cu.nome as customer_nome
  into v_chat
  from public.whatsapp_chats c
  left join public.customers cu on cu.id = c.customer_id
  where c.id = p_chat_id;

  if v_chat.id is null then
    raise exception 'Chat não encontrado';
  end if;

  if v_chat.customer_id is null then
    raise exception 'Chat sem cliente vinculado';
  end if;

  if not p_force_new then
    if v_chat.primary_negotiation_id is not null then
      select n.id into v_neg_id
      from public.crm_negotiations n
      where n.id = v_chat.primary_negotiation_id
        and n.status = 'em_andamento';
      if v_neg_id is not null then
        return v_neg_id;
      end if;
    end if;

    select n.id into v_neg_id
    from public.crm_negotiations n
    where n.tenant_id = v_chat.tenant_id
      and n.customer_id = v_chat.customer_id
      and n.status = 'em_andamento'
    order by n.updated_at desc
    limit 1;
  end if;

  if v_neg_id is null then
    select t.funnel_id, t.stage_id into v_funnel_id, v_stage_id
    from public.tenant_default_funnel_stage(v_chat.tenant_id) t;

    v_title := coalesce(
      nullif(trim(v_chat.customer_nome), ''),
      nullif(trim(v_chat.display_name), ''),
      'Lead WhatsApp'
    );

    insert into public.crm_negotiations (
      tenant_id,
      title,
      funnel_id,
      stage_id,
      status,
      customer_id,
      source_chat_id,
      assignee_id,
      last_interaction_at,
      last_contact_at
    ) values (
      v_chat.tenant_id,
      v_title,
      v_funnel_id,
      v_stage_id,
      'em_andamento',
      v_chat.customer_id,
      p_chat_id,
      v_chat.assignee_id,
      timezone('utc', now()),
      timezone('utc', now())
    )
    returning id into v_neg_id;
  else
    update public.crm_negotiations n
    set
      source_chat_id = coalesce(n.source_chat_id, p_chat_id),
      assignee_id = coalesce(n.assignee_id, v_chat.assignee_id),
      last_interaction_at = timezone('utc', now())
    where n.id = v_neg_id;
  end if;

  update public.whatsapp_chats
  set primary_negotiation_id = v_neg_id
  where id = p_chat_id;

  if p_auto_assign and v_chat.assignee_id is null then
    perform public.auto_assign_chat_system(p_chat_id);
  end if;

  return v_neg_id;
end;
$$;

grant execute on function public.ensure_lead_from_chat(uuid, boolean, boolean) to authenticated, service_role;

-- Lost reason required when marking deal as lost
create or replace function public.enforce_negotiation_lost_reason()
returns trigger
language plpgsql
as $$
begin
  if (
      NEW.status = 'perdido'
      or NEW.stage_id = 'perdido'
    )
    and (
      OLD.status is distinct from 'perdido'
      or OLD.stage_id is distinct from NEW.stage_id
    )
    and coalesce(trim(NEW.lost_reason), '') = ''
  then
    raise exception 'Informe o motivo da perda antes de marcar como perdido';
  end if;
  return NEW;
end;
$$;

drop trigger if exists crm_negotiations_require_lost_reason on public.crm_negotiations;
create trigger crm_negotiations_require_lost_reason
before update of status, lost_reason on public.crm_negotiations
for each row
execute function public.enforce_negotiation_lost_reason();

-- Message trigger: SLA, snooze clear, reopen resolved
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

  v_neg_id := v_chat.primary_negotiation_id;

  if v_neg_id is not null then
    update public.crm_negotiations n
    set
      last_interaction_at = v_occurred,
      last_contact_at = case
        when NEW.direction = 'inbound' then v_occurred
        else n.last_contact_at
      end
    where n.id = v_neg_id;
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

-- Attendance report: real avg first response
create or replace function public.report_attendance_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_assignee_id uuid default null
)
returns table(
  assignee_id uuid,
  assignee_name text,
  chats_opened bigint,
  chats_resolved bigint,
  messages_inbound bigint,
  messages_outbound bigint,
  messages_ai bigint,
  avg_first_response_minutes numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with tenant_chats as (
    select c.*
    from public.whatsapp_chats c
    where c.tenant_id = public.current_tenant_id()
      and (p_assignee_id is null or c.assignee_id = p_assignee_id)
  ),
  msg_stats as (
    select
      tc.assignee_id,
      count(*) filter (where m.direction = 'inbound') as messages_inbound,
      count(*) filter (where m.direction = 'outbound' and m.actor_type = 'human') as messages_outbound,
      count(*) filter (where m.actor_type = 'ai') as messages_ai
    from tenant_chats tc
    join public.whatsapp_messages m on m.chat_id = tc.id
    where m.created_at >= p_from and m.created_at <= p_to
    group by tc.assignee_id
  ),
  sla_stats as (
    select
      tc.assignee_id,
      round(
        avg(extract(epoch from (tc.first_response_at - tc.first_inbound_at)) / 60.0),
        2
      ) as avg_first_response_minutes
    from tenant_chats tc
    where tc.first_inbound_at is not null
      and tc.first_response_at is not null
      and tc.first_response_at >= p_from
      and tc.first_response_at <= p_to
    group by tc.assignee_id
  )
  select
    p.id as assignee_id,
    p.nome as assignee_name,
    count(tc.id) filter (
      where tc.created_at >= p_from and tc.created_at <= p_to
    ) as chats_opened,
    count(tc.id) filter (
      where tc.resolution = 'resolved'
        and tc.updated_at >= p_from and tc.updated_at <= p_to
    ) as chats_resolved,
    coalesce(ms.messages_inbound, 0),
    coalesce(ms.messages_outbound, 0),
    coalesce(ms.messages_ai, 0),
    ss.avg_first_response_minutes
  from public.profiles p
  left join tenant_chats tc on tc.assignee_id = p.id
  left join msg_stats ms on ms.assignee_id = p.id
  left join sla_stats ss on ss.assignee_id = p.id
  where p.tenant_id = public.current_tenant_id()
    and p.role in ('atendimento', 'operacao', 'admin', 'financeiro')
    and (p_assignee_id is null or p.id = p_assignee_id)
  group by p.id, p.nome, ms.messages_inbound, ms.messages_outbound, ms.messages_ai, ss.avg_first_response_minutes
  order by chats_resolved desc, messages_outbound desc;
$$;
