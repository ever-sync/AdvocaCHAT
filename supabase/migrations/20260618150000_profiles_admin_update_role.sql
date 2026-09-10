-- Allow admins to update other profiles within the same tenant (e.g. change a collaborator's role/status).
-- The existing "profiles_update_own" policy continues to cover users editing their own data.

drop policy if exists "profiles_admin_update_same_tenant" on public.profiles;
create policy "profiles_admin_update_same_tenant"
on public.profiles
for update
using (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() = 'admin'
)
with check (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() = 'admin'
);
