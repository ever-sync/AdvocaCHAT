alter table public.delivery_routes
  add column if not exists estado text,
  add column if not exists cidade text,
  add column if not exists zona text;

create index if not exists delivery_routes_tenant_estado_idx
  on public.delivery_routes (tenant_id, estado);

create index if not exists delivery_routes_tenant_cidade_idx
  on public.delivery_routes (tenant_id, cidade);
