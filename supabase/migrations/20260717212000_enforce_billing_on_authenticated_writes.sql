-- Impede que um usuario contorne o bloqueio do frontend escrevendo direto no Supabase.
-- Operacoes internas com service_role continuam liberadas para webhooks e suporte.
create or replace function public.enforce_tenant_billing_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  v_status text;
  v_trial_ends_at timestamptz;
  v_period_end timestamptz;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select s.status, s.trial_ends_at, s.current_period_end
    into v_status, v_trial_ends_at, v_period_end
  from public.billing_subscriptions s
  where s.tenant_id = v_tenant_id;

  if (v_status = 'trialing' and v_trial_ends_at is not null and v_trial_ends_at > timezone('utc', now()))
     or (v_status = 'active' and v_period_end is not null and v_period_end > timezone('utc', now())) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception using
    errcode = '42501',
    message = 'Assinatura inativa. Regularize o plano para continuar.';
end;
$$;

do $$
declare
  v_table record;
begin
  for v_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attname = 'tenant_id'
      and not a.attisdropped
      and c.relname not like 'billing_%'
      and c.relname not like 'platform_%'
      and c.relname not in ('tenants', 'profiles')
  loop
    execute format('drop trigger if exists enforce_billing_write on %I.%I', v_table.schema_name, v_table.table_name);
    execute format(
      'create trigger enforce_billing_write before insert or update or delete on %I.%I for each row execute function public.enforce_tenant_billing_write()',
      v_table.schema_name,
      v_table.table_name
    );
  end loop;
end;
$$;

select pg_notify('pgrst', 'reload schema');
