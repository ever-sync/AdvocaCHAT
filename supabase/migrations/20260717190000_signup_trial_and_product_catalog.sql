-- Cadastro gratuito: todo novo tenant recebe 7 dias de trial do Sistema.
-- IA permanece como add-on separado, gerenciado por tenant_ai_subscription.

update public.billing_plans
set status = 'archived', updated_at = timezone('utc', now())
where id in ('starter', 'profissional', 'enterprise');

insert into public.billing_plans (id, name, description, status, sort_order, entitlements, features)
values (
  'sistema',
  'Sistema',
  'Acesso completo ao CaleoCRM, sem o add-on de Inteligencia Artificial.',
  'active',
  10,
  jsonb_build_object(
    'customers', null,
    'whatsapp_instances', 1,
    'users', 5,
    'ai_monthly_tokens', 0,
    'marketing_flow_runs_monthly', null,
    'storage_gb', 20,
    'support', 'whatsapp',
    'custom_api', false
  ),
  jsonb_build_array(
    'CRM, Inbox e Agenda',
    'Automacoes e marketing',
    'Relatorios e documentos',
    'Suporte via WhatsApp',
    'IA contratada separadamente'
  )
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  sort_order = excluded.sort_order,
  entitlements = excluded.entitlements,
  features = excluded.features,
  updated_at = timezone('utc', now());

insert into public.billing_plan_prices (plan_id, billing_period, currency, amount_cents, active)
values
  ('sistema', 'monthly', 'brl', 24790, true),
  ('sistema', 'yearly', 'brl', 297480, true)
on conflict (plan_id, billing_period) do update set
  currency = excluded.currency,
  amount_cents = excluded.amount_cents,
  active = true,
  updated_at = timezone('utc', now());

create table if not exists public.billing_addons (
  id text primary key,
  name text not null,
  description text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'brl',
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.billing_addons (id, name, description, amount_cents, currency, active)
values ('ia', 'Inteligencia Artificial', 'Add-on de IA do CaleoCRM.', 44700, 'brl', true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  amount_cents = excluded.amount_cents,
  currency = excluded.currency,
  active = true,
  updated_at = timezone('utc', now());

alter table public.billing_addons enable row level security;

drop policy if exists "billing_addons_authenticated_select" on public.billing_addons;
create policy "billing_addons_authenticated_select"
on public.billing_addons for select to authenticated using (active);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_now timestamptz := timezone('utc', now());
begin
  perform public.ensure_user_profile(new.id, new.email, new.raw_user_meta_data || jsonb_build_object('plano', 'sistema'));

  select tenant_id into v_tenant_id from public.profiles where id = new.id;

  if v_tenant_id is not null then
    insert into public.billing_subscriptions (
      tenant_id,
      plan_id,
      status,
      billing_period,
      trial_ends_at,
      current_period_start,
      current_period_end,
      gateway_provider,
      metadata
    )
    values (
      v_tenant_id,
      'sistema',
      'trialing',
      'monthly',
      v_now + interval '7 days',
      v_now,
      v_now + interval '7 days',
      'abacatepay',
      jsonb_build_object('source', 'signup', 'trial_days', 7)
    )
    on conflict (tenant_id) do nothing;
  end if;

  return new;
end;
$$;
