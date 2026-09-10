-- Marketing Forms — trilha de eventos do widget para análise de abandono.
-- Registra view, step_view, field interaction, submit e abandon por sessão.

create table if not exists public.marketing_form_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  form_id uuid not null references public.marketing_forms(id) on delete cascade,
  session_id text not null,
  event_type text not null,
  step_id text,
  field_name text,
  field_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists marketing_form_events_tenant_idx
  on public.marketing_form_events (tenant_id, created_at desc);

create index if not exists marketing_form_events_form_idx
  on public.marketing_form_events (form_id, created_at desc);

create index if not exists marketing_form_events_session_idx
  on public.marketing_form_events (tenant_id, session_id, created_at desc);

create index if not exists marketing_form_events_event_idx
  on public.marketing_form_events (tenant_id, event_type, created_at desc);

alter table public.marketing_form_events enable row level security;

drop policy if exists "marketing_form_events_select" on public.marketing_form_events;
create policy "marketing_form_events_select"
on public.marketing_form_events for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'view')
);
