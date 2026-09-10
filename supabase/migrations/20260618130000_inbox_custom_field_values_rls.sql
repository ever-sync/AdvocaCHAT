-- Campos personalizados no perfil do Inbox: mesma regra de permissão que nome/e-mail.

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
      and (
        public.has_role_permission(f.tenant_id, 'clientes', 'edit')
        or public.has_role_permission(f.tenant_id, 'inbox', 'edit')
      )
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
      and (
        public.has_role_permission(f.tenant_id, 'clientes', 'edit')
        or public.has_role_permission(f.tenant_id, 'inbox', 'edit')
      )
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
      and (
        public.has_role_permission(f.tenant_id, 'clientes', 'edit')
        or public.has_role_permission(f.tenant_id, 'inbox', 'edit')
      )
  )
);
