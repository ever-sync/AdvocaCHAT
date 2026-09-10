-- Sprint 2: horário de atendimento (business hours) + pausar SLA fora do horário
-- + RPC do painel de atendimento ao vivo.
--
-- 1) tenant_settings.business_hours (jsonb): { enabled, timezone, intervals[] }
--    intervals = [{ weekday: 0-6 (0=domingo), start: "HH:MM", end: "HH:MM" }, ...]
--    Default desabilitado → SLA continua usando soma simples até o admin configurar.
-- 2) add_business_minutes(): soma N minutos "úteis" caminhando pelas janelas de
--    expediente; se desabilitado/sem janelas, cai no comportamento atual (start + N).
-- 3) touch_crm_on_whatsapp_message(): passa a calcular o vencimento do SLA via (2).
-- 4) is_within_business_hours() + live_attendance_dashboard() para o painel.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Coluna de configuração
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.tenant_settings
  add column if not exists business_hours jsonb not null default jsonb_build_object(
    'enabled', false,
    'timezone', 'America/Sao_Paulo',
    'intervals', jsonb_build_array(
      jsonb_build_object('weekday', 1, 'start', '09:00', 'end', '18:00'),
      jsonb_build_object('weekday', 2, 'start', '09:00', 'end', '18:00'),
      jsonb_build_object('weekday', 3, 'start', '09:00', 'end', '18:00'),
      jsonb_build_object('weekday', 4, 'start', '09:00', 'end', '18:00'),
      jsonb_build_object('weekday', 5, 'start', '09:00', 'end', '18:00')
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. add_business_minutes: vencimento de SLA respeitando o expediente
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.add_business_minutes(
  p_tenant_id uuid,
  p_start timestamptz,
  p_minutes integer
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_business jsonb;
  v_enabled boolean;
  v_tz text;
  v_remaining_sec numeric;
  v_cursor timestamptz;
  v_local_date date;
  v_dow int;
  v_open timestamptz;
  v_close timestamptz;
  v_window_start timestamptz;
  v_window_sec numeric;
  v_interval jsonb;
  v_days int := 0;
begin
  if p_minutes is null or p_minutes <= 0 then
    return p_start;
  end if;

  select ts.business_hours into v_business
  from public.tenant_settings ts
  where ts.tenant_id = p_tenant_id;

  v_enabled := coalesce((v_business->>'enabled')::boolean, false);
  v_tz := coalesce(nullif(v_business->>'timezone', ''), 'America/Sao_Paulo');

  -- Sem expediente configurado/ativo → soma simples (comportamento legado).
  if v_business is null
     or not v_enabled
     or jsonb_typeof(v_business->'intervals') <> 'array'
     or jsonb_array_length(v_business->'intervals') = 0
  then
    return p_start + make_interval(mins => p_minutes);
  end if;

  v_remaining_sec := p_minutes::numeric * 60;
  v_cursor := p_start;

  -- Caminha no máximo ~1 ano para evitar laço infinito se a config não tiver
  -- nenhum dia útil válido.
  while v_days < 366 loop
    v_local_date := (v_cursor at time zone v_tz)::date;
    v_dow := extract(dow from (v_cursor at time zone v_tz))::int;

    -- Janelas do dia, ordenadas por horário de abertura.
    for v_interval in
      select elem
      from jsonb_array_elements(v_business->'intervals') elem
      where (elem->>'weekday')::int = v_dow
      order by (elem->>'start')::time
    loop
      v_open := ((v_local_date::text || ' ' || (v_interval->>'start'))::timestamp) at time zone v_tz;
      v_close := ((v_local_date::text || ' ' || (v_interval->>'end'))::timestamp) at time zone v_tz;

      -- Ignora janelas inválidas ou já encerradas em relação ao cursor.
      if v_close <= v_open or v_cursor >= v_close then
        continue;
      end if;

      v_window_start := greatest(v_cursor, v_open);
      v_window_sec := extract(epoch from (v_close - v_window_start));

      if v_window_sec <= 0 then
        continue;
      end if;

      if v_remaining_sec <= v_window_sec then
        return v_window_start + make_interval(secs => v_remaining_sec);
      end if;

      v_remaining_sec := v_remaining_sec - v_window_sec;
      v_cursor := v_close;
    end loop;

    -- Avança para o início do próximo dia local.
    v_cursor := ((v_local_date + 1)::text || ' 00:00')::timestamp at time zone v_tz;
    v_days := v_days + 1;
  end loop;

  -- Fallback de segurança: nenhuma janela útil encontrada.
  return p_start + make_interval(mins => p_minutes);
end;
$$;

grant execute on function public.add_business_minutes(uuid, timestamptz, integer) to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Trigger de mensagem: usa add_business_minutes para o vencimento do SLA
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_crm_on_whatsapp_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg_id uuid;
  v_occurred timestamptz;
  v_chat record;
  v_sla_minutes integer;
begin
  v_occurred := coalesce(NEW.received_at, NEW.sent_at, timezone('utc', now()));

  select
    c.primary_negotiation_id,
    c.tenant_id,
    c.first_inbound_at,
    c.first_response_at,
    c.resolution,
    c.snooze_until
  into v_chat
  from public.whatsapp_chats c
  where c.id = NEW.chat_id;

  v_neg_id := v_chat.primary_negotiation_id;

  if v_neg_id is not null then
    update public.crm_negotiations n
    set
      last_interaction_at = v_occurred,
      last_contact_at = case
        when NEW.direction = 'inbound' then v_occurred
        else n.last_contact_at
      end
    where n.id = v_neg_id;
  end if;

  if NEW.direction = 'inbound' then
    select coalesce(ts.sla_first_response_minutes, 15) into v_sla_minutes
    from public.tenant_settings ts
    where ts.tenant_id = v_chat.tenant_id;

    update public.whatsapp_chats c
    set
      first_inbound_at = coalesce(c.first_inbound_at, v_occurred),
      sla_first_response_due_at = case
        when c.first_inbound_at is null and c.first_response_at is null
        then public.add_business_minutes(v_chat.tenant_id, v_occurred, v_sla_minutes)
        else c.sla_first_response_due_at
      end,
      snooze_until = null,
      resolution = case when c.resolution = 'resolved' then 'open' else coalesce(c.resolution, 'open') end,
      status = 'open'
    where c.id = NEW.chat_id;
  elsif NEW.direction = 'outbound'
    and coalesce(NEW.actor_type, 'human') = 'human'
  then
    update public.whatsapp_chats c
    set first_response_at = coalesce(c.first_response_at, v_occurred)
    where c.id = NEW.chat_id
      and c.first_inbound_at is not null
      and c.first_response_at is null;
  end if;

  return NEW;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Painel de atendimento ao vivo
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.is_within_business_hours(
  p_tenant_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_business jsonb;
  v_enabled boolean;
  v_tz text;
  v_local_date date;
  v_dow int;
  v_interval jsonb;
  v_open timestamptz;
  v_close timestamptz;
begin
  select ts.business_hours into v_business
  from public.tenant_settings ts
  where ts.tenant_id = p_tenant_id;

  v_enabled := coalesce((v_business->>'enabled')::boolean, false);
  -- Sem expediente configurado → considera sempre "aberto".
  if v_business is null or not v_enabled then
    return true;
  end if;

  v_tz := coalesce(nullif(v_business->>'timezone', ''), 'America/Sao_Paulo');
  v_local_date := (p_at at time zone v_tz)::date;
  v_dow := extract(dow from (p_at at time zone v_tz))::int;

  for v_interval in
    select elem
    from jsonb_array_elements(v_business->'intervals') elem
    where (elem->>'weekday')::int = v_dow
  loop
    v_open := ((v_local_date::text || ' ' || (v_interval->>'start'))::timestamp) at time zone v_tz;
    v_close := ((v_local_date::text || ' ' || (v_interval->>'end'))::timestamp) at time zone v_tz;
    if p_at >= v_open and p_at < v_close then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

grant execute on function public.is_within_business_hours(uuid, timestamptz) to authenticated, service_role;

create or replace function public.live_attendance_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_now timestamptz := now();
  v_tz text;
  v_business jsonb;
  v_today_start timestamptz;
  v_pool jsonb;
  v_sla jsonb;
  v_today jsonb;
  v_attendants jsonb;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then
    raise exception 'Não autenticado';
  end if;

  select ts.business_hours into v_business
  from public.tenant_settings ts
  where ts.tenant_id = v_tenant;

  v_tz := coalesce(nullif(v_business->>'timezone', ''), 'America/Sao_Paulo');
  v_today_start := (date_trunc('day', v_now at time zone v_tz)) at time zone v_tz;

  -- Pool aguardando: chats abertos sem responsável.
  select jsonb_build_object(
    'waiting', count(*),
    'oldest_wait_minutes', coalesce(
      max(floor(extract(epoch from (v_now - coalesce(c.first_inbound_at, c.created_at))) / 60))::int,
      0
    )
  )
  into v_pool
  from public.whatsapp_chats c
  where c.tenant_id = v_tenant
    and c.status = 'open'
    and c.assignee_id is null;

  -- SLA de 1ª resposta (chats ainda sem resposta humana).
  select jsonb_build_object(
    'awaiting_first_response', count(*) filter (
      where c.first_inbound_at is not null and c.first_response_at is null
    ),
    'at_risk', count(*) filter (
      where c.first_response_at is null
        and c.sla_first_response_due_at is not null
        and c.sla_first_response_due_at >= v_now
        and c.sla_first_response_due_at <= v_now + make_interval(mins => 15)
    ),
    'breached', count(*) filter (
      where c.first_response_at is null
        and c.sla_first_response_due_at is not null
        and c.sla_first_response_due_at < v_now
    )
  )
  into v_sla
  from public.whatsapp_chats c
  where c.tenant_id = v_tenant
    and c.status = 'open';

  -- Métricas do dia (fuso do expediente).
  select jsonb_build_object(
    'chats_opened', (
      select count(*) from public.whatsapp_chats c
      where c.tenant_id = v_tenant and c.created_at >= v_today_start
    ),
    'first_responses', (
      select count(*) from public.whatsapp_chats c
      where c.tenant_id = v_tenant and c.first_response_at >= v_today_start
    ),
    'avg_first_response_minutes', (
      select round(avg(extract(epoch from (c.first_response_at - c.first_inbound_at)) / 60)::numeric, 1)
      from public.whatsapp_chats c
      where c.tenant_id = v_tenant
        and c.first_response_at >= v_today_start
        and c.first_inbound_at is not null
    ),
    'messages_inbound', (
      select count(*) from public.whatsapp_messages m
      join public.whatsapp_chats c on c.id = m.chat_id
      where c.tenant_id = v_tenant and m.direction = 'inbound' and m.created_at >= v_today_start
    ),
    'messages_outbound', (
      select count(*) from public.whatsapp_messages m
      join public.whatsapp_chats c on c.id = m.chat_id
      where c.tenant_id = v_tenant and m.direction = 'outbound' and m.created_at >= v_today_start
    )
  )
  into v_today;

  -- Atendentes e carga atual.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', coalesce(nullif(p.nome, ''), p.email),
      'availability', coalesce(p.availability, 'available'),
      'open_chats', (
        select count(*) from public.whatsapp_chats c
        where c.tenant_id = v_tenant and c.assignee_id = p.id and c.status = 'open'
      )
    )
    order by coalesce(nullif(p.nome, ''), p.email)
  ), '[]'::jsonb)
  into v_attendants
  from public.profiles p
  where p.tenant_id = v_tenant and p.role = 'atendimento';

  return jsonb_build_object(
    'generated_at', v_now,
    'business_hours_enabled', coalesce((v_business->>'enabled')::boolean, false),
    'within_business_hours', public.is_within_business_hours(v_tenant, v_now),
    'timezone', v_tz,
    'pool', v_pool,
    'sla', v_sla,
    'today', v_today,
    'attendants', v_attendants
  );
end;
$$;

grant execute on function public.live_attendance_dashboard() to authenticated, service_role;
