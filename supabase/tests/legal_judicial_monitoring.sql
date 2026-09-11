-- F6 judicial monitoring integration regression. Run ONLY in a disposable/local or isolated staging
-- database after migrations, with postgres privileges. Synthetic data rolls back.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/legal_judicial_monitoring.sql
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
insert into legal_test_ids(name) values('jud_source'),('jud_pending_source'),('jud_datajud_source'),('jud_connection'),('jud_datajud_connection'),('jud_proceeding'),('jud_proceeding2'),('jud_job'),('jud_lease'),('jud_pending_job'),('jud_monitor'),('jud_monitor_lease'),('jud_quota_job'),('jud_quota_lease'),('jud_inbox'),('jud_changed'),('jud_multi'),('jud_older'),('jud_manual'),('jud_triage'),('jud_task');
set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_add_proceeding(pg_temp.lid('case'),'0000001-45.2024.8.26.0001','Órgão fictício','Grau fictício')).id where name='jud_proceeding';
update legal_test_ids set id=(public.legal_add_proceeding(pg_temp.lid('case2'),'0000001-45.2024.8.26.0001','Outro órgão')).id where name='jud_proceeding2';
create function pg_temp.judicial_source(p_key text,p_provider text default 'escavador') returns jsonb language sql stable as $$select jsonb_build_object('provider',p_provider,'source_key',p_key,'title','Synthetic source permission','api_version','synthetic-v2','documentation_url','https://example.invalid/docs','checked_on',(clock_timestamp() at time zone 'America/Sao_Paulo')::date,'terms_version','Synthetic terms; no actual provider authorization','permission_document_id',pg_temp.lid('general'),'allowed_operations',jsonb_build_array('consult_cnj','discover_oab','monitor_process','monitor_diary','read_updates','reconcile_monitor'),'valid_from','2026-01-01','valid_until','2027-12-31','scope',jsonb_build_object('court','Órgão fictício'),'limitations','Synthetic fixture only, no real fetch or provider activation')$$;
select pg_temp.login('member');select pg_temp.expect_error($q$select public.legal_judicial_create_source_version(pg_temp.judicial_source('bypass'))$q$,'42501','case editor cannot approve or create tenant provider permission');select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_judicial_create_source_version(pg_temp.judicial_source('missing-proof')-'permission_document_id')).id where name='jud_pending_source';
select pg_temp.expect_error($q$select public.legal_judicial_review_source(pg_temp.lid('jud_pending_source'),'approved','Cannot approve without documentary permission')$q$,'22023','permission and checked source proof required');
update legal_test_ids set id=(public.legal_judicial_create_source_version(pg_temp.judicial_source('escavador-fixture'))).id where name='jud_source';
select public.legal_judicial_review_source(pg_temp.lid('jud_source'),'approved','Synthetic permission and coverage reviewed; no real provider enabled');
update legal_test_ids set id=(public.legal_judicial_create_source_version(pg_temp.judicial_source('datajud-fixture','datajud'))).id where name='jud_datajud_source';
select public.legal_judicial_review_source(pg_temp.lid('jud_datajud_source'),'approved','Metadata review does not override commercial-use block');
select pg_temp.expect_error($q$select public.legal_judicial_service_configure(pg_temp.lid('owner'),pg_temp.lid('tenant_a'),'acct',pg_temp.lid('jud_source'),true,'{"environment":"production","requests_per_minute":120,"requests_per_day":1000}')$q$,'42501','browser cannot claim server account binding');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.expect_error($q$select public.legal_judicial_service_configure(pg_temp.lid('owner'),pg_temp.lid('tenant_b'),'jud-fixture-account',pg_temp.lid('jud_source'),true,'{"environment":"production","requests_per_minute":120,"requests_per_day":1000}')$q$,'42501','physical server tenant binding cannot be forged');
update legal_test_ids set id=(public.legal_judicial_service_configure(pg_temp.lid('owner'),pg_temp.lid('tenant_a'),'jud-fixture-account',pg_temp.lid('jud_source'),true,'{"environment":"production","requests_per_minute":120,"requests_per_day":1000}')->>'id')::uuid where name='jud_connection';
update legal_test_ids set id=(public.legal_judicial_service_configure(pg_temp.lid('owner'),pg_temp.lid('tenant_a'),'jud-datajud-account',pg_temp.lid('jud_datajud_source'),true,'{"environment":"production","requests_per_minute":120,"requests_per_day":1000}')->>'id')::uuid where name='jud_datajud_connection';
reset role;set local role authenticated;select pg_temp.login('owner');
select public.legal_judicial_save_coverage(pg_temp.lid('jud_connection'),jsonb_build_object('scope',jsonb_build_object('court','Órgão fictício'),'capability',capability,'coverage_start_on','2026-01-01','expected_interval_minutes',60,'tolerated_delay_minutes',30,'state','verified','review_note','Independent synthetic scope for this exact operation')) from unnest(array['consult_cnj','monitor_process']) capability;
create function pg_temp.judicial_job(p_operation text default 'consult_cnj') returns jsonb language sql volatile as $$select jsonb_build_object('case_id',pg_temp.lid('case'),'proceeding_id',pg_temp.lid('jud_proceeding'),'operation',p_operation,'query',jsonb_build_object('cnj','00000014520248260001'),'max_requests',2,'budget_units',case when p_operation='monitor_process' then 1 else 0 end,'authorization_note','Synthetic explicit lookup/monitor permission; no actual consumption','idempotency_key',gen_random_uuid())$$;
select pg_temp.expect_error($q$select public.legal_judicial_enqueue(pg_temp.lid('jud_connection'),pg_temp.judicial_job()||jsonb_build_object('proceeding_id',pg_temp.lid('jud_proceeding2')))$q$,'22023','same tenant other case proceeding is rejected');
select pg_temp.expect_error($q$select public.legal_judicial_enqueue(pg_temp.lid('jud_connection'),pg_temp.judicial_job()||'{"query":{"cnj":"00000014520248260001","url":"http://127.0.0.1"}}')$q$,'22023','arbitrary provider URL is never accepted');
select pg_temp.expect_error($q$select public.legal_judicial_enqueue(pg_temp.lid('jud_connection'),pg_temp.judicial_job('monitor_process')||'{"budget_units":0}')$q$,'22023','paid monitor intent needs an explicit positive budget');
select pg_temp.expect_error($q$select public.legal_judicial_enqueue(pg_temp.lid('jud_connection'),pg_temp.judicial_job()||'{"operation":"read_and_acknowledge"}')$q$,'23514','GET-like science capability outside closed operation list is denied');
update legal_test_ids set id=(public.legal_judicial_enqueue(pg_temp.lid('jud_datajud_connection'),pg_temp.judicial_job())->>'id')::uuid where name='jud_pending_job';
update legal_test_ids set id=(public.legal_judicial_enqueue(pg_temp.lid('jud_connection'),pg_temp.judicial_job())->>'id')::uuid where name='jud_job';
select pg_temp.expect_error($q$select * from public.legal_judicial_jobs$q$,'42501','staff cannot read job leases through direct table access');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(public.legal_judicial_service_claim(pg_temp.lid('tenant_a'),'jud-datajud-account','datajud',true)='[]'::jsonb,'I01 even configured DataJud never receives commercial fetch work');
select pg_temp.assert_true((select state='permission_pending' from public.legal_judicial_jobs where id=pg_temp.lid('jud_pending_job')),'DataJud limitation persisted independently of credential flag');
select pg_temp.assert_true(public.legal_judicial_service_claim(pg_temp.lid('tenant_b'),'jud-fixture-account','escavador',true)='[]'::jsonb,'I02 account does not authorize another tenant');
select pg_temp.assert_true(public.legal_judicial_service_claim(pg_temp.lid('tenant_a'),'jud-fixture-account','escavador',false)='[]'::jsonb,'missing credentials produce no sendable work');
update legal_test_ids set id=(public.legal_judicial_service_claim(pg_temp.lid('tenant_a'),'jud-fixture-account','escavador',true)->0->>'lease_token')::uuid where name='jud_lease';
select pg_temp.assert_true((public.legal_judicial_service_authorize_attempt(pg_temp.lid('jud_job'),pg_temp.lid('jud_lease'),pg_temp.lid('tenant_a'),'jud-fixture-account')->>'allowed')::boolean,'one authorized fetch consumes quota');
select pg_temp.assert_true((select request_count=1 from public.legal_judicial_jobs where id=pg_temp.lid('jud_job')),'request count is authoritative');
select public.legal_judicial_service_finish(pg_temp.lid('jud_job'),pg_temp.lid('jud_lease'),'succeeded','{"items_count":2,"next_cursor":{"page":2}}');
select pg_temp.assert_true((select state='degraded' and last_error_code='pagination_incomplete' from public.legal_judicial_connections where id=pg_temp.lid('jud_connection')),'truncated pagination never appears as full coverage');
select pg_temp.assert_true((select query->'cursor'='{"page":2}'::jsonb and result_summary->'complete'='false'::jsonb from public.legal_judicial_jobs where id=pg_temp.lid('jud_job')),'cursor persisted for explicit continuation');
create function pg_temp.judicial_ingest(p_external text,p_raw text,p_candidates jsonb default '[{"cnj":"00000014520248260001"}]') returns jsonb language sql volatile as $$select public.legal_judicial_service_ingest(pg_temp.lid('tenant_a'),'jud-fixture-account','escavador',p_external,p_raw,jsonb_build_object('original_sha256',encode(sha256(convert_to(p_raw,'UTF8')),'hex'),'parser_version','synthetic-v1','event_type','movement','source_updated_at','2026-09-10T12:00:00Z','candidates',p_candidates,'provider_monitor_ids',jsonb_build_array('m-synthetic')))$$;
update legal_test_ids set id=(pg_temp.judicial_ingest('evt-source','{"private":"PRIVATE MEDICAL TEXT","event":"one"}')->>'id')::uuid where name='jud_inbox';
select pg_temp.assert_true(pg_temp.judicial_ingest('evt-source','{"private":"PRIVATE MEDICAL TEXT","event":"one"}') @> '{"duplicate":true,"changed":false}'::jsonb,'I03 callback replay deduplicates one logical reception and returns strict boolean flags');
select pg_temp.assert_true((select count(*)=1 from public.legal_judicial_inbox where provider_event_id='evt-source'),'replay creates neither new inbox nor assignment');
update legal_test_ids set id=(pg_temp.judicial_ingest('evt-source','{"private":"PRIVATE CHANGED TEXT","event":"one"}')->>'id')::uuid where name='jud_changed';
select pg_temp.assert_true((select association_state='quarantined' and quarantine_reason='changed_payload' and version_number=2 from public.legal_judicial_inbox where id=pg_temp.lid('jud_changed')),'I04 changed bytes preserve new quarantined version');
select pg_temp.assert_true((select case_id is null and category='restricted' and published_on is null and awareness_effective_on is null from public.legal_judicial_inbox where id=pg_temp.lid('jud_inbox')),'I09/I10 monitor metadata does not associate case or invent publication/awareness');
update legal_test_ids set id=(pg_temp.judicial_ingest('evt-multi','{"event":"two proceedings"}','[{"cnj":"00000014520248260001"},{"oab_number":"1","oab_state":"RJ"}]')->>'id')::uuid where name='jud_multi';
reset role;set local role authenticated;select pg_temp.login('member');
select pg_temp.assert_true(public.legal_judicial_context()->'inbox'='[]'::jsonb,'unassociated originals remain restricted even for dual-authorized case editor');
select pg_temp.expect_error($q$select public.legal_judicial_read_original(pg_temp.lid('jud_inbox'))$q$,'42501','no raw discovery access before administrator association');
select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_judicial_review_association(pg_temp.lid('jud_multi'),pg_temp.lid('case'),pg_temp.lid('jud_proceeding'),'confirmed',pg_temp.lid('general'),'Do not distribute full multi-case original')$q$,'22023','multi-candidate page must be extracted, never broadly associated');
select public.legal_judicial_review_association(pg_temp.lid('jud_inbox'),pg_temp.lid('case'),pg_temp.lid('jud_proceeding'),'confirmed',pg_temp.lid('general'),'Individual source checked against exactly one proceeding');
select pg_temp.assert_true(public.legal_judicial_read_original(pg_temp.lid('jud_inbox'))->>'original_text'='{"private":"PRIVATE MEDICAL TEXT","event":"one"}','immutable original bytes remain available through audited read');
select pg_temp.login('finance');select pg_temp.assert_true(public.legal_judicial_context(pg_temp.lid('case'))->'inbox'='[]'::jsonb,'fiscal-only member cannot see restricted source');
select pg_temp.expect_error($q$select public.legal_judicial_read_original(pg_temp.lid('jud_inbox'))$q$,'42501','restricted is medical AND fiscal, not OR');
select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_judicial_assign(pg_temp.lid('jud_inbox'),pg_temp.lid('member'),pg_temp.lid('owner'),now()+interval '1 day','Internal review assignment')).id where name='jud_triage';
update legal_test_ids set id=(select task_id from public.legal_judicial_triage where id=pg_temp.lid('jud_triage')) where name='jud_task';
select pg_temp.expect_error($q$select public.legal_judicial_assign(pg_temp.lid('jud_inbox'),pg_temp.lid('finance'),null,now(),'Cannot assign source category not granted')$q$,'22023','assignee needs both source category grants');
select pg_temp.login('member');select public.legal_judicial_accept_assignment(pg_temp.lid('jud_triage'),'Assumed office handling only');
select pg_temp.assert_true((select awareness_effective_on is null from public.legal_judicial_inbox where id=pg_temp.lid('jud_inbox')),'internal acceptance never becomes legal awareness');
select pg_temp.expect_error($q$select public.legal_save_case_task(pg_temp.lid('case'),'{"due_at":"2030-01-01T00:00:00Z"}',pg_temp.lid('jud_task'))$q$,'42501','generic task API cannot alter reviewed judicial workflow');
select pg_temp.expect_error($q$select * from public.legal_judicial_originals$q$,'42501','original table is never directly readable');
select pg_temp.login('owner');select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,false,true);select pg_temp.login('member');
select pg_temp.assert_true((select count(*)=0 from public.legal_case_tasks where id=pg_temp.lid('jud_task')),'task category RLS hides source-linked task after medical grant revoked');
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.legal_my_day(now()-interval '1 day',now()+interval '2 days')->'items') x where x->>'id'=pg_temp.lid('jud_task')::text),'SECURITY DEFINER My Day explicitly preserves judicial task ACL');
select pg_temp.expect_error($q$select public.legal_judicial_accept_assignment(pg_temp.lid('jud_triage'),'Old assignment cannot bypass revoked category')$q$,'42501','old task assignee loses access immediately');
select pg_temp.login('outsider');select pg_temp.assert_true((select count(*)=0 from public.legal_judicial_inbox),'selected platform tenant does not reveal physical-tenant judicial records');
select pg_temp.expect_error($q$select public.legal_judicial_context(pg_temp.lid('case'))$q$,'42501','tenant impersonation denied');
reset role;grant select on legal_test_ids to legal_portal;set local role legal_portal;select pg_temp.login('owner','legal_portal');
select pg_temp.expect_error($q$select public.legal_judicial_context()$q$,'42501','portal role cannot reach judicial RPC via inherited PUBLIC privilege');
reset role;set local role authenticated;select pg_temp.login('owner');select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,true,true);
reset role;insert into legal_test_ids(name) values('jud_bounded'),('jud_bounded_lease'),('jud_missing_coverage');set local role authenticated;select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_judicial_enqueue(pg_temp.lid('jud_connection'),pg_temp.judicial_job()||'{"max_requests":6}')$q$,'23514','per-job fetch count cannot exceed bounded five requests');
update legal_test_ids set id=(public.legal_judicial_enqueue(pg_temp.lid('jud_connection'),pg_temp.judicial_job('read_updates'))->>'id')::uuid where name='jud_missing_coverage';
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(public.legal_judicial_service_claim(pg_temp.lid('tenant_a'),'jud-fixture-account','escavador',true)='[]'::jsonb,'coverage of CNJ lookup does not authorize different movements operation');
select pg_temp.assert_true((select result_summary->>'error_code'='coverage_required' and state='permission_pending' from public.legal_judicial_jobs where id=pg_temp.lid('jud_missing_coverage')),'missing exact-operation coverage is persisted');
reset role;set local role authenticated;select pg_temp.login('owner');select public.legal_judicial_cancel_job(pg_temp.lid('jud_missing_coverage'),'Synthetic missing-coverage test concluded');
update legal_test_ids set id=(public.legal_judicial_enqueue(pg_temp.lid('jud_connection'),pg_temp.judicial_job()||'{"max_requests":1}')->>'id')::uuid where name='jud_bounded';
reset role;set local role service_role;select pg_temp.login('owner','service_role');update legal_test_ids set id=(public.legal_judicial_service_claim(pg_temp.lid('tenant_a'),'jud-fixture-account','escavador',true)->0->>'lease_token')::uuid where name='jud_bounded_lease';
select pg_temp.assert_true((public.legal_judicial_service_authorize_attempt(pg_temp.lid('jud_bounded'),pg_temp.lid('jud_bounded_lease'),pg_temp.lid('tenant_a'),'jud-fixture-account')->>'allowed')::boolean,'bounded job first fetch authorized');
select pg_temp.assert_true(public.legal_judicial_service_authorize_attempt(pg_temp.lid('jud_bounded'),pg_temp.lid('jud_bounded_lease'),pg_temp.lid('tenant_a'),'jud-fixture-account')->>'reason'='job_request_limit','extra pagination/retry refuses before external fetch');
select pg_temp.assert_true((select request_count=1 and lease_token is null and result_summary->'complete'='false'::jsonb from public.legal_judicial_jobs where id=pg_temp.lid('jud_bounded')),'quota refusal clears lease and never claims complete capture');
reset role;set local role authenticated;select pg_temp.login('owner');

-- F6_MONITORING_CONCURRENCY_FIXTURE_READY
update legal_test_ids set id=(public.legal_judicial_enqueue(pg_temp.lid('jud_connection'),pg_temp.judicial_job('monitor_process'))->>'id')::uuid where name='jud_monitor';
reset role;set local role service_role;select pg_temp.login('owner','service_role');
update legal_test_ids set id=(public.legal_judicial_service_claim(pg_temp.lid('tenant_a'),'jud-fixture-account','escavador',true)->0->>'lease_token')::uuid where name='jud_monitor_lease';
select public.legal_judicial_service_authorize_attempt(pg_temp.lid('jud_monitor'),pg_temp.lid('jud_monitor_lease'),pg_temp.lid('tenant_a'),'jud-fixture-account');
select public.legal_judicial_service_finish(pg_temp.lid('jud_monitor'),pg_temp.lid('jud_monitor_lease'),'unknown','{"error_code":"timeout_after_create"}');
select pg_temp.assert_true(public.legal_judicial_service_claim(pg_temp.lid('tenant_a'),'jud-fixture-account','escavador',true)='[]'::jsonb,'I06 unknown monitor result is never blindly retried');
reset role;set local role authenticated;select pg_temp.login('owner');select pg_temp.expect_error($q$select public.legal_judicial_retry_job(pg_temp.lid('jud_monitor'),'Blind repeat forbidden')$q$,'22023','monitor creation ambiguity requires verified reconciliation');
select public.legal_judicial_review_source(pg_temp.lid('jud_source'),'revoked','Remove source authorization before further work');
update legal_test_ids set id=(public.legal_judicial_enqueue(pg_temp.lid('jud_connection'),pg_temp.judicial_job())->>'id')::uuid where name='jud_quota_job';
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(public.legal_judicial_service_claim(pg_temp.lid('tenant_a'),'jud-fixture-account','escavador',true)='[]'::jsonb,'revoked permission prevents new fetch despite configured key');
select pg_temp.expect_error($q$select pg_temp.judicial_ingest('after-revoke','{}')$q$,'42501','callbacks cannot bypass revoked source permission');
reset role;select 'F6 judicial monitoring regression PASS' as result;rollback;
