-- Follow-up #4 da rodada visual: info operacional por fluxo.
-- get_marketing_flow_activity(): último evento por fluxo, para a coluna
-- "Última atividade" da lista de automações.
-- security invoker => respeita a RLS de select de marketing_flow_events
-- (is_same_tenant + permissão marketing.view), sem expor outros tenants.

create or replace function public.get_marketing_flow_activity()
returns table (
  flow_id uuid,
  last_event_at timestamptz,
  last_event_type text
)
language sql
security invoker
set search_path = public
as $$
  select distinct on (e.flow_id)
    e.flow_id,
    e.created_at as last_event_at,
    e.event_type as last_event_type
  from public.marketing_flow_events e
  order by e.flow_id, e.created_at desc;
$$;

grant execute on function public.get_marketing_flow_activity() to authenticated;
