-- F1 integration regression. Run ONLY in a disposable/local or isolated staging
-- database after migrations, with postgres privileges. Synthetic data rolls back.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/legal_core.sql
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

set local role authenticated;
select pg_temp.login('owner');
select pg_temp.assert_true((public.legal_workspace_context()->>'enabled')::boolean=false,'feature defaults disabled');
select pg_temp.expect_error($q$select public.legal_create_case('Before activation')$q$,'42501','disabled feature denies creation');
select public.legal_set_workspace_enabled(true);
select pg_temp.assert_true((public.legal_workspace_context()->>'can_create')::boolean,'active owner can create');
select pg_temp.assert_true(jsonb_array_length(public.legal_workspace_context()->'collaborators')=4,'collaborators actual tenant active only');
update legal_test_ids set id=(public.legal_create_case('Synthetic case',pg_temp.lid('customer_a'),pg_temp.lid('negotiation'))).id where name='case';
select pg_temp.assert_true((public.legal_create_case('Ignored repeated title',null,pg_temp.lid('negotiation'))).id=pg_temp.lid('case'),'conversion is idempotent');
select pg_temp.assert_true((select count(*) from public.legal_cases)=1,'no duplicate conversion');
select pg_temp.expect_error($q$select public.legal_create_case('Cross-tenant client',pg_temp.lid('customer_b'))$q$,'42501','cross-tenant customer rejected');
select pg_temp.expect_error($q$select public.legal_update_case(pg_temp.lid('case'),' {"owner_id":"00000000-0000-0000-0000-000000000000"}'::jsonb)$q$,'22023','case ownership cannot be patched');
select pg_temp.expect_error($q$update public.legal_cases set title='Bypass'$q$,'42501','direct case mutation denied');
select pg_temp.expect_error($q$delete from public.legal_cases$q$,'42501','case deletion denied');
select pg_temp.expect_error($q$select public.legal_update_case(pg_temp.lid('case'),'{"status":"aguardando"}'::jsonb)$q$,'23514','waiting requires reason');
select public.legal_update_case(pg_temp.lid('case'),'{"status":"aguardando","wait_reason":"Aguardar documento"}'::jsonb);
select public.legal_update_case(pg_temp.lid('case'),'{"status":"ativo","next_action":"Revisar dados"}'::jsonb);
select public.legal_add_case_party(pg_temp.lid('case'),'Parte sintética','requerente',pg_temp.lid('customer_a'));
select pg_temp.expect_error($q$select public.legal_add_case_party(pg_temp.lid('case'),'Outro','parte',pg_temp.lid('customer_b'))$q$,'42501','cross-tenant party customer denied');
select public.legal_add_proceeding(pg_temp.lid('case'),'0000001-45.2024.8.26.0001','Tribunal sintético');
select pg_temp.expect_error($q$select public.legal_add_proceeding(pg_temp.lid('case'),'0000001-00.2024.8.26.0001')$q$,'22023','invalid CNJ checksum denied');
select public.legal_add_case_event(pg_temp.lid('case'),'Nota operacional sintética.');
select pg_temp.expect_error($q$update public.legal_case_events set description='Rewrite'$q$,'42501','events cannot be rewritten');
select pg_temp.expect_error($q$delete from public.legal_case_events$q$,'42501','events cannot be erased');
select pg_temp.expect_error($q$select public._legal_record_event(pg_temp.lid('case'),'case_created','Spoof')$q$,'42501','internal event RPC unavailable');
select pg_temp.expect_error($q$select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('outsider'))$q$,'22023','cross-tenant membership denied');
select pg_temp.expect_error($q$select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('inactive'))$q$,'22023','inactive membership denied');
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,false,false);
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('finance'),false,false,true);
select pg_temp.assert_true(exists(select 1 from public.legal_case_events where case_id=pg_temp.lid('case')
  and event_type='member_granted' and metadata=jsonb_build_object('profile_id',pg_temp.lid('finance'),
    'can_edit',false,'can_view_medical',false,'can_view_fiscal',true)),
  'membership audit records exact granted permissions without sensitive data');
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'medical','Hidden medical filename','hidden-medical.pdf','application/pdf',10)).id where name='document';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'fiscal','Fiscal document','fiscal.pdf','application/pdf',10)).id where name='fiscal';
select pg_temp.expect_error($q$select public.legal_finalize_document(pg_temp.lid('document'),repeat('a',64))$q$,'42501','authenticated author cannot falsify hash');
select pg_temp.expect_error($q$select public.legal_prepare_document(pg_temp.lid('case'),'general','Large','large.pdf','application/pdf',10485761)$q$,'22023','per-document size cap');
select pg_temp.expect_error($q$select public.legal_prepare_document(pg_temp.lid('case'),'general','HTML','a.html','text/html',10)$q$,'23514','active HTML disallowed');
select pg_temp.expect_error($q$select public.legal_set_document_hold(pg_temp.lid('document'),false,'')$q$,'22023','retention release requires reason');
select public.legal_set_document_hold(pg_temp.lid('document'),false,'Synthetic reason');
select pg_temp.assert_true(not exists(select 1 from public.legal_case_events where description like '%Hidden medical%' or metadata::text like '%hidden-medical%' or metadata::text like '%Synthetic reason%'),'shared audit excludes sensitive document metadata/reason');

select pg_temp.login('member');
select pg_temp.assert_true((select count(*) from public.legal_cases)=1,'explicit member can see case');
select pg_temp.assert_true((select count(*) from public.legal_case_documents)=0,'member without category grants sees no medical/fiscal metadata');
select pg_temp.assert_true((select count(*) from public.legal_document_retention_events)=0,'retention reason follows document category ACL');
select pg_temp.expect_error($q$select public.legal_create_case('Privilege through membership')$q$,'42501','membership does not grant creation');
select pg_temp.expect_error($q$select public.legal_set_workspace_enabled(false)$q$,'42501','member cannot switch workspace feature');
select pg_temp.expect_error($q$select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,true,true)$q$,'42501','member cannot self-promote category access');
select pg_temp.expect_error($q$select public.legal_prepare_document(pg_temp.lid('case'),'medical','Bypass','b.pdf','application/pdf',10)$q$,'42501','member cannot upload outside category grant');
select public.legal_update_case(pg_temp.lid('case'),'{"next_action":"Edited by authorized member"}'::jsonb);
select public.legal_set_professional_profile('123456','SP');
select pg_temp.assert_true((public.legal_workspace_context()->>'can_create')::boolean=false,'OAB does not grant privileges');

select pg_temp.login('finance');
select pg_temp.assert_true((select count(*) from public.legal_case_documents)=1,'fiscal grant does not expose medical document');
select pg_temp.expect_error($q$select public.legal_update_case(pg_temp.lid('case'),'{"title":"Finance edit"}'::jsonb)$q$,'42501','viewer cannot edit');

select pg_temp.login('same_admin');
select pg_temp.assert_true((select count(*) from public.legal_cases)=0,'unassigned same-tenant admin has no bypass');
select pg_temp.assert_true((select count(*) from public.legal_case_events)=0,'unassigned admin cannot read events');
select pg_temp.expect_error($q$select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('same_admin'),true,true,true)$q$,'42501','unassigned admin cannot take over');
select pg_temp.expect_error($q$select public.legal_create_case('Steal conversion',null,pg_temp.lid('negotiation'))$q$,'42501','idempotent conversion does not reveal inaccessible existing case');

select pg_temp.login('outsider');
select public.legal_set_workspace_enabled(true);
select pg_temp.assert_true(public.legal_workspace_context()->>'tenant_id'=pg_temp.lid('tenant_b')::text,'platform impersonation never overrides actual legal tenant');
select pg_temp.assert_true((select count(*) from public.legal_cases)=0,'other tenant sees no case');
select pg_temp.assert_true((select count(*) from public.legal_case_parties)=0,'other tenant sees no parties');
select pg_temp.assert_true((select count(*) from public.judicial_proceedings)=0,'other tenant sees no proceedings');
select pg_temp.expect_error($q$select public.legal_create_case('Cross-tenant conversion',null,pg_temp.lid('negotiation'))$q$,'42501','cross-tenant conversion denied');

select pg_temp.login('owner');
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,true,false);
select pg_temp.login('member');
select pg_temp.assert_true((select count(*) from public.legal_case_documents)=1,'explicit medical grant reveals authorized category');
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'medical','Revoked draft','revoked.pdf','application/pdf',10)).id where name='revoked_document';

-- Internal upload/finalize mirrors the Edge function's trusted boundary. No file
-- body enters the fixture, only the storage metadata necessary for the invariant.
reset role;
select pg_temp.login('owner','service_role');
insert into storage.objects(bucket_id,name,metadata)
  select 'legal-case-documents',storage_path,'{"size":10,"mimetype":"application/pdf"}'::jsonb from public.legal_case_documents where id in (pg_temp.lid('document'),pg_temp.lid('revoked_document'));
set local role service_role;
select public.legal_finalize_document(pg_temp.lid('document'),repeat('a',64));
select public.legal_finalize_document(pg_temp.lid('document'),repeat('a',64));
select pg_temp.expect_error($q$select public.legal_finalize_document(pg_temp.lid('document'),repeat('b',64))$q$,'22023','ready hash cannot be changed');
select pg_temp.expect_error($q$select public.legal_finalize_document(pg_temp.lid('fiscal'),repeat('a',64))$q$,'22023','unuploaded object cannot finalize');
select pg_temp.expect_error($q$select public.legal_abandon_document(pg_temp.lid('document'))$q$,'22023','ready document cannot be abandoned');

set local role authenticated;
select pg_temp.login('member');
select public.legal_record_document_download(pg_temp.lid('document'));
select pg_temp.assert_true((select count(*) from storage.objects where bucket_id='legal-case-documents')=0,'raw storage objects hidden even with document grant');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values('legal-case-documents','bypass')$q$,'42501','direct storage upload denied');
select pg_temp.expect_error($q$select public.legal_abandon_document(pg_temp.lid('fiscal'))$q$,'42501','draft abandonment is server-only');
select pg_temp.login('owner');
select public.legal_remove_case_member(pg_temp.lid('case'),pg_temp.lid('member'));
select pg_temp.login('member');
select pg_temp.assert_true((select count(*) from public.legal_cases)=0,'revocation removes case access');
select pg_temp.assert_true((select count(*) from public.legal_case_documents)=0,'revocation removes document metadata access');
select pg_temp.expect_error($q$select public.legal_record_document_download(pg_temp.lid('document'))$q$,'42501','revocation removes download authorization');

reset role;
select pg_temp.login('owner','service_role');
set local role service_role;
select pg_temp.expect_error($q$select public.legal_finalize_document(pg_temp.lid('revoked_document'),repeat('c',64))$q$,'42501','server finalize rechecks grant revoked during upload');
reset role;
-- Synthetic metadata only, no remote object; mirror successful Storage API cleanup.
set local storage.allow_delete_query='true';
delete from storage.objects where bucket_id='legal-case-documents' and name=(select storage_path from public.legal_case_documents where id=pg_temp.lid('revoked_document'));
set local storage.allow_delete_query='false';
set local role service_role;
select public.legal_abandon_document(pg_temp.lid('revoked_document'));
select pg_temp.assert_true((select status='abandoned' from public.legal_case_documents where id=pg_temp.lid('revoked_document')),'failed upload releases reservation without deleting metadata');

set local role authenticated;
select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_case('Quota case')).id where name='quota_case';
do $$begin
  for i in 1..20 loop perform public.legal_prepare_document(pg_temp.lid('quota_case'),'general','Quota reservation','quota.pdf','application/pdf',10485760); end loop;
end;$$;
select pg_temp.expect_error($q$select public.legal_prepare_document(pg_temp.lid('quota_case'),'general','Above quota','quota.pdf','application/pdf',1)$q$,'22023','prepared records reserve the per-case quota');
select public.legal_set_workspace_enabled(false);
select pg_temp.assert_true((select count(*) from public.legal_cases)=0,'feature deactivation hides legal data without deleting it');
select pg_temp.expect_error($q$select public.legal_update_case(pg_temp.lid('case'),'{"title":"Disabled write"}'::jsonb)$q$,'42501','feature deactivation blocks writes');
select public.legal_set_workspace_enabled(true);
select pg_temp.assert_true((select count(*) from public.legal_cases)=2,'reactivation preserves cases');

-- Profiles becoming inactive immediately lose access despite ownership/grants.
reset role;
select pg_temp.login('owner','service_role');
update public.profiles set status='inactive' where id=pg_temp.lid('owner');
set local role authenticated;
select pg_temp.login('owner');
select pg_temp.assert_true((select count(*) from public.legal_cases)=0,'inactive owner loses access');
select pg_temp.expect_error($q$select public.legal_workspace_context()$q$,'42501','inactive workspace context denied');
select pg_temp.expect_error($q$select public.legal_set_workspace_enabled(false)$q$,'42501','inactive admin cannot change flag');
reset role;
select pg_temp.login('owner','service_role');
update public.profiles set status='active' where id=pg_temp.lid('owner');

-- No unrelated CRM records were rewritten by conversion and audit is append-only.
select pg_temp.assert_true((select title='Keep original negotiation' and status='em_andamento' from public.crm_negotiations where id=pg_temp.lid('negotiation')),'conversion preserves original CRM data');
select pg_temp.assert_true((select count(*) from public.legal_case_events where case_id=pg_temp.lid('case') and event_type='document_ready')=1,'repeat finalization emits no duplicate ready event');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.legal_finalize_document(uuid,text)','EXECUTE'),'finalization never granted to authenticated');
select pg_temp.assert_true(not has_function_privilege('anon','public.legal_workspace_context()','EXECUTE'),'anonymous RPC access denied');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.legal_case_events','DELETE'),'no delete privilege for legal audit');

rollback;
select 'PASS: legal core isolation, grants, conversion, audit, document ACL and quota regressions (all fixtures rolled back)' as result;
