-- F2 integration regression. Run ONLY in a disposable/local or isolated staging
-- database after migrations, with postgres privileges. Synthetic data rolls back.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/legal_operations.sql
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

insert into legal_test_ids(name) values('template'),('template_version'),('request'),('instrument'),('instrument_version'),('new_version'),('task_template'),('task'),('appointment'),('doc_public'),('request_cancel'),('request_expired'),('request_revoke'),('request_cleanup'),('cleanup_document'),('quota_request');

set local role authenticated;
select pg_temp.login('owner');
select public.legal_set_workspace_enabled(true);
update legal_test_ids set id=(public.legal_create_case('F2 synthetic case')).id where name='case';
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,false,false);
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('finance'),false,false,true);
select pg_temp.assert_true(public.legal_operations_context(pg_temp.lid('case'))->'settings'->'services' ? 'Assessoria jurídica','default operation settings usable before configuration');
select public.legal_configure_operations(array['Consultoria'],array['Triagem','Contratação'],array['Concluído']);
select public.legal_set_case_operation(pg_temp.lid('case'),'Consultoria','Triagem');
select pg_temp.expect_error($q$select public.legal_set_case_operation(pg_temp.lid('case'),'Unknown service','Triagem')$q$,'22023','pipeline validates workspace service');
select pg_temp.expect_error($q$update public.legal_case_operations set stage_name='Bypass'$q$,'42501','pipeline direct mutation denied');
update legal_test_ids set id=(public.legal_create_interview_template('Restricted interview','medical','[{"key":"evidence","label":"Evidência","type":"text","required":true}]'::jsonb)).id where name='template';
update legal_test_ids set id=(select id from public.legal_interview_template_versions where template_id=pg_temp.lid('template') and version_number=1) where name='template_version';
select public.legal_submit_interview(pg_temp.lid('case'),pg_temp.lid('template_version'),'{"evidence":"Synthetic restricted response"}'::jsonb);
select pg_temp.expect_error($q$select public.legal_submit_interview(pg_temp.lid('case'),pg_temp.lid('template_version'),'{}'::jsonb)$q$,'22023','required answer enforced');
select pg_temp.expect_error($q$select public.legal_submit_interview(pg_temp.lid('case'),pg_temp.lid('template_version'),'{"evidence":3}'::jsonb)$q$,'22023','answer type enforced');
select pg_temp.expect_error($q$select public.legal_submit_interview(pg_temp.lid('case'),pg_temp.lid('template_version'),'{"evidence":"a","unknown":"b"}'::jsonb)$q$,'22023','unknown answers rejected');
select public.legal_add_interview_version(pg_temp.lid('template'),'[{"key":"new_evidence","label":"Novo campo","type":"text","required":false}]'::jsonb);
select pg_temp.assert_true((select questions->0->>'key'='evidence' from public.legal_interview_template_versions where id=pg_temp.lid('template_version')),'old interview version remains unchanged');
select pg_temp.expect_error($q$update public.legal_interview_submissions set answers='{}'::jsonb$q$,'42501','interview submission immutable');
select public.legal_record_conflict_review(pg_temp.lid('case'),'potential','Revisão humana inicial');
select public.legal_record_conflict_review(pg_temp.lid('case'),'clear','Verificação profissional concluída');
select pg_temp.assert_true((select count(*) from public.legal_conflict_reviews where case_id=pg_temp.lid('case'))=2,'conflict decisions preserve history');
select pg_temp.assert_true(public.legal_operations_context(pg_temp.lid('case'))->>'conflict_search_coverage'='manual_review_only','no automatic claim of full conflict clearance');

update legal_test_ids set id=(public.legal_create_document_request(pg_temp.lid('case'),'medical','Internal restricted title','Internal instructions')).id where name='request';
select public.legal_issue_document_request_token(pg_temp.lid('request'),repeat('a',64),now()+interval '1 day');
select pg_temp.expect_error($q$select * from public.legal_document_request_tokens$q$,'42501','token hashes are not client-readable');
select pg_temp.expect_error($q$select public.legal_public_document_request(repeat('a',64))$q$,'42501','public lookup RPC is service-only');
select pg_temp.expect_error($q$select public.legal_issue_document_request_token(pg_temp.lid('request'),repeat('b',64),now()+interval '8 days')$q$,'22023','public link maximum expiry enforced');

select pg_temp.login('member');
select pg_temp.assert_true((select count(*) from public.legal_interview_submissions)=0,'medical answers hidden from ordinary editor');
select pg_temp.assert_true((select count(*) from public.legal_document_requests)=0,'medical request metadata hidden');
select pg_temp.expect_error($q$select public.legal_submit_interview(pg_temp.lid('case'),pg_temp.lid('template_version'),'{"evidence":"bypass"}'::jsonb)$q$,'42501','editor cannot submit restricted interview');
select pg_temp.expect_error($q$select public.legal_record_conflict_review(pg_temp.lid('case'),'clear','Self clearance')$q$,'42501','conflict review requires owner');
select pg_temp.expect_error($q$select public.legal_configure_operations(array['Bypass'],array['x'],array['y'])$q$,'42501','editor cannot configure workspace');

select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_instrument(pg_temp.lid('case'),'contract','Test contract','medical','Immutable synthetic contract v1')).id where name='instrument';
update legal_test_ids set id=(select id from public.legal_instrument_versions where instrument_id=pg_temp.lid('instrument') and version_number=1) where name='instrument_version';
select pg_temp.expect_error($q$select public.legal_review_instrument(pg_temp.lid('instrument_version'),'approved','Premature approval')$q$,'22023','draft cannot skip review');
select public.legal_submit_instrument_review(pg_temp.lid('instrument_version'));
select public.legal_review_instrument(pg_temp.lid('instrument_version'),'approved','Reviewed');
select pg_temp.expect_error($q$update public.legal_instrument_versions set content='Mutated'$q$,'42501','instrument body immutable');
select pg_temp.expect_error($q$select public.legal_record_external_signature(pg_temp.lid('instrument_version'),pg_temp.lid('document'),'Missing file')$q$,'22023','external signature requires ready document');
select pg_temp.login('member');
select pg_temp.assert_true((select count(*) from public.legal_instrument_versions)=0,'medical instrument body hidden');
select pg_temp.expect_error($q$select public.legal_review_instrument(pg_temp.lid('instrument_version'),'revoked','Bypass')$q$,'42501','editor cannot approve or revoke instrument');

select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_save_task_template('Preparar reunião','Checklist operacional',2)).id where name='task_template';
update legal_test_ids set id=(public.legal_save_case_task(pg_temp.lid('case'),jsonb_build_object('template_id',pg_temp.lid('task_template'),'assignee_id',pg_temp.lid('member'),'substitute_id',pg_temp.lid('owner')))).id where name='task';
select pg_temp.assert_true((select title='Preparar reunião' and due_at is not null from public.legal_case_tasks where id=pg_temp.lid('task')),'task template materializes title and due date');
select pg_temp.expect_error($q$select public.legal_save_case_task(pg_temp.lid('case'),jsonb_build_object('title','Wrong member','assignee_id',pg_temp.lid('same_admin')))$q$,'22023','same-tenant nonmember cannot receive task');
select pg_temp.expect_error($q$select public.legal_save_case_task(pg_temp.lid('case'),jsonb_build_object('title','Wrong tenant','assignee_id',pg_temp.lid('outsider')))$q$,'22023','cross-tenant assignee denied');
select pg_temp.expect_error($q$select public.legal_save_case_task(pg_temp.lid('case'),'{"owner_id":"forbidden"}'::jsonb)$q$,'22023','task fields narrowly whitelisted');
select pg_temp.expect_error($q$select public.legal_save_case_task(pg_temp.lid('case'),'{"status":"cancelled"}'::jsonb,pg_temp.lid('task'))$q$,'23514','task cancellation requires reason');
select public.legal_save_case_task(pg_temp.lid('case'),'{"status":"cancelled","cancellation_reason":"Remarcada"}'::jsonb,pg_temp.lid('task'));
update legal_test_ids set id=(public.legal_save_appointment(pg_temp.lid('case'),jsonb_build_object('title','Audiência sintética','appointment_type','hearing','starts_at',now()+interval '1 day','ends_at',now()+interval '25 hours','assignee_id',pg_temp.lid('owner'),'substitute_id',pg_temp.lid('member')))).id where name='appointment';
select pg_temp.expect_error($q$select public.legal_save_appointment(pg_temp.lid('case'),jsonb_build_object('title','Bad interval','starts_at',now(),'ends_at',now()-interval '1 hour'))$q$,'23514','appointment invalid interval rejected');
select pg_temp.expect_error($q$select public.legal_save_appointment(pg_temp.lid('case'),'{"status":"cancelled"}'::jsonb,pg_temp.lid('appointment'))$q$,'23514','appointment cancellation requires reason');
select public.legal_save_appointment(pg_temp.lid('case'),'{"status":"cancelled","cancellation_reason":"Redesignada"}'::jsonb,pg_temp.lid('appointment'));

-- Trusted Edge delegates one file; public token conveys no client identity.
reset role;
select pg_temp.login('owner','service_role');
set local role service_role;
select pg_temp.assert_true(public.legal_public_document_request(repeat('a',64))->>'title'='Envio de documento','public lookup does not leak internal title');
select pg_temp.assert_true(not(public.legal_public_document_request(repeat('a',64)) ? 'case_id'),'public lookup omits case identifier');
update legal_test_ids set id=(public.legal_public_prepare_request_upload(repeat('a',64),'proof.pdf','application/pdf',10)).id where name='doc_public';
select pg_temp.expect_error($q$select public.legal_public_prepare_request_upload(repeat('a',64),'duplicate.pdf','application/pdf',10)$q$,'42501','upload token cannot be reused');
select pg_temp.expect_error($q$select public.legal_public_finalize_request_upload(repeat('a',64),pg_temp.lid('document'),repeat('1',64))$q$,'42501','token cannot finalize unrelated document');
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}'::jsonb from public.legal_case_documents where id=pg_temp.lid('doc_public');
set local role service_role;
select public.legal_public_finalize_request_upload(repeat('a',64),pg_temp.lid('doc_public'),repeat('1',64));
select public.legal_public_finalize_request_upload(repeat('a',64),pg_temp.lid('doc_public'),repeat('1',64));
select pg_temp.assert_true((select uploaded_by=pg_temp.lid('owner') from public.legal_case_documents where id=pg_temp.lid('doc_public')),'upload uses responsible staff not fabricated client identity');

set local role authenticated;
select pg_temp.login('owner');
select public.legal_review_document_request(pg_temp.lid('request'),'approved','Arquivo conferido');
select public.legal_record_external_signature(pg_temp.lid('instrument_version'),pg_temp.lid('doc_public'),'Documento externo anexado pelo responsável; verificar evidências');
select pg_temp.assert_true((select status='externally_recorded' from public.legal_external_signature_records where version_id=pg_temp.lid('instrument_version')),'manual evidence is not provider signature verification');
update legal_test_ids set id=(public.legal_add_instrument_version(pg_temp.lid('instrument'),'New draft v2')).id where name='new_version';
select pg_temp.assert_true((select content='Immutable synthetic contract v1' and superseded_at is not null from public.legal_instrument_versions where id=pg_temp.lid('instrument_version')),'new version preserves and supersedes original');
select pg_temp.assert_true((select status='draft' and approved_at is null from public.legal_instrument_versions where id=pg_temp.lid('new_version')),'changed content needs fresh approval');
select pg_temp.expect_error($q$select public.legal_record_external_signature(pg_temp.lid('instrument_version'),pg_temp.lid('doc_public'),'Reuse obsolete approval')$q$,'22023','superseded approval unusable for a new act');

update legal_test_ids set id=(public.legal_create_document_request(pg_temp.lid('case'),'general','Failed upload request')).id where name='request_cleanup';
select public.legal_issue_document_request_token(pg_temp.lid('request_cleanup'),repeat('f',64),now()+interval '1 day');
update legal_test_ids set id=(public.legal_create_case('Quota case F2')).id where name='quota_case';
do $$begin for i in 1..20 loop perform public.legal_prepare_document(pg_temp.lid('quota_case'),'general','Reserved','reserved.pdf','application/pdf',10485760);end loop;end;$$;
update legal_test_ids set id=(public.legal_create_document_request(pg_temp.lid('quota_case'),'general','At quota')).id where name='quota_request';
select public.legal_issue_document_request_token(pg_temp.lid('quota_request'),repeat('9',64),now()+interval '1 day');
reset role;
select pg_temp.login('owner','service_role');
set local role service_role;
update legal_test_ids set id=(public.legal_public_prepare_request_upload(repeat('f',64),'failed.pdf','application/pdf',10)).id where name='cleanup_document';
select public.legal_public_abandon_request_upload(repeat('f',64),pg_temp.lid('cleanup_document'));
select pg_temp.assert_true((select status='abandoned' from public.legal_case_documents where id=pg_temp.lid('cleanup_document')),'failed public upload preserves abandoned metadata');
select pg_temp.assert_true((select status='open' and used_at is not null and expires_at is null from public.legal_document_requests where id=pg_temp.lid('request_cleanup')),'failed public upload requires a fresh owner-issued link');
select pg_temp.expect_error($q$select public.legal_public_prepare_request_upload(repeat('f',64),'retry.pdf','application/pdf',10)$q$,'42501','cleanup never reopens consumed token');
select pg_temp.expect_error($q$select public.legal_public_prepare_request_upload(repeat('9',64),'over-quota.pdf','application/pdf',1)$q$,'22023','public reservation obeys existing case quota');
set local role authenticated;
select pg_temp.login('owner');

update legal_test_ids set id=(public.legal_create_document_request(pg_temp.lid('case'),'general','Cancelled request')).id where name='request_cancel';
select public.legal_issue_document_request_token(pg_temp.lid('request_cancel'),repeat('b',64),now()+interval '1 day');
select public.legal_issue_document_request_token(pg_temp.lid('request_cancel'),repeat('e',64),now()+interval '1 day');
select public.legal_cancel_document_request(pg_temp.lid('request_cancel'),'No longer needed');
update legal_test_ids set id=(public.legal_create_document_request(pg_temp.lid('case'),'general','Expired request')).id where name='request_expired';
select public.legal_issue_document_request_token(pg_temp.lid('request_expired'),repeat('c',64),now()+interval '1 day');
select pg_temp.login('member');
update legal_test_ids set id=(public.legal_create_document_request(pg_temp.lid('case'),'general','Revocation request')).id where name='request_revoke';
select public.legal_issue_document_request_token(pg_temp.lid('request_revoke'),repeat('d',64),now()+interval '1 day');
select pg_temp.login('owner');
select public.legal_remove_case_member(pg_temp.lid('case'),pg_temp.lid('member'));
reset role;
select pg_temp.login('owner','service_role');
update public.legal_document_requests set expires_at=now()-interval '1 minute' where id=pg_temp.lid('request_expired');
set local role service_role;
select pg_temp.expect_error($q$select public.legal_public_document_request(repeat('b',64))$q$,'42501','cancelled link is unusable');
select pg_temp.expect_error($q$select public.legal_public_prepare_request_upload(repeat('b',64),'rotated.pdf','application/pdf',10)$q$,'42501','rotated old link cannot reserve upload');
select pg_temp.expect_error($q$select public.legal_public_document_request(repeat('e',64))$q$,'42501','current cancelled link is unusable');
select pg_temp.expect_error($q$select public.legal_public_prepare_request_upload(repeat('c',64),'expired.pdf','application/pdf',10)$q$,'42501','expired link cannot reserve upload');
select pg_temp.expect_error($q$select public.legal_public_prepare_request_upload(repeat('d',64),'revoked.pdf','application/pdf',10)$q$,'42501','creator revocation blocks delegated upload');

set local role authenticated;
select pg_temp.login('outsider');
select public.legal_set_workspace_enabled(true);
select pg_temp.assert_true((select count(*) from public.legal_interview_submissions)=0,'other tenant cannot read interview answers');
select pg_temp.assert_true((select count(*) from public.legal_instruments)=0,'other tenant cannot read instruments');
select pg_temp.assert_true((select count(*) from public.legal_appointments)=0,'other tenant cannot read agenda');
select pg_temp.expect_error($q$select public.legal_save_case_task(pg_temp.lid('case'),'{"title":"Bypass"}'::jsonb)$q$,'42501','other tenant cannot add tasks');
select pg_temp.login('same_admin');
select pg_temp.assert_true((select count(*) from public.legal_conflict_reviews)=0,'unassigned administrator sees no conflict reviews');
select pg_temp.expect_error($q$select public.legal_record_conflict_review(pg_temp.lid('case'),'clear','Bypass')$q$,'42501','unassigned admin cannot clear conflict');
select pg_temp.login('owner');
select pg_temp.assert_true(not exists(select 1 from public.legal_case_events where metadata::text like '%Synthetic restricted response%' or metadata::text like '%Immutable synthetic%' or metadata::text like '%Internal restricted%' or description like '%Internal restricted%'),'general audit excludes restricted payloads');
select pg_temp.assert_true((select count(*) from public.legal_case_events where metadata->>'origin'='public_request' and metadata->>'request_id'=pg_temp.lid('request')::text)=2,'public request origin explicit and retry finalization emits no duplicate event');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.legal_submit_interview(uuid,uuid,jsonb)','EXECUTE'),'anonymous mutation blocked');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.legal_public_prepare_request_upload(text,text,text,bigint)','EXECUTE'),'public upload reservation service-only');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.legal_document_request_tokens','SELECT'),'hashes stay private');
select pg_temp.assert_true((select title='Keep original negotiation' from public.crm_negotiations where id=pg_temp.lid('negotiation')),'F2 leaves legacy negotiation unchanged');
rollback;
select 'PASS: F2 operations, versioning, reviews, category ACL, tasks, agenda and public document capability regressions; fixtures rolled back' as result;
