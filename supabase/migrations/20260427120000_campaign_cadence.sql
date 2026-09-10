-- Add cadence config to campaigns for anti-ban send rate control
-- cadence: { minDelaySeconds, maxDelaySeconds, batchSize, batchPauseMinutes,
--            sendWindowStart, sendWindowEnd, allowedDays, maxPerDay }
alter table public.campaigns
  add column if not exists cadence jsonb not null default '{}'::jsonb;

-- Add bodyVariants support inside content (no schema change needed, jsonb is flexible)
-- campaigns.content may now include bodyVariants: string[]

comment on column public.campaigns.cadence is
  'Anti-ban send cadence: minDelaySeconds, maxDelaySeconds, batchSize, batchPauseMinutes, sendWindowStart (HH:MM), sendWindowEnd (HH:MM), allowedDays (0=Sun..6=Sat), maxPerDay';
