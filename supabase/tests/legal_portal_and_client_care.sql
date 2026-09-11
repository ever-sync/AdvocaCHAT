-- F5 portal/communications integration regression. Run ONLY in a disposable/local or isolated staging
-- database after migrations, with postgres privileges. Synthetic data rolls back.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/legal_portal_and_client_care.sql
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
create function pg_temp.invite_payload(p_identity text,p_kind text default 'client') returns jsonb language sql stable as $$
 select jsonb_build_object('party_id',case when p_kind='representative' then pg_temp.lid('party2') else pg_temp.lid('party') end,'email','portal-'||pg_temp.lid(p_identity)||'@example.invalid','access_kind',p_kind,
 'scopes',case when p_kind='accountant' then '["documents:read","requests:upload","fiscal_exports:read"]'::jsonb else '["case_summary:read","agenda:read","messages:read","messages:write","requests:upload","documents:read","statements:read","fiscal_exports:read"]'::jsonb end,
 'allow_medical',p_kind<>'accountant','allow_fiscal',true,'public_title','Seu atendimento','expires_at',now()+interval '90 days','purpose','Individually verified synthetic access')
$$;
update legal_test_ids set id=(public.legal_create_portal_invite(pg_temp.lid('case'),pg_temp.invite_payload('external'))).id where name='invite';
select pg_temp.expect_error($q$select public.legal_create_portal_invite(pg_temp.lid('case'),pg_temp.invite_payload('accountant','accountant')||'{"allow_medical":true}'::jsonb)$q$,'22023','accountant cannot acquire medical access');
select pg_temp.expect_error($q$select public.legal_create_portal_invite(pg_temp.lid('case'),pg_temp.invite_payload('external')||jsonb_build_object('tenant_id',pg_temp.lid('tenant_b')))$q$,'22023','caller cannot forge invite tenant');
select pg_temp.expect_error($q$select public.legal_review_portal_invite(pg_temp.lid('invite'),'approved','Medical ID copied','documented_review',pg_temp.lid('medical'))$q$,'22023','sensitive medical proof cannot leak into general identity grant');
select pg_temp.login('member');
select pg_temp.expect_error($q$select public.legal_review_portal_invite(pg_temp.lid('invite'),'approved','Editor bypass','documented_review',pg_temp.lid('general'))$q$,'42501','case editor cannot approve external grants');
select pg_temp.login('owner');
select public.legal_review_portal_invite(pg_temp.lid('invite'),'approved','Individual identity and contact checked against synthetic proof','documented_review',pg_temp.lid('general'));
select pg_temp.expect_error($q$select public.legal_portal_service_reserve(pg_temp.lid('owner'),pg_temp.lid('invite'),pg_temp.lid('external'),pg_temp.lid('key'))$q$,'42501','authenticated staff cannot call service provisioning directly');
reset role;select pg_temp.login('owner','service_role');set local role service_role;
update legal_test_ids set id=(public.legal_portal_service_reserve(pg_temp.lid('owner'),pg_temp.lid('invite'),pg_temp.lid('external'),pg_temp.lid('key'))->>'id')::uuid where name='provision';
select pg_temp.assert_true(public.legal_portal_service_reserve(pg_temp.lid('owner'),pg_temp.lid('invite'),gen_random_uuid(),pg_temp.lid('key'))->>'auth_user_id'=pg_temp.lid('external')::text,'retry uses original server-reserved UUID');
reset role;
select pg_temp.expect_error($q$insert into auth.users(id,email) values(pg_temp.lid('external'),'wrong@example.invalid')$q$,'42501','reserved UUID rejects different email before any bootstrap');
-- Simulate GoTrue inserting before applying requested role/app_metadata.
insert into auth.users(id,email,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(pg_temp.lid('external'),'portal-'||pg_temp.lid('external')||'@example.invalid','authenticated','{}',jsonb_build_object('tenant_id',pg_temp.lid('tenant_a'),'role','admin','legal_portal',false),now(),now());
select pg_temp.assert_true((select role='legal_portal' and raw_app_meta_data->>'legal_portal'='true' from auth.users where id=pg_temp.lid('external')),'trusted reservation sets external role before bootstrap');
select pg_temp.assert_true(not exists(select 1 from public.profiles where id=pg_temp.lid('external')) and (select count(*) from public.tenants where id not in(pg_temp.lid('tenant_a'),pg_temp.lid('tenant_b')))=6,'external INSERT creates no profile or additional tenant (six internal fixture signups only)');
set local role service_role;
select public.legal_portal_service_complete_provision(pg_temp.lid('owner'),pg_temp.lid('provision'));
select pg_temp.assert_true((select array_agg(k order by k)=array['expires_at','invite_id','revision'] from jsonb_object_keys(public.legal_portal_service_issue(pg_temp.lid('owner'),pg_temp.lid('invite'),repeat('1',64))) k),'first invitation issuance returns no identity or Auth credential');
select pg_temp.expect_error($q$select public.legal_portal_service_accept(pg_temp.lid('external'),repeat('1',64))$q$,'42501','invitation alone without confirmed recipient Auth does not release membership');
reset role;update auth.users set email_confirmed_at=now() where id=pg_temp.lid('external');set local role service_role;
select public.ensure_user_profile(pg_temp.lid('external'),'portal-'||pg_temp.lid('external')||'@example.invalid','{"role":"admin"}');
select pg_temp.assert_true(not exists(select 1 from public.profiles where id=pg_temp.lid('external')),'confirmation and explicit bootstrap still create no external profile');
select public.legal_portal_service_issue(pg_temp.lid('owner'),pg_temp.lid('invite'),repeat('2',64));
select pg_temp.assert_true(public.legal_portal_service_inspect(repeat('1',64))='{"available":false}'::jsonb,'rotation invalidates old invitation hash');
select pg_temp.expect_error($q$select public.legal_portal_service_accept(pg_temp.lid('external'),repeat('1',64))$q$,'42501','old invitation link cannot activate a rotated invitation');
select pg_temp.expect_error($q$select public.legal_portal_service_accept(pg_temp.lid('outsider'),repeat('2',64))$q$,'42501','wrong authenticated actor cannot consume invite');
update legal_test_ids set id=(public.legal_portal_service_accept(pg_temp.lid('external'),repeat('2',64))->>'membership_id')::uuid where name='membership';
select pg_temp.assert_true(public.legal_portal_service_accept(pg_temp.lid('external'),repeat('2',64))->>'membership_id'=pg_temp.lid('membership')::text,'activation retry preserves individual membership');
select pg_temp.assert_true(public.legal_portal_service_complete_provision(pg_temp.lid('owner'),pg_temp.lid('provision'))->>'status'='active','provision retry returns persisted active state without resetting identity');
select pg_temp.expect_error($q$select public.legal_portal_service_accept(pg_temp.lid('owner'),repeat('2',64))$q$,'42501','inviting staff cannot consume recipient invitation');
select pg_temp.assert_true((select activation_method='recipient_auth' from public.legal_portal_identities where id=pg_temp.lid('external')),'activation records recipient authentication separately from identity review');
select pg_temp.assert_true(jsonb_array_length(public.legal_portal_service_cases(pg_temp.lid('external')))=1,'external sees one reviewed case only');
select pg_temp.assert_true(public.legal_portal_service_case(pg_temp.lid('external'),pg_temp.lid('membership'))->'publications'='[]'::jsonb and public.legal_portal_service_case(pg_temp.lid('external'),pg_temp.lid('membership'))::text not like '%Internal clinical%','unpublished internal title/strategy never auto-projects');
select pg_temp.expect_error($q$select public.legal_portal_service_case(pg_temp.lid('external'),gen_random_uuid())$q$,'42501','random membership cannot disclose case');
reset role;
select pg_temp.expect_error($q$update auth.users set role='authenticated' where id=pg_temp.lid('external')$q$,'42501','external identity cannot be converted into internal account');
-- Schema denial defeats inherited PUBLIC EXECUTE on legacy functions as well.
select pg_temp.assert_true(not has_schema_privilege('legal_portal','public','USAGE') and not has_schema_privilege('legal_portal','storage','USAGE'),'portal role has no application schema USAGE');
select pg_temp.assert_true(has_schema_privilege('authenticated','public','USAGE') and has_schema_privilege('anon','public','USAGE') and has_schema_privilege('service_role','public','USAGE'),'existing runtime schema access preserved');
grant select,update on legal_test_ids to legal_portal;
set local role legal_portal;select pg_temp.login('external','legal_portal');
select pg_temp.expect_error($q$select * from public.profiles$q$,'42501','portal cannot resolve internal profiles despite legacy grants');
select pg_temp.expect_error($q$select public.add_business_minutes(now(),1)$q$,'42501','PUBLIC executable legacy function cannot bypass schema boundary');
select pg_temp.expect_error($q$select public.legal_portal_service_context(pg_temp.lid('external'))$q$,'42501','portal browser cannot call service-only RPC');
select pg_temp.expect_error($q$select * from storage.objects$q$,'42501','portal has no raw object reads or signed storage access');
reset role;set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_portal_publication(pg_temp.lid('case'),jsonb_build_object('membership_id',pg_temp.lid('membership'),'category','general','publication_kind','summary','title','Documentos em conferência','body','Seu atendimento está em análise.'))).id where name='publication';
update legal_test_ids set id=(public.legal_release_portal_document(pg_temp.lid('csv'),pg_temp.lid('membership'),'Reviewed selected fiscal extract',now()+interval '30 days')).id where name='release';
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(public.legal_portal_service_case(pg_temp.lid('external'),pg_temp.lid('membership'))->'publications'='[]'::jsonb,'draft content not visible externally');
select pg_temp.expect_error($q$select public.legal_portal_service_authorize_download(pg_temp.lid('external'),pg_temp.lid('membership'),pg_temp.lid('release'))$q$,'42501','draft release cannot download');
reset role;set local role authenticated;select pg_temp.login('owner');
select public.legal_review_portal_publication(pg_temp.lid('publication'),'approved','Exact client-facing text reviewed');
select public.legal_review_portal_document_release(pg_temp.lid('release'),'approved','Selected file and recipient reviewed');
update legal_test_ids set id=(public.legal_create_portal_publication(pg_temp.lid('case'),jsonb_build_object('membership_id',pg_temp.lid('membership'),'category','general','publication_kind','agenda','title','Retorno agendado','body','Compareça ao atendimento.','starts_at',now()+interval '2 days','ends_at',now()+interval '2 days 1 hour'))).id where name='agenda';
select public.legal_review_portal_publication(pg_temp.lid('agenda'),'approved','Explicit agenda projection reviewed');
update legal_test_ids set id=(public.legal_create_portal_export(pg_temp.lid('membership'),'Pacote fiscal selecionado',array[pg_temp.lid('release')])).id where name='export';
select public.legal_review_portal_export(pg_temp.lid('export'),'approved','Manifest of chosen fiscal documents only');
update legal_test_ids set id=(public.legal_create_portal_request(pg_temp.lid('membership'),jsonb_build_object('category','fiscal','title','Envie o informe','instructions','Somente o documento solicitado.','due_at',now()+interval '7 days','expires_at',now()+interval '14 days'))).id where name='request';
select pg_temp.assert_true(jsonb_array_length(public.legal_client_care_context(pg_temp.lid('case'))->'requests')=1,'staff context includes published pending request');
select pg_temp.expect_error($q$select public.legal_issue_document_request_token((select request_id from public.legal_portal_requests where id=pg_temp.lid('request')),repeat('6',64),now()+interval '1 day')$q$,'42501','portal request cannot be downgraded to public bearer collection');
select pg_temp.expect_error($q$update public.legal_portal_publications set body='Alter approved text'$q$,'42501','published text immutable without a new version');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(jsonb_array_length(public.legal_portal_service_case(pg_temp.lid('external'),pg_temp.lid('membership'))->'publications')=1 and jsonb_array_length(public.legal_portal_service_case(pg_temp.lid('external'),pg_temp.lid('membership'))->'agenda')=1,'only approved selected summary and agenda are visible');
select pg_temp.assert_true(public.legal_portal_service_case(pg_temp.lid('external'),pg_temp.lid('membership'))::text not like '%storage_path%' and public.legal_portal_service_case(pg_temp.lid('external'),pg_temp.lid('membership'))::text not like '%PRIVATE MEDICAL%','projection omits storage paths and unreleased medical filenames');
select pg_temp.assert_true(jsonb_array_length(public.legal_portal_service_request_export(pg_temp.lid('external'),pg_temp.lid('membership'),pg_temp.lid('export'))->'items')=1,'fiscal export contains only exact reviewed manifest');
select public.legal_portal_service_acknowledge(pg_temp.lid('external'),pg_temp.lid('publication'),pg_temp.lid('membership'));
select public.legal_portal_service_acknowledge(pg_temp.lid('external'),pg_temp.lid('publication'),pg_temp.lid('membership'));
select pg_temp.assert_true((select count(*) from public.legal_portal_acknowledgements)=1,'portal acknowledgement is version-specific and idempotent, not a signature');
select public.legal_portal_service_reply(pg_temp.lid('external'),pg_temp.lid('membership'),'general','Enviarei o documento.',pg_temp.lid('reply_key'));
select public.legal_portal_service_reply(pg_temp.lid('external'),pg_temp.lid('membership'),'general','Enviarei o documento.',pg_temp.lid('reply_key'));
select pg_temp.assert_true((select count(*) from public.legal_portal_messages)=1 and (select q.status from public.legal_portal_requests r join public.legal_document_requests q on q.id=r.request_id where r.id=pg_temp.lid('request'))='open','reply is idempotent and does not falsely resolve document request');
select pg_temp.expect_error($q$select public.legal_portal_service_reply(pg_temp.lid('external'),pg_temp.lid('membership'),'general','Changed body',pg_temp.lid('reply_key'))$q$,'22023','same reply key cannot rewrite content');
update legal_test_ids set id=(public.legal_portal_service_prepare_upload(pg_temp.lid('external'),pg_temp.lid('request'),'client.csv','text/csv',10)).id where name='upload';
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}' from public.legal_case_documents where id=pg_temp.lid('upload');
set local role service_role;
select public.legal_portal_service_finalize_upload(pg_temp.lid('external'),pg_temp.lid('request'),pg_temp.lid('upload'),repeat('5',64));
select pg_temp.assert_true((select identity_id=pg_temp.lid('external') from public.legal_portal_uploads where document_id=pg_temp.lid('upload')) and (select uploaded_by=pg_temp.lid('owner') from public.legal_case_documents where id=pg_temp.lid('upload')),'external actor stored separately from technical staff uploader FK');
select pg_temp.expect_error($q$select public.legal_portal_service_abandon_upload(pg_temp.lid('external'),pg_temp.lid('request'),pg_temp.lid('upload'))$q$,'22023','cleanup cannot delete bytes after successful finalize');
select pg_temp.expect_error($q$select public.legal_portal_service_prepare_upload(pg_temp.lid('external'),pg_temp.lid('request'),'again.csv','text/csv',10)$q$,'42501','single request cannot accept duplicate uploads');
reset role;
insert into public.legal_document_request_tokens(request_id,token_hash) select request_id,repeat('6',64) from public.legal_portal_requests where id=pg_temp.lid('request');
set local role service_role;
select pg_temp.expect_error($q$select public.legal_public_document_request(repeat('6',64))$q$,'42501','even preexisting bearer token cannot read a portal-bound request');
select pg_temp.expect_error($q$select public.legal_public_prepare_request_upload(repeat('6',64),'bypass.pdf','application/pdf',10)$q$,'42501','bearer token cannot bypass portal membership for upload');
select pg_temp.expect_error($q$select public.legal_public_finalize_request_upload(repeat('6',64),pg_temp.lid('upload'),repeat('5',64))$q$,'42501','legacy finalization cannot bypass external provenance and grants');

-- F5_TEST_CONTINUE

reset role;set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_communication(pg_temp.lid('case'),jsonb_build_object('membership_id',pg_temp.lid('membership'),'channel','portal','category','general','title','Atualização','body','Seu documento foi recebido para conferência.','expires_at',now()+interval '10 days'))).id where name='communication';
select pg_temp.expect_error($q$select public.legal_queue_communication(pg_temp.lid('communication'),gen_random_uuid())$q$,'22023','draft communication cannot dispatch');
select public.legal_review_communication(pg_temp.lid('communication'),'approved','Exact content and recipient reviewed');
select public.legal_queue_communication(pg_temp.lid('communication'),gen_random_uuid());
update legal_test_ids set id=(public.legal_create_communication(pg_temp.lid('case'),jsonb_build_object('membership_id',pg_temp.lid('membership'),'channel','email','category','medical','title','PRIVATE DIAGNOSIS','body','PRIVATE MEDICAL BODY','expires_at',now()+interval '10 days'))).id where name='email_comm';
select pg_temp.assert_true((select title='Nova atualização no portal' and body not like '%PRIVATE%' from public.legal_communication_versions where id=pg_temp.lid('email_comm')),'email transport replaces sensitive content with fixed generic notification');
select public.legal_review_communication(pg_temp.lid('email_comm'),'approved','Confirmed exact notification and reviewed contact');
select pg_temp.expect_error($q$select public.legal_queue_communication(pg_temp.lid('email_comm'),gen_random_uuid())$q$,'22023','unconfigured office transport cannot queue email');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.expect_error($q$select public.legal_communication_service_configure(pg_temp.lid('owner'),'resend','synthetic-office-account','email',true,pg_temp.lid('tenant_b'))$q$,'42501','server-owned expected tenant prevents provider account squatting');
select public.legal_communication_service_configure(pg_temp.lid('owner'),'resend','synthetic-office-account','email',true,pg_temp.lid('tenant_a'));
reset role;set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_queue_communication(pg_temp.lid('email_comm'),pg_temp.lid('key'))).id where name='job';
select pg_temp.assert_true((public.legal_queue_communication(pg_temp.lid('email_comm'),pg_temp.lid('key'))).id=pg_temp.lid('job'),'queue retries preserve a single durable job');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(public.legal_communication_service_claim('resend','synthetic-office-account',10,pg_temp.lid('tenant_b'))='[]'::jsonb,'wrong office dispatcher cannot touch or claim pending jobs');
update legal_test_ids set id=(public.legal_communication_service_claim('resend','synthetic-office-account',10,pg_temp.lid('tenant_a'))->0->>'lease_token')::uuid where name='lease';
select pg_temp.assert_true(public.legal_communication_service_claim('resend','synthetic-office-account',10,pg_temp.lid('tenant_a'))='[]'::jsonb,'active send lease cannot be claimed twice');
select public.legal_communication_service_complete(pg_temp.lid('job'),pg_temp.lid('lease'),'provider_accepted','synthetic-msg-1');
select pg_temp.assert_true((select state='provider_accepted' from public.legal_communication_jobs where id=pg_temp.lid('job')),'API acceptance does not imply delivered or read');
select public.legal_communication_service_receipt('resend','synthetic-office-account','event-read','synthetic-msg-1','read',now(),repeat('8',64),pg_temp.lid('tenant_a'));
select public.legal_communication_service_receipt('resend','synthetic-office-account','event-old-failure','synthetic-msg-1','failed',now()-interval '1 hour',repeat('9',64),pg_temp.lid('tenant_a'));
select public.legal_communication_service_receipt('resend','synthetic-office-account','event-read','synthetic-msg-1','read',now(),repeat('8',64),pg_temp.lid('tenant_a'));
select pg_temp.assert_true((select state='read' from public.legal_communication_jobs where id=pg_temp.lid('job')) and (select count(*) from public.legal_communication_receipts)=2,'replayed/out-of-order callback is idempotent and cannot downgrade confirmed read');
select pg_temp.assert_true(public.legal_communication_service_receipt('resend','synthetic-office-account','orphan','unknown-message','delivered',now(),repeat('a',64),pg_temp.lid('tenant_a'))->>'matched'='false','unknown message is quarantined rather than assigned through untrusted metadata');
select pg_temp.expect_error($q$select public.legal_communication_service_receipt('resend','synthetic-office-account','forged','synthetic-msg-1','delivered',now(),repeat('b',64),pg_temp.lid('tenant_b'))$q$,'42501','callback must match expected tenant/account binding');
select pg_temp.expect_error($q$select public.legal_communication_service_receipt('resend','synthetic-office-account','event-read','synthetic-msg-1','read',now(),repeat('c',64),pg_temp.lid('tenant_a'))$q$,'22023','provider event reused with altered hash rejected');
reset role;set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_communication(pg_temp.lid('case'),jsonb_build_object('membership_id',pg_temp.lid('membership'),'channel','email','category','general','title','Notice','body','Notice','expires_at',now()+interval '10 days'))).id where name='email_comm';
select public.legal_review_communication(pg_temp.lid('email_comm'),'approved','Second reviewed generic notification');
update legal_test_ids set id=(public.legal_queue_communication(pg_temp.lid('email_comm'),gen_random_uuid())).id where name='job';
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select public.legal_communication_service_claim('resend','synthetic-office-account',10,pg_temp.lid('tenant_a'));
reset role;update public.legal_communication_jobs set lease_until=clock_timestamp()-interval '1 second' where id=pg_temp.lid('job');set local role service_role;
select pg_temp.assert_true(public.legal_communication_service_claim('resend','synthetic-office-account',10,pg_temp.lid('tenant_a'))='[]'::jsonb,'lost lease is not blindly re-sent');
select pg_temp.assert_true((select state='unknown' from public.legal_communication_jobs where id=pg_temp.lid('job')),'lost lease becomes explicitly unknown');
reset role;set local role authenticated;select pg_temp.login('owner');
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.legal_my_day(now()-interval '1 day',now()+interval '10 days')->'items') x where x->>'kind'='communication'),'uncertain delivery appears in responsible work queue');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select public.legal_communication_service_receipt('resend','synthetic-office-account','early-delivered','synthetic-msg-2','delivered',now(),repeat('4',64),pg_temp.lid('tenant_a'));
select public.legal_communication_service_complete(pg_temp.lid('job'),(select lease_token from public.legal_communication_jobs where id=pg_temp.lid('job')),'provider_accepted','synthetic-msg-2');
select pg_temp.assert_true((select state='delivered' from public.legal_communication_jobs where id=pg_temp.lid('job')) and (select matched from public.legal_communication_receipts where event_id='early-delivered'),'callback preceding send response is reconciled by exact provider/account/message identity');

reset role;set local role authenticated;select pg_temp.login('owner');

select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.legal_my_day(now()-interval '1 day',now()+interval '10 days')->'items') x where x->>'kind'='waiting_client'),'submitted client document remains queued for explicit review');
update legal_test_ids set id=(public.legal_save_followup_rule(pg_temp.lid('case'),jsonb_build_object('title','Conferir retenção anual','purpose','Review income proofs without automatically revalidating medical evidence','assignee_id',pg_temp.lid('owner'),'substitute_id',pg_temp.lid('member'),'next_occurrence',current_date::text,'cadence','annual'))).id where name='followup';
select pg_temp.assert_true(public.legal_run_followups(pg_temp.lid('case'))=1,'annual rule creates one task for the due occurrence');
select pg_temp.assert_true(public.legal_run_followups(pg_temp.lid('case'))=0 and (select count(*) from public.legal_followup_occurrences)=1,'repeated scheduler is idempotent');
select pg_temp.assert_true((select next_occurrence=(current_date+interval '1 year')::date from public.legal_followup_rules where id=pg_temp.lid('followup')),'annual cadence preserves the next occurrence explicitly');
select public.legal_save_followup_rule(pg_temp.lid('case'),jsonb_build_object('state','paused','next_occurrence',current_date::text),pg_temp.lid('followup'));
select pg_temp.assert_true(public.legal_run_followups(pg_temp.lid('case'))=0,'paused follow-up never schedules a task');
select pg_temp.expect_error($q$select public.legal_save_followup_rule(pg_temp.lid('case'),jsonb_build_object('assignee_id',pg_temp.lid('outsider')),pg_temp.lid('followup'))$q$,'22023','annual task cannot be assigned outside the physical case');
select pg_temp.assert_true(jsonb_array_length(public.legal_client_care_context(pg_temp.lid('case'))->'jobs')=3,'follow-up scheduling creates no automatic communication');

select public.ir_record_cessation(pg_temp.lid('case'),jsonb_build_object('source_id',pg_temp.lid('source'),'observed_on',(current_date-1)::text,'competence','2026-08','previous_withheld','0.00','current_withheld','10.00','before_document_id',pg_temp.lid('csv'),'after_document_id',pg_temp.lid('fiscal'),'review_note','Retenção retomada em prova conferida'));
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.legal_my_day(now(),now()+interval '2 days')->'items') x where x->>'kind'='withholding_reopened'),'latest evidenced reopened withholding creates an internal alert without sending');
select public.ir_record_cessation(pg_temp.lid('case'),jsonb_build_object('source_id',pg_temp.lid('source'),'observed_on',current_date::text,'competence','2026-09','previous_withheld','10.00','current_withheld','0.00','before_document_id',pg_temp.lid('csv'),'after_document_id',pg_temp.lid('fiscal'),'review_note','Cessação em prova posterior conferida'));
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.legal_my_day(now(),now()+interval '2 days')->'items') x where x->>'kind'='withholding_reopened'),'later reviewed cessation resolves current alert without rewriting history');

-- Independently bound accountant/representative identities, never shared logins.
update legal_test_ids set id=(public.legal_create_portal_invite(pg_temp.lid('case'),pg_temp.invite_payload('accountant','accountant'))).id where name='invite_acc';
select public.legal_review_portal_invite(pg_temp.lid('invite_acc'),'approved','Named accountant authority/contact checked','documented_review',pg_temp.lid('general'));
update legal_test_ids set id=(public.legal_create_representation(pg_temp.lid('case'),jsonb_build_object('representative_party_id',pg_temp.lid('party2'),'basis','court_order','evidence_document_id',pg_temp.lid('general'),'valid_from',now()-interval '1 day','valid_until',now()+interval '100 days'))).id where name='representation';
select public.legal_activate_representation(pg_temp.lid('representation'),'Reviewed mandate and individual powers');
update legal_test_ids set id=(public.legal_create_portal_invite(pg_temp.lid('case'),pg_temp.invite_payload('representative','representative')||jsonb_build_object('representation_id',pg_temp.lid('representation')))).id where name='invite_rep';
select pg_temp.expect_error($q$select public.legal_review_portal_invite(pg_temp.lid('invite_rep'),'approved','Old upload power is insufficient','documented_review',pg_temp.lid('general'))$q$,'22023','legacy upload-only mandate does not inherit portal reading powers');
select public.legal_grant_portal_representation(pg_temp.lid('representation'),array['case_summary:read','agenda:read','messages:read','messages:write','requests:upload','documents:read','statements:read','fiscal_exports:read'],'Explicit additional portal powers reviewed');
select public.legal_review_portal_invite(pg_temp.lid('invite_rep'),'approved','Individual representative identity and specific powers checked','documented_review',pg_temp.lid('general'));
reset role;select pg_temp.login('owner','service_role');set local role service_role;
update legal_test_ids set id=(public.legal_portal_service_reserve(pg_temp.lid('owner'),pg_temp.lid('invite_acc'),pg_temp.lid('accountant'),gen_random_uuid())->>'id')::uuid where name='provision_acc';
update legal_test_ids set id=(public.legal_portal_service_reserve(pg_temp.lid('owner'),pg_temp.lid('invite_rep'),pg_temp.lid('representative'),gen_random_uuid())->>'id')::uuid where name='provision_rep';
reset role;
insert into auth.users(id,email,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at,created_at,updated_at) select id,'portal-'||id||'@example.invalid','authenticated','{}','{}',now(),now(),now() from legal_test_ids where name in ('accountant','representative');
set local role service_role;
select public.legal_portal_service_complete_provision(pg_temp.lid('owner'),pg_temp.lid('provision_acc'));
select public.legal_portal_service_complete_provision(pg_temp.lid('owner'),pg_temp.lid('provision_rep'));
select public.legal_portal_service_issue(pg_temp.lid('owner'),pg_temp.lid('invite_acc'),repeat('d',64));
select public.legal_portal_service_issue(pg_temp.lid('owner'),pg_temp.lid('invite_rep'),repeat('e',64));
update legal_test_ids set id=(public.legal_portal_service_accept(pg_temp.lid('accountant'),repeat('d',64))->>'membership_id')::uuid where name='membership_acc';
update legal_test_ids set id=(public.legal_portal_service_accept(pg_temp.lid('representative'),repeat('e',64))->>'membership_id')::uuid where name='membership_rep';
select pg_temp.assert_true(public.legal_portal_service_case(pg_temp.lid('accountant'),pg_temp.lid('membership_acc'))->'publications'='[]'::jsonb and public.legal_portal_service_case(pg_temp.lid('accountant'),pg_temp.lid('membership_acc'))->'messages'='[]'::jsonb and public.legal_portal_service_case(pg_temp.lid('accountant'),pg_temp.lid('membership_acc'))->'documents'='[]'::jsonb,'accountant receives no client chat, summaries or other recipient releases');
select pg_temp.expect_error($q$select public.legal_portal_service_authorize_download(pg_temp.lid('accountant'),pg_temp.lid('membership'),pg_temp.lid('release'))$q$,'42501','accountant cannot substitute client membership to download its release');
reset role;set local role authenticated;select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_release_portal_document(pg_temp.lid('medical'),pg_temp.lid('membership_acc'),'Medical bypass',now()+interval '1 day')$q$,'42501','staff cannot release medical evidence to fiscal-only accountant');
update legal_test_ids set id=(public.legal_release_portal_document(pg_temp.lid('csv'),pg_temp.lid('membership_acc'),'Accountant exact fiscal extract',now()+interval '30 days')).id where name='release_acc';
select public.legal_review_portal_document_release(pg_temp.lid('release_acc'),'approved','Exact accountant and purpose checked');
update legal_test_ids set id=(public.legal_create_portal_request(pg_temp.lid('membership_rep'),jsonb_build_object('category','medical','title','Envio pelo representante','instructions','Documento escolhido','expires_at',now()+interval '2 days'))).id where name='request_rep';
reset role;set local role service_role;select pg_temp.login('owner','service_role');
update legal_test_ids set id=(public.legal_portal_service_prepare_upload(pg_temp.lid('representative'),pg_temp.lid('request_rep'),'representative.pdf','application/pdf',10)).id where name='upload_rep';
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}' from public.legal_case_documents where id=pg_temp.lid('upload_rep');
set local role authenticated;select pg_temp.login('owner');
select pg_temp.assert_true(jsonb_array_length(public.legal_client_care_context(pg_temp.lid('case'))->'connections')=1 and (public.legal_client_care_context(pg_temp.lid('case'))->'connections')::text not like '%account_id%','staff transport status omits provider account identifiers');
select public.legal_set_workspace_enabled(false);
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(public.legal_portal_service_cases(pg_temp.lid('external'))='[]'::jsonb,'workspace feature disabled immediately hides all external grants');
reset role;set local role authenticated;select pg_temp.login('owner');select public.legal_set_workspace_enabled(true);
select pg_temp.expect_error($q$select public._legal_portal_download(pg_temp.lid('external'),pg_temp.lid('membership'),pg_temp.lid('release'))$q$,'42501','private download helper cannot be called directly by staff');
-- F5_CONCURRENCY_FIXTURE_READY
select public.legal_revoke_representation(pg_temp.lid('representation'),'Mandate revoked during an in-flight upload');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.expect_error($q$select public.legal_portal_service_finalize_upload(pg_temp.lid('representative'),pg_temp.lid('request_rep'),pg_temp.lid('upload_rep'),repeat('f',64))$q$,'42501','revoked mandate prevents finalize of already uploaded bytes');
select pg_temp.assert_true(public.legal_portal_service_abandon_upload(pg_temp.lid('representative'),pg_temp.lid('request_rep'),pg_temp.lid('upload_rep'))->>'cleanup_allowed'='true','trusted exact-actor cleanup authorized for prepared bytes after revocation');
select pg_temp.assert_true(public.legal_portal_service_cases(pg_temp.lid('representative'))='[]'::jsonb,'old representative JWT immediately loses case after mandate revocation');
reset role;set local role authenticated;select pg_temp.login('owner');
select public.legal_review_portal_document_release(pg_temp.lid('release'),'revoked','End document release');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.expect_error($q$select public.legal_portal_service_request_export(pg_temp.lid('external'),pg_temp.lid('membership'),pg_temp.lid('export'))$q$,'42501','export revalidates each release at download, not just approval');
reset role;set local role authenticated;select pg_temp.login('finance');
select pg_temp.assert_true(public.legal_client_care_context(pg_temp.lid('case'))->'invites'='[]'::jsonb and public.legal_client_care_context(pg_temp.lid('case'))::text not like '%PRIVATE MEDICAL%','fiscal operator cannot read grant identity reviews or medical material');
select pg_temp.expect_error($q$select public.legal_communication_service_claim('resend','synthetic-office-account',10,pg_temp.lid('tenant_a'))$q$,'42501','internal browser cannot claim or send provider jobs');
select pg_temp.login('same_admin');
select pg_temp.expect_error($q$select public.legal_client_care_context(pg_temp.lid('case'))$q$,'42501','unassigned administrator has no case portal management bypass');
select pg_temp.login('outsider');
select pg_temp.expect_error($q$select public.legal_client_care_context(pg_temp.lid('case'))$q$,'42501','platform tenant selection cannot reveal client care data');
select pg_temp.login('owner');
select public.legal_revoke_portal_access(null,pg_temp.lid('membership'),'Client access withdrawn');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(public.legal_portal_service_cases(pg_temp.lid('external'))='[]'::jsonb,'revoked membership disappears despite old external JWT');
select pg_temp.expect_error($q$select public.legal_portal_service_case(pg_temp.lid('external'),pg_temp.lid('membership'))$q$,'42501','revocation blocks body reads immediately');
select pg_temp.expect_error($q$select public.legal_portal_service_accept(pg_temp.lid('external'),repeat('2',64))$q$,'42501','old activation token cannot recreate revoked membership');
-- Reservations cannot bootstrap an internal workspace after expiry; existing
-- internal users remain untouched when a lawyer prepares a conflicting invite.
reset role;set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_portal_invite(pg_temp.lid('case'),pg_temp.invite_payload('document'))).id where name='invite2';
select public.legal_review_portal_invite(pg_temp.lid('invite2'),'approved','Synthetic pending identity reviewed','documented_review',pg_temp.lid('general'));
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select public.legal_portal_service_reserve(pg_temp.lid('owner'),pg_temp.lid('invite2'),pg_temp.lid('document'),gen_random_uuid());
reset role;update public.legal_portal_provisioning set expires_at=now()-interval '1 second' where auth_user_id=pg_temp.lid('document');
select pg_temp.expect_error($q$insert into auth.users(id,email,role) values(pg_temp.lid('document'),'portal-'||pg_temp.lid('document')||'@example.invalid','authenticated')$q$,'42501','expired trusted reservation fails closed before bootstrap');
select pg_temp.expect_error($q$insert into auth.users(id,email,role,raw_app_meta_data) values(gen_random_uuid(),'unreserved@example.invalid','legal_portal','{"legal_portal":true}')$q$,'42501','external app marker cannot create an account without trusted reservation');
set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_portal_invite(pg_temp.lid('case'),pg_temp.invite_payload('document')||jsonb_build_object('email',(select email from public.profiles where id=pg_temp.lid('owner'))))).id where name='invite2';
select public.legal_review_portal_invite(pg_temp.lid('invite2'),'approved','Conflicting internal contact reviewed without converting account','documented_review',pg_temp.lid('general'));
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.expect_error($q$select public.legal_portal_service_reserve(pg_temp.lid('owner'),pg_temp.lid('invite2'),gen_random_uuid(),gen_random_uuid())$q$,'22023','existing internal user cannot be converted, moved or assigned portal role');
reset role;update public.legal_portal_identities set state='suspended' where id=pg_temp.lid('accountant');set local role service_role;
select pg_temp.expect_error($q$select public.legal_portal_service_context(pg_temp.lid('accountant'))$q$,'42501','suspended identity cannot reuse existing sessions');
reset role;update public.legal_portal_identities set state='active' where id=pg_temp.lid('accountant');
update auth.users set email='changed-external@example.invalid' where id=pg_temp.lid('accountant');set local role service_role;
select pg_temp.expect_error($q$select public.legal_portal_service_context(pg_temp.lid('accountant'))$q$,'42501','changed email requires reverification instead of relinking identity');
reset role;
select pg_temp.assert_true(not exists(select 1 from public.profiles where id in(pg_temp.lid('external'),pg_temp.lid('accountant'),pg_temp.lid('representative'))),'all three external identities remain outside profiles and billing bootstrap');
select 'F5 portal/client-care regression PASS; all synthetic records roll back' as result;
rollback;
