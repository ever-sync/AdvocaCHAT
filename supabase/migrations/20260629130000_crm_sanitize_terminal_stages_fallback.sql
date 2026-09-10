-- Complementa 20260608230000: tenants sem funil customizado (ou sem isLostStage/isSaleStage)
-- usam slugs legados `perdido` / `venda` como fallback.

with terminal_targets as (
  select
    n.id as negotiation_id,
    n.customer_id,
    n.funnel_id,
    n.status,
    case
      when n.status = 'perdido' then coalesce(lost_stage.stage_id, 'perdido')
      when n.status = 'vendido' then coalesce(sale_stage.stage_id, 'venda')
    end as target_stage_id
  from public.crm_negotiations n
  left join public.tenant_crm_funnel_config cfg
    on cfg.tenant_id = n.tenant_id
  left join lateral (
    select s->>'id' as stage_id
    from jsonb_array_elements(cfg.funnels) f,
         jsonb_array_elements(f->'stages') s
    where f->>'id' = n.funnel_id
      and coalesce((s->>'isLostStage')::boolean, false) = true
    limit 1
  ) lost_stage on n.status = 'perdido'
  left join lateral (
    select s->>'id' as stage_id
    from jsonb_array_elements(cfg.funnels) f,
         jsonb_array_elements(f->'stages') s
    where f->>'id' = n.funnel_id
      and coalesce((s->>'isSaleStage')::boolean, false) = true
    limit 1
  ) sale_stage on n.status = 'vendido'
  where n.status in ('perdido', 'vendido')
),
to_fix as (
  select *
  from terminal_targets
  where target_stage_id is not null
    and target_stage_id <> ''
)
update public.crm_negotiations n
set
  stage_id = f.target_stage_id,
  updated_at = timezone('utc', now())
from to_fix f
where n.id = f.negotiation_id
  and n.stage_id is distinct from f.target_stage_id;

update public.customers c
set
  source_columns = coalesce(c.source_columns, '{}'::jsonb)
    || jsonb_build_object(
      'crm_pipeline_stage', n.stage_id,
      'crm_funnel_id', n.funnel_id
    ),
  updated_at = timezone('utc', now())
from public.crm_negotiations n
where c.id = n.customer_id
  and n.status in ('perdido', 'vendido')
  and (
    coalesce(c.source_columns->>'crm_pipeline_stage', '') is distinct from n.stage_id
    or coalesce(c.source_columns->>'crm_funnel_id', '') is distinct from n.funnel_id
  );
