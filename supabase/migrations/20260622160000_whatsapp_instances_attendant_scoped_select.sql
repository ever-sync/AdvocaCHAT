-- Atendimento (vendedor) só enxerga as instâncias às quais está vinculado em
-- whatsapp_instance_attendants. Gestores (admin/operacao/financeiro) mantêm
-- visão completa do tenant. Espelha o gating de chats em
-- 20260620200000_attendant_instance_scoped_visibility.sql.

drop policy if exists "whatsapp_instances_same_tenant_select" on public.whatsapp_instances;
create policy "whatsapp_instances_same_tenant_select"
on public.whatsapp_instances
for select
using (
  public.is_same_tenant(tenant_id)
  and (
    public.current_user_role() != 'atendimento'
    or public.is_instance_attendant(id)
  )
);
