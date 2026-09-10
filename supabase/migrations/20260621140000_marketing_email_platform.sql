-- Fase 6: plataforma de e-mail (transacional).
--  - marketing_email_templates: templates por bloco (subject + blocks jsonb).
--  - marketing_email_dispatches: fila de envio com retry/idempotência (gerida por service_role).
--  - marketing_email_suppressions: lista de descadastro / bounces.
--  - marketing_email_provider_events: eventos do provedor (open/click/bounce).
--  - tenant_email_settings: identidade de envio do tenant.
-- RLS: leitura por quem tem marketing view; escritas de templates/suppr/settings por marketing edit.
-- Fila e eventos são gravados pela edge function (service_role bypassa RLS).

-- =====================================================================
-- 1) Templates
-- =====================================================================
create table if not exists public.marketing_email_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  subject text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  from_name text,
  from_email text,
  reply_to text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists marketing_email_templates_tenant_idx on public.marketing_email_templates (tenant_id);

drop trigger if exists marketing_email_templates_set_updated_at on public.marketing_email_templates;
create trigger marketing_email_templates_set_updated_at
before update on public.marketing_email_templates
for each row execute function public.set_updated_at();

-- FK do form -> template (coluna criada na Fase 1)
alter table public.marketing_forms
  drop constraint if exists marketing_forms_email_template_fk;
alter table public.marketing_forms
  add constraint marketing_forms_email_template_fk
  foreign key (email_template_id) references public.marketing_email_templates(id) on delete set null;

-- =====================================================================
-- 2) Fila de envio
-- =====================================================================
create table if not exists public.marketing_email_dispatches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  negotiation_id uuid references public.crm_negotiations(id) on delete set null,
  template_id uuid references public.marketing_email_templates(id) on delete set null,
  trigger_type text not null default 'lead_received',
  email_type text not null default 'transactional',
  recipient_email text not null,
  subject text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  variables jsonb not null default '{}'::jsonb,
  provider text default 'resend',
  provider_message_id text,
  idempotency_key text not null unique,
  status text not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  error text,
  response jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists marketing_email_dispatches_tenant_idx on public.marketing_email_dispatches (tenant_id);
create index if not exists marketing_email_dispatches_pending_idx
  on public.marketing_email_dispatches (status, next_attempt_at)
  where status in ('queued', 'retrying');

drop trigger if exists marketing_email_dispatches_set_updated_at on public.marketing_email_dispatches;
create trigger marketing_email_dispatches_set_updated_at
before update on public.marketing_email_dispatches
for each row execute function public.set_updated_at();

-- =====================================================================
-- 3) Suppressions
-- =====================================================================
create table if not exists public.marketing_email_suppressions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  reason text default 'unsubscribe',
  source text default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, email)
);
create index if not exists marketing_email_suppressions_tenant_idx on public.marketing_email_suppressions (tenant_id);

drop trigger if exists marketing_email_suppressions_set_updated_at on public.marketing_email_suppressions;
create trigger marketing_email_suppressions_set_updated_at
before update on public.marketing_email_suppressions
for each row execute function public.set_updated_at();

-- =====================================================================
-- 4) Eventos do provedor
-- =====================================================================
create table if not exists public.marketing_email_provider_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  dispatch_id uuid references public.marketing_email_dispatches(id) on delete set null,
  provider text not null default 'resend',
  provider_message_id text,
  event_type text not null,
  recipient_email text,
  payload jsonb,
  occurred_at timestamptz default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists marketing_email_provider_events_dispatch_idx on public.marketing_email_provider_events (dispatch_id);

-- =====================================================================
-- 5) Identidade de envio do tenant
-- =====================================================================
create table if not exists public.tenant_email_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  provider text not null default 'resend',
  default_from_name text,
  default_from_email text,
  default_reply_to text,
  email_enabled boolean not null default true,
  marketing_requires_consent boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists tenant_email_settings_set_updated_at on public.tenant_email_settings;
create trigger tenant_email_settings_set_updated_at
before update on public.tenant_email_settings
for each row execute function public.set_updated_at();

-- =====================================================================
-- 6) RLS
-- =====================================================================
alter table public.marketing_email_templates enable row level security;
alter table public.marketing_email_dispatches enable row level security;
alter table public.marketing_email_suppressions enable row level security;
alter table public.marketing_email_provider_events enable row level security;
alter table public.tenant_email_settings enable row level security;

-- Templates: CRUD por marketing
drop policy if exists "marketing_email_templates_select" on public.marketing_email_templates;
create policy "marketing_email_templates_select" on public.marketing_email_templates for select
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'view'));

drop policy if exists "marketing_email_templates_insert" on public.marketing_email_templates;
create policy "marketing_email_templates_insert" on public.marketing_email_templates for insert
with check (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'edit'));

drop policy if exists "marketing_email_templates_update" on public.marketing_email_templates;
create policy "marketing_email_templates_update" on public.marketing_email_templates for update
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'edit'))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "marketing_email_templates_delete" on public.marketing_email_templates;
create policy "marketing_email_templates_delete" on public.marketing_email_templates for delete
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'delete'));

-- Dispatches: somente leitura no app (fila escrita por service_role)
drop policy if exists "marketing_email_dispatches_select" on public.marketing_email_dispatches;
create policy "marketing_email_dispatches_select" on public.marketing_email_dispatches for select
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'view'));

-- Suppressions: gerenciáveis por marketing
drop policy if exists "marketing_email_suppressions_select" on public.marketing_email_suppressions;
create policy "marketing_email_suppressions_select" on public.marketing_email_suppressions for select
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'view'));

drop policy if exists "marketing_email_suppressions_insert" on public.marketing_email_suppressions;
create policy "marketing_email_suppressions_insert" on public.marketing_email_suppressions for insert
with check (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'edit'));

drop policy if exists "marketing_email_suppressions_update" on public.marketing_email_suppressions;
create policy "marketing_email_suppressions_update" on public.marketing_email_suppressions for update
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'edit'))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "marketing_email_suppressions_delete" on public.marketing_email_suppressions;
create policy "marketing_email_suppressions_delete" on public.marketing_email_suppressions for delete
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'edit'));

-- Provider events: leitura por marketing
drop policy if exists "marketing_email_provider_events_select" on public.marketing_email_provider_events;
create policy "marketing_email_provider_events_select" on public.marketing_email_provider_events for select
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'view'));

-- Tenant email settings: leitura por marketing view, escrita por marketing edit
drop policy if exists "tenant_email_settings_select" on public.tenant_email_settings;
create policy "tenant_email_settings_select" on public.tenant_email_settings for select
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'view'));

drop policy if exists "tenant_email_settings_insert" on public.tenant_email_settings;
create policy "tenant_email_settings_insert" on public.tenant_email_settings for insert
with check (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'edit'));

drop policy if exists "tenant_email_settings_update" on public.tenant_email_settings;
create policy "tenant_email_settings_update" on public.tenant_email_settings for update
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'edit'))
with check (public.is_same_tenant(tenant_id));
