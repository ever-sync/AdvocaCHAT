-- Relatórios CRM: funil (conversão), negócios parados, SLA comercial, performance por vendedor.

drop function if exists public.report_funnel_conversion(text, timestamptz, timestamptz);

-- Funil: conversão por etapa com histórico de estágio
create or replace function public.report_funnel_conversion(
  p_funnel_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  stage_id text,
  stage_order integer,
  current_count bigint,
  entered_in_period bigint,
  won_in_period bigint,
  lost_in_period bigint,
  conversion_pct numeric
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
  all_stages as (
    select fs.stage_id, fs.stage_order
    from funnel_stages fs
    union
    select distinct n.stage_id, 999
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and n.funnel_id = p_funnel_id
      and not exists (select 1 from funnel_stages fs where fs.stage_id = n.stage_id)
  ),
  current_by_stage as (
    select n.stage_id, count(*)::bigint as cnt
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and n.funnel_id = p_funnel_id
      and n.status in ('em_andamento', 'nao_pausado', 'pausado')
    group by n.stage_id
  ),
  entered as (
    select h.to_stage_id as stage_id, count(distinct h.negotiation_id)::bigint as cnt
    from public.crm_stage_history h
    join public.crm_negotiations n on n.id = h.negotiation_id
    where h.tenant_id = public.current_tenant_id()
      and n.funnel_id = p_funnel_id
      and h.changed_at >= p_from
      and h.changed_at <= p_to
    group by h.to_stage_id
    union all
    select n.stage_id, count(distinct n.id)::bigint
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and n.funnel_id = p_funnel_id
      and n.created_at >= p_from
      and n.created_at <= p_to
      and not exists (
        select 1
        from public.crm_stage_history h
        where h.negotiation_id = n.id
          and h.changed_at >= p_from
          and h.changed_at <= p_to
      )
    group by n.stage_id
  ),
  entered_agg as (
    select stage_id, sum(cnt)::bigint as entered_in_period
    from entered
    group by stage_id
  ),
  outcomes as (
    select
      coalesce(h.to_stage_id, n.stage_id) as stage_id,
      count(distinct n.id) filter (
        where n.status = 'vendido'
          and n.updated_at >= p_from
          and n.updated_at <= p_to
      )::bigint as won_in_period,
      count(distinct n.id) filter (
        where n.status = 'perdido'
          and n.updated_at >= p_from
          and n.updated_at <= p_to
      )::bigint as lost_in_period
    from public.crm_negotiations n
    left join lateral (
      select h2.to_stage_id
      from public.crm_stage_history h2
      where h2.negotiation_id = n.id
        and h2.changed_at <= p_to
      order by h2.changed_at desc
      limit 1
    ) h on true
    where n.tenant_id = public.current_tenant_id()
      and n.funnel_id = p_funnel_id
    group by coalesce(h.to_stage_id, n.stage_id)
  ),
  base as (
    select
      s.stage_id,
      s.stage_order,
      coalesce(c.cnt, 0) as current_count,
      coalesce(e.entered_in_period, 0) as entered_in_period,
      coalesce(o.won_in_period, 0) as won_in_period,
      coalesce(o.lost_in_period, 0) as lost_in_period
    from all_stages s
    left join current_by_stage c on c.stage_id = s.stage_id
    left join entered_agg e on e.stage_id = s.stage_id
    left join outcomes o on o.stage_id = s.stage_id
  )
  select
    b.stage_id,
    b.stage_order,
    b.current_count,
    b.entered_in_period,
    b.won_in_period,
    b.lost_in_period,
    case
      when lag(b.entered_in_period) over (order by b.stage_order, b.stage_id) > 0
      then round(
        100.0 * b.entered_in_period::numeric
          / lag(b.entered_in_period) over (order by b.stage_order, b.stage_id),
        1
      )
      else null
    end as conversion_pct
  from base b
  order by b.stage_order, b.stage_id;
$$;

-- Negócios parados (snapshot atual)
create or replace function public.report_stale_negotiations(
  p_funnel_id text,
  p_limit integer default 100
)
returns table(
  negotiation_id uuid,
  title text,
  funnel_id text,
  stage_id text,
  assignee_id uuid,
  assignee_name text,
  days_without_touch integer,
  missing_future_task boolean,
  total_value numeric,
  last_interaction_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select coalesce(ts.stale_negotiation_days, 7) as stale_days
    from public.tenant_settings ts
    where ts.tenant_id = public.current_tenant_id()
  ),
  touched as (
    select
      n.*,
      floor(
        extract(
          epoch from (
            timezone('utc', now())
            - coalesce(n.last_interaction_at, n.last_contact_at, n.created_at)
          )
        ) / 86400.0
      )::integer as days_without_touch,
      (n.next_task_at is null or n.next_task_at <= timezone('utc', now())) as missing_future_task
    from public.crm_negotiations n
    cross join settings s
    where n.tenant_id = public.current_tenant_id()
      and n.status in ('em_andamento', 'nao_pausado')
      and (p_funnel_id is null or n.funnel_id = p_funnel_id)
  )
  select
    t.id as negotiation_id,
    t.title,
    t.funnel_id,
    t.stage_id,
    t.assignee_id,
    p.nome as assignee_name,
    t.days_without_touch,
    t.missing_future_task,
    t.total_value,
    coalesce(t.last_interaction_at, t.last_contact_at, t.created_at) as last_interaction_at
  from touched t
  cross join settings s
  left join public.profiles p on p.id = t.assignee_id
  where t.days_without_touch >= s.stale_days
     or t.missing_future_task
  order by t.days_without_touch desc, t.total_value desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.report_stale_negotiations_summary(
  p_funnel_id text default null
)
returns table(
  stale_threshold_days integer,
  open_negotiations bigint,
  stale_count bigint,
  no_future_task_count bigint,
  pool_unassigned_stale bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select coalesce(ts.stale_negotiation_days, 7) as stale_days
    from public.tenant_settings ts
    where ts.tenant_id = public.current_tenant_id()
  ),
  open_neg as (
    select
      n.*,
      floor(
        extract(
          epoch from (
            timezone('utc', now())
            - coalesce(n.last_interaction_at, n.last_contact_at, n.created_at)
          )
        ) / 86400.0
      )::integer as days_without_touch,
      (n.next_task_at is null or n.next_task_at <= timezone('utc', now())) as missing_future_task
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and n.status in ('em_andamento', 'nao_pausado')
      and (p_funnel_id is null or n.funnel_id = p_funnel_id)
  )
  select
    s.stale_days::integer,
    coalesce(count(o.id), 0)::bigint,
    coalesce(count(o.id) filter (where o.days_without_touch >= s.stale_days), 0)::bigint,
    coalesce(count(o.id) filter (where o.missing_future_task), 0)::bigint,
    coalesce(
      count(o.id) filter (
        where o.days_without_touch >= s.stale_days
          and o.assignee_id is null
      ),
      0
    )::bigint
  from settings s
  left join open_neg o on true
  group by s.stale_days;
$$;

-- SLA comercial (CRM + chats vinculados)
create or replace function public.report_crm_commercial_sla(
  p_from timestamptz,
  p_to timestamptz,
  p_funnel_id text default null
)
returns table(
  sla_first_response_minutes integer,
  open_negotiations bigint,
  stale_negotiations bigint,
  no_future_task_negotiations bigint,
  chats_awaiting_first_response bigint,
  chats_sla_breached bigint,
  chats_first_response_in_period bigint,
  avg_first_response_minutes numeric,
  won_in_period bigint,
  lost_in_period bigint,
  avg_days_to_close numeric,
  overdue_crm_tasks bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select coalesce(ts.stale_negotiation_days, 7) as stale_days,
           coalesce(ts.sla_first_response_minutes, 15) as sla_minutes
    from public.tenant_settings ts
    where ts.tenant_id = public.current_tenant_id()
  ),
  open_neg as (
    select n.*
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and n.status in ('em_andamento', 'nao_pausado')
      and (p_funnel_id is null or n.funnel_id = p_funnel_id)
  ),
  neg_metrics as (
    select
      count(*)::bigint as open_negotiations,
      count(*) filter (
        where floor(
          extract(
            epoch from (
              timezone('utc', now())
              - coalesce(n.last_interaction_at, n.last_contact_at, n.created_at)
            )
          ) / 86400.0
        ) >= s.stale_days
      )::bigint as stale_negotiations,
      count(*) filter (
        where n.next_task_at is null or n.next_task_at <= timezone('utc', now())
      )::bigint as no_future_task_negotiations
    from open_neg n
    cross join settings s
  ),
  closed as (
    select
      count(*) filter (where n.status = 'vendido')::bigint as won_in_period,
      count(*) filter (where n.status = 'perdido')::bigint as lost_in_period,
      round(
        avg(
          extract(
            epoch from (n.updated_at - n.created_at)
          ) / 86400.0
        ) filter (where n.status = 'vendido'),
        1
      ) as avg_days_to_close
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and (p_funnel_id is null or n.funnel_id = p_funnel_id)
      and n.updated_at >= p_from
      and n.updated_at <= p_to
      and n.status in ('vendido', 'perdido')
  ),
  linked_chats as (
    select distinct c.*
    from public.whatsapp_chats c
    join public.crm_negotiations n on n.id = c.primary_negotiation_id
    where c.tenant_id = public.current_tenant_id()
      and (p_funnel_id is null or n.funnel_id = p_funnel_id)
  ),
  chat_sla as (
    select
      count(*) filter (
        where lc.first_inbound_at is not null
          and lc.first_response_at is null
      )::bigint as chats_awaiting_first_response,
      count(*) filter (
        where lc.first_response_at is null
          and lc.sla_first_response_due_at is not null
          and lc.sla_first_response_due_at < timezone('utc', now())
      )::bigint as chats_sla_breached,
      count(*) filter (
        where lc.first_response_at is not null
          and lc.first_response_at >= p_from
          and lc.first_response_at <= p_to
      )::bigint as chats_first_response_in_period,
      round(
        avg(
          extract(epoch from (lc.first_response_at - lc.first_inbound_at)) / 60.0
        ) filter (
          where lc.first_response_at is not null
            and lc.first_inbound_at is not null
            and lc.first_response_at >= p_from
            and lc.first_response_at <= p_to
        ),
        1
      ) as avg_first_response_minutes
    from linked_chats lc
  ),
  overdue_tasks as (
    select count(*)::bigint as overdue_crm_tasks
    from public.crm_tasks t
    join public.crm_negotiations n on n.id = t.negotiation_id
    where t.tenant_id = public.current_tenant_id()
      and t.status = 'aberta'
      and t.due_at is not null
      and t.due_at < timezone('utc', now())
      and (p_funnel_id is null or n.funnel_id = p_funnel_id)
  )
  select
    s.sla_minutes::integer,
    nm.open_negotiations,
    nm.stale_negotiations,
    nm.no_future_task_negotiations,
    cs.chats_awaiting_first_response,
    cs.chats_sla_breached,
    cs.chats_first_response_in_period,
    cs.avg_first_response_minutes,
    c.won_in_period,
    c.lost_in_period,
    c.avg_days_to_close,
    ot.overdue_crm_tasks
  from settings s
  cross join neg_metrics nm
  cross join closed c
  cross join chat_sla cs
  cross join overdue_tasks ot;
$$;

-- Performance por responsável no CRM
create or replace function public.report_crm_seller_performance(
  p_from timestamptz,
  p_to timestamptz,
  p_funnel_id text default null
)
returns table(
  assignee_id uuid,
  assignee_name text,
  open_count bigint,
  pipeline_value numeric,
  won_count bigint,
  won_value numeric,
  lost_count bigint,
  stale_count bigint,
  avg_days_without_touch numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select coalesce(ts.stale_negotiation_days, 7) as stale_days
    from public.tenant_settings ts
    where ts.tenant_id = public.current_tenant_id()
  ),
  scoped as (
    select n.*
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and (p_funnel_id is null or n.funnel_id = p_funnel_id)
  )
  select
    p.id as assignee_id,
    p.nome as assignee_name,
    count(s.id) filter (
      where s.status in ('em_andamento', 'nao_pausado')
        and s.assignee_id = p.id
    )::bigint as open_count,
    coalesce(
      sum(s.total_value) filter (
        where s.status in ('em_andamento', 'nao_pausado')
          and s.assignee_id = p.id
      ),
      0
    ) as pipeline_value,
    count(s.id) filter (
      where s.status = 'vendido'
        and s.assignee_id = p.id
        and s.updated_at >= p_from
        and s.updated_at <= p_to
    )::bigint as won_count,
    coalesce(
      sum(s.total_value) filter (
        where s.status = 'vendido'
          and s.assignee_id = p.id
          and s.updated_at >= p_from
          and s.updated_at <= p_to
      ),
      0
    ) as won_value,
    count(s.id) filter (
      where s.status = 'perdido'
        and s.assignee_id = p.id
        and s.updated_at >= p_from
        and s.updated_at <= p_to
    )::bigint as lost_count,
    count(s.id) filter (
      where s.status in ('em_andamento', 'nao_pausado')
        and s.assignee_id = p.id
        and floor(
          extract(
            epoch from (
              timezone('utc', now())
              - coalesce(s.last_interaction_at, s.last_contact_at, s.created_at)
            )
          ) / 86400.0
        ) >= st.stale_days
    )::bigint as stale_count,
    round(
      avg(
        floor(
          extract(
            epoch from (
              timezone('utc', now())
              - coalesce(s.last_interaction_at, s.last_contact_at, s.created_at)
            )
          ) / 86400.0
        )
      ) filter (
        where s.status in ('em_andamento', 'nao_pausado')
          and s.assignee_id = p.id
      ),
      1
    ) as avg_days_without_touch
  from public.profiles p
  cross join settings st
  left join scoped s on s.assignee_id = p.id
  where p.tenant_id = public.current_tenant_id()
    and p.role in ('atendimento', 'operacao', 'admin', 'financeiro')
  group by p.id, p.nome, st.stale_days
  having count(s.id) filter (where s.assignee_id = p.id) > 0
  order by won_value desc, pipeline_value desc, open_count desc;
$$;

grant execute on function public.report_funnel_conversion(text, timestamptz, timestamptz) to authenticated;
grant execute on function public.report_stale_negotiations(text, integer) to authenticated;
grant execute on function public.report_stale_negotiations_summary(text) to authenticated;
grant execute on function public.report_crm_commercial_sla(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.report_crm_seller_performance(timestamptz, timestamptz, text) to authenticated;
