alter table public.customers
  add column if not exists codigo text,
  add column if not exists nome_social text,
  add column if not exists celular text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists ativo boolean not null default true;

create index if not exists customers_tenant_codigo_idx
  on public.customers (tenant_id, codigo);
