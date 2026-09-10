-- Security hardening de RLS (auditoria de segurança).
-- Corrige: escalonamento de privilégio via role_permissions, escrita
-- cross-tenant em crm_task_templates e product_custom_field_values.

-- =========================================================================
-- #1 [CRÍTICO] Só admin pode alterar a matriz de permissões (role_permissions).
--
-- A policy tenant_settings_update libera o UPDATE para quem tem
-- configuracoes:edit — o que inclui 'operacao' por padrão
-- (default_role_permission('operacao','configuracoes','edit') = true).
-- Como role_permissions é coluna da própria tenant_settings, o gate é
-- auto-referente: um 'operacao' chamando o Supabase direto conseguia
-- reescrever a matriz e se promover a admin-equivalente dentro do tenant.
--
-- Travamos a COLUNA via trigger (preserva a edição dos demais campos de
-- tenant_settings por configuracoes:edit), em vez de endurecer a policy
-- inteira para admin.
-- =========================================================================
create or replace function public.guard_role_permissions_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.role_permissions is not null
       and new.role_permissions <> '{}'::jsonb
       and coalesce(public.current_user_role(), 'atendimento') <> 'admin' then
      raise exception 'Only admin can set role_permissions'
        using errcode = '42501';
    end if;
  else
    if new.role_permissions is distinct from old.role_permissions
       and coalesce(public.current_user_role(), 'atendimento') <> 'admin' then
      raise exception 'Only admin can change role_permissions'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_role_permissions_admin_only on public.tenant_settings;
create trigger guard_role_permissions_admin_only
  before insert or update on public.tenant_settings
  for each row
  execute function public.guard_role_permissions_admin_only();

-- =========================================================================
-- #2 crm_task_templates_update sem WITH CHECK permitia mover a linha para
-- outro tenant (a USING valida só a pré-imagem). Espelhamos USING no CHECK.
-- =========================================================================
drop policy if exists "crm_task_templates_update" on public.crm_task_templates;
create policy "crm_task_templates_update"
on public.crm_task_templates for update
using (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao', 'financeiro')
)
with check (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao', 'financeiro')
);

-- =========================================================================
-- #5 product_custom_field_values_update tinha with check (true): a USING
-- valida o registro atual via join em products, mas o CHECK aberto permitia
-- repontar product_id/field_id para itens de OUTRO tenant. Espelhamos o
-- mesmo exists(...) usado no INSERT.
-- =========================================================================
drop policy if exists "product_custom_field_values_update" on public.product_custom_field_values;
create policy "product_custom_field_values_update"
on public.product_custom_field_values for update
using (
  exists (
    select 1 from public.products p
    where p.id = product_id
      and public.is_same_tenant(p.tenant_id)
      and public.has_role_permission(p.tenant_id, 'produtos', 'edit')
  )
)
with check (
  exists (
    select 1 from public.products p
    where p.id = product_id
      and public.is_same_tenant(p.tenant_id)
      and public.has_role_permission(p.tenant_id, 'produtos', 'edit')
  )
  and exists (
    select 1 from public.product_custom_fields f
    where f.id = field_id
      and public.is_same_tenant(f.tenant_id)
  )
);
