-- Auto-rotation de leads do CRM no pool: distribui N negociações abertas sem
-- responsável entre atendentes disponíveis, escolhendo round-robin pela MENOR
-- carga de NEGOCIAÇÕES ABERTAS (independente de chats do Inbox).
--
-- Diferente de `pick_queue_assignee` que pesa chats abertos do Inbox, este
-- equilibra **carga de CRM** — mais relevante pro vendedor que toca pipeline.
--
-- Filtros aplicados ao escolher um atendente:
--   - tenant_id = current_tenant_id
--   - role = 'atendimento'
--   - status = 'active'
--   - availability = 'available' (respeita modo busy/offline)
--   - se houver chat_queue_attendants enabled no tenant, restringe a esse pool
--   - opcional: respeita queue_max_open_chats_per_attendant / cqa.max_open_chats
--     (usando NEGOCIAÇÕES abertas em vez de chats — semântica adaptada).

create or replace function public.pick_crm_assignee(p_tenant_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_max_global integer;
  v_has_pool boolean;
begin
  select queue_max_open_chats_per_attendant
    into v_max_global
  from public.tenant_settings
  where tenant_id = p_tenant_id;

  select exists (
    select 1 from public.chat_queue_attendants cqa
    where cqa.tenant_id = p_tenant_id and cqa.enabled = true
  ) into v_has_pool;

  return (
    select p.id
    from public.profiles p
    left join public.chat_queue_attendants cqa
      on cqa.tenant_id = p_tenant_id
      and cqa.profile_id = p.id
    left join public.crm_negotiations n
      on n.assignee_id = p.id
      and n.tenant_id = p_tenant_id
      and n.status in ('em_andamento', 'pausado', 'nao_pausado')
    where p.tenant_id = p_tenant_id
      and p.role = 'atendimento'
      and p.status = 'active'
      and p.availability = 'available'
      and (not v_has_pool or cqa.enabled = true)
    group by p.id, p.created_at, cqa.max_open_chats
    having count(n.id) < coalesce(cqa.max_open_chats, v_max_global, 2147483647)
    order by count(n.id) asc, p.created_at asc
    limit 1
  );
end;
$$;

grant execute on function public.pick_crm_assignee(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Distribui em lote as negociações do pool. Limita por p_limit (default 50)
-- pra não bloquear. Filtro opcional por funil. Retorna métricas pra UI.
-- ---------------------------------------------------------------------------
create or replace function public.auto_assign_pool_negotiations(
  p_limit integer default 50,
  p_funnel_id text default null
)
returns table(
  assigned_count integer,
  skipped_no_attendant integer,
  total_pool integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_role text;
  v_actor uuid;
  v_assigned integer := 0;
  v_skipped integer := 0;
  v_total integer := 0;
  rec record;
  v_pick uuid;
begin
  v_tenant := public.current_tenant_id();
  v_actor := auth.uid();
  if v_tenant is null then
    raise exception 'tenant context required';
  end if;
  -- Gate: apenas gestores podem disparar a distribuição em lote.
  select coalesce(role::text, '') into v_role
  from public.profiles where id = v_actor;
  if v_role not in ('admin', 'operacao', 'financeiro') then
    raise exception 'forbidden: only managers can auto-assign the pool';
  end if;

  -- Contagem total do pool no escopo (mesmo critério das demais views).
  select count(*) into v_total
  from public.crm_negotiations n
  where n.tenant_id = v_tenant
    and n.assignee_id is null
    and n.status in ('em_andamento', 'pausado', 'nao_pausado')
    and (p_funnel_id is null or n.funnel_id = p_funnel_id);

  for rec in
    select n.id, n.title, n.customer_id, n.source_chat_id, n.funnel_id, n.stage_id
    from public.crm_negotiations n
    where n.tenant_id = v_tenant
      and n.assignee_id is null
      and n.status in ('em_andamento', 'pausado', 'nao_pausado')
      and (p_funnel_id is null or n.funnel_id = p_funnel_id)
    order by n.created_at asc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  loop
    v_pick := public.pick_crm_assignee(v_tenant);
    if v_pick is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    update public.crm_negotiations
       set assignee_id = v_pick
     where id = rec.id;
    -- O trigger genérico de audit_logs em crm_negotiations já registra a
    -- mudança de assignee_id (pool→atendente) com actor_id = auth.uid(),
    -- e o trigger de webhooks emite `deal.assignee_changed` automaticamente.

    v_assigned := v_assigned + 1;
  end loop;

  assigned_count := v_assigned;
  skipped_no_attendant := v_skipped;
  total_pool := v_total;
  return next;
end;
$$;

grant execute on function public.auto_assign_pool_negotiations(integer, text) to authenticated;
