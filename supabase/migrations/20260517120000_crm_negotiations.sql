-- Negociações do Kanban CRM (fonte canônica quando a linha existe).
-- Leads sem cliente: apenas esta tabela (+ estágio).
-- Clientes no quadro: podem ter linha aqui com customer_id OU, até migrar, estágio em customers.source_columns
--   (ver `resolveKanbanStageId` em src/lib/crm/negotiation-model.ts).

create table if not exists public.crm_negotiations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  funnel_id text not null,
  stage_id text not null,
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'vendido', 'perdido', 'pausado', 'nao_pausado')),
  assignee_id uuid references public.profiles(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  star_count integer not null default 0 check (star_count >= 0 and star_count <= 20),
  qualification smallint not null default 0 check (qualification >= 0 and qualification <= 5),
  total_value numeric(14, 2) not null default 0,
  next_task_at timestamptz,
  closing_forecast timestamptz,
  last_contact_at timestamptz,
  last_interaction_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists crm_negotiations_tenant_idx
  on public.crm_negotiations (tenant_id);

create index if not exists crm_negotiations_tenant_funnel_idx
  on public.crm_negotiations (tenant_id, funnel_id);

create index if not exists crm_negotiations_tenant_stage_idx
  on public.crm_negotiations (tenant_id, stage_id);

create index if not exists crm_negotiations_customer_idx
  on public.crm_negotiations (customer_id)
  where customer_id is not null;

create index if not exists crm_negotiations_assignee_idx
  on public.crm_negotiations (assignee_id)
  where assignee_id is not null;

alter table public.crm_negotiations enable row level security;

drop policy if exists "crm_negotiations_same_tenant_select" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_select"
on public.crm_negotiations
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiations_same_tenant_insert" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_insert"
on public.crm_negotiations
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiations_same_tenant_update" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_update"
on public.crm_negotiations
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiations_same_tenant_delete" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_delete"
on public.crm_negotiations
for delete
using (public.is_same_tenant(tenant_id));

drop trigger if exists crm_negotiations_set_updated_at on public.crm_negotiations;
create trigger crm_negotiations_set_updated_at
before update on public.crm_negotiations
for each row
execute function public.set_updated_at();
