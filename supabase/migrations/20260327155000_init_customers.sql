create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  nome text,
  email text,
  empresa text,
  plano text default 'starter',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  nome text not null,
  telefone text not null default '',
  perfil text not null default 'B' check (perfil in ('A', 'B', 'C')),
  rota text not null default '',
  ultimo_pedido date not null default current_date,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'bloqueado')),
  email text not null default '',
  cnpj text not null default '',
  endereco text not null default '',
  vendedor text not null default '',
  ticket_medio numeric(12,2) not null default 0,
  frequencia_compra text not null default 'Quinzenal',
  total_gasto numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.customers enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id);

drop policy if exists "customers_same_tenant_select" on public.customers;
create policy "customers_same_tenant_select"
on public.customers
for select
using (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists "customers_same_tenant_insert" on public.customers;
create policy "customers_same_tenant_insert"
on public.customers
for insert
with check (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists "customers_same_tenant_update" on public.customers;
create policy "customers_same_tenant_update"
on public.customers
for update
using (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
)
with check (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);
