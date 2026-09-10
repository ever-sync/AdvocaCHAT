-- Onda C: CRM visibility by assignee, stage required fields, helpers

create or replace function public.can_access_crm_negotiation(p_assignee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() in ('admin', 'operacao', 'financeiro')
    or p_assignee_id is null
    or p_assignee_id = auth.uid();
$$;

grant execute on function public.can_access_crm_negotiation(uuid) to authenticated;

-- CRM negotiations: restrict atendimento to own + unassigned pool
drop policy if exists "crm_negotiations_same_tenant_select" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_select"
on public.crm_negotiations for select
using (
  public.is_same_tenant(tenant_id)
  and public.can_access_crm_negotiation(assignee_id)
);

drop policy if exists "crm_negotiations_same_tenant_update" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_update"
on public.crm_negotiations for update
using (
  public.is_same_tenant(tenant_id)
  and public.can_access_crm_negotiation(assignee_id)
)
with check (
  public.is_same_tenant(tenant_id)
  and public.can_access_crm_negotiation(assignee_id)
);

-- Tasks: visible when linked negotiation is visible (or no negotiation)
drop policy if exists "crm_tasks_same_tenant_select" on public.crm_tasks;
create policy "crm_tasks_same_tenant_select"
on public.crm_tasks for select
using (
  public.is_same_tenant(tenant_id)
  and (
    negotiation_id is null
    or exists (
      select 1 from public.crm_negotiations n
      where n.id = crm_tasks.negotiation_id
        and public.can_access_crm_negotiation(n.assignee_id)
    )
  )
);

drop policy if exists "crm_tasks_same_tenant_update" on public.crm_tasks;
create policy "crm_tasks_same_tenant_update"
on public.crm_tasks for update
using (
  public.is_same_tenant(tenant_id)
  and (
    negotiation_id is null
    or exists (
      select 1 from public.crm_negotiations n
      where n.id = crm_tasks.negotiation_id
        and public.can_access_crm_negotiation(n.assignee_id)
    )
  )
)
with check (public.is_same_tenant(tenant_id));

-- Stage history + activities (read via negotiation)
drop policy if exists "crm_stage_history_same_tenant_select" on public.crm_stage_history;
create policy "crm_stage_history_same_tenant_select"
on public.crm_stage_history for select
using (
  public.is_same_tenant(tenant_id)
  and exists (
    select 1 from public.crm_negotiations n
    where n.id = crm_stage_history.negotiation_id
      and public.can_access_crm_negotiation(n.assignee_id)
  )
);

drop policy if exists "crm_activities_same_tenant_select" on public.crm_activities;
create policy "crm_activities_same_tenant_select"
on public.crm_activities for select
using (
  public.is_same_tenant(tenant_id)
  and (
    negotiation_id is null
    or exists (
      select 1 from public.crm_negotiations n
      where n.id = crm_activities.negotiation_id
        and public.can_access_crm_negotiation(n.assignee_id)
    )
  )
);

-- Required fields per funnel stage (from tenant_crm_funnel_config.funnels JSON)
create or replace function public.crm_stage_required_field_keys(
  p_tenant_id uuid,
  p_funnel_id text,
  p_stage_id text
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_funnels jsonb;
  v_funnel jsonb;
  v_stage jsonb;
  v_fields jsonb;
  v_elem jsonb;
  v_result text[] := array[]::text[];
begin
  select t.funnels into v_funnels
  from public.tenant_crm_funnel_config t
  where t.tenant_id = p_tenant_id;

  if v_funnels is not null and jsonb_typeof(v_funnels) = 'array' then
    for v_funnel in select value from jsonb_array_elements(v_funnels) as t(value)
    loop
      if v_funnel->>'id' = p_funnel_id then
        for v_stage in select value from jsonb_array_elements(v_funnel->'stages') as t(value)
        loop
          if v_stage->>'id' = p_stage_id then
            v_fields := v_stage->'requiredFields';
            if v_fields is not null and jsonb_typeof(v_fields) = 'array' then
              for v_elem in select value from jsonb_array_elements(v_fields) as t(value)
              loop
                v_result := array_append(v_result, trim(both '"' from v_elem::text));
              end loop;
            end if;
            return v_result;
          end if;
        end loop;
      end if;
    end loop;
  end if;

  -- Fallback defaults when tenant has no custom config
  if p_stage_id in ('contrato', 'venda') then
    return array['total_value'];
  end if;

  return v_result;
end;
$$;

create or replace function public.validate_crm_negotiation_stage_requirements()
returns trigger
language plpgsql
as $$
declare
  v_fields text[];
  v_field text;
begin
  if TG_OP = 'INSERT' or NEW.stage_id is distinct from OLD.stage_id then
    v_fields := public.crm_stage_required_field_keys(NEW.tenant_id, NEW.funnel_id, NEW.stage_id);
    foreach v_field in array v_fields
    loop
      if v_field = 'total_value' and coalesce(NEW.total_value, 0) <= 0 then
        raise exception 'Informe o valor do negócio para avançar para esta etapa';
      elsif v_field = 'qualification' and coalesce(NEW.qualification, 0) <= 0 then
        raise exception 'Informe a qualificação (1-5) para avançar para esta etapa';
      elsif v_field = 'closing_forecast' and NEW.closing_forecast is null then
        raise exception 'Informe a previsão de fechamento para avançar para esta etapa';
      elsif v_field = 'next_task_at' and NEW.next_task_at is null then
        raise exception 'Agende a próxima tarefa para avançar para esta etapa';
      end if;
    end loop;
  end if;
  return NEW;
end;
$$;

drop trigger if exists crm_negotiations_stage_requirements on public.crm_negotiations;
create trigger crm_negotiations_stage_requirements
before insert or update of stage_id, funnel_id, total_value, qualification, closing_forecast, next_task_at
on public.crm_negotiations
for each row
execute function public.validate_crm_negotiation_stage_requirements();
