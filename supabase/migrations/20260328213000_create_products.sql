create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  codigo text not null,
  qtd_estoque numeric not null default 0,
  nome text not null,
  preco_compra numeric not null default 0,
  preco_venda numeric not null default 0,
  codigo_barras text,
  unidade text not null default 'UN',
  ncm text,
  cest text,
  grupo text not null default 'Outros',
  peso_bruto numeric not null default 0,
  peso_liquido numeric not null default 0,
  comissao numeric not null default 0,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists products_tenant_codigo_idx
  on public.products (tenant_id, codigo);

create index if not exists products_tenant_nome_idx
  on public.products (tenant_id, nome);

create index if not exists products_tenant_grupo_idx
  on public.products (tenant_id, grupo);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

alter table public.products enable row level security;

drop policy if exists "products_same_tenant_select" on public.products;
create policy "products_same_tenant_select"
on public.products
for select
using (
  tenant_id in (
    select profiles.tenant_id
    from public.profiles
    where profiles.id = auth.uid()
  )
);

drop policy if exists "products_same_tenant_insert" on public.products;
create policy "products_same_tenant_insert"
on public.products
for insert
with check (
  tenant_id in (
    select profiles.tenant_id
    from public.profiles
    where profiles.id = auth.uid()
  )
);

drop policy if exists "products_same_tenant_update" on public.products;
create policy "products_same_tenant_update"
on public.products
for update
using (
  tenant_id in (
    select profiles.tenant_id
    from public.profiles
    where profiles.id = auth.uid()
  )
)
with check (
  tenant_id in (
    select profiles.tenant_id
    from public.profiles
    where profiles.id = auth.uid()
  )
);
