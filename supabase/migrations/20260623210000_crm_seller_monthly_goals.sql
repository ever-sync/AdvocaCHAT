-- Metas mensais de vendas por atendente do CRM. Cada linha = goal de um
-- atendente em (ano, mês). O RPC `report_crm_monthly_goals` junta a meta com
-- o valor real vendido no mês (crm_negotiations com status='vendido' e
-- updated_at dentro do mês) pra alimentar o card de progresso no Painel.

create table if not exists public.crm_seller_monthly_goals (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  year        integer not null check (year between 2020 and 2100),
  month       integer not null check (month between 1 and 12),
  goal_amount numeric(14,2) not null default 0 check (goal_amount >= 0),
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now()),
  unique (tenant_id, profile_id, year, month)
);

create index if not exists crm_seller_monthly_goals_tenant_month_idx
  on public.crm_seller_monthly_goals (tenant_id, year, month);

drop trigger if exists crm_seller_monthly_goals_set_updated_at on public.crm_seller_monthly_goals;
create trigger crm_seller_monthly_goals_set_updated_at
before update on public.crm_seller_monthly_goals
for each row execute function public.set_updated_at();

alter table public.crm_seller_monthly_goals enable row level security;

-- SELECT: qualquer um do tenant que enxergue CRM pode ver metas (gera transparência);
-- atendimento vê só a própria linha (não quer comparar com colegas).
drop policy if exists "crm_seller_monthly_goals_select" on public.crm_seller_monthly_goals;
create policy "crm_seller_monthly_goals_select"
on public.crm_seller_monthly_goals for select
using (
  public.is_same_tenant(tenant_id)
  and (
    public.current_user_role() in ('admin', 'operacao', 'financeiro')
    or profile_id = auth.uid()
  )
);

-- INSERT/UPDATE/DELETE: só gestores.
drop policy if exists "crm_seller_monthly_goals_insert" on public.crm_seller_monthly_goals;
create policy "crm_seller_monthly_goals_insert"
on public.crm_seller_monthly_goals for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao', 'financeiro')
);

drop policy if exists "crm_seller_monthly_goals_update" on public.crm_seller_monthly_goals;
create policy "crm_seller_monthly_goals_update"
on public.crm_seller_monthly_goals for update
using (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao', 'financeiro')
)
with check (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao', 'financeiro')
);

drop policy if exists "crm_seller_monthly_goals_delete" on public.crm_seller_monthly_goals;
create policy "crm_seller_monthly_goals_delete"
on public.crm_seller_monthly_goals for delete
using (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao', 'financeiro')
);

-- ---------------------------------------------------------------------------
-- Relatório mensal: junta meta com vendas reais (status='vendido' fechadas no mês).
-- Atendentes sem meta aparecem com goal_amount=0; vendedores sem venda aparecem
-- com sold_amount=0. Só lista atendentes ativos do tenant.
-- ---------------------------------------------------------------------------
create or replace function public.report_crm_monthly_goals(
  p_year integer,
  p_month integer
)
returns table(
  profile_id uuid,
  profile_name text,
  goal_amount numeric,
  sold_amount numeric,
  sold_count bigint,
  attainment_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with month_range as (
    select
      make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'UTC') as month_start,
      make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'UTC') + interval '1 month' as month_end
  ),
  sold as (
    select n.assignee_id as profile_id,
           coalesce(sum(n.total_value), 0) as sold_amount,
           count(*)::bigint as sold_count
    from public.crm_negotiations n
    cross join month_range mr
    where n.tenant_id = public.current_tenant_id()
      and n.status = 'vendido'
      and n.updated_at >= mr.month_start
      and n.updated_at < mr.month_end
    group by n.assignee_id
  ),
  attendants as (
    select p.id, coalesce(p.nome, '') as nome
    from public.profiles p
    where p.tenant_id = public.current_tenant_id()
      and p.status = 'active'
      and p.role in ('atendimento', 'operacao', 'admin', 'financeiro')
  )
  select
    a.id as profile_id,
    a.nome as profile_name,
    coalesce(g.goal_amount, 0)::numeric as goal_amount,
    coalesce(s.sold_amount, 0)::numeric as sold_amount,
    coalesce(s.sold_count, 0)::bigint as sold_count,
    case
      when coalesce(g.goal_amount, 0) > 0
        then round(coalesce(s.sold_amount, 0)::numeric / g.goal_amount::numeric * 100, 1)
      else null
    end as attainment_pct
  from attendants a
  left join public.crm_seller_monthly_goals g
    on g.tenant_id = public.current_tenant_id()
    and g.profile_id = a.id
    and g.year = p_year
    and g.month = p_month
  left join sold s on s.profile_id = a.id
  -- Apenas quem tem meta OU vendas no mês (filtra atendentes inativos no CRM).
  where coalesce(g.goal_amount, 0) > 0 or coalesce(s.sold_amount, 0) > 0
  order by attainment_pct desc nulls last, sold_amount desc, a.nome asc;
$$;

grant execute on function public.report_crm_monthly_goals(integer, integer) to authenticated;

-- Realtime: vistas atualizam quando gestor edita metas em outra aba/sessão.
do $$
declare already_in boolean;
begin
  execute 'alter table public.crm_seller_monthly_goals replica identity full';
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_seller_monthly_goals'
  ) into already_in;
  if not already_in then
    execute 'alter publication supabase_realtime add table public.crm_seller_monthly_goals';
  end if;
end $$;
