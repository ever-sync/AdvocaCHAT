create extension if not exists "pgcrypto";

alter table public.customers
  add column if not exists phone_e164 text,
  add column if not exists phone_digits text,
  add column if not exists phone_jid text;

update public.customers
set
  phone_digits = regexp_replace(coalesce(telefone, ''), '\D', '', 'g'),
  phone_e164 = case
    when regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = '' then null
    when left(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 2) = '55'
      then '+' || regexp_replace(coalesce(telefone, ''), '\D', '', 'g')
    else '+55' || regexp_replace(coalesce(telefone, ''), '\D', '', 'g')
  end,
  phone_jid = case
    when regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = '' then null
    when left(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 2) = '55'
      then regexp_replace(coalesce(telefone, ''), '\D', '', 'g') || '@s.whatsapp.net'
    else '55' || regexp_replace(coalesce(telefone, ''), '\D', '', 'g') || '@s.whatsapp.net'
  end;

create index if not exists customers_tenant_phone_digits_idx
on public.customers (tenant_id, phone_digits);

create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  display_name text not null,
  uazapi_instance_name text not null,
  uazapi_base_url text not null default 'https://server02.uazapi.dev',
  encrypted_apikey text not null,
  phone_number text,
  status text not null default 'disconnected' check (status in ('connected', 'connecting', 'disconnected', 'error')),
  is_default boolean not null default false,
  webhook_token text not null default md5(gen_random_uuid()::text || clock_timestamp()::text || random()::text),
  last_qr text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, uazapi_instance_name)
);

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_id uuid references public.whatsapp_instances(id) on delete cascade,
  event_name text not null,
  payload jsonb not null,
  received_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.whatsapp_chats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  remote_jid text not null,
  remote_phone_digits text,
  remote_phone_e164 text,
  display_name text not null default 'Sem nome',
  last_message_preview text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, instance_id, remote_jid)
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  chat_id uuid not null references public.whatsapp_chats(id) on delete cascade,
  campaign_id uuid,
  campaign_recipient_id uuid,
  uazapi_message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null check (message_type in ('text', 'media', 'menu', 'poll', 'location', 'contact', 'audio', 'document', 'system')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'read', 'received', 'failed')),
  body_text text,
  media_url text,
  payload_json jsonb not null default '{}'::jsonb,
  raw_event jsonb,
  quoted_message_id text,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (instance_id, uazapi_message_id)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  nome text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed')),
  message_type text not null check (message_type in ('text', 'media', 'menu', 'poll', 'location', 'contact', 'audio', 'document')),
  audience_filters jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  send_mode text not null default 'now' check (send_mode in ('now', 'scheduled')),
  scheduled_at timestamptz,
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  responded_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  chat_id uuid references public.whatsapp_chats(id) on delete set null,
  phone_digits text,
  phone_e164 text,
  phone_jid text,
  display_name text not null default 'Sem nome',
  message_type text not null check (message_type in ('text', 'media', 'menu', 'poll', 'location', 'contact', 'audio', 'document')),
  payload_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed', 'responded', 'cancelled')),
  last_message_id uuid references public.whatsapp_messages(id) on delete set null,
  last_error text,
  queued_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.followup_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step text not null check (step in ('4h', '24h', '48h')),
  delay_minutes integer not null check (delay_minutes > 0),
  enabled boolean not null default true,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (campaign_id, step)
);

create table if not exists public.followup_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_recipient_id uuid not null references public.campaign_recipients(id) on delete cascade,
  followup_rule_id uuid not null references public.followup_rules(id) on delete cascade,
  chat_id uuid references public.whatsapp_chats(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'sent', 'cancelled', 'failed')),
  scheduled_for timestamptz not null,
  executed_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (campaign_recipient_id, followup_rule_id)
);

alter table public.whatsapp_instances enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_chats enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.followup_rules enable row level security;
alter table public.followup_jobs enable row level security;

drop trigger if exists whatsapp_instances_set_updated_at on public.whatsapp_instances;
create trigger whatsapp_instances_set_updated_at
before update on public.whatsapp_instances
for each row
execute function public.set_updated_at();

drop trigger if exists whatsapp_chats_set_updated_at on public.whatsapp_chats;
create trigger whatsapp_chats_set_updated_at
before update on public.whatsapp_chats
for each row
execute function public.set_updated_at();

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
before update on public.campaigns
for each row
execute function public.set_updated_at();

drop trigger if exists campaign_recipients_set_updated_at on public.campaign_recipients;
create trigger campaign_recipients_set_updated_at
before update on public.campaign_recipients
for each row
execute function public.set_updated_at();

drop trigger if exists followup_rules_set_updated_at on public.followup_rules;
create trigger followup_rules_set_updated_at
before update on public.followup_rules
for each row
execute function public.set_updated_at();

drop trigger if exists followup_jobs_set_updated_at on public.followup_jobs;
create trigger followup_jobs_set_updated_at
before update on public.followup_jobs
for each row
execute function public.set_updated_at();

drop policy if exists "whatsapp_instances_same_tenant_select" on public.whatsapp_instances;
create policy "whatsapp_instances_same_tenant_select"
on public.whatsapp_instances
for select
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "whatsapp_instances_same_tenant_insert" on public.whatsapp_instances;
create policy "whatsapp_instances_same_tenant_insert"
on public.whatsapp_instances
for insert
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "whatsapp_instances_same_tenant_update" on public.whatsapp_instances;
create policy "whatsapp_instances_same_tenant_update"
on public.whatsapp_instances
for update
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
)
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "whatsapp_chats_same_tenant_select" on public.whatsapp_chats;
create policy "whatsapp_chats_same_tenant_select"
on public.whatsapp_chats
for select
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "whatsapp_chats_same_tenant_insert" on public.whatsapp_chats;
create policy "whatsapp_chats_same_tenant_insert"
on public.whatsapp_chats
for insert
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "whatsapp_chats_same_tenant_update" on public.whatsapp_chats;
create policy "whatsapp_chats_same_tenant_update"
on public.whatsapp_chats
for update
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
)
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "whatsapp_messages_same_tenant_select" on public.whatsapp_messages;
create policy "whatsapp_messages_same_tenant_select"
on public.whatsapp_messages
for select
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "whatsapp_messages_same_tenant_insert" on public.whatsapp_messages;
create policy "whatsapp_messages_same_tenant_insert"
on public.whatsapp_messages
for insert
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "whatsapp_messages_same_tenant_update" on public.whatsapp_messages;
create policy "whatsapp_messages_same_tenant_update"
on public.whatsapp_messages
for update
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
)
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "campaigns_same_tenant_select" on public.campaigns;
create policy "campaigns_same_tenant_select"
on public.campaigns
for select
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "campaigns_same_tenant_insert" on public.campaigns;
create policy "campaigns_same_tenant_insert"
on public.campaigns
for insert
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "campaigns_same_tenant_update" on public.campaigns;
create policy "campaigns_same_tenant_update"
on public.campaigns
for update
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
)
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "campaign_recipients_same_tenant_select" on public.campaign_recipients;
create policy "campaign_recipients_same_tenant_select"
on public.campaign_recipients
for select
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "campaign_recipients_same_tenant_insert" on public.campaign_recipients;
create policy "campaign_recipients_same_tenant_insert"
on public.campaign_recipients
for insert
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "campaign_recipients_same_tenant_update" on public.campaign_recipients;
create policy "campaign_recipients_same_tenant_update"
on public.campaign_recipients
for update
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
)
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "followup_rules_same_tenant_select" on public.followup_rules;
create policy "followup_rules_same_tenant_select"
on public.followup_rules
for select
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "followup_rules_same_tenant_insert" on public.followup_rules;
create policy "followup_rules_same_tenant_insert"
on public.followup_rules
for insert
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "followup_rules_same_tenant_update" on public.followup_rules;
create policy "followup_rules_same_tenant_update"
on public.followup_rules
for update
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
)
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "followup_jobs_same_tenant_select" on public.followup_jobs;
create policy "followup_jobs_same_tenant_select"
on public.followup_jobs
for select
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "followup_jobs_same_tenant_insert" on public.followup_jobs;
create policy "followup_jobs_same_tenant_insert"
on public.followup_jobs
for insert
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "followup_jobs_same_tenant_update" on public.followup_jobs;
create policy "followup_jobs_same_tenant_update"
on public.followup_jobs
for update
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
)
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "whatsapp_webhook_events_same_tenant_select" on public.whatsapp_webhook_events;
create policy "whatsapp_webhook_events_same_tenant_select"
on public.whatsapp_webhook_events
for select
using (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);

drop policy if exists "whatsapp_webhook_events_same_tenant_insert" on public.whatsapp_webhook_events;
create policy "whatsapp_webhook_events_same_tenant_insert"
on public.whatsapp_webhook_events
for insert
with check (
  tenant_id in (select tenant_id from public.profiles where id = auth.uid())
);
