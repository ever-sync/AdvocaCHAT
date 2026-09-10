-- Relatório de agenda: métricas de ocupação, no-show e produção por prestador.
-- RPC scheduling_report(p_from, p_to, p_provider_id?)
--   Retorna um resumo agregado + série diária para o gráfico.

create or replace function public.scheduling_report(
  p_from        date,
  p_to          date,
  p_provider_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_summary   jsonb;
  v_by_day    jsonb;
  v_by_status jsonb;
  v_by_service jsonb;
  v_by_provider jsonb;
begin
  select public.current_tenant_id() into v_tenant_id;
  if v_tenant_id is null then
    raise exception 'Tenant não autenticado';
  end if;

  -- Resumo global
  select jsonb_build_object(
    'total',          count(*),
    'agendado',       count(*) filter (where status = 'agendado'),
    'confirmado',     count(*) filter (where status = 'confirmado'),
    'concluido',      count(*) filter (where status = 'concluido'),
    'cancelado',      count(*) filter (where status = 'cancelado'),
    'nao_compareceu', count(*) filter (where status = 'nao_compareceu'),
    'receita_total',  coalesce(sum(preco) filter (where status = 'concluido'), 0),
    'taxa_no_show',   round(
      case when count(*) filter (where status not in ('cancelado')) > 0
        then count(*) filter (where status = 'nao_compareceu')::numeric
             / count(*) filter (where status not in ('cancelado')) * 100
        else 0
      end, 1),
    'taxa_cancelamento', round(
      case when count(*) > 0
        then count(*) filter (where status = 'cancelado')::numeric / count(*) * 100
        else 0
      end, 1),
    'taxa_conclusao', round(
      case when count(*) filter (where status not in ('cancelado')) > 0
        then count(*) filter (where status = 'concluido')::numeric
             / count(*) filter (where status not in ('cancelado')) * 100
        else 0
      end, 1)
  )
  into v_summary
  from public.scheduling_appointments
  where tenant_id = v_tenant_id
    and starts_at::date between p_from and p_to
    and (p_provider_id is null or provider_id = p_provider_id);

  -- Série diária (para o gráfico de barras)
  select jsonb_agg(
    jsonb_build_object(
      'date',           day::text,
      'total',          total,
      'concluido',      concluido,
      'cancelado',      cancelado,
      'nao_compareceu', nao_compareceu,
      'receita',        receita
    ) order by day
  )
  into v_by_day
  from (
    select
      starts_at::date                                           as day,
      count(*)                                                  as total,
      count(*) filter (where status = 'concluido')              as concluido,
      count(*) filter (where status = 'cancelado')              as cancelado,
      count(*) filter (where status = 'nao_compareceu')         as nao_compareceu,
      coalesce(sum(preco) filter (where status = 'concluido'),0) as receita
    from public.scheduling_appointments
    where tenant_id = v_tenant_id
      and starts_at::date between p_from and p_to
      and (p_provider_id is null or provider_id = p_provider_id)
    group by 1
  ) d;

  -- Por serviço (top serviços)
  select jsonb_agg(
    jsonb_build_object(
      'service_nome', service_nome,
      'total',        total,
      'concluido',    concluido,
      'receita',      receita
    ) order by total desc
  )
  into v_by_service
  from (
    select
      coalesce(service_nome, 'Sem serviço')                     as service_nome,
      count(*)                                                   as total,
      count(*) filter (where status = 'concluido')               as concluido,
      coalesce(sum(preco) filter (where status = 'concluido'),0)  as receita
    from public.scheduling_appointments
    where tenant_id = v_tenant_id
      and starts_at::date between p_from and p_to
      and (p_provider_id is null or provider_id = p_provider_id)
    group by 1
  ) s;

  -- Por prestador (só quando não tem filtro de prestador)
  if p_provider_id is null then
    select jsonb_agg(
      jsonb_build_object(
        'provider_id',    provider_id,
        'total',          total,
        'concluido',      concluido,
        'nao_compareceu', nao_compareceu,
        'receita',        receita
      ) order by total desc
    )
    into v_by_provider
    from (
      select
        provider_id,
        count(*)                                                   as total,
        count(*) filter (where status = 'concluido')               as concluido,
        count(*) filter (where status = 'nao_compareceu')          as nao_compareceu,
        coalesce(sum(preco) filter (where status = 'concluido'),0)  as receita
      from public.scheduling_appointments
      where tenant_id = v_tenant_id
        and starts_at::date between p_from and p_to
      group by 1
    ) pv;
  else
    v_by_provider := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'summary',      v_summary,
    'by_day',       coalesce(v_by_day, '[]'::jsonb),
    'by_service',   coalesce(v_by_service, '[]'::jsonb),
    'by_provider',  coalesce(v_by_provider, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.scheduling_report(date, date, uuid) to authenticated;
