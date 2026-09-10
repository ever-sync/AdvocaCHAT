alter table public.billing_plan_prices
  add column if not exists gateway_provider text,
  add column if not exists gateway_product_id text;

create unique index if not exists billing_plan_prices_gateway_product_uidx
on public.billing_plan_prices (gateway_provider, gateway_product_id)
where gateway_product_id is not null;

comment on column public.billing_plan_prices.gateway_product_id is
  'ID do produto recorrente correspondente no gateway (ex.: prod_... na AbacatePay).';
