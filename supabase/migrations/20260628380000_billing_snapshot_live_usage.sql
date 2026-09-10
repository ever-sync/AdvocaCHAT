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
        'metric', metric.key,
        'used', public.get_tenant_current_usage(v_tenant_id, metric.key),
        'limit_value', nullif(metric.value, 'null')::bigint,
        'period_start', date_trunc('month', timezone('utc', now()))::date,
        'period_end', (date_trunc('month', timezone('utc', now())) + interval '1 month - 1 day')::date
      )
      order by metric.key
    ),
    '[]'::jsonb
  )
  into v_usage
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
  where s.tenant_id = v_tenant_id;

  return jsonb_build_object(
    'subscription', v_subscription,
    'usage', v_usage
  );
end;
$$;

grant execute on function public.get_tenant_billing_snapshot(uuid) to authenticated;
