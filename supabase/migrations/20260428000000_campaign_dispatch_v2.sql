-- Campaign dispatch v2: tick-based architecture
--
-- Problem: the old dispatcher slept inside a loop, causing edge function timeouts
-- for campaigns larger than ~5 recipients.
--
-- Fix: encode delays as scheduled_for timestamps on each recipient.
-- The dispatcher now processes ONE due recipient per HTTP call and returns immediately.
-- A pg_cron job (or Supabase Scheduled Function) calls the dispatcher every 30s.
--
-- Also adds sent_today_count/sent_today_date to campaigns so the daily limit
-- is enforced correctly across multiple function invocations.

-- 1. scheduled_for on campaign_recipients ----------------------------------
alter table public.campaign_recipients
  add column if not exists scheduled_for timestamptz not null default timezone('utc', now());

-- Efficient index for "pick next due recipient for this campaign"
create index if not exists campaign_recipients_dispatch_idx
  on public.campaign_recipients (campaign_id, scheduled_for)
  where status = 'queued';

-- 2. Daily send tracking on campaigns --------------------------------------
alter table public.campaigns
  add column if not exists sent_today_count integer not null default 0,
  add column if not exists sent_today_date  date;

-- 3. pg_cron setup (requires pg_cron + pg_net extensions) ------------------
--
-- Run in Supabase SQL Editor after enabling pg_net:
--   create extension if not exists pg_net;
--   create extension if not exists pg_cron;
--
-- Then schedule the dispatcher to tick every 30 seconds.
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> with your actual values,
-- or configure via Supabase Dashboard → Edge Functions → Schedule.
--
-- select cron.schedule(
--   'campaign-dispatcher-tick',
--   '* * * * *',   -- every minute (pg_cron minimum granularity)
--   $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/campaign-dispatcher',
--     headers := jsonb_build_object(
--       'Content-Type',  'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--     ),
--     body    := '{}'::jsonb
--   )
--   $$
-- );
--
-- Note: for sub-minute precision (every 30s), schedule two cron entries offset by 30s
-- or use Supabase Scheduled Functions (dashboard) with a 30s interval.
