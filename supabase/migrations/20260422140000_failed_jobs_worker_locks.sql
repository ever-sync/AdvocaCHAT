-- Dead-letter para falhas permanentes em automações (inspeção via SQL / futura UI admin)
create table if not exists public.failed_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  job_type text not null,
  ref_table text,
  ref_id uuid,
  payload jsonb not null default '{}'::jsonb,
  error_message text not null,
  attempt_count smallint not null default 1 check (attempt_count >= 1 and attempt_count <= 999),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_failed_jobs_tenant_created on public.failed_jobs (tenant_id, created_at desc);
create index if not exists idx_failed_jobs_job_type on public.failed_jobs (job_type, created_at desc);

alter table public.failed_jobs enable row level security;

comment on table public.failed_jobs is 'Dead-letter: falhas permanentes em automações (preenchido pelas Edge Functions com service_role).';

-- Locks com TTL para workers serverless (evita processamento duplicado se o cron disparar em paralelo)
create table if not exists public.worker_job_locks (
  lock_key text primary key,
  acquired_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create index if not exists idx_worker_job_locks_expires on public.worker_job_locks (expires_at);

alter table public.worker_job_locks enable row level security;

comment on table public.worker_job_locks is 'Locks com TTL; liberar ao concluir ou aguardar expiração.';

create or replace function public.try_acquire_worker_lock(
  p_lock_key text,
  p_ttl_seconds int default 180
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lock_key is null or length(trim(p_lock_key)) = 0 then
    return false;
  end if;

  delete from public.worker_job_locks
  where expires_at < timezone('utc', now());

  insert into public.worker_job_locks (lock_key, expires_at)
  values (
    trim(p_lock_key),
    timezone('utc', now()) + (greatest(1, p_ttl_seconds) || ' seconds')::interval
  );

  return true;
exception when unique_violation then
  return false;
end;
$$;

revoke all on function public.try_acquire_worker_lock(text, int) from public;
grant execute on function public.try_acquire_worker_lock(text, int) to service_role;
