create or replace function public.get_tenant_plan_limit(
  p_tenant_id uuid,
  p_metric text
)
returns bigint
language sql
security definer
set search_path = public
as $$
  select nullif(p.entitlements ->> p_metric, 'null')::bigint
  from public.billing_subscriptions s
  join public.billing_plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant_id
  limit 1
$$;

create or replace function public.get_tenant_current_usage(
  p_tenant_id uuid,
  p_metric text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage bigint := 0;
begin
  case p_metric
    when 'whatsapp_instances' then
      select count(*)::bigint
      into v_usage
      from public.whatsapp_instances
      where tenant_id = p_tenant_id
        and archived_at is null;

    when 'users' then
      select (
        (select count(*)::bigint from public.profiles where tenant_id = p_tenant_id and coalesce(status, 'active') <> 'inactive')
        +
        (select count(*)::bigint from public.collaborator_invites where tenant_id = p_tenant_id and status = 'pending')
      )
      into v_usage;

    when 'customers' then
      select count(*)::bigint
      into v_usage
      from public.customers
      where tenant_id = p_tenant_id;

    else
      select coalesce(used, 0)
      into v_usage
      from public.billing_usage_counters
      where tenant_id = p_tenant_id
        and metric = p_metric
        and timezone('utc', now())::date between period_start and period_end
      order by period_start desc
      limit 1;
  end case;

  return coalesce(v_usage, 0);
end;
$$;

create or replace function public.assert_tenant_plan_limit(
  p_tenant_id uuid,
  p_metric text,
  p_increment bigint default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit bigint;
  v_used bigint;
  v_requested bigint;
begin
  if p_tenant_id is null then
    raise exception 'Tenant nao informado.';
  end if;

  if auth.role() <> 'service_role' and not public.is_same_tenant(p_tenant_id) then
    raise exception 'Acesso negado ao tenant informado.';
  end if;

  v_limit := public.get_tenant_plan_limit(p_tenant_id, p_metric);
  v_used := public.get_tenant_current_usage(p_tenant_id, p_metric);
  v_requested := v_used + greatest(coalesce(p_increment, 1), 0);

  if v_limit is not null and v_requested > v_limit then
    raise exception 'Limite do plano atingido para %. Uso atual: %, limite: %.', p_metric, v_used, v_limit;
  end if;

  return jsonb_build_object(
    'metric', p_metric,
    'used', v_used,
    'limit_value', v_limit,
    'requested', v_requested,
    'allowed', true
  );
end;
$$;

grant execute on function public.get_tenant_plan_limit(uuid, text) to authenticated;
grant execute on function public.get_tenant_current_usage(uuid, text) to authenticated;
grant execute on function public.assert_tenant_plan_limit(uuid, text, bigint) to authenticated;
grant execute on function public.get_tenant_plan_limit(uuid, text) to service_role;
grant execute on function public.get_tenant_current_usage(uuid, text) to service_role;
grant execute on function public.assert_tenant_plan_limit(uuid, text, bigint) to service_role;

with current_period as (
  select
    date_trunc('month', timezone('utc', now()))::date as period_start,
    (date_trunc('month', timezone('utc', now())) + interval '1 month - 1 day')::date as period_end
),
metrics as (
  select
    s.tenant_id,
    metric.key as metric,
    nullif(metric.value, 'null')::bigint as limit_value
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
)
insert into public.billing_usage_counters (
  tenant_id,
  period_start,
  period_end,
  metric,
  used,
  limit_value
)
select
  m.tenant_id,
  cp.period_start,
  cp.period_end,
  m.metric,
  public.get_tenant_current_usage(m.tenant_id, m.metric),
  m.limit_value
from metrics m
cross join current_period cp
on conflict (tenant_id, period_start, period_end, metric) do update
set
  used = excluded.used,
  limit_value = excluded.limit_value,
  updated_at = timezone('utc', now());
