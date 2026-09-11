-- Run only on a disposable/local database after all migrations, as postgres:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/profile_trust_boundary_regression.sql
-- Self-contained fixtures; no email/provider calls; all rows are rolled back.
begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

-- Avoid unrelated CRM/billing triggers only while constructing the baseline.
set local session_replication_role = replica;
insert into public.billing_plans (id, name) values ('sistema', 'Trust test plan')
on conflict (id) do nothing;
insert into public.tenants (id, nome) values
  ('b1000000-0000-4000-8000-000000000001', 'Trust boundary A'),
  ('b1000000-0000-4000-8000-000000000002', 'Trust boundary B');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('b2000000-0000-4000-8000-000000000001', 'trust-admin-a@example.invalid', now(), '{}'),
  ('b2000000-0000-4000-8000-000000000002', 'trust-member-a@example.invalid', now(), '{}'),
  ('b2000000-0000-4000-8000-000000000003', 'trust-inactive-a@example.invalid', now(), '{}'),
  ('b2000000-0000-4000-8000-000000000004', 'trust-admin-b@example.invalid', now(), '{}');
insert into public.profiles (id, tenant_id, email, nome, role, status) values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'trust-admin-a@example.invalid', 'Admin A', 'admin', 'active'),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'trust-member-a@example.invalid', 'Member A', 'operacao', 'active'),
  ('b2000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'trust-inactive-a@example.invalid', 'Inactive A', 'operacao', 'inactive'),
  ('b2000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000002', 'trust-admin-b@example.invalid', 'Admin B', 'admin', 'active');
insert into public.billing_subscriptions
  (tenant_id, plan_id, status, billing_period, current_period_start, current_period_end)
values
  ('b1000000-0000-4000-8000-000000000001', 'sistema', 'active', 'monthly', now(), now() + interval '1 month'),
  ('b1000000-0000-4000-8000-000000000002', 'sistema', 'active', 'monthly', now(), now() + interval '1 month');
insert into public.collaborator_invites (id, tenant_id, email, nome, role, status, invited_by) values
  ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'trust-invited@example.invalid', 'Invited', 'atendimento', 'pending', 'b2000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'trust-revoked@example.invalid', 'Revoked', 'admin', 'revoked', 'b2000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'trust-admin-revoke@example.invalid', 'Revoke test', 'operacao', 'pending', 'b2000000-0000-4000-8000-000000000001');
set local session_replication_role = origin;

select pg_temp.assert_true(not has_function_privilege('anon', 'public.ensure_user_profile(uuid,text,jsonb)', 'EXECUTE'), 'anon cannot bootstrap arbitrary profiles');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.ensure_user_profile(uuid,text,jsonb)', 'EXECUTE'), 'authenticated cannot bootstrap arbitrary profiles');
select pg_temp.assert_true(has_function_privilege('service_role', 'public.ensure_user_profile(uuid,text,jsonb)', 'EXECUTE'), 'service role preserves bootstrap');

-- Execute real auth insert triggers: untrusted tenant/role/plan never cross the
-- workspace boundary; a pending authorized invite supplies the role instead.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('b2000000-0000-4000-8000-000000000005', 'trust-malicious@example.invalid', now(), '{"tenant_id":"b1000000-0000-4000-8000-000000000002","role":"admin","plano":"enterprise","status":"active","nome":"Own workspace"}'),
  ('b2000000-0000-4000-8000-000000000006', 'trust-invited@example.invalid', now(), '{"tenant_id":"b1000000-0000-4000-8000-000000000002","role":"admin","plano":"enterprise"}'),
  ('b2000000-0000-4000-8000-000000000007', 'trust-revoked@example.invalid', now(), '{"tenant_id":"not-even-a-uuid","role":"admin"}');

select pg_temp.assert_true((select tenant_id not in ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002') and role = 'admin' and plano = 'sistema' from public.profiles where id='b2000000-0000-4000-8000-000000000005'), 'standalone signup only owns fresh tenant');
select pg_temp.assert_true((select tenant_id = 'b1000000-0000-4000-8000-000000000001' and role = 'atendimento' from public.profiles where id='b2000000-0000-4000-8000-000000000006'), 'valid invite supplies its tenant and role');
select pg_temp.assert_true((select auth_user_id = 'b2000000-0000-4000-8000-000000000006' from public.collaborator_invites where id='b3000000-0000-4000-8000-000000000001'), 'invite bound to auth identity');
select pg_temp.assert_true((select tenant_id not in ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002') from public.profiles where id='b2000000-0000-4000-8000-000000000007'), 'revoked invite cannot join tenant');

-- A trusted repeated bootstrap still cannot interpret metadata as authority.
select public.ensure_user_profile('b2000000-0000-4000-8000-000000000003', 'trust-inactive-a@example.invalid', '{"tenant_id":"b1000000-0000-4000-8000-000000000002","role":"admin","status":"active","plano":"enterprise"}');
select pg_temp.assert_true((select tenant_id = 'b1000000-0000-4000-8000-000000000001' and role = 'operacao' and status = 'inactive' from public.profiles where id='b2000000-0000-4000-8000-000000000003'), 'metadata cannot move promote or reactivate existing user');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated","email":"trust-member-a@example.invalid"}', true);
update public.profiles set nome = 'Safe edit', empresa = 'Cosmetic company', call_phone = '+5511999990000'
where id = 'b2000000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select nome = 'Safe edit' from public.profiles where id='b2000000-0000-4000-8000-000000000002'), 'own cosmetic profile edit works');
do $$ begin
  begin
    update public.profiles set role='admin' where id='b2000000-0000-4000-8000-000000000002';
    raise exception 'ASSERTION FAILED: self promotion accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set tenant_id='b1000000-0000-4000-8000-000000000002' where id='b2000000-0000-4000-8000-000000000002';
    raise exception 'ASSERTION FAILED: tenant transfer accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set email='trust-admin-b@example.invalid' where id='b2000000-0000-4000-8000-000000000002';
    raise exception 'ASSERTION FAILED: profile email spoofing accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.ensure_user_profile('b2000000-0000-4000-8000-000000000002', 'trust-member-a@example.invalid', '{"role":"admin"}');
    raise exception 'ASSERTION FAILED: direct bootstrap accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.collaborator_invites (tenant_id,email,nome,role,invited_by) values ('b1000000-0000-4000-8000-000000000001','forged@example.invalid','Forged','admin','b2000000-0000-4000-8000-000000000001');
    raise exception 'ASSERTION FAILED: forged invite accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.clear_collaborator_invite_after_accept('b2000000-0000-4000-8000-000000000006', 'trust-invited@example.invalid', 'b1000000-0000-4000-8000-000000000001');
    raise exception 'ASSERTION FAILED: clearing another users invite accepted';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims', '{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated","email":"trust-inactive-a@example.invalid"}', true);
do $$ begin
  begin
    update public.profiles set status='active' where id='b2000000-0000-4000-8000-000000000003';
    raise exception 'ASSERTION FAILED: inactive self reactivation accepted';
  exception when insufficient_privilege then null; end;
end $$;

-- Legitimate direct tenant admin paths remain compatible, without a tenant move.
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated","email":"trust-admin-a@example.invalid"}', true);
update public.profiles set role='financeiro' where id='b2000000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select role='financeiro' from public.profiles where id='b2000000-0000-4000-8000-000000000002'), 'real tenant admin changes collaborator role');
update public.collaborator_invites set status='revoked' where id='b3000000-0000-4000-8000-000000000003';
select pg_temp.assert_true((select status='revoked' from public.collaborator_invites where id='b3000000-0000-4000-8000-000000000003'), 'real tenant admin can revoke invitation');
do $$ begin
  begin
    update public.collaborator_invites set role='admin' where id='b3000000-0000-4000-8000-000000000003';
    raise exception 'ASSERTION FAILED: browser rewrote invite role';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set tenant_id='b1000000-0000-4000-8000-000000000002' where id='b2000000-0000-4000-8000-000000000002';
    raise exception 'ASSERTION FAILED: admin moved collaborator to another tenant';
  exception when insufficient_privilege then null; end;
end $$;
update public.profiles set role='operacao' where id='b2000000-0000-4000-8000-000000000004';

-- Current AtivarAcesso contract: safe name + no-op active, then own clear RPC.
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-4000-8000-000000000006","role":"authenticated","email":"trust-invited@example.invalid"}', true);
update public.profiles set nome='Activated invite', status='active' where id='b2000000-0000-4000-8000-000000000006';
select public.clear_collaborator_invite_after_accept(
  target_user_id => 'b2000000-0000-4000-8000-000000000006',
  target_email => 'trust-invited@example.invalid',
  target_tenant_id => 'b1000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.assert_true(not exists (select 1 from public.collaborator_invites where id='b3000000-0000-4000-8000-000000000001'), 'own verified activation clears invitation');
select pg_temp.assert_true((select role='admin' from public.profiles where id='b2000000-0000-4000-8000-000000000004'), 'cross tenant admin update had no effect');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set status='active', role='atendimento' where id='b2000000-0000-4000-8000-000000000003';
reset role;
select pg_temp.assert_true((select status='active' and role='atendimento' from public.profiles where id='b2000000-0000-4000-8000-000000000003'), 'trusted admin service retains collaborator management');
select 'profile_trust_boundary_regression: PASS' as result;
rollback;
