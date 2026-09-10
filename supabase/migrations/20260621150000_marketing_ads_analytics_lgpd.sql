-- Fase 7: LGPD (consentimentos) + Ads (conversões offline) + auto-winner A/B.

-- =====================================================================
-- 1) Consentimentos (LGPD) — capturados no submit
-- =====================================================================
create table if not exists public.marketing_lead_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  negotiation_id uuid references public.crm_negotiations(id) on delete cascade,
  form_id uuid references public.marketing_forms(id) on delete set null,
  consent_key text not null,
  consent_text text,
  consent_version text default 'v1',
  granted boolean not null default false,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists marketing_lead_consents_tenant_idx on public.marketing_lead_consents (tenant_id);
create index if not exists marketing_lead_consents_negotiation_idx on public.marketing_lead_consents (negotiation_id);

alter table public.marketing_lead_consents enable row level security;

drop policy if exists "marketing_lead_consents_select" on public.marketing_lead_consents;
create policy "marketing_lead_consents_select" on public.marketing_lead_consents for select
using (
  public.is_same_tenant(tenant_id)
  and (
    public.has_role_permission(tenant_id, 'marketing', 'view')
    or public.has_role_permission(tenant_id, 'crm', 'view')
  )
);

-- =====================================================================
-- 2) Ads — configs por plataforma + fila de conversões offline
-- =====================================================================
create table if not exists public.marketing_ad_platform_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  platform text not null check (platform in ('google_ads', 'meta_ads')),
  is_active boolean not null default false,
  credentials jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, platform)
);

drop trigger if exists marketing_ad_platform_configs_set_updated_at on public.marketing_ad_platform_configs;
create trigger marketing_ad_platform_configs_set_updated_at
before update on public.marketing_ad_platform_configs
for each row execute function public.set_updated_at();

create table if not exists public.marketing_ad_conversion_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  negotiation_id uuid references public.crm_negotiations(id) on delete cascade,
  platform text not null check (platform in ('google_ads', 'meta_ads')),
  event_name text not null default 'lead_won',
  event_time timestamptz not null default timezone('utc', now()),
  event_idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists marketing_ad_conversion_events_tenant_idx on public.marketing_ad_conversion_events (tenant_id);

create table if not exists public.marketing_ad_conversion_dispatches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid references public.marketing_ad_conversion_events(id) on delete cascade,
  platform text not null,
  event_name text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  sent_at timestamptz,
  last_attempt_at timestamptz,
  error text,
  response jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists marketing_ad_conversion_dispatches_pending_idx
  on public.marketing_ad_conversion_dispatches (status)
  where status = 'pending';

alter table public.marketing_ad_platform_configs enable row level security;
alter table public.marketing_ad_conversion_events enable row level security;
alter table public.marketing_ad_conversion_dispatches enable row level security;

drop policy if exists "marketing_ad_configs_select" on public.marketing_ad_platform_configs;
create policy "marketing_ad_configs_select" on public.marketing_ad_platform_configs for select
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'view'));

drop policy if exists "marketing_ad_configs_insert" on public.marketing_ad_platform_configs;
create policy "marketing_ad_configs_insert" on public.marketing_ad_platform_configs for insert
with check (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'edit'));

drop policy if exists "marketing_ad_configs_update" on public.marketing_ad_platform_configs;
create policy "marketing_ad_configs_update" on public.marketing_ad_platform_configs for update
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'edit'))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "marketing_ad_configs_delete" on public.marketing_ad_platform_configs;
create policy "marketing_ad_configs_delete" on public.marketing_ad_platform_configs for delete
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'delete'));

drop policy if exists "marketing_ad_events_select" on public.marketing_ad_conversion_events;
create policy "marketing_ad_events_select" on public.marketing_ad_conversion_events for select
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'view'));

drop policy if exists "marketing_ad_dispatches_select" on public.marketing_ad_conversion_dispatches;
create policy "marketing_ad_dispatches_select" on public.marketing_ad_conversion_dispatches for select
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'marketing', 'view'));

-- =====================================================================
-- 3) Captura de conversão offline quando uma negociação de marketing é ganha
-- =====================================================================
create or replace function public.capture_marketing_ad_conversion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_marketing boolean;
  v_platform text;
begin
  -- Só quando muda para 'vendido'
  if NEW.status <> 'vendido' or coalesce(OLD.status, '') = 'vendido' then
    return NEW;
  end if;

  select exists (
    select 1 from public.crm_negotiation_marketing m where m.negotiation_id = NEW.id
  ) into v_has_marketing;
  if not v_has_marketing then
    return NEW;
  end if;

  for v_platform in
    select platform from public.marketing_ad_platform_configs
    where tenant_id = NEW.tenant_id and is_active = true
  loop
    insert into public.marketing_ad_conversion_events (
      tenant_id, negotiation_id, platform, event_name, event_idempotency_key, payload
    ) values (
      NEW.tenant_id, NEW.id, v_platform, 'lead_won',
      'lead_won:' || NEW.id::text || ':' || v_platform,
      jsonb_build_object('value', NEW.total_value, 'won_at', timezone('utc', now()))
    )
    on conflict (event_idempotency_key) do nothing;

    insert into public.marketing_ad_conversion_dispatches (tenant_id, event_id, platform, event_name)
    select e.tenant_id, e.id, e.platform, e.event_name
    from public.marketing_ad_conversion_events e
    where e.event_idempotency_key = 'lead_won:' || NEW.id::text || ':' || v_platform
      and not exists (
        select 1 from public.marketing_ad_conversion_dispatches d where d.event_id = e.id
      );
  end loop;

  return NEW;
end;
$$;

drop trigger if exists crm_negotiations_capture_ad_conversion on public.crm_negotiations;
create trigger crm_negotiations_capture_ad_conversion
after update of status on public.crm_negotiations
for each row execute function public.capture_marketing_ad_conversion();

-- =====================================================================
-- 4) Auto-winner A/B — aplica a melhor variante por conversão
--    Config em marketing_forms.settings->'abAutoWinner' { enabled, minDays, minViews }.
--    Rode por cron (ver F8) ou manualmente.
-- =====================================================================
create or replace function public.apply_marketing_ab_auto_winners(p_tenant_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form record;
  v_cfg jsonb;
  v_min_days integer;
  v_min_views integer;
  v_winner uuid;
  v_oldest timestamptz;
  v_applied integer := 0;
begin
  for v_form in
    select f.id, f.tenant_id, f.settings
    from public.marketing_forms f
    where (p_tenant_id is null or f.tenant_id = p_tenant_id)
      and coalesce((f.settings->'abAutoWinner'->>'enabled')::boolean, false) = true
      and coalesce(f.settings->'abAutoWinner'->>'appliedAt', '') = ''
  loop
    v_cfg := v_form.settings->'abAutoWinner';
    v_min_days := coalesce((v_cfg->>'minDays')::int, 7);
    v_min_views := coalesce((v_cfg->>'minViews')::int, 100);

    -- precisa de >= 2 variantes ativas e tempo mínimo desde a mais antiga
    select min(created_at) into v_oldest
    from public.marketing_form_variants
    where form_id = v_form.id and is_active = true;

    if v_oldest is null or v_oldest > timezone('utc', now()) - make_interval(days => v_min_days) then
      continue;
    end if;

    if (select count(*) from public.marketing_form_variants where form_id = v_form.id and is_active = true) < 2 then
      continue;
    end if;

    -- melhor conversão entre as que atingiram min_views
    select id into v_winner
    from public.marketing_form_variants
    where form_id = v_form.id and is_active = true and total_views >= v_min_views
    order by (case when total_views > 0 then total_submissions::numeric / total_views else 0 end) desc,
             total_views desc
    limit 1;

    if v_winner is null then
      continue;
    end if;

    update public.marketing_form_variants set is_active = false, weight = 0
    where form_id = v_form.id and id <> v_winner;
    update public.marketing_form_variants set is_active = true, weight = 100
    where id = v_winner;

    update public.marketing_forms
    set settings = jsonb_set(
      settings,
      '{abAutoWinner}',
      v_cfg || jsonb_build_object('appliedAt', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'winnerVariantId', v_winner::text)
    )
    where id = v_form.id;

    v_applied := v_applied + 1;
  end loop;

  return v_applied;
end;
$$;

grant execute on function public.apply_marketing_ab_auto_winners(uuid) to service_role, authenticated;
