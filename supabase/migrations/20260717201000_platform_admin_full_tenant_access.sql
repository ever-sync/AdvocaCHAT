-- O SUPERADMIN tem permissao total dentro da empresa selecionada.
-- O isolamento continua ativo: target_tenant_id precisa ser o tenant atual.

update public.profiles p
set role = 'admin'
where exists (
  select 1
  from public.platform_admins pa
  where pa.user_id = p.id
)
and p.role is distinct from 'admin';

create or replace function public.has_role_permission(
  target_tenant_id uuid,
  p_function_key text,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_name text := coalesce(public.current_user_role(), 'atendimento');
  stored_value text;
begin
  if exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  ) then
    return target_tenant_id is not null
      and target_tenant_id = public.current_tenant_id();
  end if;

  select case lower(coalesce(p_action, ''))
    when 'view' then role_permissions -> role_name -> p_function_key ->> 'view'
    when 'edit' then role_permissions -> role_name -> p_function_key ->> 'edit'
    when 'delete' then role_permissions -> role_name -> p_function_key ->> 'delete'
    else null
  end
    into stored_value
  from public.tenant_settings
  where tenant_id = target_tenant_id
  limit 1;

  if stored_value is not null then
    return stored_value::boolean;
  end if;

  return public.default_role_permission(role_name, p_function_key, p_action);
end;
$$;

select pg_notify('pgrst', 'reload schema');
