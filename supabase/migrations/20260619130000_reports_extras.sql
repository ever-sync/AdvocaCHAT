-- Relatorios extras:
-- 1) Filtrar report_attendance_summary apenas a quem realmente atendeu no periodo
--    (chats abertos, resolvidos OU mensagens). Admins/financeiro inativos sem trafego sumiram da lista.
-- 2) Nova RPC report_lost_reasons: agrupa motivos de perda por funil/periodo.

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
  ),
  sla_stats as (
    select
      tc.assignee_id,
      round(
        avg(extract(epoch from (tc.first_response_at - tc.first_inbound_at)) / 60.0),
        2
      ) as avg_first_response_minutes
    from tenant_chats tc
    where tc.first_inbound_at is not null
      and tc.first_response_at is not null
      and tc.first_response_at >= p_from
      and tc.first_response_at <= p_to
    group by tc.assignee_id
  ),
  per_profile as (
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
      coalesce(ms.messages_inbound, 0) as messages_inbound,
      coalesce(ms.messages_outbound, 0) as messages_outbound,
      coalesce(ms.messages_ai, 0) as messages_ai,
      ss.avg_first_response_minutes as avg_first_response_minutes
    from public.profiles p
    left join tenant_chats tc on tc.assignee_id = p.id
    left join msg_stats ms on ms.assignee_id = p.id
    left join sla_stats ss on ss.assignee_id = p.id
    where p.tenant_id = public.current_tenant_id()
      and p.role in ('atendimento', 'operacao', 'admin', 'financeiro')
      and (p_assignee_id is null or p.id = p_assignee_id)
    group by p.id, p.nome, ms.messages_inbound, ms.messages_outbound, ms.messages_ai, ss.avg_first_response_minutes
  )
  select
    pp.assignee_id,
    pp.assignee_name,
    pp.chats_opened,
    pp.chats_resolved,
    pp.messages_inbound,
    pp.messages_outbound,
    pp.messages_ai,
    pp.avg_first_response_minutes
  from per_profile pp
  where
    -- mantem sempre o usuario filtrado explicitamente; caso contrario, exige atividade real
    p_assignee_id is not null
    or pp.chats_opened > 0
    or pp.chats_resolved > 0
    or pp.messages_outbound > 0
    or pp.messages_ai > 0
  order by pp.chats_resolved desc, pp.messages_outbound desc;
$$;

grant execute on function public.report_attendance_summary(timestamptz, timestamptz, uuid) to authenticated;

-- Breakdown de motivos de perda
create or replace function public.report_lost_reasons(
  p_funnel_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  reason text,
  count bigint,
  total_value numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(nullif(trim(n.lost_reason), ''), '(sem motivo)') as reason,
    count(*)::bigint as count,
    coalesce(sum(n.total_value), 0)::numeric as total_value
  from public.crm_negotiations n
  where n.tenant_id = public.current_tenant_id()
    and n.funnel_id = p_funnel_id
    and n.status = 'perdido'
    and n.updated_at >= p_from
    and n.updated_at <= p_to
  group by 1
  order by count desc, total_value desc;
$$;

grant execute on function public.report_lost_reasons(text, timestamptz, timestamptz) to authenticated;
