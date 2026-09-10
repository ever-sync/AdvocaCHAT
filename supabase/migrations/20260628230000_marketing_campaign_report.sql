-- Relatório de campanhas (dados internos) para a aba Campanhas do Marketing.
-- Agrega os leads de formulário (crm_negotiation_marketing) + estado da
-- negociação (crm_negotiations) por origem e por formulário, numa janela de
-- tempo. security invoker => respeita a RLS de select das duas tabelas
-- (is_same_tenant + marketing.view / crm.view), sem expor outros tenants.

-- 1) Por origem (utm_source normalizado) -----------------------------------
create or replace function public.get_marketing_campaign_report(
  p_since timestamptz default null
)
returns table (
  source text,
  leads bigint,
  won bigint,
  revenue numeric
)
language sql
security invoker
set search_path = public
as $$
  select
    coalesce(nullif(trim(m.utm_source), ''), 'Direto/sem origem') as source,
    count(*) as leads,
    count(*) filter (where n.status = 'vendido') as won,
    coalesce(sum(n.total_value) filter (where n.status = 'vendido'), 0) as revenue
  from public.crm_negotiation_marketing m
  join public.crm_negotiations n on n.id = m.negotiation_id
  where p_since is null or m.created_at >= p_since
  group by 1
  order by leads desc;
$$;

grant execute on function public.get_marketing_campaign_report(timestamptz) to authenticated;

-- 2) Por formulário ---------------------------------------------------------
-- views/submits são contadores lifetime do form; leads/won/revenue respeitam a
-- janela (vêm dos leads daquela janela).
create or replace function public.get_marketing_form_report(
  p_since timestamptz default null
)
returns table (
  form_id uuid,
  form_name text,
  views integer,
  submits integer,
  leads bigint,
  won bigint,
  revenue numeric
)
language sql
security invoker
set search_path = public
as $$
  select
    f.id as form_id,
    f.name as form_name,
    f.total_views as views,
    f.total_submissions as submits,
    count(m.negotiation_id) as leads,
    count(m.negotiation_id) filter (where n.status = 'vendido') as won,
    coalesce(sum(n.total_value) filter (where n.status = 'vendido'), 0) as revenue
  from public.marketing_forms f
  left join public.crm_negotiation_marketing m
    on m.form_id = f.id
   and (p_since is null or m.created_at >= p_since)
  left join public.crm_negotiations n on n.id = m.negotiation_id
  group by f.id, f.name, f.total_views, f.total_submissions, f.created_at
  order by leads desc, f.created_at desc;
$$;

grant execute on function public.get_marketing_form_report(timestamptz) to authenticated;
