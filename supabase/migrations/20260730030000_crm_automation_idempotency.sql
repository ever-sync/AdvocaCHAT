-- Ledger central de idempotência para automações do CRM.
-- A chave é isolada por tenant e tipo de evento.

create table if not exists public.crm_automation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  idempotency_key text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  lease_expires_at timestamptz,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, event_type, idempotency_key)
);

create index if not exists crm_automation_events_status_idx
  on public.crm_automation_events (tenant_id, status, lease_expires_at);

create index if not exists crm_automation_events_resource_idx
  on public.crm_automation_events (tenant_id, resource_type, resource_id)
  where resource_id is not null;

alter table public.crm_automation_events enable row level security;

drop policy if exists "crm_automation_events_same_tenant_select"
  on public.crm_automation_events;
create policy "crm_automation_events_same_tenant_select"
  on public.crm_automation_events
  for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

create or replace function public.claim_crm_automation_event(
  p_tenant_id uuid,
  p_event_type text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.crm_automation_events%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 600), 3600));
begin
  if nullif(trim(p_event_type), '') is null
     or nullif(trim(p_idempotency_key), '') is null then
    raise exception 'event_type and idempotency_key are required';
  end if;

  insert into public.crm_automation_events (
    tenant_id,
    event_type,
    idempotency_key,
    status,
    attempts,
    lease_expires_at,
    metadata,
    first_seen_at,
    last_seen_at,
    created_at,
    updated_at
  )
  values (
    p_tenant_id,
    trim(p_event_type),
    trim(p_idempotency_key),
    'processing',
    1,
    v_now + make_interval(secs => v_lease_seconds),
    coalesce(p_metadata, '{}'::jsonb),
    v_now,
    v_now,
    v_now,
    v_now
  )
  on conflict (tenant_id, event_type, idempotency_key) do nothing
  returning * into v_event;

  if found then
    return jsonb_build_object(
      'claimed', true,
      'deduplicated', false,
      'event', to_jsonb(v_event)
    );
  end if;

  select *
    into v_event
    from public.crm_automation_events
   where tenant_id = p_tenant_id
     and event_type = trim(p_event_type)
     and idempotency_key = trim(p_idempotency_key)
   for update;

  update public.crm_automation_events
     set last_seen_at = v_now,
         updated_at = v_now
   where id = v_event.id;

  if v_event.status = 'completed' then
    return jsonb_build_object(
      'claimed', false,
      'deduplicated', true,
      'reason', 'completed',
      'event', to_jsonb(v_event)
    );
  end if;

  if v_event.status = 'processing'
     and v_event.lease_expires_at is not null
     and v_event.lease_expires_at > v_now then
    return jsonb_build_object(
      'claimed', false,
      'deduplicated', true,
      'reason', 'processing',
      'event', to_jsonb(v_event)
    );
  end if;

  update public.crm_automation_events
     set status = 'processing',
         attempts = attempts + 1,
         lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
         metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
         last_seen_at = v_now,
         updated_at = v_now
   where id = v_event.id
  returning * into v_event;

  return jsonb_build_object(
    'claimed', true,
    'deduplicated', false,
    'reason', 'retry',
    'event', to_jsonb(v_event)
  );
end;
$$;

create or replace function public.complete_crm_automation_event(
  p_tenant_id uuid,
  p_event_type text,
  p_idempotency_key text,
  p_resource_type text default null,
  p_resource_id text default null,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.crm_automation_events%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  update public.crm_automation_events
     set status = 'completed',
         lease_expires_at = null,
         resource_type = nullif(trim(coalesce(p_resource_type, '')), ''),
         resource_id = nullif(trim(coalesce(p_resource_id, '')), ''),
         result = coalesce(p_result, '{}'::jsonb),
         completed_at = coalesce(completed_at, v_now),
         last_seen_at = v_now,
         updated_at = v_now
   where tenant_id = p_tenant_id
     and event_type = trim(p_event_type)
     and idempotency_key = trim(p_idempotency_key)
  returning * into v_event;

  if not found then
    raise exception 'automation event not found';
  end if;

  return jsonb_build_object('ok', true, 'event', to_jsonb(v_event));
end;
$$;

create or replace function public.fail_crm_automation_event(
  p_tenant_id uuid,
  p_event_type text,
  p_idempotency_key text,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.crm_automation_events%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  update public.crm_automation_events
     set status = 'failed',
         lease_expires_at = null,
         result = coalesce(p_result, '{}'::jsonb),
         last_seen_at = v_now,
         updated_at = v_now
   where tenant_id = p_tenant_id
     and event_type = trim(p_event_type)
     and idempotency_key = trim(p_idempotency_key)
  returning * into v_event;

  if not found then
    raise exception 'automation event not found';
  end if;

  return jsonb_build_object('ok', true, 'event', to_jsonb(v_event));
end;
$$;

revoke all on function public.claim_crm_automation_event(uuid, text, text, jsonb, integer)
  from public, anon, authenticated;
revoke all on function public.complete_crm_automation_event(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_crm_automation_event(uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.claim_crm_automation_event(uuid, text, text, jsonb, integer)
  to service_role;
grant execute on function public.complete_crm_automation_event(uuid, text, text, text, text, jsonb)
  to service_role;
grant execute on function public.fail_crm_automation_event(uuid, text, text, jsonb)
  to service_role;

comment on table public.crm_automation_events is
  'Ledger de idempotência dos efeitos produzidos por n8n, IA, formulários e integrações.';
