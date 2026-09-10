-- Configurações de automação (avisos + relatório diário) por tenant
create table if not exists public.automation_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  notice_rules jsonb not null default '[]'::jsonb,
  report_config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.automation_settings enable row level security;

drop policy if exists "automation_settings_same_tenant_select" on public.automation_settings;
create policy "automation_settings_same_tenant_select"
on public.automation_settings
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "automation_settings_same_tenant_insert" on public.automation_settings;
create policy "automation_settings_same_tenant_insert"
on public.automation_settings
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "automation_settings_same_tenant_update" on public.automation_settings;
create policy "automation_settings_same_tenant_update"
on public.automation_settings
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop trigger if exists automation_settings_set_updated_at on public.automation_settings;
create trigger automation_settings_set_updated_at
before update on public.automation_settings
for each row
execute function public.set_updated_at();
