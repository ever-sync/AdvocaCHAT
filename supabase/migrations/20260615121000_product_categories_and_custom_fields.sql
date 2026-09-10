-- Categorias de catálogo por tenant e campos personalizados por produto

-- 1) Categorias
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_categories_nome_nonempty check (char_length(trim(nome)) > 0)
);

create unique index if not exists product_categories_tenant_nome_lower_idx
  on public.product_categories (tenant_id, lower(trim(nome)));

create index if not exists product_categories_tenant_idx
  on public.product_categories (tenant_id);

drop trigger if exists product_categories_set_updated_at on public.product_categories;
create trigger product_categories_set_updated_at
before update on public.product_categories
for each row execute function public.set_updated_at();

alter table public.product_categories enable row level security;

drop policy if exists "product_categories_same_tenant_select" on public.product_categories;
create policy "product_categories_same_tenant_select"
on public.product_categories for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "product_categories_same_tenant_insert" on public.product_categories;
create policy "product_categories_same_tenant_insert"
on public.product_categories for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "product_categories_same_tenant_update" on public.product_categories;
create policy "product_categories_same_tenant_update"
on public.product_categories for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "product_categories_same_tenant_delete" on public.product_categories;
create policy "product_categories_same_tenant_delete"
on public.product_categories for delete
using (public.is_same_tenant(tenant_id));

-- 2) Vínculo produto ↔ categoria
create table if not exists public.product_category_assignments (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.product_categories(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, category_id)
);

create index if not exists product_category_assignments_category_idx
  on public.product_category_assignments (category_id);

alter table public.product_category_assignments enable row level security;

drop policy if exists "product_category_assignments_select" on public.product_category_assignments;
create policy "product_category_assignments_select"
on public.product_category_assignments for select
using (
  exists (
    select 1 from public.products p
    where p.id = product_id and public.is_same_tenant(p.tenant_id)
  )
  and exists (
    select 1 from public.product_categories c
    where c.id = category_id and public.is_same_tenant(c.tenant_id)
  )
);

drop policy if exists "product_category_assignments_insert" on public.product_category_assignments;
create policy "product_category_assignments_insert"
on public.product_category_assignments for insert
with check (
  exists (
    select 1 from public.products p
    where p.id = product_id and public.is_same_tenant(p.tenant_id)
  )
  and exists (
    select 1 from public.product_categories c
    where c.id = category_id and public.is_same_tenant(c.tenant_id)
  )
);

drop policy if exists "product_category_assignments_delete" on public.product_category_assignments;
create policy "product_category_assignments_delete"
on public.product_category_assignments for delete
using (
  exists (
    select 1 from public.products p
    where p.id = product_id and public.is_same_tenant(p.tenant_id)
  )
  and exists (
    select 1 from public.product_categories c
    where c.id = category_id and public.is_same_tenant(c.tenant_id)
  )
);

-- 3) Definições de campos extras (por tenant)
create table if not exists public.product_custom_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null,
  kind text not null check (kind in ('texto', 'numero', 'data')),
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_custom_fields_nome_nonempty check (char_length(trim(nome)) > 0)
);

create unique index if not exists product_custom_fields_tenant_nome_lower_idx
  on public.product_custom_fields (tenant_id, lower(trim(nome)));

create index if not exists product_custom_fields_tenant_sort_idx
  on public.product_custom_fields (tenant_id, sort_order, nome);

drop trigger if exists product_custom_fields_set_updated_at on public.product_custom_fields;
create trigger product_custom_fields_set_updated_at
before update on public.product_custom_fields
for each row execute function public.set_updated_at();

alter table public.product_custom_fields enable row level security;

drop policy if exists "product_custom_fields_same_tenant_select" on public.product_custom_fields;
create policy "product_custom_fields_same_tenant_select"
on public.product_custom_fields for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "product_custom_fields_same_tenant_insert" on public.product_custom_fields;
create policy "product_custom_fields_same_tenant_insert"
on public.product_custom_fields for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "product_custom_fields_same_tenant_update" on public.product_custom_fields;
create policy "product_custom_fields_same_tenant_update"
on public.product_custom_fields for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "product_custom_fields_same_tenant_delete" on public.product_custom_fields;
create policy "product_custom_fields_same_tenant_delete"
on public.product_custom_fields for delete
using (public.is_same_tenant(tenant_id));

-- 4) Valores por produto
create table if not exists public.product_custom_field_values (
  product_id uuid not null references public.products(id) on delete cascade,
  field_id uuid not null references public.product_custom_fields(id) on delete cascade,
  value_text text,
  value_numeric numeric,
  value_date date,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, field_id)
);

create index if not exists product_custom_field_values_field_idx
  on public.product_custom_field_values (field_id);

drop trigger if exists product_custom_field_values_set_updated_at on public.product_custom_field_values;
create trigger product_custom_field_values_set_updated_at
before update on public.product_custom_field_values
for each row execute function public.set_updated_at();

alter table public.product_custom_field_values enable row level security;

drop policy if exists "product_custom_field_values_select" on public.product_custom_field_values;
create policy "product_custom_field_values_select"
on public.product_custom_field_values for select
using (
  exists (
    select 1 from public.products p
    where p.id = product_id and public.is_same_tenant(p.tenant_id)
  )
  and exists (
    select 1 from public.product_custom_fields f
    where f.id = field_id and public.is_same_tenant(f.tenant_id)
  )
);

drop policy if exists "product_custom_field_values_insert" on public.product_custom_field_values;
create policy "product_custom_field_values_insert"
on public.product_custom_field_values for insert
with check (
  exists (
    select 1 from public.products p
    where p.id = product_id and public.is_same_tenant(p.tenant_id)
  )
  and exists (
    select 1 from public.product_custom_fields f
    where f.id = field_id and public.is_same_tenant(f.tenant_id)
  )
);

drop policy if exists "product_custom_field_values_update" on public.product_custom_field_values;
create policy "product_custom_field_values_update"
on public.product_custom_field_values for update
using (
  exists (
    select 1 from public.products p
    where p.id = product_id and public.is_same_tenant(p.tenant_id)
  )
  and exists (
    select 1 from public.product_custom_fields f
    where f.id = field_id and public.is_same_tenant(f.tenant_id)
  )
)
with check (
  exists (
    select 1 from public.products p
    where p.id = product_id and public.is_same_tenant(p.tenant_id)
  )
  and exists (
    select 1 from public.product_custom_fields f
    where f.id = field_id and public.is_same_tenant(f.tenant_id)
  )
);

drop policy if exists "product_custom_field_values_delete" on public.product_custom_field_values;
create policy "product_custom_field_values_delete"
on public.product_custom_field_values for delete
using (
  exists (
    select 1 from public.products p
    where p.id = product_id and public.is_same_tenant(p.tenant_id)
  )
  and exists (
    select 1 from public.product_custom_fields f
    where f.id = field_id and public.is_same_tenant(f.tenant_id)
  )
);

-- 5) Exclusão de produtos (catálogo)
drop policy if exists "products_same_tenant_delete" on public.products;
create policy "products_same_tenant_delete"
on public.products for delete
using (
  tenant_id in (
    select profiles.tenant_id
    from public.profiles
    where profiles.id = auth.uid()
  )
);
