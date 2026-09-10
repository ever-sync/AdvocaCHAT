create table if not exists public.billing_plans (
  id text primary key,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order integer not null default 0,
  entitlements jsonb not null default '{}'::jsonb,
  features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.billing_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.billing_plans(id) on delete cascade,
  billing_period text not null check (billing_period in ('monthly', 'yearly')),
  currency text not null default 'brl',
  amount_cents integer not null check (amount_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (plan_id, billing_period)
);

create table if not exists public.billing_subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan_id text not null references public.billing_plans(id),
  status text not null default 'trialing' check (
    status in ('trialing', 'active', 'past_due', 'paused', 'canceled', 'incomplete')
  ),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'yearly')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  gateway_provider text not null default 'asaas',
  gateway_customer_id text,
  gateway_subscription_id text,
  gateway_checkout_id text,
  gateway_payment_id text,
  gateway_checkout_url text,
  gateway_invoice_url text,
  gateway_status text,
  gateway_metadata jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.billing_usage_counters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  metric text not null,
  used bigint not null default 0 check (used >= 0),
  limit_value bigint,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, period_start, period_end, metric)
);

create table if not exists public.billing_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric text not null,
  quantity bigint not null default 1 check (quantity > 0),
  source text,
  ref_type text,
  ref_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now())
);

alter table public.billing_plans enable row level security;
alter table public.billing_plan_prices enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_usage_counters enable row level security;
alter table public.billing_usage_events enable row level security;

drop policy if exists "billing_plans_authenticated_select" on public.billing_plans;
create policy "billing_plans_authenticated_select"
on public.billing_plans
for select
to authenticated
using (status = 'active');

drop policy if exists "billing_plan_prices_authenticated_select" on public.billing_plan_prices;
create policy "billing_plan_prices_authenticated_select"
on public.billing_plan_prices
for select
to authenticated
using (
  active
  and exists (
    select 1
    from public.billing_plans p
    where p.id = plan_id
      and p.status = 'active'
  )
);

drop policy if exists "billing_subscriptions_same_tenant_select" on public.billing_subscriptions;
create policy "billing_subscriptions_same_tenant_select"
on public.billing_subscriptions
for select
to authenticated
using (public.is_same_tenant(tenant_id));

drop policy if exists "billing_usage_counters_same_tenant_select" on public.billing_usage_counters;
create policy "billing_usage_counters_same_tenant_select"
on public.billing_usage_counters
for select
to authenticated
using (public.is_same_tenant(tenant_id));

drop policy if exists "billing_usage_events_same_tenant_select" on public.billing_usage_events;
create policy "billing_usage_events_same_tenant_select"
on public.billing_usage_events
for select
to authenticated
using (public.is_same_tenant(tenant_id));

insert into public.billing_plans (id, name, description, sort_order, entitlements, features)
values
  (
    'starter',
    'Starter',
    'Plano para operacoes que estao iniciando no WChat.',
    10,
    jsonb_build_object(
      'users', 3,
      'whatsapp_instances', 1,
      'customers', 500,
      'ai_monthly_tokens', 200000,
      'marketing_flow_runs_monthly', 3000,
      'storage_gb', 5,
      'support', 'email',
      'custom_api', false
    ),
    jsonb_build_array(
      'Ate 500 clientes',
      '1 canal WhatsApp',
      '3 usuarios',
      'Disparos diarios',
      'Follow-up automatico',
      'Suporte por e-mail'
    )
  ),
  (
    'profissional',
    'Profissional',
    'Plano para times comerciais que precisam vender e atender com automacao.',
    20,
    jsonb_build_object(
      'users', 10,
      'whatsapp_instances', 3,
      'customers', 2000,
      'ai_monthly_tokens', 1000000,
      'marketing_flow_runs_monthly', 15000,
      'storage_gb', 25,
      'support', 'whatsapp',
      'custom_api', true
    ),
    jsonb_build_array(
      'Ate 2.000 clientes',
      '3 canais WhatsApp',
      '10 usuarios',
      'Automacoes avancadas',
      'IA de atendimento',
      'Suporte via WhatsApp'
    )
  ),
  (
    'enterprise',
    'Enterprise',
    'Plano para operacoes maiores com suporte prioritario e limites customizados.',
    30,
    jsonb_build_object(
      'users', null,
      'whatsapp_instances', null,
      'customers', null,
      'ai_monthly_tokens', null,
      'marketing_flow_runs_monthly', null,
      'storage_gb', null,
      'support', 'priority',
      'custom_api', true
    ),
    jsonb_build_array(
      'Clientes ilimitados',
      'Canais WhatsApp customizados',
      'Usuarios ilimitados',
      'API completa',
      'Gerente de conta',
      'SLA e suporte prioritario'
    )
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  sort_order = excluded.sort_order,
  entitlements = excluded.entitlements,
  features = excluded.features,
  updated_at = timezone('utc', now());

insert into public.billing_plan_prices (plan_id, billing_period, currency, amount_cents)
values
  ('starter', 'monthly', 'brl', 49700),
  ('starter', 'yearly', 'brl', 39700),
  ('profissional', 'monthly', 'brl', 99700),
  ('profissional', 'yearly', 'brl', 79700),
  ('enterprise', 'monthly', 'brl', 199700),
  ('enterprise', 'yearly', 'brl', 159700)
on conflict (plan_id, billing_period) do update
set
  currency = excluded.currency,
  amount_cents = excluded.amount_cents,
  active = true,
  updated_at = timezone('utc', now());

insert into public.billing_subscriptions (
  tenant_id,
  plan_id,
  status,
  billing_period,
  current_period_start,
  current_period_end,
  metadata
)
select
  t.id,
  case
    when lower(coalesce(max(p.plano), '')) in ('starter', 'profissional', 'enterprise')
      then lower(max(p.plano))
    else 'profissional'
  end as plan_id,
  'active',
  'monthly',
  date_trunc('month', timezone('utc', now())),
  date_trunc('month', timezone('utc', now())) + interval '1 month',
  jsonb_build_object('source', 'migration_profile_plano')
from public.tenants t
left join public.profiles p on p.tenant_id = t.id
group by t.id
on conflict (tenant_id) do nothing;

insert into public.billing_usage_counters (tenant_id, period_start, period_end, metric, used, limit_value)
select
  s.tenant_id,
  date_trunc('month', timezone('utc', now()))::date,
  (date_trunc('month', timezone('utc', now())) + interval '1 month - 1 day')::date,
  metric.key,
  0,
  nullif(metric.value, 'null')::bigint
from public.billing_subscriptions s
join public.billing_plans p on p.id = s.plan_id
cross join lateral (
  values
    ('customers', p.entitlements ->> 'customers'),
    ('whatsapp_instances', p.entitlements ->> 'whatsapp_instances'),
    ('users', p.entitlements ->> 'users'),
    ('ai_monthly_tokens', p.entitlements ->> 'ai_monthly_tokens'),
    ('marketing_flow_runs_monthly', p.entitlements ->> 'marketing_flow_runs_monthly'),
    ('storage_gb', p.entitlements ->> 'storage_gb')
) as metric(key, value)
on conflict (tenant_id, period_start, period_end, metric) do nothing;

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
