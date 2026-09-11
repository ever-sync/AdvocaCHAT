-- F6 assisted deadline integration regression. Run ONLY in a disposable/local or isolated staging
-- database after migrations, with postgres privileges. Synthetic data rolls back.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/legal_assisted_deadlines.sql
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
insert into legal_test_ids(name) values('deadline_proceeding'),('deadline_proceeding2'),('deadline_calendar'),('deadline_calendar2'),('deadline_rule'),('deadline_rule2'),('deadline_inbox'),('deadline_version'),('deadline_incomplete'),('deadline_check'),('deadline_task'),('deadline_new'),('deadline_stale'),('deadline_same_tenant_other_case'),('deadline_current');
set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_add_proceeding(pg_temp.lid('case'),'0000001-45.2024.8.26.0001','Órgão fictício','Grau fictício')).id where name='deadline_proceeding';
update legal_test_ids set id=(public.legal_add_proceeding(pg_temp.lid('case2'),'0000001-45.2024.8.26.0001','Outro órgão')).id where name='deadline_proceeding2';
create function pg_temp.deadline_scope() returns jsonb language sql immutable as $$select '{"court":"Órgão fictício","degree":"Grau fictício","unit":"Unidade fictícia","territory":"UF fictícia"}'::jsonb$$;
create function pg_temp.deadline_sources() returns jsonb language sql stable as $$select jsonb_build_array(jsonb_build_object('title','Synthetic documented legal source','url','https://example.invalid/legal-source','checked_on',(clock_timestamp() at time zone 'America/Sao_Paulo')::date,'version_note','Pure synthetic fixture; no actual legal approval','document_id',pg_temp.lid('general')))$$;
create function pg_temp.calendar_payload(p_key text default 'synthetic-calendar') returns jsonb language sql stable as $$select jsonb_build_object('calendar_key',p_key,'title','Synthetic judicial calendar','scope',pg_temp.deadline_scope(),'timezone','America/Sao_Paulo','valid_from','2026-01-01','valid_until','2027-12-31','body','{"working_weekdays":[1,2,3,4,5],"exceptions":[],"suspensions":[]}'::jsonb,'sources',pg_temp.deadline_sources())$$;
create function pg_temp.rule_payload(p_key text default 'synthetic-rule') returns jsonb language sql stable as $$select jsonb_build_object('rule_key',p_key,'title','Synthetic procedural rule','scope',pg_temp.deadline_scope(),'valid_from','2026-01-01','valid_until','2027-12-31','sources',pg_temp.deadline_sources(),'body','{"regime":"civil_procedure","nature":"procedural","modality":"synthetic_publication","recipient_kind":"synthetic_person","conditions":"Only independent synthetic test","exclusions":"No other procedure is covered","validity_note":"Synthetic transition explicitly reviewed","transition_resolved":true,"input_kind":"civil_date","anchor_kind":"published_on","marker_offset_count":0,"marker_offset_unit":"business_days","marker_adjustment":"none","exclude_marker":true,"count_unit":"business_days","apply_suspensions":true,"due_adjustment":"next_business_day","due_time":"23:59:59"}'::jsonb)$$;
select pg_temp.login('member');select pg_temp.expect_error($q$select public.legal_deadline_create_calendar_version(pg_temp.calendar_payload())$q$,'42501','case editor is not automatically catalog editor');select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_deadline_create_calendar_version(pg_temp.calendar_payload()||'{"valid_from":"infinity"}')$q$,'22023','calendar cannot have infinite civil coverage');
select pg_temp.expect_error($q$select public.legal_deadline_create_calendar_version(jsonb_set(pg_temp.calendar_payload(),'{sources,0,document_id}',to_jsonb(pg_temp.lid('medical'))))$q$,'42501','clinical proof cannot become shared calendar documentation');
update legal_test_ids set id=(public.legal_deadline_create_calendar_version(pg_temp.calendar_payload())).id where name='deadline_calendar';
select public.legal_deadline_review_calendar(pg_temp.lid('deadline_calendar'),'approved','Calendar scope, daily effects and documentary sources independently reviewed');
update legal_test_ids set id=(public.legal_deadline_create_rule_version(pg_temp.rule_payload())).id where name='deadline_rule';
select public.legal_deadline_review_rule(pg_temp.lid('deadline_rule'),'approved','Duration stays case-specific; this synthetic enumerated rule was independently reviewed');
update legal_test_ids set id=(public.legal_judicial_record_manual_event(pg_temp.lid('case'),jsonb_build_object('title','PRIVATE CLINICAL MOVEMENT','event_type','publication','category','restricted','original_text','Original synthetic medical/fiscal source, plain text only','proceeding_id',pg_temp.lid('deadline_proceeding'),'evidence_document_id',pg_temp.lid('general'),'published_on','2026-09-14'))).id where name='deadline_inbox';
create function pg_temp.deadline_payload(p_key text default 'deadline-one') returns jsonb language sql stable as $$select jsonb_build_object('deadline_key',p_key,'title','Synthetic three-day assisted deadline','proceeding_id',pg_temp.lid('deadline_proceeding'),'inbox_id',pg_temp.lid('deadline_inbox'),'rule_version_id',pg_temp.lid('deadline_rule'),'calendar_version_id',pg_temp.lid('deadline_calendar'),'quantity',3,'unit','business_days','anchor_date','2026-09-14','anchor_kind','published_on','evidence_document_id',pg_temp.lid('general'),'duration_basis','Three days stated in independent synthetic evidence','conditions_confirmed',true,'coverage_confirmed',true,'conflict_detected',false,'scope',pg_temp.deadline_scope(),'assignee_id',pg_temp.lid('member'),'substitute_id',pg_temp.lid('owner'),'note','Synthetic case-specific analysis without actual judicial action')$$;
reset role;insert into legal_test_ids(name) values('deadline_mismatch'),('deadline_clock_rule'),('deadline_clock_event'),('deadline_clock_result'),('deadline_missing_field');set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_deadline_create_version(pg_temp.lid('case'),pg_temp.deadline_payload('divergent-source')||'{"anchor_date":"2026-09-15"}')).id where name='deadline_mismatch';
select pg_temp.assert_true((select state='incomplete' and result->>'proposed_due_on' is null and exists(select 1 from jsonb_array_elements(result->'refusals') x where x->>'code'='source_anchor_mismatch') from public.legal_deadline_versions where id=pg_temp.lid('deadline_mismatch')),'source publication date cannot be silently replaced by another date');
update legal_test_ids set id=(public.legal_deadline_create_rule_version(jsonb_set(pg_temp.rule_payload('clock-rule'),'{body,anchor_kind}','"source_consulted_at"'))).id where name='deadline_clock_rule';select public.legal_deadline_review_rule(pg_temp.lid('deadline_clock_rule'),'approved','Synthetic certified timestamp origin and civil-day conversion independently checked');
update legal_test_ids set id=(public.legal_judicial_record_manual_event(pg_temp.lid('case'),jsonb_build_object('title','Synthetic certified timestamp','event_type','certificate','category','restricted','original_text','Synthetic certified origin UTC corresponds to prior civil day in court timezone','proceeding_id',pg_temp.lid('deadline_proceeding'),'evidence_document_id',pg_temp.lid('general'),'source_consulted_at','2026-09-15T01:00:00Z'))).id where name='deadline_clock_event';
update legal_test_ids set id=(public.legal_deadline_create_version(pg_temp.lid('case'),pg_temp.deadline_payload('clock-origin')||jsonb_build_object('inbox_id',pg_temp.lid('deadline_clock_event'),'rule_version_id',pg_temp.lid('deadline_clock_rule'),'anchor_kind','source_consulted_at'))).id where name='deadline_clock_result';
select pg_temp.assert_true((select state='draft' and result->>'start_marker_on'='2026-09-14' and result->>'proposed_due_on'='2026-09-17' from public.legal_deadline_versions where id=pg_temp.lid('deadline_clock_result')),'C09 source timestamp converts to previous civil date in court IANA timezone, independent of browser');
update legal_test_ids set id=(public.legal_deadline_create_version(pg_temp.lid('case'),pg_temp.deadline_payload('missing-publication')||jsonb_build_object('inbox_id',pg_temp.lid('deadline_clock_event')))).id where name='deadline_missing_field';
select pg_temp.assert_true((select state='incomplete' and result->>'proposed_due_on' is null and exists(select 1 from jsonb_array_elements(result->'refusals') x where x->>'code'='source_anchor_missing') from public.legal_deadline_versions where id=pg_temp.lid('deadline_missing_field')),'missing publication cannot be inferred from consultation or capture');
select pg_temp.expect_error($q$select public.legal_deadline_create_version(pg_temp.lid('case'),pg_temp.deadline_payload()||jsonb_build_object('proceeding_id',pg_temp.lid('deadline_proceeding2')))$q$,'42501','cross-case proceeding denied before calculation');
reset role;insert into legal_test_ids(name) values('deadline_wrong_court_rule'),('deadline_wrong_court_calendar'),('deadline_wrong_court_result');set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_deadline_create_rule_version(jsonb_set(pg_temp.rule_payload('other-court-rule'),'{scope,court}','"Other synthetic court"'))).id where name='deadline_wrong_court_rule';select public.legal_deadline_review_rule(pg_temp.lid('deadline_wrong_court_rule'),'approved','Synthetic rule valid only in the separately named court');
update legal_test_ids set id=(public.legal_deadline_create_calendar_version(jsonb_set(pg_temp.calendar_payload('other-court-calendar'),'{scope,court}','"Other synthetic court"'))).id where name='deadline_wrong_court_calendar';select public.legal_deadline_review_calendar(pg_temp.lid('deadline_wrong_court_calendar'),'approved','Synthetic calendar valid only in the separately named court');
update legal_test_ids set id=(public.legal_deadline_create_version(pg_temp.lid('case'),jsonb_set(pg_temp.deadline_payload('wrong-court'),'{scope,court}','"Other synthetic court"')||jsonb_build_object('rule_version_id',pg_temp.lid('deadline_wrong_court_rule'),'calendar_version_id',pg_temp.lid('deadline_wrong_court_calendar')))).id where name='deadline_wrong_court_result';
select pg_temp.assert_true((select state='incomplete' and result->>'proposed_due_on' is null and result->'refusals' @> '[{"code":"proceeding_scope_mismatch"}]'::jsonb from public.legal_deadline_versions where id=pg_temp.lid('deadline_wrong_court_result')),'matching input/rule/calendar cannot override the actual proceeding court');

update legal_test_ids set id=(public.legal_deadline_create_version(pg_temp.lid('case'),pg_temp.deadline_payload('incomplete')-'evidence_document_id')).id where name='deadline_incomplete';
select pg_temp.assert_true((select state='incomplete' and result->>'proposed_due_on' is null and result->>'due_at' is null from public.legal_deadline_versions where id=pg_temp.lid('deadline_incomplete')),'missing case proof refuses final deadline even with approved rule/calendar');
select pg_temp.expect_error($q$select public.legal_deadline_submit(pg_temp.lid('deadline_incomplete'))$q$,'22023','incomplete proposal cannot enter approval as complete');
select pg_temp.expect_error($q$select public.legal_deadline_review(pg_temp.lid('deadline_incomplete'),'reviewed','Cannot approve missing source')$q$,'22023','owner cannot force an incomplete proposal into a judicial deadline');
update legal_test_ids set id=(public.legal_deadline_create_check_task(pg_temp.lid('deadline_incomplete'),now()+interval '1 day','Collect missing source and review dates')).id where name='deadline_check';
select pg_temp.assert_true((public.legal_deadline_create_check_task(pg_temp.lid('deadline_incomplete'),now()+interval '1 day','Repeated check request')).id=pg_temp.lid('deadline_check'),'incomplete review task is idempotent and distinct from approved deadline');
update legal_test_ids set id=(public.legal_deadline_create_version(pg_temp.lid('case'),pg_temp.deadline_payload())).id where name='deadline_version';
select pg_temp.assert_true((select state='draft' and result->>'start_marker_on'='2026-09-14' and result->>'first_counted_on'='2026-09-15' and result->>'proposed_due_on'='2026-09-17' and result->>'due_at'='2026-09-18T02:59:59Z' from public.legal_deadline_versions where id=pg_temp.lid('deadline_version')),'C03 integration preserves independent expected marker, first day, civil due and UTC task instant');
select pg_temp.expect_error($q$select public.legal_deadline_review(pg_temp.lid('deadline_version'),'reviewed','Draft without submission bypass')$q$,'22023','separate submission and nominal review required');
select public.legal_deadline_submit(pg_temp.lid('deadline_version'));select pg_temp.login('member');
select pg_temp.expect_error($q$select public.legal_deadline_review(pg_temp.lid('deadline_version'),'reviewed','Editor is not case owner')$q$,'42501','dual category editor cannot approve own deadline');
select pg_temp.login('owner');select public.legal_deadline_review(pg_temp.lid('deadline_version'),'reviewed','Independent three-day calendar count and documentary basis checked');
update legal_test_ids set id=(select task_id from public.legal_deadline_versions where id=pg_temp.lid('deadline_version')) where name='deadline_task';
select pg_temp.assert_true((select t.due_at='2026-09-18T02:59:59Z'::timestamptz and t.title not like '%PRIVATE%' from public.legal_case_tasks t where id=pg_temp.lid('deadline_task')),'approved deadline task is atomic, exact and excludes source text');
select pg_temp.expect_error($q$update public.legal_deadline_versions set result='{}'$q$,'42501','calculation memory immutable through direct table path');
select pg_temp.expect_error($q$select public.legal_save_case_task(pg_temp.lid('case'),'{"due_at":"2026-09-20T00:00:00Z"}',pg_temp.lid('deadline_task'))$q$,'42501','F2 CRUD cannot silently change a reviewed deadline');
select pg_temp.login('member');select pg_temp.assert_true((public.legal_deadline_read_report(pg_temp.lid('deadline_version'))->>'is_current')::boolean,'authorized restricted reader can export audit report');
select pg_temp.login('finance');select pg_temp.expect_error($q$select public.legal_deadline_read_report(pg_temp.lid('deadline_version'))$q$,'42501','fiscal-only reader cannot export combined source/memory');
select pg_temp.assert_true(public.legal_judicial_context(pg_temp.lid('case'))->'deadlines'='[]'::jsonb,'combined calculations omitted from fiscal-only context');
select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_deadline_create_version(pg_temp.lid('case'),pg_temp.deadline_payload('calendar-race'))).id where name='deadline_stale';select public.legal_deadline_submit(pg_temp.lid('deadline_stale'));
-- C11: a newly approved calendar invalidates old snapshots, preserving previously published tasks.
update legal_test_ids set id=(public.legal_deadline_create_calendar_version(jsonb_set(pg_temp.calendar_payload(),'{body,exceptions}','[{"on":"2026-09-16","suspend_count":true,"allow_start":false,"allow_due":false,"reason":"Independent new suspension evidence","source_index":0}]'))).id where name='deadline_calendar2';
select public.legal_deadline_review_calendar(pg_temp.lid('deadline_calendar2'),'approved','New exception independently reviewed; old versions remain historical');
select pg_temp.expect_error($q$select public.legal_deadline_review(pg_temp.lid('deadline_stale'),'reviewed','Old version cannot approve after new calendar')$q$,'22023','C11 current head change blocks approval of old in-review snapshot');
select pg_temp.assert_true(not(public.legal_deadline_read_report(pg_temp.lid('deadline_version'))->>'is_current')::boolean,'historical reviewed report is explicitly stale after a new calendar');
select pg_temp.assert_true((select due_at='2026-09-18T02:59:59Z'::timestamptz from public.legal_case_tasks where id=pg_temp.lid('deadline_task')),'calendar update never silently changes historical task date');
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.legal_my_day('2026-09-01T00:00:00Z','2026-10-01T00:00:00Z')->'items') x where x->>'id'=pg_temp.lid('deadline_task')::text and x->>'title'='Reconferir prazo judicial: referência alterada'),'stale followed deadline opens explicit reconference item in My Day');
update legal_test_ids set id=pg_temp.lid('deadline_calendar2') where name='deadline_calendar';
update legal_test_ids set id=(public.legal_deadline_create_version(pg_temp.lid('case'),pg_temp.deadline_payload('corrected'))).id where name='deadline_new';
select pg_temp.assert_true((select result->>'proposed_due_on'='2026-09-18' from public.legal_deadline_versions where id=pg_temp.lid('deadline_new')),'new calendar suspension changes only new proposal to independently expected Friday');
select public.legal_deadline_submit(pg_temp.lid('deadline_new'));
select public.legal_judicial_review_association(pg_temp.lid('deadline_inbox'),pg_temp.lid('case'),pg_temp.lid('deadline_proceeding'),'rejected',pg_temp.lid('general'),'Documentary association corrected after proposal');
select pg_temp.expect_error($q$select public.legal_deadline_review(pg_temp.lid('deadline_new'),'reviewed','Source association changed after review submission')$q$,'22023','C12 association correction prevents partially publishing a deadline task');
select pg_temp.assert_true((select task_id is null and state='in_review' from public.legal_deadline_versions where id=pg_temp.lid('deadline_new')),'failed review is atomic and does not create or link task');
select public.legal_judicial_review_association(pg_temp.lid('deadline_inbox'),pg_temp.lid('case'),pg_temp.lid('deadline_proceeding'),'confirmed',pg_temp.lid('general'),'Source rechecked after correction');
update legal_test_ids set id=(public.legal_deadline_create_version(pg_temp.lid('case'),pg_temp.deadline_payload('concurrent-current'))).id where name='deadline_current';select public.legal_deadline_submit(pg_temp.lid('deadline_current'));
-- A catalog reviewer must retain access to the documentary proof, even when it lives in another case.
reset role;insert into legal_test_ids(name) values('deadline_other_proof'),('deadline_proof_rule'),('deadline_proof_calendar'),('deadline_proof_version'),('deadline_proof_blocked');set local role authenticated;select pg_temp.login('owner');
select public.legal_set_case_member(pg_temp.lid('case2'),pg_temp.lid('same_admin'),false,false,false);
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case2'),'general','Synthetic other-case catalog proof','proof.pdf','application/pdf',10)).id where name='deadline_other_proof';
reset role;insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}' from public.legal_case_documents where id=pg_temp.lid('deadline_other_proof');set local role service_role;select pg_temp.login('owner','service_role');select public.legal_finalize_document(pg_temp.lid('deadline_other_proof'),repeat('e',64));
reset role;set local role authenticated;select pg_temp.login('same_admin');
update legal_test_ids set id=(public.legal_deadline_create_rule_version(jsonb_set(pg_temp.rule_payload('separate-proof-rule'),'{sources,0,document_id}',to_jsonb(pg_temp.lid('deadline_other_proof'))))).id where name='deadline_proof_rule';select public.legal_deadline_review_rule(pg_temp.lid('deadline_proof_rule'),'approved','Reviewer has current explicit access to independent catalog proof');
update legal_test_ids set id=(public.legal_deadline_create_calendar_version(jsonb_set(pg_temp.calendar_payload('separate-proof-calendar'),'{sources,0,document_id}',to_jsonb(pg_temp.lid('deadline_other_proof'))))).id where name='deadline_proof_calendar';select public.legal_deadline_review_calendar(pg_temp.lid('deadline_proof_calendar'),'approved','Calendar reviewer has current explicit access to independent catalog proof');
select pg_temp.login('owner');update legal_test_ids set id=(public.legal_deadline_create_version(pg_temp.lid('case'),pg_temp.deadline_payload('proof-access-current')||jsonb_build_object('rule_version_id',pg_temp.lid('deadline_proof_rule'),'calendar_version_id',pg_temp.lid('deadline_proof_calendar')))).id where name='deadline_proof_version';
select pg_temp.assert_true((select state='draft' and snapshot->'catalog_proof_access'->'rule'->0->'current_can_access'='true'::jsonb from public.legal_deadline_versions where id=pg_temp.lid('deadline_proof_version')),'catalog proof snapshot records current reviewer access without document content');
select public.legal_remove_case_member(pg_temp.lid('case2'),pg_temp.lid('same_admin'));
select pg_temp.assert_true(not(public.legal_deadline_read_report(pg_temp.lid('deadline_proof_version'))->>'is_current')::boolean,'reviewer losing access to other proof case invalidates existing snapshot');
update legal_test_ids set id=(public.legal_deadline_create_version(pg_temp.lid('case'),pg_temp.deadline_payload('proof-access-blocked')||jsonb_build_object('rule_version_id',pg_temp.lid('deadline_proof_rule'),'calendar_version_id',pg_temp.lid('deadline_proof_calendar')))).id where name='deadline_proof_blocked';
select pg_temp.assert_true((select state='incomplete' and result->>'proposed_due_on' is null and exists(select 1 from jsonb_array_elements(result->'refusals') x where x->>'code'='catalog_reviewer_evidence_unavailable') from public.legal_deadline_versions where id=pg_temp.lid('deadline_proof_blocked')),'new proposals refuse catalog whose reviewer lost proof access');

-- F6_DEADLINE_CONCURRENCY_FIXTURE_READY
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,false,true);
select pg_temp.expect_error($q$select public.legal_deadline_review(pg_temp.lid('deadline_current'),'reviewed','Assignee category revoked')$q$,'22023','assignee access change invalidates pending snapshot before review');
select pg_temp.login('member');select pg_temp.expect_error($q$select public.legal_deadline_read_report(pg_temp.lid('deadline_version'))$q$,'42501','old reader JWT loses medical report after category revoked');
select pg_temp.login('outsider');select pg_temp.assert_true((select count(*)=0 from public.legal_deadline_versions),'physical tenant isolation for all deadline versions');
reset role;select 'F6 assisted deadline workflow regression PASS' as result;rollback;
