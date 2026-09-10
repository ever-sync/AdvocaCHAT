-- Platform access is provisioned explicitly, never by email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_now timestamptz := timezone('utc', now());
  v_confirmed boolean := new.email_confirmed_at is not null;
begin
  perform public.ensure_user_profile(
    new.id,
    new.email,
    new.raw_user_meta_data || jsonb_build_object('plano', 'sistema')
  );


  select tenant_id into v_tenant_id
  from public.profiles
  where id = new.id;

  if v_tenant_id is not null then
    insert into public.billing_subscriptions (
      tenant_id, plan_id, status, billing_period, trial_ends_at,
      current_period_start, current_period_end, gateway_provider, metadata
    ) values (
      v_tenant_id,
      'sistema',
      case when v_confirmed then 'trialing' else 'incomplete' end,
      'monthly',
      case when v_confirmed then v_now + interval '7 days' else null end,
      case when v_confirmed then v_now else null end,
      case when v_confirmed then v_now + interval '7 days' else null end,
      'abacatepay',
      jsonb_build_object(
        'source', 'signup',
        'trial_days', 7,
        'awaiting_email_confirmation', not v_confirmed
      )
    )
    on conflict (tenant_id) do nothing;
  end if;

  return new;
end;
$$;
