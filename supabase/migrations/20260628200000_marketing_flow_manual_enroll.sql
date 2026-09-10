-- Fase 5: gatilho manual de fluxos de marketing.
-- enroll_customers_in_flow_manual(): matricula uma lista de clientes num fluxo
-- ativo, ignorando o trigger.type (uso da UI "Adicionar leads manualmente").
-- Reaproveita add_to_marketing_flow (service_role only) — chamavel aqui porque
-- esta funcao e SECURITY DEFINER (roda como owner). Antes valida tenant +
-- permissao marketing.edit, espelhando as demais RPCs de gestao.
-- Retorna jsonb { enrolled, skipped } (skipped = dedupe/allowReentry barrou).

create or replace function public.enroll_customers_in_flow_manual(
  p_flow_id uuid,
  p_customer_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow record;
  v_customer_id uuid;
  v_participant_id uuid;
  v_enrolled integer := 0;
  v_skipped integer := 0;
begin
  select tenant_id, status into v_flow
  from public.marketing_flows where id = p_flow_id;
  if v_flow.tenant_id is null then
    raise exception 'Fluxo % nao encontrado', p_flow_id;
  end if;

  -- Checagem de tenant + permissao (espelha a RLS das tabelas de fluxo).
  if not public.is_same_tenant(v_flow.tenant_id) then
    raise exception 'Acesso negado ao fluxo %', p_flow_id;
  end if;
  if not public.has_role_permission(v_flow.tenant_id, 'marketing', 'edit') then
    raise exception 'Permissao marketing.edit necessaria';
  end if;

  if v_flow.status <> 'ativo' then
    raise exception 'Fluxo precisa estar ativo para matricular leads (status=%)', v_flow.status;
  end if;

  if p_customer_ids is null or array_length(p_customer_ids, 1) is null then
    return jsonb_build_object('enrolled', 0, 'skipped', 0);
  end if;

  foreach v_customer_id in array p_customer_ids loop
    -- So matricula clientes do mesmo tenant (defesa contra ids forjados).
    if not exists (
      select 1 from public.customers
      where id = v_customer_id and tenant_id = v_flow.tenant_id
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_participant_id := public.add_to_marketing_flow(
      p_flow_id, v_customer_id, null, '{"trigger_type": "manual"}'::jsonb
    );
    if v_participant_id is null then
      v_skipped := v_skipped + 1;
    else
      v_enrolled := v_enrolled + 1;
    end if;
  end loop;

  return jsonb_build_object('enrolled', v_enrolled, 'skipped', v_skipped);
end;
$$;

revoke all on function public.enroll_customers_in_flow_manual(uuid, uuid[]) from public;
grant execute on function public.enroll_customers_in_flow_manual(uuid, uuid[]) to authenticated;
