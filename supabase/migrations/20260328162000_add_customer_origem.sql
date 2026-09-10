alter table public.customers
  add column if not exists origem text;

alter table public.customers
  drop constraint if exists customers_origem_check;

alter table public.customers
  add constraint customers_origem_check
  check (origem is null or origem in ('organico', 'pago'));
