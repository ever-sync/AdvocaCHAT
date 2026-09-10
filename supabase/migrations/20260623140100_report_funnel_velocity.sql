-- Velocidade do funil: tempo médio (e mediana) que negociações passam em cada etapa
-- antes de transitar para a próxima. Usa crm_stage_history (já populada por trigger
-- log_crm_stage_history) e considera o instante de entrada = primeira mudança que
-- chega na etapa (ou created_at quando é a etapa inicial). O período filtra pela
-- data em que o negócio SAIU da etapa (h.changed_at), de modo que medições recentes
-- não se contaminam com transições antigas. Sem RLS extra: a query roda em SECURITY
-- DEFINER e filtra por current_tenant_id().

create or replace function public.report_funnel_velocity(
  p_funnel_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  stage_id text,
  stage_order integer,
  transitions bigint,
  avg_days numeric,
  median_days numeric,
  max_days numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce(t.funnels, '[]'::jsonb) as funnels
    from public.tenant_crm_funnel_config t
    where t.tenant_id = public.current_tenant_id()
  ),
  funnel_stages as (
    select
      stage_elem->>'id' as stage_id,
      stage_ord::integer as stage_order
    from cfg,
    lateral jsonb_array_elements(cfg.funnels) as funnel_elem,
    lateral jsonb_array_elements(funnel_elem->'stages') with ordinality as stages(stage_elem, stage_ord)
    where funnel_elem->>'id' = p_funnel_id
  ),
  -- Para cada transição (h), determina quando o negócio ENTROU na etapa que está saindo:
  -- a mudança anterior do mesmo negócio (lag), ou o created_at quando é a primeira.
  exits as (
    select
      h.negotiation_id,
      h.from_stage_id as stage_id,
      h.changed_at as exit_at,
      coalesce(
        lag(h.changed_at) over (
          partition by h.negotiation_id order by h.changed_at
        ),
        n.created_at
      ) as enter_at
    from public.crm_stage_history h
    join public.crm_negotiations n on n.id = h.negotiation_id
    where h.tenant_id = public.current_tenant_id()
      and n.funnel_id = p_funnel_id
      and h.from_stage_id is not null
      and h.changed_at >= p_from
      and h.changed_at <= p_to
  ),
  durations as (
    select
      e.stage_id,
      extract(epoch from (e.exit_at - e.enter_at)) / 86400.0 as days_in_stage
    from exits e
    where e.exit_at > e.enter_at
  ),
  agg as (
    select
      d.stage_id,
      count(*)::bigint as transitions,
      round(avg(d.days_in_stage)::numeric, 1) as avg_days,
      round(
        percentile_cont(0.5) within group (order by d.days_in_stage)::numeric,
        1
      ) as median_days,
      round(max(d.days_in_stage)::numeric, 1) as max_days
    from durations d
    group by d.stage_id
  )
  select
    coalesce(fs.stage_id, a.stage_id) as stage_id,
    coalesce(fs.stage_order, 999) as stage_order,
    coalesce(a.transitions, 0) as transitions,
    a.avg_days,
    a.median_days,
    a.max_days
  from funnel_stages fs
  full outer join agg a on a.stage_id = fs.stage_id
  order by coalesce(fs.stage_order, 999), coalesce(fs.stage_id, a.stage_id);
$$;

grant execute on function public.report_funnel_velocity(text, timestamptz, timestamptz) to authenticated;
