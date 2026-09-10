create table if not exists public.platform_worker_heartbeats (
  worker_key text primary key,
  worker_label text,
  schedule text,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_http_status integer,
  last_ok boolean not null default false,
  consecutive_failures integer not null default 0,
  duration_ms integer,
  response_excerpt text,
  error_excerpt text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.platform_worker_runs (
  id uuid primary key default gen_random_uuid(),
  worker_key text not null,
  worker_label text,
  schedule text,
  started_at timestamptz not null,
  finished_at timestamptz not null default timezone('utc', now()),
  http_status integer,
  ok boolean not null default false,
  duration_ms integer,
  response_excerpt text,
  error_excerpt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists platform_worker_runs_worker_created_idx
  on public.platform_worker_runs (worker_key, created_at desc);

create index if not exists platform_worker_runs_failures_idx
  on public.platform_worker_runs (created_at desc)
  where ok = false;

alter table public.platform_worker_heartbeats enable row level security;
alter table public.platform_worker_runs enable row level security;

drop policy if exists "platform_worker_heartbeats_platform_admin_select"
  on public.platform_worker_heartbeats;
create policy "platform_worker_heartbeats_platform_admin_select"
  on public.platform_worker_heartbeats for select
  to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

drop policy if exists "platform_worker_runs_platform_admin_select"
  on public.platform_worker_runs;
create policy "platform_worker_runs_platform_admin_select"
  on public.platform_worker_runs for select
  to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

create or replace function public.record_platform_worker_run(
  p_worker_key text,
  p_worker_label text default null,
  p_schedule text default null,
  p_started_at timestamptz default null,
  p_finished_at timestamptz default null,
  p_http_status integer default null,
  p_ok boolean default false,
  p_duration_ms integer default null,
  p_response_excerpt text default null,
  p_error_excerpt text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.platform_worker_heartbeats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started_at timestamptz := coalesce(p_started_at, timezone('utc', now()));
  v_finished_at timestamptz := coalesce(p_finished_at, timezone('utc', now()));
  v_row public.platform_worker_heartbeats;
begin
  if nullif(trim(coalesce(p_worker_key, '')), '') is null then
    raise exception 'worker_key obrigatorio';
  end if;

  insert into public.platform_worker_runs (
    worker_key,
    worker_label,
    schedule,
    started_at,
    finished_at,
    http_status,
    ok,
    duration_ms,
    response_excerpt,
    error_excerpt,
    metadata
  )
  values (
    p_worker_key,
    nullif(trim(coalesce(p_worker_label, '')), ''),
    nullif(trim(coalesce(p_schedule, '')), ''),
    v_started_at,
    v_finished_at,
    p_http_status,
    coalesce(p_ok, false),
    p_duration_ms,
    left(coalesce(p_response_excerpt, ''), 4000),
    left(coalesce(p_error_excerpt, ''), 4000),
    coalesce(p_metadata, '{}'::jsonb)
  );

  insert into public.platform_worker_heartbeats (
    worker_key,
    worker_label,
    schedule,
    last_started_at,
    last_finished_at,
    last_success_at,
    last_failure_at,
    last_http_status,
    last_ok,
    consecutive_failures,
    duration_ms,
    response_excerpt,
    error_excerpt,
    metadata,
    updated_at
  )
  values (
    p_worker_key,
    nullif(trim(coalesce(p_worker_label, '')), ''),
    nullif(trim(coalesce(p_schedule, '')), ''),
    v_started_at,
    v_finished_at,
    case when coalesce(p_ok, false) then v_finished_at else null end,
    case when coalesce(p_ok, false) then null else v_finished_at end,
    p_http_status,
    coalesce(p_ok, false),
    case when coalesce(p_ok, false) then 0 else 1 end,
    p_duration_ms,
    left(coalesce(p_response_excerpt, ''), 4000),
    left(coalesce(p_error_excerpt, ''), 4000),
    coalesce(p_metadata, '{}'::jsonb),
    timezone('utc', now())
  )
  on conflict (worker_key) do update set
    worker_label = coalesce(excluded.worker_label, platform_worker_heartbeats.worker_label),
    schedule = coalesce(excluded.schedule, platform_worker_heartbeats.schedule),
    last_started_at = excluded.last_started_at,
    last_finished_at = excluded.last_finished_at,
    last_success_at = case
      when excluded.last_ok then excluded.last_finished_at
      else platform_worker_heartbeats.last_success_at
    end,
    last_failure_at = case
      when excluded.last_ok then platform_worker_heartbeats.last_failure_at
      else excluded.last_finished_at
    end,
    last_http_status = excluded.last_http_status,
    last_ok = excluded.last_ok,
    consecutive_failures = case
      when excluded.last_ok then 0
      else platform_worker_heartbeats.consecutive_failures + 1
    end,
    duration_ms = excluded.duration_ms,
    response_excerpt = excluded.response_excerpt,
    error_excerpt = excluded.error_excerpt,
    metadata = excluded.metadata,
    updated_at = timezone('utc', now())
  returning * into v_row;

  -- Retencao simples: mantem cerca de 14 dias ou ultimas execucoes recentes.
  delete from public.platform_worker_runs
  where created_at < timezone('utc', now()) - interval '14 days';

  return v_row;
end;
$$;

revoke all on function public.record_platform_worker_run(
  text, text, text, timestamptz, timestamptz, integer, boolean, integer, text, text, jsonb
) from public;
grant execute on function public.record_platform_worker_run(
  text, text, text, timestamptz, timestamptz, integer, boolean, integer, text, text, jsonb
) to service_role;
