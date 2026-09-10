-- Mantem o plano vigente separado de checkouts e mudancas ainda nao confirmados.
alter table public.billing_subscriptions
  add column if not exists pending_plan_id text references public.billing_plans(id),
  add column if not exists pending_billing_period text check (pending_billing_period in ('monthly', 'yearly')),
  add column if not exists pending_gateway_product_id text,
  add column if not exists pending_checkout_id text,
  add column if not exists pending_checkout_url text,
  add column if not exists pending_checkout_status text,
  add column if not exists pending_change_id text,
  add column if not exists pending_change_status text,
  add column if not exists pending_effective_at timestamptz,
  add column if not exists pending_metadata jsonb not null default '{}'::jsonb;

create index if not exists billing_subscriptions_pending_checkout_idx
  on public.billing_subscriptions (pending_checkout_id)
  where pending_checkout_id is not null;

-- Um trial nunca pode ficar aberto indefinidamente.
update public.billing_subscriptions
set
  trial_ends_at = coalesce(current_period_start, updated_at, created_at, timezone('utc', now())) + interval '7 days',
  current_period_end = coalesce(current_period_start, updated_at, created_at, timezone('utc', now())) + interval '7 days',
  updated_at = timezone('utc', now())
where status = 'trialing'
  and trial_ends_at is null;

create or replace function public.get_tenant_billing_access(p_tenant_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := coalesce(p_tenant_id, public.current_tenant_id());
  v_status text;
  v_trial_ends_at timestamptz;
  v_period_end timestamptz;
  v_is_platform_admin boolean := exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  );
  v_allowed boolean := false;
  v_reason text := 'subscription_missing';
begin
  if v_tenant_id is null then
    raise exception 'Tenant nao encontrado';
  end if;

  if p_tenant_id is not null
     and not public.is_same_tenant(p_tenant_id)
     and not v_is_platform_admin then
    raise exception 'Acesso negado ao tenant informado';
  end if;

  if v_is_platform_admin then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'platform_admin',
      'status', null,
      'trial_ends_at', null,
      'current_period_end', null
    );
  end if;

  select s.status, s.trial_ends_at, s.current_period_end
    into v_status, v_trial_ends_at, v_period_end
  from public.billing_subscriptions s
  where s.tenant_id = v_tenant_id;

  if v_status = 'trialing' then
    v_allowed := v_trial_ends_at is not null and v_trial_ends_at > timezone('utc', now());
    v_reason := case when v_allowed then 'trial_active' else 'trial_expired' end;
  elsif v_status = 'active' then
    v_allowed := v_period_end is not null and v_period_end > timezone('utc', now());
    v_reason := case when v_allowed then 'subscription_active' else 'subscription_expired' end;
  elsif v_status is not null then
    v_reason := v_status;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'status', v_status,
    'trial_ends_at', v_trial_ends_at,
    'current_period_end', v_period_end
  );
end;
$$;

grant execute on function public.get_tenant_billing_access(uuid) to authenticated;
grant execute on function public.get_tenant_billing_access(uuid) to service_role;

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
    'pending_plan_id', s.pending_plan_id,
    'pending_billing_period', s.pending_billing_period,
    'pending_checkout_id', s.pending_checkout_id,
    'pending_checkout_url', s.pending_checkout_url,
    'pending_checkout_status', s.pending_checkout_status,
    'pending_change_id', s.pending_change_id,
    'pending_change_status', s.pending_change_status,
    'pending_effective_at', s.pending_effective_at,
    'plan', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'entitlements', p.entitlements,
      'features', p.features
    ),
    'pending_plan', case when pp.id is null then null else jsonb_build_object(
      'id', pp.id,
      'name', pp.name,
      'description', pp.description,
      'entitlements', pp.entitlements,
      'features', pp.features
    ) end,
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
  left join public.billing_plans pp on pp.id = s.pending_plan_id
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
    'access', public.get_tenant_billing_access(v_tenant_id),
    'usage', v_usage
  );
end;
$$;

grant execute on function public.get_tenant_billing_snapshot(uuid) to authenticated;

select pg_notify('pgrst', 'reload schema');
