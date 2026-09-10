-- Atendentes com permissão de editar o Inbox podem atualizar cadastro do cliente
-- vinculado à conversa (nome/e-mail no perfil lateral), respeitando vínculo CRM.

create or replace function public.can_atendimento_update_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      public.has_role_permission(public.current_tenant_id(), 'clientes', 'edit')
      or public.has_role_permission(public.current_tenant_id(), 'inbox', 'edit')
    )
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

grant execute on function public.can_atendimento_update_customer(uuid) to authenticated;
