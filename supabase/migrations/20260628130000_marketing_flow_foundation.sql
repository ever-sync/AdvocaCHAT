-- Fase 0 do plano completo de automacoes de marketing.
-- Escopo:
--  - Evolui marketing_flows: status com 4 valores; colunas trigger/published_definition/
--    version/published_at/published_by.
--  - Cria marketing_flow_versions (historico imutavel de publicacoes).
--  - Cria marketing_flow_participants (leads dentro de cada fluxo).
--  - Cria marketing_flow_jobs (fila de execucao, com lock atomico).
--  - Cria marketing_flow_events (auditoria de cada passo).
--  - Cria marketing_flow_suppressions (opt-out por canal).
--  - Cria RPC claim_marketing_flow_jobs() para o worker pegar jobs com SKIP LOCKED.
-- RLS: leitura para usuarios com marketing.view do tenant; participants/jobs/events
--      sao mutados apenas via service_role (worker).

-- =====================================================================
-- 1) marketing_flows: evolucao do status + colunas de publicacao
-- =====================================================================
alter table public.marketing_flows
  add column if not exists trigger jsonb not null default '{}'::jsonb,
  add column if not exists published_definition jsonb,
  add column if not exists version integer not null default 1,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id) on delete set null;

-- Migra dados existentes antes de trocar o check (inativo legado -> rascunho).
update public.marketing_flows
set status = 'rascunho'
where status = 'inativo';

alter table public.marketing_flows
  drop constraint if exists marketing_flows_status_check;

alter table public.marketing_flows
  add constraint marketing_flows_status_check
  check (status in ('rascunho', 'ativo', 'pausado', 'arquivado'));

alter table public.marketing_flows
  alter column status set default 'rascunho';

-- =====================================================================
-- 2) marketing_flow_versions: snapshot imutavel publicado
-- =====================================================================
create table if not exists public.marketing_flow_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  flow_id uuid not null references public.marketing_flows(id) on delete cascade,
  version integer not null,
  definition jsonb not null default '{"steps": []}'::jsonb,
  criteria jsonb not null default '{}'::jsonb,
  trigger jsonb not null default '{}'::jsonb,
  validation_snapshot jsonb not null default '{}'::jsonb,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default timezone('utc', now()),
  unique (flow_id, version)
);

create index if not exists marketing_flow_versions_tenant_idx
  on public.marketing_flow_versions (tenant_id);
create index if not exists marketing_flow_versions_flow_idx
  on public.marketing_flow_versions (flow_id, version desc);

alter table public.marketing_flow_versions enable row level security;

drop policy if exists "marketing_flow_versions_select" on public.marketing_flow_versions;
create policy "marketing_flow_versions_select"
on public.marketing_flow_versions for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'view')
);

drop policy if exists "marketing_flow_versions_insert" on public.marketing_flow_versions;
create policy "marketing_flow_versions_insert"
on public.marketing_flow_versions for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
);
-- update/delete intencionalmente nao expostos: versoes sao imutaveis.

-- =====================================================================
-- 3) marketing_flow_participants: leads/clientes/negociacoes em execucao
-- =====================================================================
create table if not exists public.marketing_flow_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  flow_id uuid not null references public.marketing_flows(id) on delete cascade,
  flow_version_id uuid references public.marketing_flow_versions(id) on delete set null,
  customer_id uuid references public.customers(id) on delete cascade,
  chat_id text,
  negotiation_id uuid references public.crm_negotiations(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'waiting', 'completed', 'exited', 'failed', 'paused')),
  current_step_id text,
  entered_at timestamptz not null default timezone('utc', now()),
  next_run_at timestamptz,
  exited_at timestamptz,
  exit_reason text,
  dedupe_key text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- dedupe por fluxo: NULL nao bloqueia (Postgres considera NULLs distintos).
  unique (flow_id, dedupe_key)
);

create index if not exists marketing_flow_participants_tenant_idx
  on public.marketing_flow_participants (tenant_id);
create index if not exists marketing_flow_participants_status_idx
  on public.marketing_flow_participants (tenant_id, status);
create index if not exists marketing_flow_participants_next_run_idx
  on public.marketing_flow_participants (status, next_run_at)
  where status in ('active', 'waiting');
create index if not exists marketing_flow_participants_customer_idx
  on public.marketing_flow_participants (customer_id);

drop trigger if exists marketing_flow_participants_set_updated_at
  on public.marketing_flow_participants;
create trigger marketing_flow_participants_set_updated_at
before update on public.marketing_flow_participants
for each row execute function public.set_updated_at();

alter table public.marketing_flow_participants enable row level security;

drop policy if exists "marketing_flow_participants_select"
  on public.marketing_flow_participants;
create policy "marketing_flow_participants_select"
on public.marketing_flow_participants for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'view')
);
-- insert/update/delete apenas via service_role (worker).

-- =====================================================================
-- 4) marketing_flow_jobs: fila de execucao com lock atomico
-- =====================================================================
create table if not exists public.marketing_flow_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  flow_id uuid not null references public.marketing_flows(id) on delete cascade,
  participant_id uuid not null references public.marketing_flow_participants(id) on delete cascade,
  step_id text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed', 'dead')),
  run_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  locked_by text,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  idempotency_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (idempotency_key)
);

create index if not exists marketing_flow_jobs_run_idx
  on public.marketing_flow_jobs (status, run_at)
  where status in ('queued', 'running');
create index if not exists marketing_flow_jobs_tenant_idx
  on public.marketing_flow_jobs (tenant_id);
create index if not exists marketing_flow_jobs_participant_idx
  on public.marketing_flow_jobs (participant_id);

drop trigger if exists marketing_flow_jobs_set_updated_at
  on public.marketing_flow_jobs;
create trigger marketing_flow_jobs_set_updated_at
before update on public.marketing_flow_jobs
for each row execute function public.set_updated_at();

alter table public.marketing_flow_jobs enable row level security;

drop policy if exists "marketing_flow_jobs_select" on public.marketing_flow_jobs;
create policy "marketing_flow_jobs_select"
on public.marketing_flow_jobs for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'view')
);
-- insert/update/delete apenas via service_role.

-- =====================================================================
-- 5) RPC claim_marketing_flow_jobs: lock atomico para o worker
-- =====================================================================
create or replace function public.claim_marketing_flow_jobs(
  p_limit integer default 10,
  p_worker text default 'worker'
)
returns setof public.marketing_flow_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id
    from public.marketing_flow_jobs
    where status = 'queued'
      and run_at <= timezone('utc', now())
    order by run_at asc
    for update skip locked
    limit greatest(coalesce(p_limit, 10), 1)
  )
  update public.marketing_flow_jobs j
  set status = 'running',
      locked_at = timezone('utc', now()),
      locked_by = p_worker,
      attempts = j.attempts + 1
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

revoke all on function public.claim_marketing_flow_jobs(integer, text) from public;
grant execute on function public.claim_marketing_flow_jobs(integer, text) to service_role;

-- =====================================================================
-- 6) marketing_flow_events: auditoria
-- =====================================================================
create table if not exists public.marketing_flow_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  flow_id uuid not null references public.marketing_flows(id) on delete cascade,
  participant_id uuid references public.marketing_flow_participants(id) on delete cascade,
  event_type text not null,
  step_id text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists marketing_flow_events_tenant_idx
  on public.marketing_flow_events (tenant_id);
create index if not exists marketing_flow_events_flow_idx
  on public.marketing_flow_events (flow_id, created_at desc);
create index if not exists marketing_flow_events_participant_idx
  on public.marketing_flow_events (participant_id, created_at desc);

alter table public.marketing_flow_events enable row level security;

drop policy if exists "marketing_flow_events_select" on public.marketing_flow_events;
create policy "marketing_flow_events_select"
on public.marketing_flow_events for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'view')
);
-- insert apenas via service_role (worker grava cada evento).

-- =====================================================================
-- 7) marketing_flow_suppressions: opt-out por canal
-- =====================================================================
create table if not exists public.marketing_flow_suppressions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  channel text not null
    check (channel in ('whatsapp', 'email', 'sms', 'all')),
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, customer_id, channel)
);

create index if not exists marketing_flow_suppressions_tenant_idx
  on public.marketing_flow_suppressions (tenant_id);
create index if not exists marketing_flow_suppressions_customer_idx
  on public.marketing_flow_suppressions (customer_id, channel);

alter table public.marketing_flow_suppressions enable row level security;

drop policy if exists "marketing_flow_suppressions_select"
  on public.marketing_flow_suppressions;
create policy "marketing_flow_suppressions_select"
on public.marketing_flow_suppressions for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'view')
);

drop policy if exists "marketing_flow_suppressions_insert"
  on public.marketing_flow_suppressions;
create policy "marketing_flow_suppressions_insert"
on public.marketing_flow_suppressions for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
);

drop policy if exists "marketing_flow_suppressions_delete"
  on public.marketing_flow_suppressions;
create policy "marketing_flow_suppressions_delete"
on public.marketing_flow_suppressions for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
);
