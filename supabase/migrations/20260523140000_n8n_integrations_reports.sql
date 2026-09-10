-- n8n integrations + attendance/sales report RPCs

create table if not exists public.tenant_integrations (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  n8n_webhook_url text,
  n8n_secret text,
  n8n_enabled boolean not null default false,
  n8n_rate_limit_per_minute integer not null default 30,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.tenant_integrations enable row level security;

create policy "tenant_integrations_select" on public.tenant_integrations
for select using (public.is_same_tenant(tenant_id));

create policy "tenant_integrations_insert" on public.tenant_integrations
for insert with check (public.is_same_tenant(tenant_id));

create policy "tenant_integrations_update" on public.tenant_integrations
for update using (public.is_same_tenant(tenant_id)) with check (public.is_same_tenant(tenant_id));

-- Attendance report per seller
create or replace function public.report_attendance_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_assignee_id uuid default null
)
returns table(
  assignee_id uuid,
  assignee_name text,
  chats_opened bigint,
  chats_resolved bigint,
  messages_inbound bigint,
  messages_outbound bigint,
  messages_ai bigint,
  avg_first_response_minutes numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with tenant_chats as (
    select c.*
    from public.whatsapp_chats c
    where c.tenant_id = public.current_tenant_id()
      and (p_assignee_id is null or c.assignee_id = p_assignee_id)
  ),
  msg_stats as (
    select
      tc.assignee_id,
      count(*) filter (where m.direction = 'inbound') as messages_inbound,
      count(*) filter (where m.direction = 'outbound' and m.actor_type = 'human') as messages_outbound,
      count(*) filter (where m.actor_type = 'ai') as messages_ai
    from tenant_chats tc
    join public.whatsapp_messages m on m.chat_id = tc.id
    where m.created_at >= p_from and m.created_at <= p_to
    group by tc.assignee_id
  )
  select
    p.id as assignee_id,
    p.nome as assignee_name,
    count(tc.id) filter (
      where tc.created_at >= p_from and tc.created_at <= p_to
    ) as chats_opened,
    count(tc.id) filter (
      where tc.resolution = 'resolved'
        and tc.updated_at >= p_from and tc.updated_at <= p_to
    ) as chats_resolved,
    coalesce(ms.messages_inbound, 0),
    coalesce(ms.messages_outbound, 0),
    coalesce(ms.messages_ai, 0),
    null::numeric as avg_first_response_minutes
  from public.profiles p
  left join tenant_chats tc on tc.assignee_id = p.id
  left join msg_stats ms on ms.assignee_id = p.id
  where p.tenant_id = public.current_tenant_id()
    and p.role in ('atendimento', 'operacao', 'admin', 'financeiro')
    and (p_assignee_id is null or p.id = p_assignee_id)
  group by p.id, p.nome, ms.messages_inbound, ms.messages_outbound, ms.messages_ai
  order by chats_resolved desc, messages_outbound desc;
$$;

grant execute on function public.report_attendance_summary(timestamptz, timestamptz, uuid) to authenticated;

-- Funnel conversion report
create or replace function public.report_funnel_conversion(
  p_funnel_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  stage_id text,
  total_cards bigint,
  moved_in bigint,
  sold_count bigint,
  lost_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.stage_id,
    count(*)::bigint as total_cards,
    count(*) filter (where n.updated_at >= p_from and n.updated_at <= p_to)::bigint as moved_in,
    count(*) filter (where n.status = 'vendido')::bigint as sold_count,
    count(*) filter (where n.status = 'perdido')::bigint as lost_count
  from public.crm_negotiations n
  where n.tenant_id = public.current_tenant_id()
    and n.funnel_id = p_funnel_id
    and n.created_at <= p_to
  group by n.stage_id
  order by n.stage_id;
$$;

grant execute on function public.report_funnel_conversion(text, timestamptz, timestamptz) to authenticated;

-- Sales performance vs goals
create or replace function public.report_seller_sales(
  p_year integer,
  p_month integer
)
returns table(
  seller_id uuid,
  seller_name text,
  sales_count bigint,
  sales_total numeric,
  goal_amount numeric,
  goal_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id as seller_id,
    s.name as seller_name,
    count(sa.id)::bigint as sales_count,
    coalesce(sum(sale_totals.sale_amount), 0) as sales_total,
    coalesce(g.goal_amount, 0) as goal_amount,
    case
      when coalesce(g.goal_amount, 0) > 0
      then round((coalesce(sum(sale_totals.sale_amount), 0) / g.goal_amount) * 100, 2)
      else null
    end as goal_pct
  from public.trendii_sellers s
  left join public.sales sa
    on sa.seller_id = s.id
    and sa.tenant_id = s.tenant_id
    and extract(year from sa.sold_at) = p_year
    and extract(month from sa.sold_at) = p_month
  left join lateral (
    select coalesce(sum(si.quantity * si.unit_price), 0) as sale_amount
    from public.sale_items si
    where si.sale_id = sa.id
      and si.tenant_id = sa.tenant_id
  ) sale_totals on sa.id is not null
  left join public.trendii_seller_goals g
    on g.seller_id = s.id
    and g.tenant_id = s.tenant_id
    and g.year = p_year
    and g.month = p_month
    and g.week_number is null
  where s.tenant_id = public.current_tenant_id()
    and s.active = true
  group by s.id, s.name, g.goal_amount
  order by sales_total desc;
$$;

grant execute on function public.report_seller_sales(integer, integer) to authenticated;

-- Export attendance CSV rows
create or replace function public.export_attendance_report(
  p_from timestamptz,
  p_to timestamptz
)
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(r)
  from public.report_attendance_summary(p_from, p_to, null) r;
$$;

grant execute on function public.export_attendance_report(timestamptz, timestamptz) to authenticated;
