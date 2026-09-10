create table if not exists public.billing_usage_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric text not null,
  threshold integer not null check (threshold in (80, 100)),
  period text not null,
  used bigint not null default 0,
  limit_value bigint not null default 0,
  recipients jsonb not null default '[]'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, metric, threshold, period)
);

create index if not exists billing_usage_alerts_tenant_created_idx
on public.billing_usage_alerts (tenant_id, created_at desc);

alter table public.billing_usage_alerts enable row level security;

drop policy if exists "billing_usage_alerts_same_tenant_select" on public.billing_usage_alerts;
create policy "billing_usage_alerts_same_tenant_select"
on public.billing_usage_alerts
for select
to authenticated
using (public.is_same_tenant(tenant_id));

insert into public.billing_usage_counters (
  tenant_id,
  period_start,
  period_end,
  metric,
  used,
  limit_value
)
select
  s.tenant_id,
  date_trunc('month', timezone('utc', now()))::date,
  (date_trunc('month', timezone('utc', now())) + interval '1 month - 1 day')::date,
  metric.key,
  public.get_tenant_current_usage(s.tenant_id, metric.key),
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
on conflict (tenant_id, period_start, period_end, metric) do update
set
  used = excluded.used,
  limit_value = excluded.limit_value,
  updated_at = timezone('utc', now());
