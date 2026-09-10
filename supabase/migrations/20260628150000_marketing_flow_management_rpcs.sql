-- Fase 6 do plano completo: monitoramento na UI.
-- - get_marketing_flow_stats(): counts por status por flow (security invoker;
--   respeita RLS do select dos participants).
-- - reprocess_marketing_flow_job(): reenfileira job em failed/dead.
-- - exit_marketing_flow_participant(): saida manual + cancela jobs pendentes.
-- RPCs de escrita usam security definer + has_role_permission(tenant, 'marketing', 'edit').

-- =====================================================================
-- 1) Stats por flow
-- =====================================================================
create or replace function public.get_marketing_flow_stats()
returns table (
  flow_id uuid,
  total_entered bigint,
  active_count bigint,
  completed_count bigint,
  failed_count bigint,
  exited_count bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    p.flow_id,
    count(*) as total_entered,
    count(*) filter (where p.status in ('active', 'waiting')) as active_count,
    count(*) filter (where p.status = 'completed') as completed_count,
    count(*) filter (where p.status = 'failed') as failed_count,
    count(*) filter (where p.status = 'exited') as exited_count
  from public.marketing_flow_participants p
  group by p.flow_id;
$$;

grant execute on function public.get_marketing_flow_stats() to authenticated;

-- =====================================================================
-- 2) Reprocessar job
-- =====================================================================
create or replace function public.reprocess_marketing_flow_job(p_job_id uuid)
returns public.marketing_flow_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.marketing_flow_jobs;
begin
  select * into v_job from public.marketing_flow_jobs where id = p_job_id;
  if v_job.id is null then
    raise exception 'Job nao encontrado';
  end if;
  if not public.has_role_permission(v_job.tenant_id, 'marketing', 'edit') then
    raise exception 'Permissao negada';
  end if;
  if v_job.status not in ('failed', 'dead') then
    raise exception 'Job nao esta em estado falho (status=%) ', v_job.status;
  end if;

  update public.marketing_flow_jobs
  set status = 'queued',
      run_at = timezone('utc', now()),
      attempts = 0,
      locked_at = null,
      locked_by = null,
      last_error = null
  where id = p_job_id
  returning * into v_job;

  -- Reativa participant se estava failed por causa desse job.
  update public.marketing_flow_participants
  set status = 'active',
      exited_at = null,
      exit_reason = null
  where id = v_job.participant_id
    and status = 'failed';

  insert into public.marketing_flow_events (
    tenant_id, flow_id, participant_id, event_type, step_id, message, metadata
  ) values (
    v_job.tenant_id, v_job.flow_id, v_job.participant_id,
    'manual_resume', v_job.step_id,
    'Reprocessado manualmente',
    jsonb_build_object('reprocessed_by', auth.uid())
  );

  return v_job;
end;
$$;

grant execute on function public.reprocess_marketing_flow_job(uuid) to authenticated;

-- =====================================================================
-- 3) Saida manual de participant
-- =====================================================================
create or replace function public.exit_marketing_flow_participant(
  p_participant_id uuid,
  p_reason text default null
)
returns public.marketing_flow_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.marketing_flow_participants;
  v_reason text;
begin
  select * into v_p from public.marketing_flow_participants where id = p_participant_id;
  if v_p.id is null then
    raise exception 'Participante nao encontrado';
  end if;
  if not public.has_role_permission(v_p.tenant_id, 'marketing', 'edit') then
    raise exception 'Permissao negada';
  end if;
  v_reason := coalesce(nullif(trim(p_reason), ''), 'Removido manualmente');

  update public.marketing_flow_participants
  set status = 'exited',
      exited_at = timezone('utc', now()),
      exit_reason = v_reason,
      next_run_at = null
  where id = p_participant_id
  returning * into v_p;

  -- Cancela jobs pendentes (queued/running) deste participant.
  update public.marketing_flow_jobs
  set status = 'done',
      locked_at = null,
      locked_by = null,
      last_error = 'Participant exited manually'
  where participant_id = p_participant_id
    and status in ('queued', 'running');

  insert into public.marketing_flow_events (
    tenant_id, flow_id, participant_id, event_type, step_id, message, metadata
  ) values (
    v_p.tenant_id, v_p.flow_id, v_p.id,
    'participant_exited', v_p.current_step_id,
    v_reason,
    jsonb_build_object('exited_by', auth.uid(), 'manual', true)
  );

  return v_p;
end;
$$;

grant execute on function public.exit_marketing_flow_participant(uuid, text) to authenticated;
