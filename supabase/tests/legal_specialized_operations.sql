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
insert into legal_test_ids(name) values('coverage'),('coverage_new'),('homologation'),('package'),('package_new'),('installation'),('package_task'),('succession'),('succession_empty'),('succession_person'),('authority'),('act'),('attempt'),('receipt'),('diligence'),('diligence2'),('diligence_invite'),('diligence_grant'),('diligence_provision'),('diligence_upload'),('diligence_delivery'),('second_upload'),('second_delivery'),('f8_key'),('f8_upload_key'),('f8_token'),('act_doc'),('receipt_doc'),('signature_doc');
create temp table legal_test_results(name text primary key,result jsonb);grant select,insert,update on legal_test_results to authenticated,service_role;
set local role authenticated;select pg_temp.login('owner');
create function pg_temp.today() returns date language sql stable as $$select (clock_timestamp() at time zone 'America/Sao_Paulo')::date$$;
create function pg_temp.iso(p timestamptz) returns text language sql stable as $$select to_char(p at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')$$;
create function pg_temp.coverage(p_key text default 'synthetic-coverage') returns jsonb language sql stable as $$select jsonb_build_object('coverage_key',p_key,'title','Synthetic manual-only coverage','provider','mni','operation','petition_submit','api_version','synthetic-v1','environment','homologation','institution_reference','SYNTHETIC-INSTITUTION','court','Synthetic court','degree','first','channel','Synthetic channel','documentation_url','https://example.invalid/operation','checked_on',pg_temp.today(),'permission_document_id',pg_temp.lid('general'),'valid_from',pg_temp.today()-1,'valid_until',pg_temp.today()+30,'limitations','No external adapter or legal transmission enabled','permission_state','documented')$$;
create function pg_temp.package(p_key text default 'synthetic-specialty') returns jsonb language sql stable as $$select jsonb_build_object('package_key',p_key,'title','Synthetic organizational package','specialty','Pilot organization only','purpose','Organize manual evidence work','scope','No legal conclusion or deadline','source_url','https://example.invalid/package','checked_on',pg_temp.today(),'validity_note','Organizational version only','limitations','Independent legal review remains required','body',jsonb_build_object('stages',jsonb_build_array(jsonb_build_object('key','intake','label','Gather information')),'checklist',jsonb_build_array(jsonb_build_object('key','evidence','title','Conferir prova','description','Manual organizational task only','category','restricted','required',true)),'task_templates',jsonb_build_array(jsonb_build_object('key','review','title','Review selected source','description','No date inferred','category','restricted'))))$$;
create function pg_temp.succession(p_empty boolean default false) returns jsonb language sql stable as $$select jsonb_build_object('succession_key',case when p_empty then 'incomplete' else 'synthetic-succession' end,'title','Synthetic succession dossier','deceased_party_id',pg_temp.lid('party'),'death_on',case when p_empty then null else pg_temp.today()-5 end,'death_document_id',case when p_empty then null else pg_temp.lid('general') end,'assets_status','unknown','dependency_status','unknown','payment_location','unknown','notes','Declared facts, no powers or distribution inferred','persons',case when p_empty then '[]'::jsonb else jsonb_build_array(jsonb_build_object('party_id',pg_temp.lid('party2'),'claimed_capacity','heir','capacity_note','Declared only','evidence_document_ids',jsonb_build_array(pg_temp.lid('general')),'representation_id',pg_temp.lid('representation'),'pending_note','No adjudication or ownership inferred')) end)$$;
create function pg_temp.diligence(p_key text default 'synthetic-diligence',p_category text default 'restricted') returns jsonb language sql stable as $$select jsonb_build_object('diligence_key',p_key,'category',p_category,'title','Synthetic individual diligence','instructions','Read only these released instructions and provide the requested evidence. No petition authorized.','supervisor_id',pg_temp.lid('owner'),'substitute_id',pg_temp.lid('member'),'due_at',pg_temp.iso(clock_timestamp()+interval '1 day'),'expires_at',pg_temp.iso(clock_timestamp()+interval '2 days'),'source_document_ids',jsonb_build_array(pg_temp.lid('general')))$$;
select pg_temp.assert_true(public.legal_expansion_context(pg_temp.lid('case'))->'external_execution_enabled'='false'::jsonb,'F8 never enables external legal execution');
select pg_temp.expect_error($q$select * from public.legal_succession_versions$q$,'42501','private succession content has no direct browser SELECT');
select pg_temp.expect_error($q$select public._legal_expansion_succession_snapshot(gen_random_uuid(),pg_temp.lid('owner'))$q$,'42501','explicit-actor helpers are private');
select pg_temp.login('member');select pg_temp.expect_error($q$select public.legal_operation_create_coverage(pg_temp.coverage())$q$,'42501','editor cannot configure institutional coverage');select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_operation_create_coverage(pg_temp.coverage()||'{"adapter_state":"implemented","active":true}')$q$,'22023','browser cannot assert supported adapter or active operation');
select pg_temp.expect_error($q$select public.legal_operation_create_coverage(pg_temp.coverage()||'{"provider":"domicilio"}')$q$,'22023','provider-operation coverage cannot be conflated');
update legal_test_ids set id=(public.legal_operation_create_coverage(pg_temp.coverage())->>'id')::uuid where name='coverage';
select public.legal_operation_review_coverage(pg_temp.lid('coverage'),'reviewed','Synthetic operation permission documentation reviewed');
select pg_temp.assert_true(public.legal_operation_read_coverage(pg_temp.lid('coverage'))->'connection'->'active'='false'::jsonb,'reviewed permission is not implemented integration');
select public.legal_operation_record_homologation(pg_temp.lid('coverage'),jsonb_build_object('scenario','Synthetic negative and positive manual case','result','passed','evidence_document_id',pg_temp.lid('general'),'tested_on',pg_temp.today(),'note','No provider called; evidence is synthetic'));
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.expect_error($q$select public.legal_operation_service_configure(pg_temp.lid('owner'),pg_temp.lid('tenant_b'),'synthetic-account','SYNTHETIC-INSTITUTION','homologation',pg_temp.lid('coverage'),true)$q$,'42501','physical server tenant binding cannot be forged');
insert into legal_test_results values('binding',public.legal_operation_service_configure(pg_temp.lid('owner'),pg_temp.lid('tenant_a'),'synthetic-account','SYNTHETIC-INSTITUTION','homologation',pg_temp.lid('coverage'),true));
select pg_temp.assert_true((select result->>'state'='adapter_unimplemented' and result->'active'='false'::jsonb and result->'adapter_implemented'='false'::jsonb from legal_test_results where name='binding'),'credential metadata and test proof cannot invent executable adapter');
reset role;set local role authenticated;select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_specialty_create_version(jsonb_set(pg_temp.package(),'{body,task_templates,0,legal_days}','5'))$q$,'22023','package cannot install automatic legal deadline fields');
select pg_temp.expect_error($q$select public.legal_specialty_create_version(jsonb_set(pg_temp.package(),'{body,task_templates,0,key}','"evidence"'))$q$,'22023','organizational keys are unique across groups');
update legal_test_ids set id=(public.legal_specialty_create_version(pg_temp.package())->>'id')::uuid where name='package';
select pg_temp.assert_true(public.legal_specialty_preview(pg_temp.lid('case'),pg_temp.lid('package'))->'can_apply'='false'::jsonb,'draft package cannot be installed');
select public.legal_specialty_review(pg_temp.lid('package'),'reviewed','Organizational package checked, no legal approvals included');
select pg_temp.login('finance');select pg_temp.assert_true(public.legal_specialty_preview(pg_temp.lid('case'),pg_temp.lid('package'))->'can_apply'='false'::jsonb,'fiscal-only editor cannot install restricted items');select pg_temp.login('owner');
insert into legal_test_results values('preview',public.legal_specialty_preview(pg_temp.lid('case'),pg_temp.lid('package')));
select pg_temp.expect_error($q$select public.legal_specialty_apply(pg_temp.lid('case'),pg_temp.lid('package'),repeat('0',64),gen_random_uuid())$q$,'22023','installation requires the exact reviewed preview hash');
insert into legal_test_results values('installation',public.legal_specialty_apply(pg_temp.lid('case'),pg_temp.lid('package'),(select result->>'preview_hash' from legal_test_results where name='preview'),pg_temp.lid('f8_key')));
update legal_test_ids set id=(select (result->>'installation_id')::uuid from legal_test_results where name='installation') where name='installation';
select pg_temp.assert_true((select jsonb_array_length(result->'items')=3 from legal_test_results where name='installation'),'package installs three organizational items, no approved legal objects');
select pg_temp.assert_true(public.legal_specialty_apply(pg_temp.lid('case'),pg_temp.lid('package'),'old-preview',pg_temp.lid('f8_key'))->'already_applied'='true'::jsonb,'retry returns the preserved installation idempotently');
select pg_temp.login('finance');select pg_temp.assert_true(jsonb_array_length(public.legal_specialty_preview(pg_temp.lid('case'),pg_temp.lid('package'))->'conflicts')=1,'package preview hides medical/fiscal restricted case item history outside caller ACL');select pg_temp.login('owner');
reset role;update legal_test_ids set id=(select id from public.legal_specialty_items where installation_id=pg_temp.lid('installation') and kind='task_template') where name='package_task';set local role authenticated;select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_specialty_create_task(pg_temp.lid('package_task'),clock_timestamp()+interval '1 day',pg_temp.lid('finance'))$q$,'22023','restricted task cannot be assigned to fiscal-only colleague');
insert into legal_test_results values('task',public.legal_specialty_create_task(pg_temp.lid('package_task'),clock_timestamp()+interval '1 day',pg_temp.lid('member')));
select pg_temp.login('finance');select pg_temp.assert_true(not exists(select 1 from public.legal_case_tasks where id=(select (result->>'id')::uuid from legal_test_results where name='task')),'F2 task RLS preserves restricted organizational category');select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_representation(pg_temp.lid('case'),jsonb_build_object('representative_party_id',pg_temp.lid('party2'),'basis','court_order','evidence_document_id',pg_temp.lid('general'),'valid_from',pg_temp.iso(clock_timestamp()-interval '1 day'),'valid_until',pg_temp.iso(clock_timestamp()+interval '3 days')))).id where name='representation';
select public.legal_activate_representation(pg_temp.lid('representation'),'Synthetic representation evidence checked; no broader F3 scope');
update legal_test_ids set id=(public.legal_succession_create_version(pg_temp.lid('case'),pg_temp.succession(true))->>'id')::uuid where name='succession_empty';
select public.legal_succession_submit(pg_temp.lid('succession_empty'));
select pg_temp.expect_error($q$select public.legal_succession_review(pg_temp.lid('succession_empty'),'reviewed','Missing evidence cannot confer review completion')$q$,'22023','death report without certificate/person proof remains incomplete');
update legal_test_ids set id=(public.legal_succession_create_version(pg_temp.lid('case'),pg_temp.succession())->>'id')::uuid where name='succession';
select pg_temp.assert_true(public.legal_succession_read(pg_temp.lid('succession'))->'version'->>'assets_status'='unknown','unknown assets remain unknown after documentary creation');
select pg_temp.login('finance');select pg_temp.expect_error($q$select public.legal_succession_read(pg_temp.lid('succession'))$q$,'42501','succession dossier requires both category grants');select pg_temp.login('owner');
select public.legal_succession_submit(pg_temp.lid('succession'));select public.legal_succession_review(pg_temp.lid('succession'),'reviewed','Dossier evidence checked; no habilitation or payment inferred');
update legal_test_ids set id=(public.legal_succession_read(pg_temp.lid('succession'))->'persons'->0->>'id')::uuid where name='succession_person';
select public.legal_succession_record_authority(pg_temp.lid('succession'),jsonb_build_object('person_id',pg_temp.lid('succession_person'),'representation_id',null,'operation','payment_request','evidence_document_ids','[]'::jsonb,'basis_note','Missing specific powers','scope_note','No payment authority recorded','valid_from',null,'valid_until',null,'decision','insufficient'));
update legal_test_ids set id=(public.legal_succession_record_authority(pg_temp.lid('succession'),jsonb_build_object('person_id',pg_temp.lid('succession_person'),'representation_id',pg_temp.lid('representation'),'operation','judicial_representation','evidence_document_ids',jsonb_build_array(pg_temp.lid('general')),'basis_note','Synthetic operation-specific review only','scope_note','This reviewed judicial operation, no money grant','valid_from',pg_temp.iso(clock_timestamp()-interval '1 hour'),'valid_until',pg_temp.iso(clock_timestamp()+interval '1 day'),'decision','reviewed'))->>'id')::uuid where name='authority';
select pg_temp.assert_true((select scopes=array['document_upload']::text[] from public.legal_representations where id=pg_temp.lid('representation')),'successor authority review does not enlarge F3 scopes');
select pg_temp.expect_error($q$select public.legal_succession_record_event(pg_temp.lid('succession'),jsonb_build_object('event_kind','habilitation_decided','occurred_on',pg_temp.today(),'description','No documentary decision'))$q$,'22023','judicial habilitation cannot be invented without proof');
select pg_temp.expect_error($q$select public.legal_succession_record_event(pg_temp.lid('succession'),jsonb_build_object('event_kind','note','occurred_on',pg_temp.today()+1,'description','Future event'))$q$,'22023','effective succession facts cannot be future dated');
select public.legal_succession_record_event(pg_temp.lid('succession'),jsonb_build_object('event_kind','appointment','occurred_on',pg_temp.today(),'document_id',pg_temp.lid('general'),'description','Synthetic appointment externally documented; no automatic portal grant'));
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'general','Synthetic final artifact','final.pdf','application/pdf',10)).id where name='act_doc';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'general','Synthetic signature verification','signature.pdf','application/pdf',10)).id where name='signature_doc';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'general','Synthetic external receipt','receipt.pdf','application/pdf',10)).id where name='receipt_doc';
reset role;select pg_temp.login('owner','service_role');insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}' from public.legal_case_documents where id in (pg_temp.lid('act_doc'),pg_temp.lid('signature_doc'),pg_temp.lid('receipt_doc'));set local role service_role;
select public.legal_finalize_document(id,encode(sha256(convert_to(id::text,'UTF8')),'hex')) from public.legal_case_documents where id in (pg_temp.lid('act_doc'),pg_temp.lid('signature_doc'),pg_temp.lid('receipt_doc'));
reset role;set local role authenticated;select pg_temp.login('owner');
create function pg_temp.act(p_key text default 'synthetic-act') returns jsonb language sql stable as $$select jsonb_build_object('act_key',p_key,'category','restricted','title','Synthetic manual act preparation','act_kind','petition','coverage_version_id',pg_temp.lid('coverage'),'recipient','Synthetic recipient','channel','Synthetic channel','representation_id',pg_temp.lid('representation'),'succession_authority_id',pg_temp.lid('authority'),'final_document_id',pg_temp.lid('act_doc'),'signature_evidence_document_id',pg_temp.lid('signature_doc'),'source_document_ids',jsonb_build_array(pg_temp.lid('general')),'purpose','Prepare and record a manually evidenced external occurrence','authority_basis','Nominal operation-specific review, no authority inferred from F3 scope','checks',jsonb_build_object('documents_complete',true,'recipient_verified',true,'representation_reviewed',true,'signature_checked',true,'channel_authorized',true,'legal_consequences_reviewed',true))$$;
select pg_temp.expect_error($q$select public.legal_external_act_create_version(pg_temp.lid('case'),pg_temp.act()||'{"sent":true}')$q$,'22023','act payload cannot pretend app transmission');
update legal_test_ids set id=(public.legal_external_act_create_version(pg_temp.lid('case'),pg_temp.act())->>'id')::uuid where name='act';
select pg_temp.expect_error($q$select public.legal_external_act_prepare_attempt(pg_temp.lid('act'),gen_random_uuid(),'No nominal review yet')$q$,'22023','draft act cannot become a manual attempt');
select public.legal_external_act_submit(pg_temp.lid('act'));select public.legal_external_act_review(pg_temp.lid('act'),'ready','Synthetic recipient, signatures and operation reviewed; no app transmission');
update legal_test_ids set id=(public.legal_external_act_prepare_attempt(pg_temp.lid('act'),gen_random_uuid(),'Manual handling to occur only outside the app')->>'id')::uuid where name='attempt';
select public.legal_external_act_report_attempt(pg_temp.lid('attempt'),'unknown','Synthetic external outcome unknown');
select pg_temp.assert_true(public.legal_external_act_read(pg_temp.lid('act'))->'attempt_blockers' ? 'pending_attempt','read projection identifies pending attempt across the act series');
select pg_temp.expect_error($q$select public.legal_external_act_prepare_attempt(pg_temp.lid('act'),gen_random_uuid(),'Duplicate retry blocked')$q$,'22023','ambiguous occurrence blocks a second attempt');
select pg_temp.expect_error($q$select public.legal_external_act_report_attempt(pg_temp.lid('attempt'),'not_sent','Cannot clear ambiguity without proof')$q$,'22023','ambiguity requires documentary reconciliation');
update legal_test_ids set id=(public.legal_external_act_record_receipt(pg_temp.lid('attempt'),jsonb_build_object('document_id',pg_temp.lid('receipt_doc'),'external_reference','SYNTHETIC-RECEIPT-1','recipient','Synthetic recipient','channel','Synthetic channel','occurred_on',pg_temp.today(),'outcome','protocol','description','Synthetic external receipt only; not submitted by this app'))->>'id')::uuid where name='receipt';
select pg_temp.assert_true(public.legal_external_act_read(pg_temp.lid('act'))->'receipts'->0->>'state'='submitted','uploaded receipt does not automatically confirm occurrence');
select pg_temp.expect_error($q$select public.legal_external_act_reconcile(pg_temp.lid('receipt'),'reviewed','{}','No checks')$q$,'22023','nominal checks required before receipt reconciliation');
select public.legal_external_act_reconcile(pg_temp.lid('receipt'),'reviewed','{"reference_matches":true,"recipient_matches":true,"channel_matches":true,"document_compared":true,"occurrence_confirmed":true}','Synthetic original identifiers compared; external occurrence recorded');
select pg_temp.assert_true(public.legal_external_act_read(pg_temp.lid('act'))->'attempts'->0->>'state'='reconciled','reviewed external receipt is reconciled without app-send claim');
select pg_temp.assert_true(jsonb_array_length(public.legal_external_act_read(pg_temp.lid('act'))->'attempts'->0->'reports')=3,'preparation, ambiguous report and reconciliation keep separate immutable audit rows');
select pg_temp.assert_true(public.legal_external_act_read(pg_temp.lid('act'))->'attempt_blockers' ? 'confirmed_receipt' and public.legal_external_act_read(pg_temp.lid('act'))->'can_prepare_attempt'='false'::jsonb,'confirmed protocol blocks repetition without claiming an app transmission');
select pg_temp.expect_error($q$select public.legal_external_act_prepare_attempt(pg_temp.lid('act'),gen_random_uuid(),'Already confirmed protocol cannot repeat')$q$,'22023','confirmed external act cannot acquire a new attempt under the same key');
update legal_test_ids set id=(public.legal_diligence_create_version(pg_temp.lid('case'),pg_temp.diligence())->>'id')::uuid where name='diligence';
select pg_temp.expect_error($q$select public.legal_diligence_create_invite(pg_temp.lid('diligence'),jsonb_build_object('email','external@example.invalid','scopes',array['instruction:read'],'expires_at',pg_temp.iso(clock_timestamp()+interval '1 day')))$q$,'22023','unreviewed instructions cannot be granted externally');
select public.legal_diligence_review(pg_temp.lid('diligence'),'approved','Only this instruction and selected general proof were reviewed for this restricted diligence');
select pg_temp.expect_error($q$select public.legal_diligence_create_invite(pg_temp.lid('diligence'),jsonb_build_object('email','external@example.invalid','scopes',array['case_summary:read'],'expires_at',pg_temp.iso(clock_timestamp()+interval '1 day')))$q$,'22023','diligence scope cannot expand into full-case membership');
update legal_test_ids set id=(public.legal_diligence_create_invite(pg_temp.lid('diligence'),jsonb_build_object('email','diligence-'||pg_temp.lid('external')||'@example.invalid','scopes',array['instruction:read','files:read','delivery:upload','message:write'],'expires_at',pg_temp.iso(clock_timestamp()+interval '1 day')))->>'id')::uuid where name='diligence_invite';
select public.legal_diligence_review_invite(pg_temp.lid('diligence_invite'),'approved',pg_temp.lid('general'),'Synthetic identity/contact separately reviewed');
select pg_temp.expect_error($q$select public.legal_diligence_service_reserve(pg_temp.lid('owner'),pg_temp.lid('diligence_invite'),pg_temp.lid('external'),gen_random_uuid())$q$,'42501','browser cannot provision external Auth identity');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
update legal_test_ids set id=(public.legal_diligence_service_reserve(pg_temp.lid('owner'),pg_temp.lid('diligence_invite'),pg_temp.lid('external'),pg_temp.lid('f8_key'))->>'id')::uuid where name='diligence_provision';
select pg_temp.assert_true(public.legal_diligence_service_reserve(pg_temp.lid('owner'),pg_temp.lid('diligence_invite'),gen_random_uuid(),pg_temp.lid('f8_key'))->>'auth_user_id'=pg_temp.lid('external')::text,'retry returns the existing server reserved UUID');
select pg_temp.expect_error($q$select public.legal_portal_service_complete_provision(pg_temp.lid('owner'),pg_temp.lid('diligence_provision'))$q$,'42501','F5 case endpoint rejects diligence provisioning destination');
reset role;insert into auth.users(id,email,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at,created_at,updated_at) values(pg_temp.lid('external'),'diligence-'||pg_temp.lid('external')||'@example.invalid','authenticated','{}','{}',now(),now(),now());
select pg_temp.assert_true((select role='legal_portal' and raw_app_meta_data->>'legal_portal'='true' from auth.users where id=pg_temp.lid('external')) and not exists(select 1 from public.profiles where id=pg_temp.lid('external')),'reserved external insert never creates staff profile or internal role');
set local role service_role;select pg_temp.login('owner','service_role');
select public.legal_diligence_service_complete_provision(pg_temp.lid('owner'),pg_temp.lid('diligence_provision'));
insert into legal_test_results values('issued',public.legal_diligence_service_issue(pg_temp.lid('owner'),pg_temp.lid('diligence_invite'),encode(sha256(convert_to('synthetic-first-token','UTF8')),'hex')));
select pg_temp.assert_true((select not(result?'auth_user_id') and not(result?'email') and not(result?'token') from legal_test_results where name='issued'),'staff gets only invitation metadata, never recipient Auth credentials');
select public.legal_diligence_service_issue(pg_temp.lid('owner'),pg_temp.lid('diligence_invite'),encode(sha256(convert_to('synthetic-second-token','UTF8')),'hex'));
select pg_temp.assert_true(public.legal_diligence_service_inspect(encode(sha256(convert_to('synthetic-first-token','UTF8')),'hex'))->'available'='false'::jsonb,'rotated invite token is immediately unavailable');
select pg_temp.expect_error($q$select public.legal_diligence_service_accept(pg_temp.lid('outsider'),encode(sha256(convert_to('synthetic-second-token','UTF8')),'hex'))$q$,'42501','invitation is not usable by another authenticated identity');
update legal_test_ids set id=(public.legal_diligence_service_accept(pg_temp.lid('external'),encode(sha256(convert_to('synthetic-second-token','UTF8')),'hex'))->>'grant_id')::uuid where name='diligence_grant';
select pg_temp.assert_true((select count(*)=0 from public.legal_portal_memberships where identity_id=pg_temp.lid('external')),'accepting diligence creates no case membership');
select pg_temp.assert_true(public.legal_portal_service_cases(pg_temp.lid('external'))='[]'::jsonb,'F5 case list stays empty for a diligence-only identity');
select pg_temp.assert_true(jsonb_array_length(public.legal_diligence_service_context(pg_temp.lid('external'))->'diligences')=1,'external identity sees exactly its individual diligence');
select pg_temp.assert_true(jsonb_array_length(public.legal_diligence_service_read(pg_temp.lid('external'),pg_temp.lid('diligence_grant'))->'documents')=1,'external projection includes only one specifically released original');
select pg_temp.expect_error($q$select public.legal_diligence_service_download(pg_temp.lid('external'),pg_temp.lid('diligence_grant'),pg_temp.lid('medical'))$q$,'42501','arbitrary unreleased same-case file remains private');
select pg_temp.expect_error($q$select public.legal_diligence_service_prepare_upload(pg_temp.lid('external'),pg_temp.lid('diligence_grant'),jsonb_build_object('category','general','file_name','downgrade.pdf','mime_type','application/pdf','size_bytes',10,'description','Cannot downgrade restricted origin','idempotency_key',gen_random_uuid()))$q$,'22023','external recipient cannot classify a restricted delivery as general');
insert into legal_test_results values('upload',public.legal_diligence_service_prepare_upload(pg_temp.lid('external'),pg_temp.lid('diligence_grant'),jsonb_build_object('category','medical','file_name','synthetic-delivery.pdf','mime_type','application/pdf','size_bytes',10,'description','Synthetic external delivery requiring human review','idempotency_key',pg_temp.lid('f8_upload_key'))));
update legal_test_ids set id=(select (result->>'delivery_id')::uuid from legal_test_results where name='upload') where name='diligence_delivery';update legal_test_ids set id=(select (result->'document'->>'id')::uuid from legal_test_results where name='upload') where name='diligence_upload';
reset role;insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}' from public.legal_case_documents where id=pg_temp.lid('diligence_upload');set local role service_role;
select public.legal_diligence_service_finalize_upload(pg_temp.lid('external'),pg_temp.lid('diligence_delivery'),repeat('e',64));
select pg_temp.assert_true((select status='diligence_restricted' and sha256=repeat('e',64) from public.legal_case_documents where id=pg_temp.lid('diligence_upload')),'restricted delivery is stored outside legacy ready pipeline');
select pg_temp.assert_true(public.legal_diligence_service_abandon_upload(pg_temp.lid('external'),pg_temp.lid('diligence_delivery'))->'cleanup_allowed'='false'::jsonb,'ambiguous client retry cannot erase confirmed restricted bytes');
select pg_temp.expect_error($q$select public.legal_finalize_document(pg_temp.lid('diligence_upload'),repeat('e',64))$q$,'42501','F1 finalizer cannot promote restricted delivery into ordinary ready documents');
select pg_temp.assert_true(public.legal_diligence_service_download(pg_temp.lid('external'),pg_temp.lid('diligence_grant'),pg_temp.lid('diligence_upload'))->>'sha256'=repeat('e',64),'external actor can retrieve own restricted delivery under current individual grant');
select pg_temp.expect_error($q$select public.legal_diligence_staff_download(pg_temp.lid('finance'),pg_temp.lid('diligence'),pg_temp.lid('diligence_upload'))$q$,'42501','fiscal-only staff cannot retrieve restricted diligence bytes');
select pg_temp.assert_true(public.legal_diligence_staff_download(pg_temp.lid('owner'),pg_temp.lid('diligence'),pg_temp.lid('diligence_upload'))->>'sha256'=repeat('e',64),'current dual-authorized staff can retrieve restricted bytes');
reset role;set local role authenticated;select pg_temp.login('finance');
select pg_temp.assert_true(not exists(select 1 from public.legal_case_documents where id=pg_temp.lid('diligence_upload')),'raw F1 document metadata does not leak restricted delivery to single-category staff');
select pg_temp.expect_error($q$select public.legal_diligence_read(pg_temp.lid('diligence'))$q$,'42501','internal diligence metadata also preserves dual ACL');
select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_record_document_download(pg_temp.lid('diligence_upload'))$q$,'42501','ordinary F1 download path cannot bypass isolated delivery');
select pg_temp.expect_error($q$select public.legal_text_create_version(pg_temp.lid('diligence_upload'),'{"mode":"manual","pages_total":1,"note":"No legacy derivation","pages":[{"page_number":1,"text":"Restricted origin"}]}')$q$,'42501','F7 cannot derive single-category OCR/transcription from restricted delivery');
select pg_temp.expect_error($q$select public.legal_create_representation(pg_temp.lid('case'),jsonb_build_object('representative_party_id',pg_temp.lid('party2'),'basis','court_order','evidence_document_id',pg_temp.lid('diligence_upload')))$q$,'22023','F3 cannot treat isolated delivery as ordinary ready representation evidence');
select public.legal_diligence_review_delivery(pg_temp.lid('diligence_delivery'),'reviewed','Synthetic bytes reviewed; delivery does not imply judicial act');
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,true,false);
select pg_temp.login('member');select pg_temp.assert_true(not exists(select 1 from public.legal_case_documents where id=pg_temp.lid('diligence_upload')),'medical-only reader cannot read medical metadata from restricted-origin delivery');
select pg_temp.expect_error($q$select public.legal_diligence_read(pg_temp.lid('diligence'))$q$,'42501','medical-only colleague cannot read restricted delivery instructions');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.expect_error($q$select public.legal_diligence_staff_download(pg_temp.lid('member'),pg_temp.lid('diligence'),pg_temp.lid('diligence_upload'))$q$,'42501','medical-only staff cannot bypass restricted origin with service download');
reset role;set local role authenticated;select pg_temp.login('owner');select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,true,true);
update legal_test_ids set id=(public.legal_create_portal_invite(pg_temp.lid('case'),jsonb_build_object('party_id',pg_temp.lid('party'),'email','f5-'||pg_temp.lid('accountant')||'@example.invalid','access_kind','client','scopes',array['case_summary:read'],'public_title','Synthetic case access distinct from diligence','purpose','Prove reservation destination separation','expires_at',pg_temp.iso(clock_timestamp()+interval '1 day')))).id where name='invite';
select public.legal_review_portal_invite(pg_temp.lid('invite'),'approved','Synthetic identity separately reviewed','documented_review',pg_temp.lid('general'));
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.expect_error($q$select public.legal_portal_service_reserve(pg_temp.lid('owner'),pg_temp.lid('invite'),gen_random_uuid(),pg_temp.lid('f8_key'))$q$,'22023','case invitation cannot reuse a diligence provisioning idempotency destination');
update legal_test_ids set id=(public.legal_portal_service_reserve(pg_temp.lid('owner'),pg_temp.lid('invite'),pg_temp.lid('accountant'),gen_random_uuid())->>'id')::uuid where name='provision_acc';
select pg_temp.expect_error($q$select public.legal_diligence_service_complete_provision(pg_temp.lid('owner'),pg_temp.lid('provision_acc'))$q$,'42501','diligence complete endpoint rejects a case-portal reservation');
reset role;set local role authenticated;select pg_temp.login('owner');

-- F8_EXPANSION_CONCURRENCY_FIXTURE_READY
select public.legal_diligence_revoke_invite(pg_temp.lid('diligence_invite'),'Synthetic access revocation');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.expect_error($q$select public.legal_diligence_service_read(pg_temp.lid('external'),pg_temp.lid('diligence_grant'))$q$,'42501','same external session loses access after grant revocation');
select pg_temp.assert_true(public.legal_diligence_service_context(pg_temp.lid('external'))->'diligences'='[]'::jsonb,'revoked external grants disappear without deleting history');
reset role;set local role authenticated;select pg_temp.login('owner');
select public.legal_revoke_representation(pg_temp.lid('representation'),'Synthetic representation revoked');
select pg_temp.assert_true(public.legal_succession_read(pg_temp.lid('succession'))->'is_current'='false'::jsonb,'representation revocation makes prior dossier review stale');
select pg_temp.assert_true(public.legal_external_act_read(pg_temp.lid('act'))->'is_current'='false'::jsonb,'operation authority changes invalidate further prepared acts');
select pg_temp.login('outsider');select pg_temp.expect_error($q$select public.legal_expansion_context(pg_temp.lid('case'))$q$,'42501','platform tenant selection cannot cross actual tenant boundary');
reset role;grant select on legal_test_ids to legal_portal;set local role legal_portal;select pg_temp.login('external','legal_portal');select pg_temp.expect_error($q$select public.legal_expansion_context(pg_temp.lid('case'))$q$,'42501','external Auth role cannot invoke internal expansion RPC');
reset role;
-- Fill quota using only synthetic metadata. A quarantined restricted delivery consumes bytes too.
do $$declare remaining bigint;d public.legal_case_documents;n integer:=0;begin
 select 209715200-coalesce(sum(size_bytes),0) into remaining from public.legal_case_documents where case_id=pg_temp.lid('case') and status in ('prepared','ready','diligence_restricted');
 while remaining>0 loop n:=n+1;d.id:=gen_random_uuid();insert into public.legal_case_documents(id,tenant_id,case_id,category,display_name,file_name,mime_type,size_bytes,storage_path,uploaded_by) values(d.id,pg_temp.lid('tenant_a'),pg_temp.lid('case'),'general','Synthetic quota','quota.txt','text/plain',least(remaining,10485760),pg_temp.lid('tenant_a')||'/'||pg_temp.lid('case')||'/'||d.id,pg_temp.lid('owner'));remaining:=remaining-least(remaining,10485760);end loop;
end;$$;
set local role authenticated;select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_prepare_document(pg_temp.lid('case'),'general','One byte above inclusive quota','overflow.txt','text/plain',1)$q$,'22023','quarantined restricted bytes remain included in the F1 case quota');
reset role;select 'F8 specialized operations regression PASS' as result;rollback;
