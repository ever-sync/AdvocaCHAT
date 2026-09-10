drop policy if exists "customers_same_tenant_delete" on public.customers;

create policy "customers_same_tenant_delete"
on public.customers
for delete
using (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);
