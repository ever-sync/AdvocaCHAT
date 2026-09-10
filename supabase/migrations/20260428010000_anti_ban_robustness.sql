-- Anti-ban & robustness improvements
--
-- 1. customers.opt_out          — permanent opt-out flag set when customer replies STOP
-- 2. campaign_recipients.wa_valid — WhatsApp number existence cache (null=unchecked)
-- 3. instance_send_slots         — cross-campaign rate limiting per WhatsApp instance
-- 4. campaign_events             — audit log (started, completed, auto_paused, error, etc.)

-- ---------------------------------------------------------------------------
-- 1. Permanent opt-out on customers
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists opt_out    boolean      not null default false,
  add column if not exists opt_out_at timestamptz;

-- Efficient lookup: "which customers have opted out in this tenant?"
create index if not exists customers_opt_out_idx
  on public.customers (tenant_id)
  where opt_out = true;

-- ---------------------------------------------------------------------------
-- 2. WhatsApp number validation cache on campaign_recipients
-- ---------------------------------------------------------------------------
alter table public.campaign_recipients
  add column if not exists wa_valid boolean;  -- null=unchecked, true=exists, false=not on WA

-- ---------------------------------------------------------------------------
-- 3. Instance send slots — prevents two campaigns from sending to the
--    same WhatsApp instance simultaneously (cross-campaign rate limiting)
-- ---------------------------------------------------------------------------
create table if not exists public.instance_send_slots (
  instance_id    uuid primary key references public.whatsapp_instances(id) on delete cascade,
  last_sent_at   timestamptz not null default timezone('utc', now()),
  next_allowed_at timestamptz not null default timezone('utc', now())
);

-- Service-role-only table (edge functions use admin client that bypasses RLS)
alter table public.instance_send_slots enable row level security;

drop policy if exists "instance_send_slots_deny_direct" on public.instance_send_slots;
create policy "instance_send_slots_deny_direct"
  on public.instance_send_slots for all
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 4. Campaign events — audit log
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_events (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  campaign_id uuid        not null references public.campaigns(id) on delete cascade,
  event_type  text        not null,   -- 'started' | 'completed' | 'auto_paused' | 'recipient_failed'
                                      -- | 'outside_window' | 'daily_limit' | 'instance_busy' | 'opt_out_detected'
  details     jsonb       not null default '{}',
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists campaign_events_campaign_idx
  on public.campaign_events (campaign_id, created_at desc);

alter table public.campaign_events enable row level security;

drop policy if exists "campaign_events_same_tenant_select" on public.campaign_events;
create policy "campaign_events_same_tenant_select"
  on public.campaign_events for select
  using (
    tenant_id in (select tenant_id from public.profiles where id = auth.uid())
  );
