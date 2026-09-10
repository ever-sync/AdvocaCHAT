create or replace function public.get_tenant_current_usage(
  p_tenant_id uuid,
  p_metric text
)
returns bigint
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_usage bigint := 0;
  v_month_start timestamptz := date_trunc('month', timezone('utc', now()));
  v_month_end timestamptz := date_trunc('month', timezone('utc', now())) + interval '1 month';
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

    when 'ai_monthly_tokens' then
      select coalesce(sum(
        coalesce(input_tokens, 0)
        + coalesce(output_tokens, 0)
        + coalesce(cache_read_tokens, 0)
        + coalesce(cache_creation_tokens, 0)
      ), 0)::bigint
      into v_usage
      from public.ai_usage
      where tenant_id = p_tenant_id
        and created_at >= v_month_start
        and created_at < v_month_end;

    when 'marketing_flow_runs_monthly' then
      select count(*)::bigint
      into v_usage
      from public.marketing_flow_events
      where tenant_id = p_tenant_id
        and event_type = 'step_completed'
        and created_at >= v_month_start
        and created_at < v_month_end;

    when 'storage_gb' then
      select ceil(coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0)::numeric / 1073741824)::bigint
      into v_usage
      from storage.objects
      where bucket_id in ('whatsapp-media', 'crm-lead-documents', 'marketing-forms')
        and split_part(name, '/', 1) = p_tenant_id::text;

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

create or replace function public.refresh_current_billing_usage(p_tenant_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_period_end date := (date_trunc('month', timezone('utc', now())) + interval '1 month - 1 day')::date;
begin
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
    v_period_start,
    v_period_end,
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
  where p_tenant_id is null or s.tenant_id = p_tenant_id
  on conflict (tenant_id, period_start, period_end, metric) do update
  set
    used = excluded.used,
    limit_value = excluded.limit_value,
    updated_at = timezone('utc', now());
end;
$$;

create or replace function public.enforce_customer_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit bigint;
  v_used bigint;
begin
  if exists (
    select 1
    from public.customers c
    where c.tenant_id = new.tenant_id
      and (
        (new.id is not null and c.id = new.id)
        or (
          new.phone_jid is not null
          and new.phone_jid <> ''
          and c.phone_jid = new.phone_jid
        )
        or (
          nullif(new.email, '') is not null
          and lower(c.email) = lower(new.email)
        )
        or (
          nullif(new.telefone, '') is not null
          and regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') = regexp_replace(new.telefone, '\D', '', 'g')
        )
      )
  ) then
    return new;
  end if;

  v_limit := public.get_tenant_plan_limit(new.tenant_id, 'customers');
  if v_limit is null then
    return new;
  end if;

  select count(*)::bigint
  into v_used
  from public.customers
  where tenant_id = new.tenant_id;

  if v_used + 1 > v_limit then
    raise exception 'Limite do plano atingido para customers. Uso atual: %, limite: %.', v_used, v_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists customers_billing_plan_limit on public.customers;
create trigger customers_billing_plan_limit
before insert on public.customers
for each row
execute function public.enforce_customer_plan_limit();

create or replace function public.enforce_storage_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_tenant_id uuid;
  v_limit_gb bigint;
  v_current_bytes bigint;
  v_new_bytes bigint;
begin
  if new.bucket_id not in ('whatsapp-media', 'crm-lead-documents', 'marketing-forms') then
    return new;
  end if;

  begin
    v_tenant_id := split_part(new.name, '/', 1)::uuid;
  exception when others then
    return new;
  end;

  v_limit_gb := public.get_tenant_plan_limit(v_tenant_id, 'storage_gb');
  if v_limit_gb is null then
    return new;
  end if;

  v_new_bytes := coalesce((new.metadata ->> 'size')::bigint, 0);
  select coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0)::bigint
  into v_current_bytes
  from storage.objects
  where bucket_id in ('whatsapp-media', 'crm-lead-documents', 'marketing-forms')
    and split_part(name, '/', 1) = v_tenant_id::text
    and id is distinct from new.id;

  if v_current_bytes + v_new_bytes > v_limit_gb * 1073741824 then
    raise exception 'Limite do plano atingido para storage_gb. Uso atual: % GB, limite: % GB.',
      ceil(v_current_bytes::numeric / 1073741824),
      v_limit_gb;
  end if;

  return new;
end;
$$;

drop trigger if exists storage_objects_billing_plan_limit on storage.objects;
create trigger storage_objects_billing_plan_limit
before insert or update on storage.objects
for each row
execute function public.enforce_storage_plan_limit();

grant execute on function public.refresh_current_billing_usage(uuid) to authenticated;
grant execute on function public.refresh_current_billing_usage(uuid) to service_role;

select public.refresh_current_billing_usage(null);
