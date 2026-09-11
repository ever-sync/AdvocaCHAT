-- F3 integration regression. Run ONLY in a disposable/local or isolated staging
-- database after migrations, with postgres privileges. Synthetic data rolls back.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/ir_assisted_dossier.sql
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

insert into legal_test_ids(name) values('case2'),('payer'),('payer2'),('source'),('salary'),('medical_event'),('protocol'),('review'),('rule'),('rule2'),('checklist'),('item_medical'),('item_fiscal'),('req_medical'),('req_fiscal'),('assessment1'),('assessment2'),('assessment3'),('doc_medical'),('doc_general'),('doc_other_case'),('party'),('rep'),('rep_expired'),('req_rep'),('rep_upload'),('rep_doc'),('poa'),('poa_version'),('rep_poa'),('race_request'),('race_document'),('rule3');
create function pg_temp.proposals() returns jsonb language sql stable as $$
 select jsonb_agg(jsonb_build_object('source_id',id,'proposal','needs_review','rule_version_ids','[]'::jsonb,'evidence_event_ids','[]'::jsonb,'document_ids','[]'::jsonb,'reasoning','Análise profissional ainda pendente') order by id) from public.ir_income_sources where case_id=pg_temp.lid('case');
$$;

set local role authenticated;
select pg_temp.login('owner');
select public.legal_set_workspace_enabled(true);
update legal_test_ids set id=(public.legal_create_case('F3 synthetic IR dossier')).id where name='case';
update legal_test_ids set id=(public.legal_create_case('Another isolated case')).id where name='case2';
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,true,false);
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('finance'),true,false,true);
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->'control'->>'input_revision'='0','empty dossier context available without mutation');
update legal_test_ids set id=(public.ir_save_payer(pg_temp.lid('case'),'{"name":"Synthetic payer","payer_type":"inss"}')).id where name='payer';
update legal_test_ids set id=(public.ir_save_payer(pg_temp.lid('case2'),'{"name":"Other payer","payer_type":"employer"}')).id where name='payer2';
update legal_test_ids set id=(public.ir_save_income_source(pg_temp.lid('case'),jsonb_build_object('payer_id',pg_temp.lid('payer'),'income_kind','retirement','regime','rgps','benefit_start_date','2020-01-01'))).id where name='source';
update legal_test_ids set id=(public.ir_save_income_source(pg_temp.lid('case'),jsonb_build_object('payer_id',pg_temp.lid('payer'),'income_kind','salary'))).id where name='salary';
select pg_temp.assert_true((select count(*) from public.ir_income_sources where case_id=pg_temp.lid('case'))=2,'retirement and salary coexist without automatic exemption');
select pg_temp.assert_true((select product_type='unknown' and pension_kind='unknown' and income_event='unknown' from public.ir_income_sources where id=pg_temp.lid('source')),'unknown legal classifications remain explicit');
select pg_temp.expect_error($q$select public.ir_save_income_source(pg_temp.lid('case'),jsonb_build_object('payer_id',pg_temp.lid('payer2'),'income_kind','salary'))$q$,'22023','payer cannot cross case boundary');
select pg_temp.expect_error($q$select public.ir_save_payer(pg_temp.lid('case'),'{"name":"bypass","payer_type":"inss","tenant_id":"forbidden"}')$q$,'22023','payer fields narrowly whitelisted');
select pg_temp.expect_error($q$update public.ir_income_sources set income_kind='retirement'$q$,'42501','income direct mutation denied');
select pg_temp.expect_error($q$delete from public.ir_fact_revisions$q$,'42501','fact revision history cannot be erased');

update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'medical','Restricted report','report.pdf','application/pdf',10)).id where name='doc_medical';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'general','Representation evidence','mandate.pdf','application/pdf',10)).id where name='doc_general';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'fiscal','Income statement','income.pdf','application/pdf',10)).id where name='fiscal';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case2'),'medical','Other case report','other.pdf','application/pdf',10)).id where name='doc_other_case';
select pg_temp.expect_error($q$select public.ir_record_document_review(pg_temp.lid('doc_medical'),'{}','pending','Needs review')$q$,'22023','prepared document cannot be reviewed');
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}'::jsonb from public.legal_case_documents where id in(pg_temp.lid('doc_medical'),pg_temp.lid('doc_general'),pg_temp.lid('fiscal'),pg_temp.lid('doc_other_case'));
select pg_temp.login('owner','service_role');
set local role service_role;
select public.legal_finalize_document(id,repeat('1',64)) from public.legal_case_documents where id in(pg_temp.lid('doc_medical'),pg_temp.lid('doc_general'),pg_temp.lid('fiscal'),pg_temp.lid('doc_other_case'));
reset role;
set local role authenticated;
select pg_temp.login('owner');
update legal_test_ids set id=(public.ir_add_evidence_event(pg_temp.lid('case'),jsonb_build_object('category','medical','event_type','disease_onset_reported','event_date','2019-01-01','date_precision','estimated','description','Synthetic confidential onset','document_id',pg_temp.lid('doc_medical'),'source_page',1))).id where name='medical_event';
select public.ir_add_evidence_event(pg_temp.lid('case'),jsonb_build_object('category','medical','event_type','diagnosis_reported','event_date','2020-01-02','date_precision','exact','description','Diagnosis distinct from onset'));
update legal_test_ids set id=(public.ir_add_evidence_event(pg_temp.lid('case'),jsonb_build_object('category','medical','event_type','administrative_protocol','date_precision','unknown','description','Sensitive protocol stays medical','document_id',pg_temp.lid('doc_medical')))).id where name='protocol';
select pg_temp.assert_true((select category='medical' from public.ir_evidence_events where id=pg_temp.lid('protocol')),'protocol preserves caller protected category');
select pg_temp.expect_error($q$select public.ir_add_evidence_event(pg_temp.lid('case'),'{"category":"general","event_type":"disease_onset_reported","description":"bypass"}')$q$,'22023','disease onset cannot be downgraded');
select pg_temp.expect_error($q$select public.ir_add_evidence_event(pg_temp.lid('case'),jsonb_build_object('category','medical','event_type','other','description','wrong case','document_id',pg_temp.lid('doc_other_case')))$q$,'22023','timeline document from another case denied');
select pg_temp.expect_error($q$select public.ir_add_evidence_event(pg_temp.lid('case'),jsonb_build_object('category','medical','event_type','other','description','wrong category','document_id',pg_temp.lid('fiscal')))$q$,'22023','timeline document category must match');
select pg_temp.expect_error($q$update public.ir_evidence_events set description='Rewrite history'$q$,'42501','timeline append-only');
update legal_test_ids set id=(public.ir_record_document_review(pg_temp.lid('doc_medical'),'{"issuer":"present","signature":"unclear","date":"present"}','pending','Professional assessment needed','{"issuer_name":"Synthetic physician","professional_registration":"SYNTHETIC","document_nature":"private","issued_on":"2020-01-02","reported_onset_on":"2019-01-01"}')).id where name='review';
select pg_temp.assert_true((select metadata->>'document_nature'='private' from public.ir_document_reviews where id=pg_temp.lid('review')),'private report recorded without automatic exclusion');
select pg_temp.expect_error($q$select public.ir_record_document_review(pg_temp.lid('fiscal'),'{}','pending','x','{"reported_onset_on":"2020-01-01"}')$q$,'22023','structured health metadata cannot enter fiscal review');
select pg_temp.expect_error($q$select public.ir_record_document_review(pg_temp.lid('doc_medical'),'{"diagnosed":"present"}','sufficient','x')$q$,'22023','review cannot claim unsupported medical diagnosis');
select pg_temp.expect_error($q$select public.ir_record_document_review(pg_temp.lid('doc_medical'),'{"issuer":"yes"}','sufficient','x')$q$,'22023','review check values validated');

select pg_temp.login('member');
select pg_temp.assert_true((select count(*) from public.ir_payers)=0,'medical-only member cannot read fiscal payers');
select pg_temp.assert_true((select count(*) from public.ir_evidence_events)=3,'medical-only member can read authorized timeline');
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->>'latest_assessment_id' is null,'assessment identity hidden without both grants');
select pg_temp.expect_error($q$select public.ir_save_payer(pg_temp.lid('case'),'{"name":"bypass","payer_type":"inss"}')$q$,'42501','medical editor cannot write fiscal source');
select pg_temp.expect_error($q$select public.ir_create_assessment_version(pg_temp.lid('case'),'[]','documents_first','bypass')$q$,'42501','medical-only editor cannot create combined snapshot');
select pg_temp.expect_error($q$select public.ir_record_document_review(pg_temp.lid('doc_medical'),'{}','sufficient','bypass')$q$,'42501','document review requires owner');
select pg_temp.login('finance');
select pg_temp.assert_true((select count(*) from public.ir_income_sources)=2,'fiscal member sees income sources only in own case');
select pg_temp.assert_true((select count(*) from public.ir_evidence_events)=0,'fiscal-only member cannot read medical events');
select pg_temp.assert_true((select count(*) from public.ir_document_reviews)=0,'fiscal-only member cannot read medical metadata');
select pg_temp.expect_error($q$select public.ir_create_assessment_version(pg_temp.lid('case'),pg_temp.proposals(),'documents_first','bypass')$q$,'42501','fiscal-only editor cannot create combined snapshot');
select pg_temp.login('same_admin');
select pg_temp.assert_true((select count(*) from public.ir_payers)=0,'same-tenant admin has no case bypass');
select pg_temp.expect_error($q$select public.ir_get_case_context(pg_temp.lid('case'))$q$,'42501','context has no admin bypass');
select pg_temp.login('outsider');
select pg_temp.assert_true((select count(*) from public.ir_payers)=0,'impersonation cannot read another tenant dossier');
select pg_temp.expect_error($q$select public.ir_save_payer(pg_temp.lid('case'),'{"name":"bypass","payer_type":"inss"}')$q$,'42501','cross-tenant impersonation cannot mutate dossier');

select pg_temp.login('owner');
update legal_test_ids set id=(public.ir_create_rule_version('{"rule_key":"synthetic","title":"Reference for professional review","criteria":"Synthetic rule content, no legal conclusion","scope":{"income_kind":"retirement","validity_note":"Synthetic scope and validity reviewed; no seeded legal conclusion"},"sources":[{"url":"https://www.planalto.gov.br/ccivil_03/leis/l7713.htm","checked_on":"2026-09-11","version_note":"Synthetic reference version"}]}')).id where name='rule';
select pg_temp.assert_true((select status='draft' and approved_by is null from public.ir_rule_versions where id=pg_temp.lid('rule')),'catalog entries are drafts without automatic approval');
select pg_temp.expect_error($q$select public.ir_review_rule_version(pg_temp.lid('rule'),'approved','')$q$,'22023','rule approval requires professional note');
select pg_temp.expect_error($q$select public.ir_create_rule_version('{"rule_key":"bypass","title":"x","criteria":"x","sources":[{"url":"javascript:alert(1)"}]}')$q$,'22023','rule sources require HTTPS');
select pg_temp.expect_error($q$select public.ir_create_assessment_version(pg_temp.lid('case'),jsonb_set(pg_temp.proposals(),'{0,rule_version_ids}',jsonb_build_array(pg_temp.lid('rule'))),'administrative','References draft rule')$q$,'22023','unapproved catalog version cannot support assessment');
select public.ir_review_rule_version(pg_temp.lid('rule'),'approved','Human review performed for synthetic fixture');
update legal_test_ids set id=(public.ir_create_rule_version('{"rule_key":"synthetic","title":"New reference draft","criteria":"Changed draft content","sources":[{"url":"https://www.planalto.gov.br/ccivil_03/leis/l7713.htm"}]}')).id where name='rule2';
select pg_temp.expect_error($q$select public.ir_review_rule_version(pg_temp.lid('rule2'),'approved','Missing validity')$q$,'22023','approval requires explicit source validity');
select pg_temp.assert_true((select version_number=2 and status='draft' from public.ir_rule_versions where id=pg_temp.lid('rule2')),'catalog revision creates distinct draft version');
select pg_temp.expect_error($q$update public.ir_rule_versions set criteria='Mutate approved text'$q$,'42501','approved reference body immutable');
select pg_temp.login('member');
select pg_temp.expect_error($q$select public.ir_review_rule_version(pg_temp.lid('rule2'),'approved','bypass')$q$,'42501','case editor cannot approve workspace legal catalog');
select pg_temp.login('owner');
update legal_test_ids set id=(public.ir_create_checklist_version('{"template_key":"synthetic","title":"Initial evidence","route":"both","payer_types":["inss"],"items":[{"key":"report","title":"Report review","category":"medical","gating_stage":"decision","required":true},{"key":"income","title":"Income report","category":"fiscal","gating_stage":"filing","required":true}]}')).id where name='checklist';
select count(*) from public.ir_apply_checklist(pg_temp.lid('case'),pg_temp.lid('checklist'),pg_temp.lid('payer'));
select count(*) from public.ir_apply_checklist(pg_temp.lid('case'),pg_temp.lid('checklist'),pg_temp.lid('payer'));
select pg_temp.assert_true((select count(*) from public.ir_case_checklist_items where case_id=pg_temp.lid('case'))=2,'reapplying same checklist is idempotent');
update legal_test_ids set id=(select id from public.ir_case_checklist_items where item_key='report') where name='item_medical';
update legal_test_ids set id=(select id from public.ir_case_checklist_items where item_key='income') where name='item_fiscal';
update legal_test_ids set id=(public.legal_create_document_request(pg_temp.lid('case'),'medical','Requested report')).id where name='req_medical';
update legal_test_ids set id=(public.legal_create_document_request(pg_temp.lid('case'),'fiscal','Requested income report')).id where name='req_fiscal';
select pg_temp.expect_error($q$select public.ir_link_checklist_request(pg_temp.lid('item_medical'),pg_temp.lid('req_fiscal'))$q$,'22023','checklist cannot link wrong category request');
select public.ir_link_checklist_request(pg_temp.lid('item_medical'),pg_temp.lid('req_medical'));
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.ir_get_case_context(pg_temp.lid('case'))->'checklist_states') x where x->>'item_id'=pg_temp.lid('item_medical')::text and x->>'state'='open'),'checklist derives state from actual request');
select public.legal_submit_document_request(pg_temp.lid('req_medical'),pg_temp.lid('doc_medical'));
select public.legal_review_document_request(pg_temp.lid('req_medical'),'approved','Checked');
select public.ir_waive_checklist_item(pg_temp.lid('item_fiscal'),'Professional reason recorded; filing remains separately reviewed');
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.ir_get_case_context(pg_temp.lid('case'))->'checklist_states') x where x->>'state'='waived'),'waiver is distinct from receipt or approval');
select pg_temp.login('member');
select pg_temp.assert_true(jsonb_array_length(public.ir_get_case_context(pg_temp.lid('case'))->'checklist_states')=1,'context omits unauthorized category checklist items');
select pg_temp.expect_error($q$select count(*) from public.ir_apply_checklist(pg_temp.lid('case'),pg_temp.lid('checklist'))$q$,'42501','mixed-category checklist application is atomic and ACL protected');
select pg_temp.expect_error($q$select public.ir_waive_checklist_item(pg_temp.lid('item_medical'),'bypass')$q$,'42501','waiver requires owner');

-- Combined medical/fiscal assessment requires both grants, complete source
-- coverage, immutable inputs and an explicit owner decision for every source.
select pg_temp.login('owner');
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,true,true);
select pg_temp.login('member');
update legal_test_ids set id=(public.ir_create_assessment_version(pg_temp.lid('case'),pg_temp.proposals(),'documents_first','Pending professional assessment')).id where name='assessment1';
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->'control'->>'workflow_status'='incomplete','needs_review keeps dossier incomplete');
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->>'assessment_is_current'='true','server snapshot starts current');
select pg_temp.assert_true((select jsonb_array_length(snapshot->'income_sources')=2 and length(input_hash)=64 from public.ir_assessment_versions where id=pg_temp.lid('assessment1')),'snapshot contains both income sources and SHA256');
select pg_temp.expect_error($q$select public.ir_create_assessment_version(pg_temp.lid('case'),jsonb_build_array(pg_temp.proposals()->0),'documents_first','Missing source')$q$,'22023','assessment must cover every source exactly once');
select pg_temp.expect_error($q$select public.ir_create_assessment_version(pg_temp.lid('case'),jsonb_set(pg_temp.proposals(),'{0,proposal}','"proposed_applicable"'),'administrative','Unsupported conclusion')$q$,'22023','proposed conclusion needs approved reference and evidence');
select public.ir_submit_assessment_review(pg_temp.lid('assessment1'));
select pg_temp.expect_error($q$select public.ir_review_assessment(pg_temp.lid('assessment1'),'approved','Editor bypass')$q$,'42501','combined editor cannot approve own assessment');
select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.ir_review_assessment(pg_temp.lid('assessment1'),'approved','Pending source')$q$,'22023','needs_review source cannot become approved decision');
select public.ir_review_assessment(pg_temp.lid('assessment1'),'returned','Obter elementos para cada fonte');
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->'control'->>'workflow_status'='incomplete','returned pending assessment remains incomplete');
select public.ir_save_income_source(pg_temp.lid('case'),'{"notes":"Additional verified fiscal fact"}',pg_temp.lid('source'));
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->>'assessment_is_current'='false','source edit makes snapshot stale');
select pg_temp.expect_error($q$select public.ir_submit_assessment_review(pg_temp.lid('assessment1'))$q$,'22023','stale version cannot enter review');
select pg_temp.assert_true((select count(*) from public.ir_fact_revisions where entity_id=pg_temp.lid('source'))=2,'source edits keep prior fact revision');
create function pg_temp.reviewed_proposals() returns jsonb language sql stable as $$
 select jsonb_agg(jsonb_build_object('source_id',id,'proposal',case when income_kind='salary' then 'proposed_not_applicable' else 'proposed_applicable' end,'rule_version_ids',jsonb_build_array(pg_temp.lid('rule')),'evidence_event_ids',jsonb_build_array(pg_temp.lid('medical_event')),'document_ids',jsonb_build_array(pg_temp.lid('doc_medical')),'reasoning','Synthetic human legal reasoning for this specific source','proposed_start_date','2020-01-01','start_date_reason','Synthetic human proposed date; not calculated') order by id) from public.ir_income_sources where case_id=pg_temp.lid('case');
$$;
select pg_temp.expect_error($q$select public.ir_create_assessment_version(pg_temp.lid('case'),jsonb_set(pg_temp.reviewed_proposals(),'{0,proposed_start_date}','"infinity"'),'administrative','Invalid date')$q$,'22023','proposed date cannot be infinite');
select pg_temp.expect_error($q$select public.ir_save_income_source(pg_temp.lid('case'),'{"benefit_start_date":"01/01/2020"}',pg_temp.lid('source'))$q$,'22023','benefit date requires ISO date');
select pg_temp.expect_error($q$select public.ir_record_document_review(pg_temp.lid('doc_medical'),'{}','pending','x','{"issued_on":"infinity"}')$q$,'22023','document date cannot be infinite');
update legal_test_ids set id=(public.ir_create_assessment_version(pg_temp.lid('case'),pg_temp.reviewed_proposals(),'administrative','Source-specific proposal after professional review')).id where name='assessment2';
select pg_temp.assert_true((select status='superseded' from public.ir_assessment_versions where id=pg_temp.lid('assessment1')),'new assessment preserves older version as superseded');
select public.ir_submit_assessment_review(pg_temp.lid('assessment2'));
select public.ir_review_assessment(pg_temp.lid('assessment2'),'approved','Reviewed each source and proposed initial date');
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->'control'->>'workflow_status'='decision_recorded','complete reviewed proposal records internal decision');
select pg_temp.assert_true((select count(*) from public.ir_assessment_reviews)=2,'returned and approved decisions retained append-only');
select pg_temp.expect_error($q$update public.ir_assessment_versions set snapshot='{}'$q$,'42501','approved snapshot cannot be rewritten');
select pg_temp.expect_error($q$delete from public.ir_assessment_reviews$q$,'42501','review trail cannot be erased');
update legal_test_ids set id=(public.ir_create_rule_version('{"rule_key":"synthetic","title":"Revised approved reference","criteria":"New source version reviewed by lawyer","scope":{"validity_note":"New synthetic version effective scope reviewed"},"sources":[{"url":"https://www.planalto.gov.br/ccivil_03/leis/l7713.htm","checked_on":"2026-09-11"}]}')).id where name='rule3';
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->>'assessment_is_current'='true','unapproved reference draft does not invalidate analysis');
select public.ir_review_rule_version(pg_temp.lid('rule3'),'approved','New reference version approved');
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->>'assessment_is_current'='false','new approved reference revision requires fresh analysis');
update legal_test_ids set id=(public.ir_create_assessment_version(pg_temp.lid('case'),pg_temp.reviewed_proposals(),'administrative','Reassessed with historical version and new catalog head visible')).id where name='assessment3';
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->>'assessment_is_current'='true','new analysis preserves chosen historical reference and current catalog head');
select public.legal_cancel_document_request(pg_temp.lid('req_fiscal'),'Document requirement revised');
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->>'assessment_is_current'='false','F2 request transition invalidates snapshot even without IR revision increment');
select public.ir_add_evidence_event(pg_temp.lid('case'),jsonb_build_object('category','medical','event_type','disease_onset_reported','event_date','2019-02-01','date_precision','estimated','description','Corrected onset','supersedes_id',pg_temp.lid('medical_event')));
select pg_temp.expect_error($q$select public.ir_create_assessment_version(pg_temp.lid('case'),pg_temp.reviewed_proposals(),'administrative','References superseded event')$q$,'22023','new proposal cannot rely on superseded evidence');
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,true,false);
select pg_temp.login('member');
select pg_temp.assert_true((select count(*) from public.ir_assessment_versions)=0,'loss of either grant hides historical combined snapshots');
select pg_temp.expect_error($q$select public._ir_build_snapshot(pg_temp.lid('case'),'[]')$q$,'42501','internal snapshot builder cannot bypass combined ACL');
select pg_temp.assert_true(public.ir_get_case_context(pg_temp.lid('case'))->>'assessment_is_current' is null,'current-state metadata hidden after category revocation');

-- Evidence-backed representation is owner-reviewed and never staff membership.
select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_add_case_party(pg_temp.lid('case'),'Synthetic representative','Representante')).id where name='party';
select pg_temp.expect_error($q$select public.legal_create_representation(pg_temp.lid('case'),jsonb_build_object('representative_party_id',pg_temp.lid('party'),'basis','power_of_attorney','evidence_document_id',pg_temp.lid('doc_other_case')))$q$,'42501','representation evidence cannot cross case boundary');
select pg_temp.expect_error($q$select public.legal_create_representation(pg_temp.lid('case'),jsonb_build_object('representative_party_id',pg_temp.lid('party'),'basis','power_of_attorney','evidence_document_id',pg_temp.lid('doc_general'),'valid_until','infinity'))$q$,'23514','representation deadline cannot be infinite');
select pg_temp.expect_error($q$select public.legal_create_representation(pg_temp.lid('case'),jsonb_build_object('representative_party_id',pg_temp.lid('party'),'basis','power_of_attorney','evidence_document_id',pg_temp.lid('doc_general'),'scopes',jsonb_build_array('case_access')))$q$,'23514','representation cannot grant staff access scopes');
update legal_test_ids set id=(public.legal_create_representation(pg_temp.lid('case'),jsonb_build_object('representative_party_id',pg_temp.lid('party'),'basis','power_of_attorney','evidence_document_id',pg_temp.lid('doc_general'),'valid_from',now()-interval '1 day','valid_until',now()+interval '2 days'))).id where name='rep';
select pg_temp.assert_true((select status='draft' and category='general' from public.legal_representations where id=pg_temp.lid('rep')),'representation starts draft with evidence category');
update legal_test_ids set id=(public.legal_create_document_request(pg_temp.lid('case'),'general','Generic collection')).id where name='req_rep';
select public.legal_issue_document_request_token(pg_temp.lid('req_rep'),repeat('a',64),now()+interval '1 day');
select pg_temp.expect_error($q$select public.legal_set_request_representation(pg_temp.lid('req_rep'),pg_temp.lid('rep'))$q$,'42501','unreviewed representation cannot authorize link');
select pg_temp.login('member');
select pg_temp.expect_error($q$select public.legal_activate_representation(pg_temp.lid('rep'),'Editor bypass')$q$,'42501','representation activation requires owner');
select pg_temp.login('owner');
select public.legal_activate_representation(pg_temp.lid('rep'),'Original mandate checked by responsible lawyer');
select public.legal_set_request_representation(pg_temp.lid('req_rep'),pg_temp.lid('rep'));
select pg_temp.assert_true((select expires_at is null from public.legal_document_requests where id=pg_temp.lid('req_rep')),'binding representation invalidates previous capability');
select public.legal_issue_document_request_token(pg_temp.lid('req_rep'),repeat('b',64),now()+interval '7 days');
select pg_temp.assert_true((select q.expires_at=r.valid_until from public.legal_document_requests q join public.legal_representations r on r.id=q.representation_id where q.id=pg_temp.lid('req_rep')),'link expiry is capped by mandate validity');
reset role;
select pg_temp.assert_true((select count(*) from public.legal_case_members where case_id=pg_temp.lid('case'))=2,'representative did not gain staff membership');
select pg_temp.login('owner','service_role');
set local role service_role;
select pg_temp.expect_error($q$select public.legal_public_document_request(repeat('a',64))$q$,'42501','old rotated token remains invalid');
select pg_temp.assert_true(public.legal_public_document_request(repeat('b',64))->>'title'='Envio de documento','public link does not expose representative identity');
update legal_test_ids set id=(public.legal_public_prepare_request_upload(repeat('b',64),'submission.pdf','application/pdf',10)).id where name='rep_doc';
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}'::jsonb from public.legal_case_documents where id=pg_temp.lid('rep_doc');
set local role authenticated;
select pg_temp.login('owner');
select public.legal_revoke_representation(pg_temp.lid('rep'),'Mandate revoked before upload completed');
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.ir_get_case_context(pg_temp.lid('case'))->'representation_states') x where x->>'id'=pg_temp.lid('rep')::text and x->>'effective_status'='revoked'),'effective revocation visible in context');
reset role;
select pg_temp.login('owner','service_role');
set local role service_role;
select pg_temp.expect_error($q$select public.legal_public_finalize_request_upload(repeat('b',64),pg_temp.lid('rep_doc'),repeat('2',64))$q$,'42501','revocation blocks in-flight upload finalization');
select pg_temp.assert_true((select status='prepared' and sha256 is null from public.legal_case_documents where id=pg_temp.lid('rep_doc')),'failed finalization rolls back document readiness');
reset role;
-- Simulate the trusted Storage API deletion for this rolled-back fixture only.
set local storage.allow_delete_query='true';
delete from storage.objects where bucket_id='legal-case-documents' and name=(select storage_path from public.legal_case_documents where id=pg_temp.lid('rep_doc'));
set local role service_role;
select public.legal_public_abandon_request_upload(repeat('b',64),pg_temp.lid('rep_doc'));
reset role;
set local role authenticated;
select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_issue_document_request_token(pg_temp.lid('req_rep'),repeat('c',64),now()+interval '1 day')$q$,'42501','revoked mandate cannot renew capability');
select public.legal_set_request_representation(pg_temp.lid('req_rep'),null);
select public.legal_issue_document_request_token(pg_temp.lid('req_rep'),repeat('c',64),now()+interval '1 day');
select pg_temp.assert_true((select representation_id is null and expires_at is not null from public.legal_document_requests where id=pg_temp.lid('req_rep')),'owner explicitly restores unbound collection with a new link');
select pg_temp.expect_error($q$update public.legal_representations set status='active'$q$,'42501','revoked representation cannot be rewritten directly');

-- Linked power-of-attorney version must remain current and approved.
update legal_test_ids set id=(public.legal_create_instrument(pg_temp.lid('case'),'power_of_attorney','Synthetic mandate','general','Synthetic draft content')).id where name='poa';
update legal_test_ids set id=(select id from public.legal_instrument_versions where instrument_id=pg_temp.lid('poa') and version_number=1) where name='poa_version';
select public.legal_submit_instrument_review(pg_temp.lid('poa_version'));
select public.legal_review_instrument(pg_temp.lid('poa_version'),'approved','Reviewed synthetic mandate');
update legal_test_ids set id=(public.legal_create_representation(pg_temp.lid('case'),jsonb_build_object('representative_party_id',pg_temp.lid('party'),'basis','power_of_attorney','evidence_document_id',pg_temp.lid('doc_general'),'instrument_version_id',pg_temp.lid('poa_version')))).id where name='rep_poa';
select public.legal_activate_representation(pg_temp.lid('rep_poa'),'Checked instrument and evidence');
select public.legal_set_request_representation(pg_temp.lid('req_rep'),pg_temp.lid('rep_poa'));
select public.legal_issue_document_request_token(pg_temp.lid('req_rep'),repeat('d',64),now()+interval '1 day');
select public.legal_add_instrument_version(pg_temp.lid('poa'),'New draft supersedes previous version');
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.ir_get_case_context(pg_temp.lid('case'))->'representation_states') x where x->>'id'=pg_temp.lid('rep_poa')::text and x->>'effective_status'='invalid_evidence'),'superseded instrument invalidates linked representation for future use');
reset role;
select pg_temp.login('owner','service_role');
set local role service_role;
select pg_temp.expect_error($q$select public.legal_public_document_request(repeat('d',64))$q$,'42501','new instrument version blocks prior linked capability');
reset role;
set local role authenticated;
select pg_temp.login('owner');
select public.legal_set_request_representation(pg_temp.lid('req_rep'),null);
select public.legal_issue_document_request_token(pg_temp.lid('req_rep'),repeat('e',64),now()+interval '1 day');
reset role;
-- Delay only this rolled-back fixture's document finalization. The expiry
-- starts in the future, passes the initial guard, then elapses during storage
-- finalization. The final capability check must undo readiness atomically.
set local role authenticated;
select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_document_request(pg_temp.lid('case'),'general','Expiry race')).id where name='race_request';
select public.legal_issue_document_request_token(pg_temp.lid('race_request'),repeat('f',64),now()+interval '1 day');
reset role;
select pg_temp.login('owner','service_role');
set local role service_role;
update legal_test_ids set id=(public.legal_public_prepare_request_upload(repeat('f',64),'race.pdf','application/pdf',10)).id where name='race_document';
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}'::jsonb from public.legal_case_documents where id=pg_temp.lid('race_document');
create function pg_temp.delay_legal_ready() returns trigger language plpgsql as $f$
begin
 if new.id=pg_temp.lid('race_document') and new.status='ready' then perform pg_sleep(1);end if;
 return new;
end;$f$;
create trigger f3_test_delay_ready before update on public.legal_case_documents for each row execute function pg_temp.delay_legal_ready();
create temp table f3_test_clock(started timestamptz not null);
grant select on f3_test_clock to service_role;
insert into f3_test_clock values(clock_timestamp());
update public.legal_document_requests set expires_at=clock_timestamp()+interval '500 milliseconds' where id=pg_temp.lid('race_request');
set local role service_role;
select pg_temp.expect_error($q$select public.legal_public_finalize_request_upload(repeat('f',64),pg_temp.lid('race_document'),repeat('9',64))$q$,'42501','expiration during finalization blocks commit');
select pg_temp.assert_true((select clock_timestamp()-started>=interval '1 second' from f3_test_clock),'expiry race passed initial guard and reached delayed finalizer');
select pg_temp.assert_true((select status='prepared' and sha256 is null from public.legal_case_documents where id=pg_temp.lid('race_document')),'expiry after processing rolls back file ready state');
reset role;
drop trigger f3_test_delay_ready on public.legal_case_documents;
-- Trusted fixture advances deadline into the past without sleeping. RPCs use
-- wall-clock time, not the transaction start time (all tests share BEGIN).
update public.legal_document_requests set expires_at=clock_timestamp()-interval '1 millisecond' where id=pg_temp.lid('req_rep');
select pg_temp.login('owner','service_role');
set local role service_role;
select pg_temp.expect_error($q$select public.legal_public_prepare_request_upload(repeat('e',64),'late.pdf','application/pdf',10)$q$,'42501','wall-clock expiration prevents late upload within same transaction');
reset role;
set local role authenticated;
select pg_temp.login('owner');
select pg_temp.assert_true(not exists(select 1 from public.legal_case_events where case_id=pg_temp.lid('case') and (description like '%Synthetic confidential onset%' or metadata::text like '%Synthetic physician%' or metadata::text like '%Additional verified fiscal fact%')),'shared audit excludes medical and fiscal body data');
select public.legal_set_workspace_enabled(false);
select pg_temp.assert_true((select count(*) from public.ir_payers)=0 and (select count(*) from public.ir_rule_versions)=0,'disabled legal workspace hides fiscal data and catalog');
select pg_temp.expect_error($q$select public.ir_create_rule_version('{"rule_key":"disabled"}')$q$,'42501','disabled workspace cannot author catalog');
select public.legal_set_workspace_enabled(true);
select public.legal_remove_case_member(pg_temp.lid('case'),pg_temp.lid('finance'));
select pg_temp.login('finance');
select pg_temp.expect_error($q$select public.ir_save_payer(pg_temp.lid('case'),'{"name":"After revocation","payer_type":"other"}')$q$,'42501','revoked editor cannot mutate fiscal data');
reset role;
select pg_temp.login('owner','service_role');
update public.profiles set status='inactive' where id=pg_temp.lid('owner');
set local role authenticated;
select pg_temp.login('owner');
select pg_temp.assert_true((select count(*) from public.ir_assessment_versions)=0,'inactive owner cannot read retained snapshots');
select pg_temp.expect_error($q$select public.ir_get_case_context(pg_temp.lid('case'))$q$,'42501','inactive owner cannot read context');
reset role;
select 'F3 IR dossier regression PASS' as result;
rollback;
