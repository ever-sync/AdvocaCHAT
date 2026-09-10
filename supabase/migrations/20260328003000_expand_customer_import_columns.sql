alter table public.customers
  add column if not exists tipo text,
  add column if not exists razao_social text,
  add column if not exists inscricao_estadual text,
  add column if not exists inscricao_municipal text,
  add column if not exists cpf text,
  add column if not exists rg text,
  add column if not exists nascimento text,
  add column if not exists fax text,
  add column if not exists canal text,
  add column if not exists cep text,
  add column if not exists bairro text,
  add column if not exists complemento text,
  add column if not exists cidade text,
  add column if not exists estado text,
  add column if not exists observacoes text,
  add column if not exists cadastrado_em text,
  add column if not exists source_columns jsonb not null default '{}'::jsonb;

create index if not exists customers_tenant_cidade_idx
  on public.customers (tenant_id, cidade);

create index if not exists customers_tenant_estado_idx
  on public.customers (tenant_id, estado);
