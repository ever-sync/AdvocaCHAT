-- Disposable local database only, after migrations. All fixtures/grants roll back.
begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

select pg_temp.assert_true(not has_table_privilege('anon', 'public.crm_negotiation_documents', 'INSERT'), 'anon document insert revoked');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.crm_document_templates', 'SELECT'), 'anon template read revoked');
select pg_temp.assert_true(has_table_privilege('authenticated', 'public.crm_negotiation_documents', 'INSERT,SELECT'), 'internal document grants preserved');
select pg_temp.assert_true(has_table_privilege('authenticated', 'public.crm_document_templates', 'INSERT,SELECT'), 'internal template grants preserved');
select pg_temp.assert_true(has_table_privilege('service_role', 'public.crm_negotiation_documents', 'INSERT,SELECT'), 'service document grants preserved');

set local session_replication_role = replica;
insert into public.billing_plans (id, name) values ('sistema', 'Regression plan') on conflict (id) do nothing;
insert into public.tenants (id, nome) values
  ('d1000000-0000-4000-8000-000000000001', 'Legacy retirement A'),
  ('d1000000-0000-4000-8000-000000000002', 'Legacy retirement B');
insert into public.billing_subscriptions (tenant_id, plan_id, status, billing_period, current_period_start, current_period_end) values
  ('d1000000-0000-4000-8000-000000000001', 'sistema', 'active', 'monthly', now(), now() + interval '1 month');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('d2000000-0000-4000-8000-000000000001', 'legacy-admin@example.invalid', now(), '{}');
insert into public.profiles (id, tenant_id, email, nome, role, status) values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'legacy-admin@example.invalid', 'Legacy admin', 'admin', 'active');
insert into public.crm_negotiations (id, tenant_id, title, funnel_id, stage_id) values
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Existing A', 'd4000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001'),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'Existing B', 'd4000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000002');
insert into public.crm_document_templates (id, tenant_id, category, name, content) values
  ('d6000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'contrato', 'Internal A', 'Existing content'),
  ('d6000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'contrato', 'Internal B', 'Other tenant content');
insert into public.crm_negotiation_documents (id, tenant_id, negotiation_id, display_name, storage_path, file_name) values
  ('d7000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'Saved original', 'd1000000-0000-4000-8000-000000000001/d3000000-0000-4000-8000-000000000001/original.html', 'original.html');
insert into storage.buckets (id, name, public) values ('crm-lead-documents', 'crm-lead-documents', false) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name, metadata) values
  ('crm-lead-documents', 'd1000000-0000-4000-8000-000000000001/d3000000-0000-4000-8000-000000000001/original.html', '{"size":0}');
set local session_replication_role = origin;

-- Even a future accidental grant/permissive policy cannot reopen anonymous access.
grant select, insert on public.crm_document_templates, public.crm_negotiation_documents, storage.objects to anon;
create policy regression_permissive_templates on public.crm_document_templates to anon using (true) with check (true);
create policy regression_permissive_documents on public.crm_negotiation_documents to anon using (true) with check (true);
create policy regression_permissive_storage on storage.objects to anon using (true) with check (true);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.assert_true((select count(*)=0 from public.crm_document_templates), 'anon sees no templates despite permissive policy');
select pg_temp.assert_true((select count(*)=0 from public.crm_negotiation_documents), 'anon sees no saved documents despite permissive policy');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='crm-lead-documents'), 'anon sees no legacy storage objects');
do $$ begin
  begin
    insert into public.crm_negotiation_documents (tenant_id, negotiation_id, display_name, storage_path, file_name) values
      ('d1000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'Forged', 'forged.html', 'forged.html');
    raise exception 'ASSERTION FAILED: anonymous forged document accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('crm-lead-documents', 'd1000000-0000-4000-8000-000000000001/d3000000-0000-4000-8000-000000000001/forged.html', '{"size":0}');
    raise exception 'ASSERTION FAILED: anonymous storage upload accepted';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*)=1 from public.crm_document_templates), 'internal template read remains tenant scoped');
select pg_temp.assert_true((select content='Existing content' from public.crm_document_templates where id='d6000000-0000-4000-8000-000000000001'), 'existing template content preserved');
select pg_temp.assert_true((select count(*)=1 from public.crm_negotiation_documents), 'saved original remains readable internally');
insert into public.crm_negotiation_documents (tenant_id, negotiation_id, display_name, storage_path, file_name) values
  ('d1000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'Internal new', 'internal.txt', 'internal.txt');
select pg_temp.assert_true((select count(*)=2 from public.crm_negotiation_documents), 'internal document creation preserved');
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='crm-lead-documents'), 'saved storage object remains readable internally');
reset role;

rollback;
select 'legacy_public_document_retirement_regression: PASS' as result;
