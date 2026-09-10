-- O relogio dos 7 dias comeca somente quando o e-mail e confirmado.

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
  perform public.ensure_user_profile(new.id, new.email, new.raw_user_meta_data || jsonb_build_object('plano', 'sistema'));
  select tenant_id into v_tenant_id from public.profiles where id = new.id;

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
      jsonb_build_object('source', 'signup', 'trial_days', 7, 'awaiting_email_confirmation', not v_confirmed)
    )
    on conflict (tenant_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_now timestamptz := timezone('utc', now());
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    select tenant_id into v_tenant_id from public.profiles where id = new.id;
    if v_tenant_id is not null then
      update public.billing_subscriptions
      set status = 'trialing',
          trial_ends_at = v_now + interval '7 days',
          current_period_start = v_now,
          current_period_end = v_now + interval '7 days',
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'email_confirmed_at', v_now,
            'awaiting_email_confirmation', false
          ),
          updated_at = v_now
      where tenant_id = v_tenant_id
        and status = 'incomplete'
        and coalesce(metadata->>'source', '') = 'signup';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
after update of email_confirmed_at on auth.users
for each row execute function public.handle_user_email_confirmed();

update public.billing_subscriptions s
set status = 'incomplete',
    trial_ends_at = null,
    current_period_start = null,
    current_period_end = null,
    metadata = coalesce(s.metadata, '{}'::jsonb) || '{"awaiting_email_confirmation": true}'::jsonb,
    updated_at = timezone('utc', now())
from public.profiles p
join auth.users u on u.id = p.id
where p.tenant_id = s.tenant_id
  and u.email_confirmed_at is null
  and coalesce(s.metadata->>'source', '') = 'signup';
