-- SaaS readiness audit
--
-- Run against staging/production before a release:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/saas_readiness_audit.sql
--
-- This test focuses on the first production gate:
-- tenant isolation and accidental public data exposure.

\set ON_ERROR_STOP on

with public_tables as (
  select
    c.oid,
    c.relname as table_name,
    c.relrowsecurity as rls_enabled,
    exists (
      select 1
      from information_schema.columns col
      where col.table_schema = 'public'
        and col.table_name = c.relname
        and col.column_name = 'tenant_id'
    ) as has_tenant_id,
    count(p.polname) as policy_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
  where n.nspname = 'public'
    and c.relkind = 'r'
  group by c.oid, c.relname, c.relrowsecurity
),
allowed_internal_no_policy as (
  select unnest(array[
    -- Internal queues / locks: service-role or SECURITY DEFINER only.
    'ai_alerts',
    'failed_jobs',
    'tenant_api_keys',
    'webhook_delivery_dedupe',
    'worker_job_locks',
    -- Platform-level table intentionally hidden from tenant users.
    'platform_admins'
  ]) as table_name
),
findings as (
  select
    'critical' as severity,
    'RLS_DISABLED' as code,
    table_name,
    'Public table has RLS disabled.' as detail
  from public_tables
  where not rls_enabled

  union all

  select
    'high' as severity,
    'TENANT_TABLE_WITHOUT_POLICY' as code,
    table_name,
    'Table has tenant_id but no policies. Add a tenant policy or include it in the internal allowlist with justification.' as detail
  from public_tables pt
  where has_tenant_id
    and policy_count = 0
    and not exists (
      select 1
      from allowed_internal_no_policy allowed
      where allowed.table_name = pt.table_name
    )

  union all

  select
    'medium' as severity,
    'NO_TENANT_ID_REVIEW' as code,
    table_name,
    'Public table does not have tenant_id. Verify it is a join table, platform table, or protected by join-based RLS.' as detail
  from public_tables pt
  where not has_tenant_id
    and not exists (
      select 1
      from allowed_internal_no_policy allowed
      where allowed.table_name = pt.table_name
    )
    and table_name not in (
      'billing_plan_prices',
      'billing_plans',
      'tenants',
      'customer_custom_field_values',
      'instance_send_slots',
      'marketing_flow_worker_heartbeats',
      'product_category_assignments',
      'product_custom_field_values',
      'whatsapp_chat_tags'
    )
)
select *
from findings
order by
  case severity
    when 'critical' then 1
    when 'high' then 2
    when 'medium' then 3
    else 4
  end,
  table_name;

do $$
declare
  blocking_count integer;
begin
  with public_tables as (
    select
      c.oid,
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      exists (
        select 1
        from information_schema.columns col
        where col.table_schema = 'public'
          and col.table_name = c.relname
          and col.column_name = 'tenant_id'
      ) as has_tenant_id,
      count(p.polname) as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
    group by c.oid, c.relname, c.relrowsecurity
  ),
  allowed_internal_no_policy as (
    select unnest(array[
      'ai_alerts',
      'failed_jobs',
      'tenant_api_keys',
      'webhook_delivery_dedupe',
      'worker_job_locks',
      'platform_admins'
    ]) as table_name
  )
  select count(*)
    into blocking_count
  from public_tables pt
  where not pt.rls_enabled
     or (
       pt.has_tenant_id
       and pt.policy_count = 0
       and not exists (
         select 1
         from allowed_internal_no_policy allowed
         where allowed.table_name = pt.table_name
       )
     );

  if blocking_count > 0 then
    raise exception 'SaaS readiness audit failed: % blocking RLS finding(s). See result set above.', blocking_count;
  end if;
end $$;

select 'SaaS readiness audit passed: no blocking RLS findings.' as result;
