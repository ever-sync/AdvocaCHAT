-- Override de estágio para `negotiation_id` texto (mocks / leads) até migrarem para `crm_negotiations`.
-- Clientes com cadastro: preferir `customers.source_columns` ou linha em `crm_negotiations` com customer_id.

create table if not exists public.crm_negotiation_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  negotiation_id text not null,
  funnel_id text not null,
  stage_id text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, negotiation_id)
);

create index if not exists crm_negotiation_stages_tenant_idx
  on public.crm_negotiation_stages (tenant_id);

alter table public.crm_negotiation_stages enable row level security;

drop policy if exists "crm_negotiation_stages_same_tenant_select" on public.crm_negotiation_stages;
create policy "crm_negotiation_stages_same_tenant_select"
on public.crm_negotiation_stages
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiation_stages_same_tenant_insert" on public.crm_negotiation_stages;
create policy "crm_negotiation_stages_same_tenant_insert"
on public.crm_negotiation_stages
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiation_stages_same_tenant_update" on public.crm_negotiation_stages;
create policy "crm_negotiation_stages_same_tenant_update"
on public.crm_negotiation_stages
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiation_stages_same_tenant_delete" on public.crm_negotiation_stages;
create policy "crm_negotiation_stages_same_tenant_delete"
on public.crm_negotiation_stages
for delete
using (public.is_same_tenant(tenant_id));

drop trigger if exists crm_negotiation_stages_set_updated_at on public.crm_negotiation_stages;
create trigger crm_negotiation_stages_set_updated_at
before update on public.crm_negotiation_stages
for each row
execute function public.set_updated_at();
