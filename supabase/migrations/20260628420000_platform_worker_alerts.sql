create table if not exists public.platform_worker_alerts (
  id uuid primary key default gen_random_uuid(),
  worker_key text not null,
  worker_label text,
  alert_type text not null check (alert_type in ('failure', 'stale')),
  severity text not null check (severity in ('warning', 'critical')),
  period text not null,
  last_http_status integer,
  consecutive_failures integer not null default 0,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  sent_to jsonb not null default '[]'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (worker_key, alert_type, period)
);

create index if not exists platform_worker_alerts_created_idx
  on public.platform_worker_alerts (created_at desc);

create index if not exists platform_worker_alerts_worker_idx
  on public.platform_worker_alerts (worker_key, created_at desc);

alter table public.platform_worker_alerts enable row level security;

drop policy if exists "platform_worker_alerts_platform_admin_select"
  on public.platform_worker_alerts;
create policy "platform_worker_alerts_platform_admin_select"
  on public.platform_worker_alerts for select
  to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
