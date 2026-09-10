-- Definição de funis CRM por tenant (JSON). Sem linha = app usa funis padrão em `DEFAULT_CRM_FUNNELS`.

create table if not exists public.tenant_crm_funnel_config (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  funnels jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.tenant_crm_funnel_config enable row level security;

drop policy if exists "tenant_crm_funnel_config_select" on public.tenant_crm_funnel_config;
create policy "tenant_crm_funnel_config_select"
on public.tenant_crm_funnel_config
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "tenant_crm_funnel_config_insert" on public.tenant_crm_funnel_config;
create policy "tenant_crm_funnel_config_insert"
on public.tenant_crm_funnel_config
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "tenant_crm_funnel_config_update" on public.tenant_crm_funnel_config;
create policy "tenant_crm_funnel_config_update"
on public.tenant_crm_funnel_config
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "tenant_crm_funnel_config_delete" on public.tenant_crm_funnel_config;
create policy "tenant_crm_funnel_config_delete"
on public.tenant_crm_funnel_config
for delete
using (public.is_same_tenant(tenant_id));

drop trigger if exists tenant_crm_funnel_config_set_updated_at on public.tenant_crm_funnel_config;
create trigger tenant_crm_funnel_config_set_updated_at
before update on public.tenant_crm_funnel_config
for each row
execute function public.set_updated_at();
