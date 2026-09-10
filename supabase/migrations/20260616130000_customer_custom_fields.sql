-- Campos personalizados por contato (definições + valores por cliente)

create table if not exists public.customer_custom_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null,
  kind text not null check (
    kind in (
      'texto', 'texto_longo', 'numero', 'inteiro', 'moeda', 'porcentagem',
      'data', 'hora', 'data_hora', 'email', 'telefone', 'url',
      'cpf', 'cnpj', 'cep', 'booleano', 'lista', 'cor'
    )
  ),
  options jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_custom_fields_nome_nonempty check (char_length(trim(nome)) > 0)
);

create unique index if not exists customer_custom_fields_tenant_nome_lower_idx
  on public.customer_custom_fields (tenant_id, lower(trim(nome)));

create index if not exists customer_custom_fields_tenant_sort_idx
  on public.customer_custom_fields (tenant_id, sort_order, nome);

drop trigger if exists customer_custom_fields_set_updated_at on public.customer_custom_fields;
create trigger customer_custom_fields_set_updated_at
before update on public.customer_custom_fields
for each row execute function public.set_updated_at();

alter table public.customer_custom_fields enable row level security;

drop policy if exists "customer_custom_fields_same_tenant_select" on public.customer_custom_fields;
create policy "customer_custom_fields_same_tenant_select"
on public.customer_custom_fields for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "customer_custom_fields_same_tenant_insert" on public.customer_custom_fields;
create policy "customer_custom_fields_same_tenant_insert"
on public.customer_custom_fields for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "customer_custom_fields_same_tenant_update" on public.customer_custom_fields;
create policy "customer_custom_fields_same_tenant_update"
on public.customer_custom_fields for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "customer_custom_fields_same_tenant_delete" on public.customer_custom_fields;
create policy "customer_custom_fields_same_tenant_delete"
on public.customer_custom_fields for delete
using (public.is_same_tenant(tenant_id));

create table if not exists public.customer_custom_field_values (
  customer_id uuid not null references public.customers(id) on delete cascade,
  field_id uuid not null references public.customer_custom_fields(id) on delete cascade,
  value_text text,
  value_numeric numeric,
  value_date date,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (customer_id, field_id)
);

create index if not exists customer_custom_field_values_field_idx
  on public.customer_custom_field_values (field_id);

drop trigger if exists customer_custom_field_values_set_updated_at on public.customer_custom_field_values;
create trigger customer_custom_field_values_set_updated_at
before update on public.customer_custom_field_values
for each row execute function public.set_updated_at();

alter table public.customer_custom_field_values enable row level security;

drop policy if exists "customer_custom_field_values_select" on public.customer_custom_field_values;
create policy "customer_custom_field_values_select"
on public.customer_custom_field_values for select
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_id and public.is_same_tenant(c.tenant_id)
  )
  and exists (
    select 1 from public.customer_custom_fields f
    where f.id = field_id and public.is_same_tenant(f.tenant_id)
  )
);

drop policy if exists "customer_custom_field_values_insert" on public.customer_custom_field_values;
create policy "customer_custom_field_values_insert"
on public.customer_custom_field_values for insert
with check (
  exists (
    select 1 from public.customers c
    where c.id = customer_id and public.is_same_tenant(c.tenant_id)
  )
  and exists (
    select 1 from public.customer_custom_fields f
    where f.id = field_id and public.is_same_tenant(f.tenant_id)
  )
);

drop policy if exists "customer_custom_field_values_update" on public.customer_custom_field_values;
create policy "customer_custom_field_values_update"
on public.customer_custom_field_values for update
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_id and public.is_same_tenant(c.tenant_id)
  )
  and exists (
    select 1 from public.customer_custom_fields f
    where f.id = field_id and public.is_same_tenant(f.tenant_id)
  )
)
with check (
  exists (
    select 1 from public.customers c
    where c.id = customer_id and public.is_same_tenant(c.tenant_id)
  )
  and exists (
    select 1 from public.customer_custom_fields f
    where f.id = field_id and public.is_same_tenant(f.tenant_id)
  )
);

drop policy if exists "customer_custom_field_values_delete" on public.customer_custom_field_values;
create policy "customer_custom_field_values_delete"
on public.customer_custom_field_values for delete
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_id and public.is_same_tenant(c.tenant_id)
  )
  and exists (
    select 1 from public.customer_custom_fields f
    where f.id = field_id and public.is_same_tenant(f.tenant_id)
  )
);
