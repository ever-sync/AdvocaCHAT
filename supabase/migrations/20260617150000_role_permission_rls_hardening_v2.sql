-- RLS hardening v2: aplica a matriz de permissões também em tabelas
-- que ainda aceitavam bypass via Supabase direto.

-- Atualiza helpers de negócio para respeitar a matriz de permissões do tenant.
create or replace function public.can_atendimento_act_on_chat(p_assignee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role_permission(public.current_tenant_id(), 'inbox', 'edit')
    and (
      public.current_user_role() in ('admin', 'operacao', 'financeiro')
      or (
        public.current_user_role() = 'atendimento'
        and p_assignee_id is not null
        and p_assignee_id = auth.uid()
      )
    );
$$;

create or replace function public.can_modify_crm_negotiation(p_assignee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role_permission(public.current_tenant_id(), 'crm', 'edit')
    and (
      public.current_user_role() in ('admin', 'operacao', 'financeiro')
      or (
        public.current_user_role() = 'atendimento'
        and p_assignee_id is not null
        and p_assignee_id = auth.uid()
      )
    );
$$;

create or replace function public.can_atendimento_update_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role_permission(public.current_tenant_id(), 'clientes', 'edit')
    and (
      public.current_user_role() in ('admin', 'operacao', 'financeiro')
      or (
        public.current_user_role() = 'atendimento'
        and not exists (
          select 1
          from public.crm_negotiations n
          where n.customer_id = p_customer_id
            and n.tenant_id = public.current_tenant_id()
            and n.status = 'em_andamento'
            and (
              n.assignee_id is null
              or n.assignee_id is distinct from auth.uid()
            )
        )
      )
    );
$$;

-- Customers: leitura e escrita por permissao.
drop policy if exists "customers_same_tenant_select" on public.customers;
create policy "customers_same_tenant_select"
on public.customers
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'clientes', 'view')
);

drop policy if exists "customers_same_tenant_insert" on public.customers;
create policy "customers_same_tenant_insert"
on public.customers
for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'clientes', 'edit')
);

drop policy if exists "customers_same_tenant_update" on public.customers;
create policy "customers_same_tenant_update"
on public.customers
for update
using (
  public.is_same_tenant(tenant_id)
  and public.can_atendimento_update_customer(id)
)
with check (
  public.is_same_tenant(tenant_id)
  and public.can_atendimento_update_customer(id)
);

drop policy if exists "customers_same_tenant_delete" on public.customers;
create policy "customers_same_tenant_delete"
on public.customers
for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'clientes', 'delete')
  and public.can_atendimento_update_customer(id)
);

-- Products: catalogo completo por permissao.
drop policy if exists "products_same_tenant_select" on public.products;
create policy "products_same_tenant_select"
on public.products
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'produtos', 'view')
);

drop policy if exists "products_same_tenant_insert" on public.products;
create policy "products_same_tenant_insert"
on public.products
for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'produtos', 'edit')
);

drop policy if exists "products_same_tenant_update" on public.products;
create policy "products_same_tenant_update"
on public.products
for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'produtos', 'edit')
)
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'produtos', 'edit')
);

drop policy if exists "products_same_tenant_delete" on public.products;
create policy "products_same_tenant_delete"
on public.products
for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'produtos', 'delete')
);

-- Customer custom fields + values: permissao de clientes.
drop policy if exists "customer_custom_fields_same_tenant_select" on public.customer_custom_fields;
create policy "customer_custom_fields_same_tenant_select"
on public.customer_custom_fields
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'clientes', 'view')
);

drop policy if exists "customer_custom_fields_same_tenant_insert" on public.customer_custom_fields;
create policy "customer_custom_fields_same_tenant_insert"
on public.customer_custom_fields
for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'clientes', 'edit')
);

drop policy if exists "customer_custom_fields_same_tenant_update" on public.customer_custom_fields;
create policy "customer_custom_fields_same_tenant_update"
on public.customer_custom_fields
for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'clientes', 'edit')
)
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'clientes', 'edit')
);

drop policy if exists "customer_custom_fields_same_tenant_delete" on public.customer_custom_fields;
create policy "customer_custom_fields_same_tenant_delete"
on public.customer_custom_fields
for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'clientes', 'delete')
);

drop policy if exists "customer_custom_field_values_select" on public.customer_custom_field_values;
create policy "customer_custom_field_values_select"
on public.customer_custom_field_values
for select
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and public.is_same_tenant(c.tenant_id)
      and public.has_role_permission(c.tenant_id, 'clientes', 'view')
  )
  and exists (
    select 1 from public.customer_custom_fields f
    where f.id = field_id
      and public.is_same_tenant(f.tenant_id)
  )
);

drop policy if exists "customer_custom_field_values_insert" on public.customer_custom_field_values;
create policy "customer_custom_field_values_insert"
on public.customer_custom_field_values
for insert
with check (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and public.is_same_tenant(c.tenant_id)
      and public.can_atendimento_update_customer(c.id)
  )
  and exists (
    select 1 from public.customer_custom_fields f
    where f.id = field_id
      and public.is_same_tenant(f.tenant_id)
      and public.has_role_permission(f.tenant_id, 'clientes', 'edit')
  )
);

drop policy if exists "customer_custom_field_values_update" on public.customer_custom_field_values;
create policy "customer_custom_field_values_update"
on public.customer_custom_field_values
for update
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and public.is_same_tenant(c.tenant_id)
      and public.can_atendimento_update_customer(c.id)
  )
  and exists (
    select 1 from public.customer_custom_fields f
    where f.id = field_id
      and public.is_same_tenant(f.tenant_id)
      and public.has_role_permission(f.tenant_id, 'clientes', 'edit')
  )
)
with check (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and public.is_same_tenant(c.tenant_id)
      and public.can_atendimento_update_customer(c.id)
  )
  and exists (
    select 1 from public.customer_custom_fields f
    where f.id = field_id
      and public.is_same_tenant(f.tenant_id)
      and public.has_role_permission(f.tenant_id, 'clientes', 'edit')
  )
);

drop policy if exists "customer_custom_field_values_delete" on public.customer_custom_field_values;
create policy "customer_custom_field_values_delete"
on public.customer_custom_field_values
for delete
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and public.is_same_tenant(c.tenant_id)
      and public.can_atendimento_update_customer(c.id)
  )
  and exists (
    select 1 from public.customer_custom_fields f
    where f.id = field_id
      and public.is_same_tenant(f.tenant_id)
      and public.has_role_permission(f.tenant_id, 'clientes', 'delete')
  )
);

-- Tenant settings / integrations: configuracoes.
drop policy if exists "tenant_settings_select" on public.tenant_settings;
create policy "tenant_settings_select"
on public.tenant_settings
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'view')
);

drop policy if exists "tenant_settings_insert" on public.tenant_settings;
create policy "tenant_settings_insert"
on public.tenant_settings
for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
);

drop policy if exists "tenant_settings_update" on public.tenant_settings;
create policy "tenant_settings_update"
on public.tenant_settings
for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
)
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
);

drop policy if exists "tenant_integrations_select" on public.tenant_integrations;
create policy "tenant_integrations_select"
on public.tenant_integrations
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'view')
);

drop policy if exists "tenant_integrations_insert" on public.tenant_integrations;
create policy "tenant_integrations_insert"
on public.tenant_integrations
for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
);

drop policy if exists "tenant_integrations_update" on public.tenant_integrations;
create policy "tenant_integrations_update"
on public.tenant_integrations
for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
)
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
);

-- CRM negotiations / tasks / documentos.
drop policy if exists "crm_negotiations_same_tenant_select" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_select"
on public.crm_negotiations
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'view')
);

drop policy if exists "crm_negotiations_same_tenant_insert" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_insert"
on public.crm_negotiations
for insert
with check (
  public.is_same_tenant(tenant_id)
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
  public.is_same_tenant(tenant_id)
  and public.can_modify_crm_negotiation(assignee_id)
)
with check (
  public.is_same_tenant(tenant_id)
  and public.can_modify_crm_negotiation(assignee_id)
);

drop policy if exists "crm_negotiations_same_tenant_delete" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_delete"
on public.crm_negotiations
for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'delete')
);

drop policy if exists "crm_tasks_same_tenant_select" on public.crm_tasks;
create policy "crm_tasks_same_tenant_select"
on public.crm_tasks
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'view')
);

drop policy if exists "crm_tasks_same_tenant_insert" on public.crm_tasks;
create policy "crm_tasks_same_tenant_insert"
on public.crm_tasks
for insert
with check (
  public.is_same_tenant(tenant_id)
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
  public.is_same_tenant(tenant_id)
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
  public.is_same_tenant(tenant_id)
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

drop policy if exists "crm_tasks_same_tenant_delete" on public.crm_tasks;
create policy "crm_tasks_same_tenant_delete"
on public.crm_tasks
for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'delete')
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

drop policy if exists "crm_negotiation_documents_same_tenant_select" on public.crm_negotiation_documents;
create policy "crm_negotiation_documents_same_tenant_select"
on public.crm_negotiation_documents
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'view')
);

drop policy if exists "crm_negotiation_documents_same_tenant_insert" on public.crm_negotiation_documents;
create policy "crm_negotiation_documents_same_tenant_insert"
on public.crm_negotiation_documents
for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'edit')
  and exists (
    select 1
    from public.crm_negotiations n
    where n.id = crm_negotiation_documents.negotiation_id
      and public.can_modify_crm_negotiation(n.assignee_id)
  )
);

drop policy if exists "crm_negotiation_documents_same_tenant_delete" on public.crm_negotiation_documents;
create policy "crm_negotiation_documents_same_tenant_delete"
on public.crm_negotiation_documents
for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'delete')
  and exists (
    select 1
    from public.crm_negotiations n
    where n.id = crm_negotiation_documents.negotiation_id
      and public.can_modify_crm_negotiation(n.assignee_id)
  )
);
