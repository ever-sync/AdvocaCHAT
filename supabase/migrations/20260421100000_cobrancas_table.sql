-- Cobranças operacionais por tenant
create table if not exists public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cliente text not null,
  telefone text not null default '',
  valor numeric(12, 2) not null check (valor >= 0),
  due_date date not null,
  tentativas smallint not null default 0 check (tentativas >= 0 and tentativas <= 99),
  vendedor text not null default '',
  status text not null check (status in ('pendente', 'enviada', 'pago', 'vencido', 'negociando')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Compatibilidade para ambientes onde `cobrancas` já existe com coluna antiga (`vencimento`)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cobrancas'
      and column_name = 'vencimento'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cobrancas'
      and column_name = 'due_date'
  ) then
    alter table public.cobrancas add column due_date date;
    execute 'update public.cobrancas set due_date = vencimento where due_date is null';
    alter table public.cobrancas alter column due_date set not null;
  elsif not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cobrancas'
      and column_name = 'due_date'
  ) then
    alter table public.cobrancas add column due_date date not null default current_date;
    alter table public.cobrancas alter column due_date drop default;
  end if;
end $$;

create index if not exists idx_cobrancas_tenant_due on public.cobrancas(tenant_id, due_date desc);
create index if not exists idx_cobrancas_tenant_status on public.cobrancas(tenant_id, status);

alter table public.cobrancas enable row level security;

drop policy if exists "cobrancas_same_tenant_select" on public.cobrancas;
create policy "cobrancas_same_tenant_select"
on public.cobrancas
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "cobrancas_same_tenant_insert" on public.cobrancas;
create policy "cobrancas_same_tenant_insert"
on public.cobrancas
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "cobrancas_same_tenant_update" on public.cobrancas;
create policy "cobrancas_same_tenant_update"
on public.cobrancas
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "cobrancas_same_tenant_delete" on public.cobrancas;
create policy "cobrancas_same_tenant_delete"
on public.cobrancas
for delete
using (public.is_same_tenant(tenant_id));

drop trigger if exists cobrancas_set_updated_at on public.cobrancas;
create trigger cobrancas_set_updated_at
before update on public.cobrancas
for each row
execute function public.set_updated_at();
