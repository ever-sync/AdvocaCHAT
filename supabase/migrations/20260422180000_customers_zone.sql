-- Zona operacional (frete / roteirização); bairro já existia como coluna `bairro`.

alter table public.customers
  add column if not exists zone text;

create index if not exists idx_customers_zone on public.customers (tenant_id, zone);

comment on column public.customers.zone is 'Zona de entrega / região (ex.: Zona Norte, Centro).';
