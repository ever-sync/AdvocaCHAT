alter table public.billing_plan_prices
  drop column if exists stripe_price_id;

alter table public.billing_subscriptions
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id,
  add column if not exists gateway_provider text not null default 'asaas',
  add column if not exists gateway_customer_id text,
  add column if not exists gateway_subscription_id text,
  add column if not exists gateway_checkout_id text,
  add column if not exists gateway_payment_id text,
  add column if not exists gateway_checkout_url text,
  add column if not exists gateway_invoice_url text,
  add column if not exists gateway_status text,
  add column if not exists gateway_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.billing_gateway_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas',
  event_id text not null,
  event_type text not null,
  tenant_id uuid references public.tenants(id) on delete set null,
  checkout_id text,
  subscription_id text,
  payment_id text,
  raw_payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (provider, event_id)
);

create index if not exists billing_gateway_events_tenant_created_idx
on public.billing_gateway_events (tenant_id, created_at desc);

create index if not exists billing_gateway_events_checkout_idx
on public.billing_gateway_events (provider, checkout_id)
where checkout_id is not null;

create index if not exists billing_gateway_events_subscription_idx
on public.billing_gateway_events (provider, subscription_id)
where subscription_id is not null;

alter table public.billing_gateway_events enable row level security;

drop policy if exists "billing_gateway_events_same_tenant_select" on public.billing_gateway_events;
create policy "billing_gateway_events_same_tenant_select"
on public.billing_gateway_events
for select
to authenticated
using (tenant_id is not null and public.is_same_tenant(tenant_id));

update public.billing_subscriptions
set gateway_provider = 'asaas'
where gateway_provider is distinct from 'asaas';

create or replace function public.get_tenant_billing_snapshot(p_tenant_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := coalesce(p_tenant_id, public.current_tenant_id());
  v_subscription jsonb;
  v_usage jsonb;
begin
  if v_tenant_id is null then
    raise exception 'Tenant nao encontrado';
  end if;

  if p_tenant_id is not null and not public.is_same_tenant(p_tenant_id) then
    raise exception 'Acesso negado ao tenant informado';
  end if;

  select jsonb_build_object(
    'tenant_id', s.tenant_id,
    'plan_id', s.plan_id,
    'status', s.status,
    'billing_period', s.billing_period,
    'trial_ends_at', s.trial_ends_at,
    'current_period_start', s.current_period_start,
    'current_period_end', s.current_period_end,
    'cancel_at_period_end', s.cancel_at_period_end,
    'gateway_provider', s.gateway_provider,
    'gateway_customer_id', s.gateway_customer_id,
    'gateway_subscription_id', s.gateway_subscription_id,
    'gateway_checkout_id', s.gateway_checkout_id,
    'gateway_checkout_url', s.gateway_checkout_url,
    'gateway_invoice_url', s.gateway_invoice_url,
    'gateway_status', s.gateway_status,
    'plan', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'entitlements', p.entitlements,
      'features', p.features
    ),
    'price', (
      select jsonb_build_object(
        'billing_period', pr.billing_period,
        'currency', pr.currency,
        'amount_cents', pr.amount_cents
      )
      from public.billing_plan_prices pr
      where pr.plan_id = s.plan_id
        and pr.billing_period = s.billing_period
        and pr.active
      limit 1
    )
  )
  into v_subscription
  from public.billing_subscriptions s
  join public.billing_plans p on p.id = s.plan_id
  where s.tenant_id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'metric', c.metric,
        'used', c.used,
        'limit_value', c.limit_value,
        'period_start', c.period_start,
        'period_end', c.period_end
      )
      order by c.metric
    ),
    '[]'::jsonb
  )
  into v_usage
  from public.billing_usage_counters c
  where c.tenant_id = v_tenant_id
    and timezone('utc', now())::date between c.period_start and c.period_end;

  return jsonb_build_object(
    'subscription', v_subscription,
    'usage', v_usage
  );
end;
$$;

grant execute on function public.get_tenant_billing_snapshot(uuid) to authenticated;
