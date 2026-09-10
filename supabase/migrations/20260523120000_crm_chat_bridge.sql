-- CRM ↔ Chat bridge: negotiation link, ensure_lead_from_chat, interaction triggers

alter table public.whatsapp_chats
  add column if not exists primary_negotiation_id uuid references public.crm_negotiations(id) on delete set null;

alter table public.crm_negotiations
  add column if not exists source_chat_id uuid references public.whatsapp_chats(id) on delete set null,
  add column if not exists lost_reason text;

create index if not exists whatsapp_chats_primary_negotiation_idx
  on public.whatsapp_chats (primary_negotiation_id)
  where primary_negotiation_id is not null;

create index if not exists crm_negotiations_source_chat_idx
  on public.crm_negotiations (source_chat_id)
  where source_chat_id is not null;

-- Default funnel/stage for tenant (first funnel, first stage; fallback comercial/lead)
create or replace function public.tenant_default_funnel_stage(p_tenant_id uuid)
returns table(funnel_id text, stage_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_funnels jsonb;
  v_first jsonb;
  v_stages jsonb;
begin
  select t.funnels into v_funnels
  from public.tenant_crm_funnel_config t
  where t.tenant_id = p_tenant_id;

  if v_funnels is not null and jsonb_typeof(v_funnels) = 'array' and jsonb_array_length(v_funnels) > 0 then
    v_first := v_funnels -> 0;
    funnel_id := coalesce(nullif(trim(v_first->>'id'), ''), 'comercial');
    v_stages := v_first->'stages';
    if v_stages is not null and jsonb_typeof(v_stages) = 'array' and jsonb_array_length(v_stages) > 0 then
      stage_id := coalesce(nullif(trim((v_stages -> 0)->>'id'), ''), 'lead');
    else
      stage_id := 'lead';
    end if;
    return next;
    return;
  end if;

  funnel_id := 'comercial';
  stage_id := 'lead';
  return next;
end;
$$;

-- Creates or links active negotiation for a chat (service_role + authenticated)
create or replace function public.ensure_lead_from_chat(
  p_chat_id uuid,
  p_auto_assign boolean default false
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

  update public.crm_negotiations
  set source_chat_id = coalesce(source_chat_id, p_chat_id)
  where id = v_neg_id;

  if p_auto_assign and v_chat.assignee_id is null then
    perform public.auto_assign_chat_system(p_chat_id);
  end if;

  return v_neg_id;
end;
$$;

grant execute on function public.ensure_lead_from_chat(uuid, boolean) to authenticated, service_role;

-- Round-robin without auth (webhook / ensure_lead)
create or replace function public.auto_assign_chat_system(p_chat_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_prev uuid;
  v_next uuid;
begin
  select tenant_id, assignee_id into v_tenant, v_prev
  from public.whatsapp_chats
  where id = p_chat_id;

  if v_tenant is null then
    return null;
  end if;

  select p.id into v_next
  from public.profiles p
  left join public.whatsapp_chats wc
    on wc.assignee_id = p.id
    and wc.tenant_id = v_tenant
    and wc.status = 'open'
  where p.tenant_id = v_tenant
    and p.role = 'atendimento'
    and p.status = 'active'
  group by p.id, p.created_at
  order by count(wc.id) asc, p.created_at asc
  limit 1;

  if v_next is null then
    return null;
  end if;

  if v_prev is distinct from v_next then
    insert into public.chat_transfers (
      tenant_id, chat_id, from_user_id, to_user_id, transferred_by, reason
    ) values (
      v_tenant, p_chat_id, v_prev, v_next, v_next, 'auto_round_robin_system'
    );
  end if;

  update public.whatsapp_chats
  set assignee_id = v_next,
      assigned_at = timezone('utc', now()),
      assigned_by = v_next
  where id = p_chat_id;

  update public.crm_negotiations n
  set assignee_id = v_next
  from public.whatsapp_chats c
  where c.id = p_chat_id
    and n.id = c.primary_negotiation_id
    and n.assignee_id is null;

  return v_next;
end;
$$;

grant execute on function public.auto_assign_chat_system(uuid) to service_role;

-- Touch negotiation + reopen resolved chat on inbound
create or replace function public.touch_crm_on_whatsapp_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg_id uuid;
  v_occurred timestamptz;
begin
  v_occurred := coalesce(NEW.received_at, NEW.sent_at, timezone('utc', now()));

  select c.primary_negotiation_id into v_neg_id
  from public.whatsapp_chats c
  where c.id = NEW.chat_id;

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
    update public.whatsapp_chats c
    set
      resolution = case when c.resolution = 'resolved' then 'open' else coalesce(c.resolution, 'open') end,
      status = 'open'
    where c.id = NEW.chat_id
      and coalesce(c.resolution, 'open') = 'resolved';
  end if;

  return NEW;
end;
$$;

drop trigger if exists whatsapp_messages_touch_crm on public.whatsapp_messages;
create trigger whatsapp_messages_touch_crm
after insert on public.whatsapp_messages
for each row
execute function public.touch_crm_on_whatsapp_message();

-- Backfill pipeline from customers.source_columns into negotiations
insert into public.crm_negotiations (
  tenant_id,
  title,
  funnel_id,
  stage_id,
  status,
  customer_id,
  assignee_id,
  last_interaction_at,
  created_at,
  updated_at
)
select
  c.tenant_id,
  coalesce(nullif(trim(c.nome), ''), 'Cliente'),
  coalesce(nullif(trim(c.source_columns->>'crm_funnel_id'), ''), 'comercial'),
  coalesce(nullif(trim(c.source_columns->>'crm_pipeline_stage'), ''), 'lead'),
  'em_andamento',
  c.id,
  null,
  timezone('utc', now()),
  c.created_at,
  c.updated_at
from public.customers c
where (
  nullif(trim(c.source_columns->>'crm_pipeline_stage'), '') is not null
  or nullif(trim(c.source_columns->>'crm_funnel_id'), '') is not null
)
and not exists (
  select 1 from public.crm_negotiations n
  where n.customer_id = c.id
    and n.tenant_id = c.tenant_id
    and n.status = 'em_andamento'
);

update public.whatsapp_chats c
set primary_negotiation_id = sub.neg_id
from (
  select distinct on (wc.id)
    wc.id as chat_id,
    n.id as neg_id
  from public.whatsapp_chats wc
  join public.crm_negotiations n
    on n.customer_id = wc.customer_id
    and n.tenant_id = wc.tenant_id
    and n.status = 'em_andamento'
  where wc.customer_id is not null
    and wc.primary_negotiation_id is null
  order by wc.id, n.updated_at desc
) sub
where c.id = sub.chat_id;
