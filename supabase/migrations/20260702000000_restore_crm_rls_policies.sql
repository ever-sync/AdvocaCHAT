-- Restaura as regras de segurança completas (can_access_crm_negotiation, etc)
-- mantendo a performance do InitPlan (tenant_id = (select public.current_tenant_id()))
-- que foi introduzida no script 20260701170000_rls_initplan_hot_tables.sql.

-- crm_negotiations
drop policy if exists "crm_negotiations_same_tenant_select" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_select"
on public.crm_negotiations
for select
using (
  tenant_id = (select public.current_tenant_id())
  and public.can_access_crm_negotiation(assignee_id)
);

drop policy if exists "crm_negotiations_same_tenant_insert" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_insert"
on public.crm_negotiations
for insert
with check (
  tenant_id = (select public.current_tenant_id())
  and public.has_role_permission(tenant_id, 'crm', 'edit')
  and (
    public.current_user_role() in ('admin', 'operacao', 'financeiro')
    or (
      public.current_user_role() = 'atendimento'
      and assignee_id = auth.uid()
    )
  )
);

drop policy if exists "crm_negotiations_same_tenant_update" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_update"
on public.crm_negotiations
for update
using (
  tenant_id = (select public.current_tenant_id())
  and public.can_modify_crm_negotiation(assignee_id)
)
with check (
  tenant_id = (select public.current_tenant_id())
  and public.can_modify_crm_negotiation(assignee_id)
);

drop policy if exists "crm_negotiations_same_tenant_delete" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_delete"
on public.crm_negotiations
for delete
using (
  tenant_id = (select public.current_tenant_id())
  and public.has_role_permission(tenant_id, 'crm', 'delete')
);

-- crm_tasks
drop policy if exists "crm_tasks_same_tenant_select" on public.crm_tasks;
create policy "crm_tasks_same_tenant_select"
on public.crm_tasks
for select
using (
  tenant_id = (select public.current_tenant_id())
  and public.has_role_permission(tenant_id, 'crm', 'view')
  and (
    negotiation_id is null
    or exists (
      select 1
      from public.crm_negotiations n
      where n.id = crm_tasks.negotiation_id
        and public.can_access_crm_negotiation(n.assignee_id)
    )
  )
);

drop policy if exists "crm_tasks_same_tenant_insert" on public.crm_tasks;
create policy "crm_tasks_same_tenant_insert"
on public.crm_tasks
for insert
with check (
  tenant_id = (select public.current_tenant_id())
  and public.has_role_permission(tenant_id, 'crm', 'edit')
  and (
    negotiation_id is null
    or exists (
      select 1
      from public.crm_negotiations n
      where n.id = crm_tasks.negotiation_id
        and public.can_modify_crm_negotiation(n.assignee_id)
    )
  )
);

drop policy if exists "crm_tasks_same_tenant_update" on public.crm_tasks;
create policy "crm_tasks_same_tenant_update"
on public.crm_tasks
for update
using (
  tenant_id = (select public.current_tenant_id())
  and public.has_role_permission(tenant_id, 'crm', 'edit')
  and (
    negotiation_id is null
    or exists (
      select 1
      from public.crm_negotiations n
      where n.id = crm_tasks.negotiation_id
        and public.can_modify_crm_negotiation(n.assignee_id)
    )
  )
)
with check (
  tenant_id = (select public.current_tenant_id())
  and public.has_role_permission(tenant_id, 'crm', 'edit')
  and (
    negotiation_id is null
    or exists (
      select 1
      from public.crm_negotiations n
      where n.id = crm_tasks.negotiation_id
        and public.can_modify_crm_negotiation(n.assignee_id)
    )
  )
);


-- Criação de um índice composto para otimizar as consultas do Kanban (agora paginadas)
create index if not exists crm_negotiations_query_idx
on public.crm_negotiations (tenant_id, funnel_id, updated_at desc);
