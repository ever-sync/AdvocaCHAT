-- Fase 7 (deferidos): rate limits + horario comercial pra envios.
-- - marketing_flow_channel_limits: por (tenant, channel) define max_per_hour
--   e se respeita expediente do tenant (tenant_settings.business_hours).
-- - marketing_flow_send_log: cada envio (WA/email/smart) loga aqui pra contagem.
-- - marketing_flow_pre_send_check(): RPC que o worker chama antes de cada envio.
--   Retorna jsonb {allowed: bool, reason?: 'rate_limit'|'business_hours'}.
--   Quando allowed, ja loga o envio (consume).
--
-- Ausencia da linha em marketing_flow_channel_limits => sem enforcement.

create table if not exists public.marketing_flow_channel_limits (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'email', 'sms', 'smart')),
  max_per_hour integer,
  enforce_business_hours boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, channel)
);

drop trigger if exists marketing_flow_channel_limits_set_updated_at
  on public.marketing_flow_channel_limits;
create trigger marketing_flow_channel_limits_set_updated_at
before update on public.marketing_flow_channel_limits
for each row execute function public.set_updated_at();

alter table public.marketing_flow_channel_limits enable row level security;

drop policy if exists "marketing_flow_channel_limits_select" on public.marketing_flow_channel_limits;
create policy "marketing_flow_channel_limits_select"
on public.marketing_flow_channel_limits for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'view')
);

drop policy if exists "marketing_flow_channel_limits_modify" on public.marketing_flow_channel_limits;
create policy "marketing_flow_channel_limits_modify"
on public.marketing_flow_channel_limits for all
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
)
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
);

-- =====================================================================
-- Log de envios (1 row por envio, leve por design)
-- =====================================================================
create table if not exists public.marketing_flow_send_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel text not null,
  participant_id uuid references public.marketing_flow_participants(id) on delete set null,
  step_id text,
  sent_at timestamptz not null default timezone('utc', now())
);

-- Index parcial otimizado pra contagens da ultima hora.
create index if not exists marketing_flow_send_log_window_idx
  on public.marketing_flow_send_log (tenant_id, channel, sent_at desc);

alter table public.marketing_flow_send_log enable row level security;

drop policy if exists "marketing_flow_send_log_select" on public.marketing_flow_send_log;
create policy "marketing_flow_send_log_select"
on public.marketing_flow_send_log for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'view')
);
-- insert apenas via service_role (worker), sem policy expressa.

-- =====================================================================
-- Pre-send check (chamado pelo worker antes de cada envio).
-- =====================================================================
create or replace function public.marketing_flow_pre_send_check(
  p_tenant_id uuid,
  p_channel text,
  p_participant_id uuid default null,
  p_step_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit record;
  v_count integer;
  v_now timestamptz := timezone('utc', now());
begin
  select max_per_hour, enforce_business_hours into v_limit
  from public.marketing_flow_channel_limits
  where tenant_id = p_tenant_id and channel = p_channel;

  -- Sem linha = sem enforcement.
  if v_limit is null then
    insert into public.marketing_flow_send_log (
      tenant_id, channel, participant_id, step_id, sent_at
    ) values (p_tenant_id, p_channel, p_participant_id, p_step_id, v_now);
    return jsonb_build_object('allowed', true);
  end if;

  -- Business hours, se exigido pelo tenant nesse canal.
  if v_limit.enforce_business_hours
     and not public.is_within_business_hours(p_tenant_id, v_now) then
    return jsonb_build_object('allowed', false, 'reason', 'business_hours');
  end if;

  -- Rate limit (janela rolante de 1 hora).
  if v_limit.max_per_hour is not null and v_limit.max_per_hour > 0 then
    select count(*) into v_count
    from public.marketing_flow_send_log
    where tenant_id = p_tenant_id
      and channel = p_channel
      and sent_at > v_now - interval '1 hour';
    if v_count >= v_limit.max_per_hour then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'rate_limit',
        'count', v_count,
        'max_per_hour', v_limit.max_per_hour
      );
    end if;
  end if;

  insert into public.marketing_flow_send_log (
    tenant_id, channel, participant_id, step_id, sent_at
  ) values (p_tenant_id, p_channel, p_participant_id, p_step_id, v_now);

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.marketing_flow_pre_send_check(uuid, text, uuid, text) from public;
grant execute on function public.marketing_flow_pre_send_check(uuid, text, uuid, text) to service_role;
