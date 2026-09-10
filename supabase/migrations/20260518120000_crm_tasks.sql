-- Tarefas ligadas a negociações CRM e/ou clientes (independe de `public.tasks` de rotas).

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  negotiation_id uuid references public.crm_negotiations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'aberta' check (status in ('aberta', 'concluida')),
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crm_tasks_negotiation_or_customer check (negotiation_id is not null or customer_id is not null)
);

create index if not exists crm_tasks_tenant_idx on public.crm_tasks (tenant_id);
create index if not exists crm_tasks_negotiation_idx on public.crm_tasks (negotiation_id) where negotiation_id is not null;
create index if not exists crm_tasks_customer_idx on public.crm_tasks (customer_id) where customer_id is not null;
create index if not exists crm_tasks_status_idx on public.crm_tasks (tenant_id, status);

alter table public.crm_tasks enable row level security;

drop policy if exists "crm_tasks_same_tenant_select" on public.crm_tasks;
create policy "crm_tasks_same_tenant_select"
on public.crm_tasks
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "crm_tasks_same_tenant_insert" on public.crm_tasks;
create policy "crm_tasks_same_tenant_insert"
on public.crm_tasks
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_tasks_same_tenant_update" on public.crm_tasks;
create policy "crm_tasks_same_tenant_update"
on public.crm_tasks
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_tasks_same_tenant_delete" on public.crm_tasks;
create policy "crm_tasks_same_tenant_delete"
on public.crm_tasks
for delete
using (public.is_same_tenant(tenant_id));

drop trigger if exists crm_tasks_set_updated_at on public.crm_tasks;
create trigger crm_tasks_set_updated_at
before update on public.crm_tasks
for each row
execute function public.set_updated_at();
