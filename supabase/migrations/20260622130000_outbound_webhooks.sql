-- Tier 3 — Frente 2: Webhooks de saída (outbound).
-- O tenant cadastra endpoints assinados por eventos do CRM/contatos/mensagens.
-- Eventos enfileiram entregas; uma edge function (webhook-dispatcher, via pg_cron) faz POST com HMAC + retry.

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  url text not null,
  secret text not null,
  events text[] not null default '{}',
  active boolean not null default true,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists webhooks_tenant_idx on public.webhooks (tenant_id);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'error')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  response_status integer,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  delivered_at timestamptz
);

create index if not exists webhook_deliveries_claim_idx
  on public.webhook_deliveries (status, next_attempt_at)
  where status = 'pending';
create index if not exists webhook_deliveries_tenant_time_idx
  on public.webhook_deliveries (tenant_id, created_at desc);
create index if not exists webhook_deliveries_webhook_idx
  on public.webhook_deliveries (webhook_id, created_at desc);

alter table public.webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;

-- Webhooks: gestão por quem tem configuracoes.
drop policy if exists "webhooks_select" on public.webhooks;
create policy "webhooks_select" on public.webhooks for select
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'configuracoes', 'view'));

drop policy if exists "webhooks_insert" on public.webhooks;
create policy "webhooks_insert" on public.webhooks for insert
with check (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'configuracoes', 'edit'));

drop policy if exists "webhooks_update" on public.webhooks;
create policy "webhooks_update" on public.webhooks for update
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'configuracoes', 'edit'))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "webhooks_delete" on public.webhooks;
create policy "webhooks_delete" on public.webhooks for delete
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'configuracoes', 'edit'));

-- Entregas: leitura p/ o log; escrita só dispatcher (service role) e triggers (definer).
drop policy if exists "webhook_deliveries_select" on public.webhook_deliveries;
create policy "webhook_deliveries_select" on public.webhook_deliveries for select
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'configuracoes', 'view'));

-- updated_at
drop trigger if exists set_updated_at on public.webhooks;
create trigger set_updated_at before update on public.webhooks
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Enfileira uma entrega por webhook ativo do tenant inscrito no evento.
-- Envelope: { event, tenant_id, occurred_at, data }.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_webhook_event(p_tenant uuid, p_event text, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_tenant is null or p_event is null then
    return 0;
  end if;
  insert into public.webhook_deliveries (tenant_id, webhook_id, event, payload)
  select w.tenant_id, w.id, p_event,
         jsonb_build_object(
           'event', p_event,
           'tenant_id', w.tenant_id,
           'occurred_at', timezone('utc', now()),
           'data', coalesce(p_payload, '{}'::jsonb)
         )
  from public.webhooks w
  where w.tenant_id = p_tenant and w.active and p_event = any (w.events);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- service_role chama via rpc (domain.ts: message.received/sent). authenticated NÃO (evita forjar eventos).
grant execute on function public.enqueue_webhook_event(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Triggers de origem de eventos (curto-circuitam quando ninguém está inscrito,
-- pois enqueue só insere se houver webhook ativo correspondente).
-- ---------------------------------------------------------------------------
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
    'assignee_id', NEW.assignee_id, 'closing_forecast', NEW.closing_forecast,
    'created_at', NEW.created_at
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
  end if;
  return NEW;
end;
$$;

drop trigger if exists webhook_crm_negotiation on public.crm_negotiations;
create trigger webhook_crm_negotiation
after insert or update on public.crm_negotiations
for each row execute function public.tg_webhook_crm_negotiation();

create or replace function public.tg_webhook_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.enqueue_webhook_event(NEW.tenant_id, 'contact.created', to_jsonb(NEW) - 'search_vector');
  end if;
  return NEW;
end;
$$;

drop trigger if exists webhook_customer on public.customers;
create trigger webhook_customer
after insert on public.customers
for each row execute function public.tg_webhook_customer();

-- Mensagens: inbound => message.received, outbound => message.sent.
-- Curto-circuita rápido (enqueue só insere se houver webhook inscrito), ok p/ tabela quente.
create or replace function public.tg_webhook_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := case when NEW.direction = 'inbound' then 'message.received' else 'message.sent' end;
begin
  perform public.enqueue_webhook_event(
    NEW.tenant_id,
    v_event,
    jsonb_build_object(
      'id', NEW.id, 'chat_id', NEW.chat_id, 'instance_id', NEW.instance_id,
      'direction', NEW.direction, 'message_type', NEW.message_type,
      'body_text', NEW.body_text, 'media_url', NEW.media_url, 'created_at', NEW.created_at
    )
  );
  return NEW;
end;
$$;

drop trigger if exists webhook_message on public.whatsapp_messages;
create trigger webhook_message
after insert on public.whatsapp_messages
for each row execute function public.tg_webhook_message();

-- Limpeza opcional de entregas antigas (agendar pg_cron manualmente).
create or replace function public.purge_old_webhook_deliveries(p_keep_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.webhook_deliveries
  where created_at < timezone('utc', now()) - make_interval(days => greatest(p_keep_days, 7))
    and status in ('success', 'error');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
