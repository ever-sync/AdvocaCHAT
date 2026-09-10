-- Fase 7 do plano completo: recursos avancados (cross-flow).
-- - add_to_marketing_flow: adiciona um lead a um fluxo especifico ignorando o
--   trigger.type (usado pelo executor "adicionar-leads-outros-fluxos").
-- - remove_customer_from_marketing_flow: tira todos os participants do customer
--   no fluxo alvo, com motivo (executor "remover-leads-outros-fluxos").
-- Honra allowReentry e dedupe_key.

-- =====================================================================
-- 1) add_to_marketing_flow
-- =====================================================================
create or replace function public.add_to_marketing_flow(
  p_flow_id uuid,
  p_customer_id uuid,
  p_negotiation_id uuid default null,
  p_context jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow record;
  v_published jsonb;
  v_first_step jsonb;
  v_first_step_id text;
  v_allow_reentry boolean;
  v_dedupe_key text;
  v_participant_id uuid;
begin
  select tenant_id, status, criteria, published_definition into v_flow
  from public.marketing_flows where id = p_flow_id;
  if v_flow.tenant_id is null then
    raise exception 'Fluxo % nao encontrado', p_flow_id;
  end if;
  if v_flow.status <> 'ativo' then
    raise exception 'Fluxo % nao esta ativo (status=%)', p_flow_id, v_flow.status;
  end if;
  v_published := v_flow.published_definition;
  v_first_step := v_published -> 'steps' -> 0;
  if v_first_step is null then
    return null;
  end if;
  v_first_step_id := v_first_step ->> 'id';
  if v_first_step_id is null or length(v_first_step_id) = 0 then
    return null;
  end if;

  v_allow_reentry := coalesce(
    (v_published -> 'settings' ->> 'allowReentry')::boolean,
    false
  );
  if v_allow_reentry then
    v_dedupe_key := null;
  elsif p_negotiation_id is not null then
    v_dedupe_key := 'negotiation:' || p_negotiation_id::text;
  elsif p_customer_id is not null then
    v_dedupe_key := 'customer:' || p_customer_id::text;
  else
    v_dedupe_key := null;
  end if;

  begin
    insert into public.marketing_flow_participants (
      tenant_id, flow_id, customer_id, negotiation_id,
      status, current_step_id, next_run_at, dedupe_key, context
    ) values (
      v_flow.tenant_id, p_flow_id, p_customer_id, p_negotiation_id,
      'active', v_first_step_id, timezone('utc', now()), v_dedupe_key,
      coalesce(p_context, '{}'::jsonb)
    )
    returning id into v_participant_id;
  exception when unique_violation then
    return null;
  end;

  insert into public.marketing_flow_jobs (
    tenant_id, flow_id, participant_id, step_id,
    status, run_at, attempts, max_attempts, idempotency_key
  ) values (
    v_flow.tenant_id, p_flow_id, v_participant_id, v_first_step_id,
    'queued', timezone('utc', now()), 0, 5,
    v_participant_id::text || ':' || v_first_step_id || ':1'
  )
  on conflict (idempotency_key) do nothing;

  insert into public.marketing_flow_events (
    tenant_id, flow_id, participant_id, event_type, step_id, metadata
  ) values (
    v_flow.tenant_id, p_flow_id, v_participant_id,
    'flow_entered', v_first_step_id,
    jsonb_build_object(
      'trigger_type', 'cross_flow',
      'context', coalesce(p_context, '{}'::jsonb)
    )
  );

  return v_participant_id;
end;
$$;

revoke all on function public.add_to_marketing_flow(uuid, uuid, uuid, jsonb) from public;
grant execute on function public.add_to_marketing_flow(uuid, uuid, uuid, jsonb) to service_role;

-- =====================================================================
-- 2) remove_customer_from_marketing_flow
-- =====================================================================
create or replace function public.remove_customer_from_marketing_flow(
  p_flow_id uuid,
  p_customer_id uuid,
  p_reason text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_p record;
  v_reason text;
begin
  v_reason := coalesce(nullif(trim(p_reason), ''), 'Removido via outro fluxo');
  for v_p in
    select id, tenant_id, current_step_id
    from public.marketing_flow_participants
    where flow_id = p_flow_id
      and customer_id = p_customer_id
      and status in ('active', 'waiting', 'paused')
  loop
    update public.marketing_flow_participants
    set status = 'exited',
        exited_at = timezone('utc', now()),
        exit_reason = v_reason,
        next_run_at = null
    where id = v_p.id;

    update public.marketing_flow_jobs
    set status = 'done',
        locked_at = null,
        locked_by = null,
        last_error = 'Participant exited (cross flow)'
    where participant_id = v_p.id
      and status in ('queued', 'running');

    insert into public.marketing_flow_events (
      tenant_id, flow_id, participant_id, event_type, step_id, message, metadata
    ) values (
      v_p.tenant_id, p_flow_id, v_p.id,
      'participant_exited', v_p.current_step_id, v_reason,
      jsonb_build_object('cross_flow', true)
    );

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.remove_customer_from_marketing_flow(uuid, uuid, text) from public;
grant execute on function public.remove_customer_from_marketing_flow(uuid, uuid, text) to service_role;
