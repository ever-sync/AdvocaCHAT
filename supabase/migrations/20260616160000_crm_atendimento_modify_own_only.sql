-- Atendimento: pode ver leads no pool, mas só altera negócio já atribuído a si (claim via RPC).

create or replace function public.can_modify_crm_negotiation(p_assignee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() in ('admin', 'operacao', 'financeiro')
    or (
      public.current_user_role() = 'atendimento'
      and p_assignee_id is not null
      and p_assignee_id = auth.uid()
    );
$$;

grant execute on function public.can_modify_crm_negotiation(uuid) to authenticated;

drop policy if exists "crm_negotiations_same_tenant_update" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_update"
on public.crm_negotiations for update
using (
  public.is_same_tenant(tenant_id)
  and public.can_modify_crm_negotiation(assignee_id)
)
with check (
  public.is_same_tenant(tenant_id)
  and public.can_modify_crm_negotiation(assignee_id)
);

drop policy if exists "crm_tasks_same_tenant_insert" on public.crm_tasks;
create policy "crm_tasks_same_tenant_insert"
on public.crm_tasks for insert
with check (
  public.is_same_tenant(tenant_id)
  and (
    negotiation_id is null
    or exists (
      select 1 from public.crm_negotiations n
      where n.id = crm_tasks.negotiation_id
        and public.can_modify_crm_negotiation(n.assignee_id)
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
        and public.can_modify_crm_negotiation(n.assignee_id)
    )
  )
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiation_documents_same_tenant_insert" on public.crm_negotiation_documents;
create policy "crm_negotiation_documents_same_tenant_insert"
on public.crm_negotiation_documents for insert
with check (
  public.is_same_tenant(tenant_id)
  and exists (
    select 1 from public.crm_negotiations n
    where n.id = crm_negotiation_documents.negotiation_id
      and public.can_modify_crm_negotiation(n.assignee_id)
  )
);

drop policy if exists "crm_negotiation_documents_same_tenant_delete" on public.crm_negotiation_documents;
create policy "crm_negotiation_documents_same_tenant_delete"
on public.crm_negotiation_documents for delete
using (
  public.is_same_tenant(tenant_id)
  and exists (
    select 1 from public.crm_negotiations n
    where n.id = crm_negotiation_documents.negotiation_id
      and public.can_modify_crm_negotiation(n.assignee_id)
  )
);
