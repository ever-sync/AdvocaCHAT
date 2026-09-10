-- Módulo de Agendamento multi-prestador (F0 — fundação).
--  - Catálogo de serviços reusa products (tipo='servico') + vínculo serviço↔prestador.
--  - Config de prestador (timezone, granularidade), horários de trabalho e exceções.
--  - scheduling_appointments: núcleo, com constraint btree_gist anti-overbooking.
--  - scheduling_google_connections: tokens criptografados por prestador (duas vias).
--  - scheduling_public_config: link público de auto-agendamento por tenant.
--  - scheduling_reminders: fila de lembretes WhatsApp (consumida na F5).
-- Padrão multi-tenant: tenant_id FK + RLS is_same_tenant + trigger set_updated_at.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- products: campos de agendamento (serviços).
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists duracao_min integer,
  add column if not exists agendavel boolean not null default false;

-- ---------------------------------------------------------------------------
-- scheduling_services: quais prestadores fazem cada serviço (e por quanto tempo).
-- ---------------------------------------------------------------------------
create table if not exists public.scheduling_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  duracao_min integer not null default 30 check (duracao_min > 0),
  preco numeric,
  buffer_antes_min integer not null default 0 check (buffer_antes_min >= 0),
  buffer_depois_min integer not null default 0 check (buffer_depois_min >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, product_id, provider_id)
);

create index if not exists scheduling_services_provider_idx
  on public.scheduling_services (tenant_id, provider_id) where ativo;
create index if not exists scheduling_services_product_idx
  on public.scheduling_services (tenant_id, product_id) where ativo;

-- ---------------------------------------------------------------------------
-- scheduling_provider_settings: 1 linha por prestador.
-- ---------------------------------------------------------------------------
create table if not exists public.scheduling_provider_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  slot_granularity_min integer not null default 15 check (slot_granularity_min > 0),
  min_lead_time_min integer not null default 60 check (min_lead_time_min >= 0),
  max_advance_days integer not null default 60 check (max_advance_days > 0),
  accepts_online_booking boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, provider_id)
);

create index if not exists scheduling_provider_settings_tenant_idx
  on public.scheduling_provider_settings (tenant_id);

-- ---------------------------------------------------------------------------
-- scheduling_working_hours: expediente recorrente por dia da semana.
-- Várias linhas por (provider, weekday) = turnos quebrados.
-- ---------------------------------------------------------------------------
create table if not exists public.scheduling_working_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_time > start_time)
);

create index if not exists scheduling_working_hours_provider_idx
  on public.scheduling_working_hours (tenant_id, provider_id, weekday);

-- ---------------------------------------------------------------------------
-- scheduling_exceptions: folgas/bloqueios (block) ou aberturas extras (extra).
-- Também recebe a ocupação importada do Google (kind='block').
-- ---------------------------------------------------------------------------
create table if not exists public.scheduling_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('block', 'extra')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  source text not null default 'manual' check (source in ('manual', 'google')),
  google_event_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at)
);

create index if not exists scheduling_exceptions_provider_idx
  on public.scheduling_exceptions (tenant_id, provider_id, starts_at, ends_at);
create unique index if not exists scheduling_exceptions_google_event_idx
  on public.scheduling_exceptions (tenant_id, provider_id, google_event_id)
  where google_event_id is not null;

-- ---------------------------------------------------------------------------
-- scheduling_appointments: núcleo.
-- ---------------------------------------------------------------------------
create table if not exists public.scheduling_appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid references public.products(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'agendado'
    check (status in ('agendado', 'confirmado', 'concluido', 'cancelado', 'nao_compareceu')),
  origin text not null default 'interno'
    check (origin in ('interno', 'publico', 'google')),
  -- Sincronização Google (duas vias):
  google_event_id text,
  google_calendar_id text,
  google_sync_status text not null default 'pending'
    check (google_sync_status in ('pending', 'synced', 'error', 'skip')),
  google_synced_at timestamptz,
  google_sync_error text,
  -- Snapshot denormalizado para listagens sem N+1:
  customer_nome text,
  customer_telefone text,
  service_nome text,
  preco numeric,
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at)
);

-- Anti-overbooking: nenhum prestador pode ter 2 agendamentos ativos sobrepostos.
-- Corrida (página pública x recepcionista x pull do Google) falha atômica → 409.
alter table public.scheduling_appointments
  drop constraint if exists scheduling_appointments_no_overlap;
alter table public.scheduling_appointments
  add constraint scheduling_appointments_no_overlap
  exclude using gist (
    provider_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status not in ('cancelado', 'nao_compareceu'));

create index if not exists scheduling_appointments_provider_start_idx
  on public.scheduling_appointments (tenant_id, provider_id, starts_at);
create index if not exists scheduling_appointments_tenant_start_idx
  on public.scheduling_appointments (tenant_id, starts_at);
create index if not exists scheduling_appointments_google_pending_idx
  on public.scheduling_appointments (tenant_id, google_sync_status)
  where google_sync_status in ('pending', 'error');
create index if not exists scheduling_appointments_status_start_idx
  on public.scheduling_appointments (tenant_id, status, starts_at);

-- ---------------------------------------------------------------------------
-- scheduling_google_connections: 1 por prestador, tokens criptografados.
-- ---------------------------------------------------------------------------
create table if not exists public.scheduling_google_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  google_account_email text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  access_token_expires_at timestamptz,
  calendar_id text not null default 'primary',
  sync_token text,
  watch_channel_id text,
  watch_resource_id text,
  watch_expires_at timestamptz,
  status text not null default 'connected'
    check (status in ('connected', 'error', 'revoked')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, provider_id)
);

create index if not exists scheduling_google_connections_tenant_idx
  on public.scheduling_google_connections (tenant_id);

-- ---------------------------------------------------------------------------
-- scheduling_public_config: link público de auto-agendamento (1 por tenant).
-- ---------------------------------------------------------------------------
create table if not exists public.scheduling_public_config (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  slug text not null unique,
  is_active boolean not null default false,
  allowed_domains jsonb not null default '[]'::jsonb,
  titulo text,
  descricao text,
  theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- scheduling_reminders: fila de lembretes WhatsApp (consumida na F5).
-- ---------------------------------------------------------------------------
create table if not exists public.scheduling_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_id uuid not null references public.scheduling_appointments(id) on delete cascade,
  kind text not null check (kind in ('confirmacao', 'lembrete_24h', 'lembrete_1h')),
  send_at timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped', 'cancelled')),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (appointment_id, kind)
);

create index if not exists scheduling_reminders_due_idx
  on public.scheduling_reminders (status, send_at) where status = 'queued';
create index if not exists scheduling_reminders_tenant_idx
  on public.scheduling_reminders (tenant_id);

-- ---------------------------------------------------------------------------
-- Triggers set_updated_at.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'scheduling_services',
    'scheduling_provider_settings',
    'scheduling_working_hours',
    'scheduling_exceptions',
    'scheduling_appointments',
    'scheduling_google_connections',
    'scheduling_public_config',
    'scheduling_reminders'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I;', t, t);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS: mesma-tenant em todas as tabelas (select/insert/update/delete).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'scheduling_services',
    'scheduling_provider_settings',
    'scheduling_working_hours',
    'scheduling_exceptions',
    'scheduling_appointments',
    'scheduling_google_connections',
    'scheduling_public_config',
    'scheduling_reminders'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "%s_same_tenant_select" on public.%I;', t, t);
    execute format(
      'create policy "%s_same_tenant_select" on public.%I for select using (public.is_same_tenant(tenant_id));',
      t, t
    );

    execute format('drop policy if exists "%s_same_tenant_insert" on public.%I;', t, t);
    execute format(
      'create policy "%s_same_tenant_insert" on public.%I for insert with check (public.is_same_tenant(tenant_id));',
      t, t
    );

    execute format('drop policy if exists "%s_same_tenant_update" on public.%I;', t, t);
    execute format(
      'create policy "%s_same_tenant_update" on public.%I for update using (public.is_same_tenant(tenant_id)) with check (public.is_same_tenant(tenant_id));',
      t, t
    );

    execute format('drop policy if exists "%s_same_tenant_delete" on public.%I;', t, t);
    execute format(
      'create policy "%s_same_tenant_delete" on public.%I for delete using (public.is_same_tenant(tenant_id));',
      t, t
    );
  end loop;
end $$;
