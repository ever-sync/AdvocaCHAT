-- F8 specialized operations regression. Run ONLY in a disposable/local or isolated staging
-- database after migrations, with postgres privileges. Synthetic data rolls back.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/legal_specialized_operations.sql
\set ON_ERROR_STOP on
begin;

create temp table legal_test_ids(name text primary key,id uuid not null default gen_random_uuid());
insert into legal_test_ids(name) values('tenant_a'),('tenant_b'),('owner'),('member'),('same_admin'),('finance'),('outsider'),('inactive'),('customer_a'),('customer_b'),('negotiation'),('case'),('document'),('fiscal'),('revoked_document'),('quota_case');
grant select,update on legal_test_ids to authenticated,service_role;
create function pg_temp.lid(p_name text) returns uuid language sql stable as $$select id from legal_test_ids where name=p_name$$;
create function pg_temp.assert_true(p_value boolean,p_label text) returns void language plpgsql as $$
begin if p_value is distinct from true then raise exception 'FAIL: %',p_label; end if; end;$$;
create function pg_temp.expect_error(p_sql text,p_code text,p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate=p_code then return; end if;
    raise exception 'FAIL: % expected SQLSTATE %, got % (%)',p_label,p_code,sqlstate,sqlerrm;
  end;
  raise exception 'FAIL: % unexpectedly succeeded',p_label;
end;$$;
create function pg_temp.login(p_name text,p_role text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',coalesce(pg_temp.lid(p_name)::text,''),true);
  perform set_config('request.jwt.claim.role',p_role,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.lid(p_name),'role',p_role)::text,true);
end;$$;

-- A schema-only fixture may have no billing catalog. This insert is rolled back.
insert into public.billing_plans(id,name) values('sistema','Synthetic legal regression') on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit) values('legal-case-documents','legal-case-documents',false,10485760) on conflict(id) do nothing;
insert into public.tenants(id,nome) values(pg_temp.lid('tenant_a'),'Legal regression A'),(pg_temp.lid('tenant_b'),'Legal regression B');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at,created_at,updated_at)
  select id,'legal-'||id::text||'@example.invalid','{}'::jsonb,jsonb_build_object('nome','Legal regression '||name),now(),now(),now()
  from legal_test_ids where name in ('owner','member','same_admin','finance','outsider','inactive');
update public.profiles p set tenant_id=case when i.name='outsider' then pg_temp.lid('tenant_b') else pg_temp.lid('tenant_a') end,
  role=case when i.name='member' then 'atendimento' when i.name='finance' then 'financeiro' else 'admin' end,
  status=case when i.name='inactive' then 'inactive' else 'active' end
  from legal_test_ids i where p.id=i.id and i.name in ('owner','member','same_admin','finance','outsider','inactive');
insert into public.customers(id,tenant_id,nome) values(pg_temp.lid('customer_a'),pg_temp.lid('tenant_a'),'Synthetic A'),(pg_temp.lid('customer_b'),pg_temp.lid('tenant_b'),'Synthetic B');
insert into public.crm_negotiations(id,tenant_id,title,funnel_id,stage_id,customer_id,assignee_id)
  values(pg_temp.lid('negotiation'),pg_temp.lid('tenant_a'),'Keep original negotiation','test-funnel','test-stage',pg_temp.lid('customer_a'),pg_temp.lid('owner'));
insert into public.platform_admins(user_id) values(pg_temp.lid('outsider'));
insert into public.platform_user_tenant_context(user_id,selected_tenant_id) values(pg_temp.lid('outsider'),pg_temp.lid('tenant_a'));


insert into legal_test_ids(name) values('case2'),('party'),('party2'),('external'),('accountant'),('representative'),('invite'),('invite2'),('invite_acc'),('invite_rep'),('provision'),('provision_acc'),('provision_rep'),('membership'),('membership_acc'),('membership_rep'),('general'),('medical'),('csv'),('publication'),('agenda'),('release'),('release_acc'),('export'),('request'),('request_rep'),('upload'),('upload_rep'),('representation'),('communication'),('email_comm'),('job'),('lease'),('followup'),('source'),('payer'),('key'),('reply_key');
set local role authenticated;select pg_temp.login('owner');select public.legal_set_workspace_enabled(true);
update legal_test_ids set id=(public.legal_create_case('Internal clinical strategy NEVER in portal',pg_temp.lid('customer_a'))).id where name='case';
update legal_test_ids set id=(public.legal_create_case('Other unrelated case',pg_temp.lid('customer_a'))).id where name='case2';
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,true,true);
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('finance'),true,false,true);
update legal_test_ids set id=(public.legal_add_case_party(pg_temp.lid('case'),'Synthetic client party','client',pg_temp.lid('customer_a'))).id where name='party';
update legal_test_ids set id=(public.legal_add_case_party(pg_temp.lid('case'),'Synthetic representative party','representative')).id where name='party2';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'general','Identity review evidence','identity.pdf','application/pdf',10)).id where name='general';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'medical','PRIVATE MEDICAL NAME','clinical.pdf','application/pdf',10)).id where name='medical';
update legal_test_ids set id=(public.ir_save_payer(pg_temp.lid('case'),'{"name":"Synthetic payer","payer_type":"inss"}')).id where name='payer';
update legal_test_ids set id=(public.ir_save_income_source(pg_temp.lid('case'),jsonb_build_object('payer_id',pg_temp.lid('payer'),'income_kind','retirement','regime','rgps'))).id where name='source';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'fiscal','Later payroll proof','later.pdf','application/pdf',10)).id where name='fiscal';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'fiscal','Reviewed fiscal extract','tax.csv','text/csv',10)).id where name='csv';
reset role;select pg_temp.login('owner','service_role');
insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}' from public.legal_case_documents where case_id=pg_temp.lid('case');
set local role service_role;
select public.legal_finalize_document(id,encode(sha256(convert_to(id::text,'UTF8')),'hex')) from public.legal_case_documents where case_id=pg_temp.lid('case');
reset role;set local role authenticated;select pg_temp.login('owner');

reset role;

set local role authenticated;select pg_temp.login('owner');
create temp table f9_results(name text primary key,value jsonb);grant all on f9_results to authenticated;
insert into f9_results values('before',public.legal_readiness_metrics());
select pg_temp.assert_true((select (value->>'case_count')::int>=1 from f9_results where name='before'),'metrics expose accessible cases');
insert into f9_results values('preview',public.legal_preview_case_import('[{"title":"Synthetic F9 import","area":"IR","next_action":"Review imported data"}]'));
select pg_temp.expect_error($q$select public.legal_preview_case_import('[{"title":"Illegal","owner_id":"00000000-0000-0000-0000-000000000000"}]')$q$,'22023','import cannot assign caller-controlled owner');
select pg_temp.expect_error($q$select public.legal_preview_case_import(jsonb_build_array(jsonb_build_object('title','Wrong customer','customer_id',pg_temp.lid('customer_b'))))$q$,'42501','import cross-tenant customer denied');
select pg_temp.expect_error($q$select public.legal_preview_case_import('[]')$q$,'22023','empty import denied');
select pg_temp.expect_error($q$select public.legal_preview_case_import((select jsonb_agg(jsonb_build_object('title','Case')) from generate_series(1,101)))$q$,'22023','101 case import denied');
select pg_temp.expect_error($q$select public.legal_apply_case_import('[{"title":"Synthetic F9 import","area":"IR","next_action":"Review imported data"}]','stale',pg_temp.lid('key'))$q$,'22023','stale preview denied atomically');
insert into f9_results values('import',public.legal_apply_case_import('[{"title":"Synthetic F9 import","area":"IR","next_action":"Review imported data"}]',(select value->>'preview_hash' from f9_results where name='preview'),pg_temp.lid('key')));
select pg_temp.assert_true(public.legal_apply_case_import('[{"title":"Synthetic F9 import","area":"IR","next_action":"Review imported data"}]','old',(pg_temp.lid('key')))->'already_applied'='true'::jsonb,'exact import replay returns existing batch');
select pg_temp.assert_true((public.legal_readiness_metrics()->>'case_count')::int=(select (value->>'case_count')::int+1 from f9_results where name='before'),'idempotent import creates exactly one case');
select pg_temp.expect_error($q$select public.legal_apply_case_import('[{"title":"Changed"}]','old',pg_temp.lid('key'))$q$,'22023','changed replay denied');
insert into f9_results values('payload',jsonb_build_object('kind','estimate','category','infrastructure','amount','12.34','currency','BRL','period_start','2026-09-01','period_end','2026-09-12','source','Synthetic tariff','allocation_method','Synthetic allocation no actual cost','idempotency_key',pg_temp.lid('reply_key')));
insert into f9_results values('cost',public.legal_record_operational_cost(pg_temp.lid('case'),(select value from f9_results where name='payload')));
select pg_temp.assert_true(public.legal_record_operational_cost(pg_temp.lid('case'),(select value from f9_results where name='payload'))->>'id'=(select value->>'id' from f9_results where name='cost'),'cost replay does not duplicate');
select pg_temp.expect_error($q$select public.legal_record_operational_cost(pg_temp.lid('case'),(select value||'{"amount":"13.00"}'::jsonb from f9_results where name='payload'))$q$,'22023','changed cost replay denied');
select pg_temp.expect_error($q$select public.legal_record_operational_cost(pg_temp.lid('case'),(select value||jsonb_build_object('idempotency_key',gen_random_uuid(),'kind','actual') from f9_results where name='payload'))$q$,'23514','actual cost requires proof');
select pg_temp.assert_true(public.legal_readiness_metrics()->'cost_totals'->0->>'kind'='estimate','estimate remains distinct from actual');
insert into f9_results values('export',public.legal_export_case_manifest(pg_temp.lid('case')));
select pg_temp.assert_true((select value->>'format'='advocachat-case-v1' and value->'case'->>'id'=pg_temp.lid('case')::text and not (value->'tables' ? 'legal_diligence_invites') and not (value->'tables' ? 'legal_ai_jobs') and not(value->'tables' ? 'legal_document_text_pages') from f9_results where name='export'),'manifest excludes credentials, queues and withdrawn derived OCR');
reset role;
insert into public.legal_case_events(tenant_id,case_id,actor_id,event_type,description,metadata) values(pg_temp.lid('tenant_a'),pg_temp.lid('case'),pg_temp.lid('owner'),'manual','Synthetic oversized export fixture',jsonb_build_object('fixture',repeat('x',17000000)));
set local role authenticated;select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_export_case_manifest(pg_temp.lid('case'))$q$,'22023','manifest byte budget rejects before JSON aggregation');
reset role;delete from public.legal_case_events where case_id=pg_temp.lid('case') and description='Synthetic oversized export fixture';set local role authenticated;
select pg_temp.login('finance');
select pg_temp.expect_error($q$select public.legal_export_case_manifest(pg_temp.lid('case'))$q$,'42501','fiscal-only member cannot export restricted case content');
select pg_temp.assert_true(public.legal_readiness_metrics()->>'ir_received_brl'='0','fiscal-only member has no IR combined financial disclosure');
select pg_temp.expect_error($q$select public.legal_record_operational_cost(pg_temp.lid('case'),(select value from f9_results where name='payload'))$q$,'42501','member cannot register cost');
select pg_temp.login('outsider');
select pg_temp.expect_error($q$select public.legal_export_case_manifest(pg_temp.lid('case'))$q$,'42501','outsider export denied');
select pg_temp.expect_error($q$select public.legal_readiness_metrics()$q$,'42501','disabled other tenant cannot access metrics');
reset role;insert into public.legal_workspace_features(tenant_id,enabled,updated_by) values(pg_temp.lid('tenant_b'),true,pg_temp.lid('outsider')) on conflict(tenant_id) do update set enabled=true;set local role authenticated;select pg_temp.login('outsider');
select pg_temp.assert_true(not(public.legal_readiness_metrics()->'cost_totals' @> '[{"amount":"12.34"}]'),'enabled other tenant does not receive costs');
select pg_temp.expect_error($q$select * from public.legal_operational_costs$q$,'42501','raw cost table denied');
reset role;set local role legal_portal;
select pg_temp.expect_error($q$select public.legal_readiness_metrics()$q$,'42501','external portal cannot access readiness RPC');
reset role;rollback;
