-- F5 finance portal regression. Run ONLY in a disposable/local or isolated staging
-- database after migrations, with postgres privileges. Synthetic data rolls back.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/legal_case_finance_portal.sql
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


insert into legal_test_ids(name) values('case2'),('medical'),('proof'),('signature'),('instrument'),('instrument_version'),('agreement'),('basis'),('fee'),('advance'),('cost'),('tx'),('tx2'),('allocation'),('reversal'),('statement'),('connection'),('charge'),('lease'),('receipt'),('key');
set local role authenticated;select pg_temp.login('owner');select public.legal_set_workspace_enabled(true);
update legal_test_ids set id=(public.legal_create_case('Synthetic finance case',pg_temp.lid('customer_a'))).id where name='case';
update legal_test_ids set id=(public.legal_create_case('Synthetic other case',pg_temp.lid('customer_a'))).id where name='case2';
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,false,false);
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('finance'),true,false,true);
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'general','Signed contract proof','contract.pdf','application/pdf',10)).id where name='document';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'fiscal','Bank statement proof','bank.pdf','application/pdf',10)).id where name='proof';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'medical','PRIVATE CLINICAL','medical.pdf','application/pdf',10)).id where name='medical';
reset role;select pg_temp.login('owner','service_role');
insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}' from public.legal_case_documents where case_id=pg_temp.lid('case');
set local role service_role;select public.legal_finalize_document(id,encode(sha256(convert_to(id::text,'UTF8')),'hex')) from public.legal_case_documents where case_id=pg_temp.lid('case');
reset role;set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_instrument(pg_temp.lid('case'),'contract','Synthetic fee contract','general','Independently reviewed fixed fee of 100.00; no real client.')).id where name='instrument';
update legal_test_ids set id=(select id from public.legal_instrument_versions where instrument_id=pg_temp.lid('instrument') and version_number=1) where name='instrument_version';
select public.legal_submit_instrument_review(pg_temp.lid('instrument_version'));
select public.legal_review_instrument(pg_temp.lid('instrument_version'),'approved','Synthetic human review');
update legal_test_ids set id=(public.legal_record_external_signature(pg_temp.lid('instrument_version'),pg_temp.lid('document'),'Synthetic signed documentary evidence')).id where name='signature';
update legal_test_ids set id=(public.legal_create_fee_agreement(pg_temp.lid('case'),jsonb_build_object('agreement_key','main','instrument_version_id',pg_temp.lid('instrument_version'),'title','Fee 100','model','fixed','fixed_amount','100.00','success_rate','0','basis_kind','manual','trigger_description','Due after documented work','exclusions','No court fees'))).id where name='agreement';
select pg_temp.expect_error($q$select public.legal_review_fee_agreement(pg_temp.lid('agreement'),'approved','No signature')$q$,'22023','agreement needs exact accepted contract proof');
select public.legal_review_fee_agreement(pg_temp.lid('agreement'),'approved','Reviewed acceptance and terms',pg_temp.lid('signature'));
update legal_test_ids set id=(public.legal_create_fee_basis(pg_temp.lid('agreement'),jsonb_build_object('title','Reviewed fixed base','source_ids','[]'::jsonb,'document_id',pg_temp.lid('proof'),'proof_line','basis-1','base_amount','100.00','deductions','0.00','justification','Independent fixed amount source'))).id where name='basis';
select public.legal_review_fee_basis(pg_temp.lid('basis'),'approved','100.00 independently checked');
select pg_temp.assert_true((select fee_amount='100.00' from public.legal_fee_basis_versions where id=pg_temp.lid('basis')),'fixed fee exact');
create function pg_temp.obligation(p_title text,p_category text,p_direction text,p_owner text,p_amount text) returns jsonb language sql stable as $$select jsonb_build_object('title',p_title,'category',p_category,'direction',p_direction,'funds_owner',p_owner,'beneficiary',case when p_category='client_transfer' then 'client' when p_category='cost' then 'third_party' else 'office' end,'amount',p_amount,'due_on',(current_timestamp at time zone 'America/Sao_Paulo')::date,'document_id',pg_temp.lid('proof'))$$;
update legal_test_ids set id=(public.legal_create_financial_obligation(pg_temp.lid('case'),(pg_temp.obligation('Fee instalment','fee','receivable','office','100.00')-'document_id')||jsonb_build_object('agreement_id',pg_temp.lid('agreement'),'basis_id',pg_temp.lid('basis')))).id where name='fee';
select public.legal_review_financial_obligation(pg_temp.lid('fee'),'Verified contractual instalment');
select pg_temp.expect_error($q$select public.legal_create_financial_obligation(pg_temp.lid('case'),(pg_temp.obligation('Duplicate fee','fee','receivable','office','0.01')-'document_id')||jsonb_build_object('agreement_id',pg_temp.lid('agreement'),'basis_id',pg_temp.lid('basis')))$q$,'22023','instalments cannot exceed fee basis');
update legal_test_ids set id=(public.legal_create_financial_obligation(pg_temp.lid('case'),pg_temp.obligation('Client custody advance','advance','receivable','client','200.00'))).id where name='advance';
select public.legal_review_financial_obligation(pg_temp.lid('advance'),'No office revenue implied');
update legal_test_ids set id=(public.legal_create_financial_obligation(pg_temp.lid('case'),pg_temp.obligation('Client court cost','cost','payable','client','50.00'))).id where name='cost';
select public.legal_review_financial_obligation(pg_temp.lid('cost'),'Documented cost');
create function pg_temp.cash(p_from text,p_to text,p_amount text,p_line text) returns jsonb language sql stable as $$ select jsonb_build_object('from_owner',p_from,'to_owner',p_to,'amount',p_amount,'occurred_on',(current_timestamp at time zone 'America/Sao_Paulo')::date,'document_id',pg_temp.lid('proof'),'proof_line',p_line,'reference','ref-'||p_line,'reason','Synthetic documentary cash entry','idempotency_key',gen_random_uuid()) $$;
select pg_temp.expect_error($q$select public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('client','external','0.01','no-balance'))$q$,'22023','no custody overdraft');
select pg_temp.expect_error($q$select public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('external','client','1.00','medical')||jsonb_build_object('document_id',pg_temp.lid('medical')))$q$,'42501','clinical proof cannot enter finance');
update legal_test_ids set id=(public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('external','client','200.00','advance'))).id where name='tx';
select public.legal_allocate_cash_transaction(pg_temp.lid('tx'),pg_temp.lid('advance'),'200.00',gen_random_uuid(),'Advance receipt');
select pg_temp.assert_true(public.legal_get_case_financial_context(pg_temp.lid('case'))->>'client_balance'='200.00','client funds are in custody');
select pg_temp.assert_true(public.legal_get_case_financial_context(pg_temp.lid('case'))->>'office_balance'='0.00','client money is not office revenue');
select pg_temp.expect_error($q$select public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('external','office','200.00','advance'))$q$,'23505','same proof cannot be recorded again with different owner');
select pg_temp.expect_error($q$select public.legal_allocate_cash_transaction(pg_temp.lid('tx'),pg_temp.lid('fee'),'1.00',gen_random_uuid(),'Wrong owner')$q$,'22023','client receipt cannot directly settle office fee');
select pg_temp.expect_error($q$select public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('client','office','40.00','missing-authority'))$q$,'22023','compensation requires reviewed fee');
update legal_test_ids set id=(public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('client','office','40.00','compensate')||jsonb_build_object('transfer_obligation_id',pg_temp.lid('fee'),'compensation_authorized',true))).id where name='tx2';
select pg_temp.assert_true((public.legal_get_case_financial_context(pg_temp.lid('case'))->'obligations' @> jsonb_build_array(jsonb_build_object('id',pg_temp.lid('fee'),'paid','40.00','remaining','60.00'))),'compensation and allocation atomic');
select pg_temp.assert_true(public.legal_get_case_financial_context(pg_temp.lid('case'))->>'client_balance'='160.00' and public.legal_get_case_financial_context(pg_temp.lid('case'))->>'office_balance'='40.00','custody balances remain separate');
update legal_test_ids set id=(public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('office','client','10.00','reverse-compensation')||jsonb_build_object('reverses_id',pg_temp.lid('tx2'),'transfer_obligation_id',pg_temp.lid('fee')))).id where name='reversal';
select pg_temp.assert_true((public.legal_get_case_financial_context(pg_temp.lid('case'))->'obligations' @> jsonb_build_array(jsonb_build_object('id',pg_temp.lid('fee'),'paid','30.00','remaining','70.00'))),'partial reversal reopens exact fee amount');
select pg_temp.expect_error($q$select public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('office','client','31.00','over-refund')||jsonb_build_object('reverses_id',pg_temp.lid('tx2'),'transfer_obligation_id',pg_temp.lid('fee')))$q$,'22023','sum of reversals capped');
select pg_temp.expect_error($q$select public.legal_cancel_financial_obligation(pg_temp.lid('fee'),'Erase settled fee')$q$,'22023','paid obligation cannot disappear');
select pg_temp.expect_error($q$select public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('client','external','20.00','reverse-advance-missing')||jsonb_build_object('reverses_id',pg_temp.lid('tx')))$q$,'22023','allocated receipt reversal requires linked allocation refund');
update legal_test_ids set id=(select id from public.legal_cash_allocations where cash_transaction_id=pg_temp.lid('tx') and kind='settlement') where name='allocation';
select public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('client','external','20.00','reverse-advance')||jsonb_build_object('reverses_id',pg_temp.lid('tx'),'allocation_reversals',jsonb_build_array(jsonb_build_object('allocation_id',pg_temp.lid('allocation'),'amount','20.00'))));
select pg_temp.assert_true((public.legal_get_case_financial_context(pg_temp.lid('case'))->'obligations' @> jsonb_build_array(jsonb_build_object('id',pg_temp.lid('advance'),'paid','180.00','remaining','20.00'))),'external partial reversal reopens custody advance');
select pg_temp.expect_error($q$select public.legal_allocate_cash_transaction(pg_temp.lid('tx'),pg_temp.lid('advance'),'0.01',gen_random_uuid(),'Reusing reversed money')$q$,'22023','reversed funds cannot settle again');
update legal_test_ids set id=(public.legal_create_financial_statement(pg_temp.lid('case'),'September statement',(current_timestamp at time zone 'America/Sao_Paulo')::date-1,(current_timestamp at time zone 'America/Sao_Paulo')::date,'Public reviewed explanation, no clinical details.')).id where name='statement';
select public.legal_review_financial_statement(pg_temp.lid('statement'),'approved','150.00 client, 30.00 office; obligations current at generation');
select pg_temp.assert_true((select snapshot->'closing'->>'client'='150.00' and snapshot->'closing'->>'office'='30.00' from public.legal_financial_statement_versions where id=pg_temp.lid('statement')),'statement independent exact expected closing balances');
select pg_temp.assert_true((select snapshot::text not like '%PRIVATE CLINICAL%' and snapshot::text not like '%document_id%' and snapshot::text not like '%Synthetic documentary cash entry%' from public.legal_financial_statement_versions where id=pg_temp.lid('statement')),'statement excludes clinical content proof IDs and internal cash notes');
select pg_temp.expect_error($q$update public.legal_cash_transactions set amount='0.01'$q$,'42501','cash history immutable');
select pg_temp.expect_error($q$delete from public.legal_cash_allocations$q$,'42501','allocation history immutable');
select pg_temp.expect_error($q$select public._legal_finance_balance(pg_temp.lid('case'),'client')$q$,'42501','private helper not exposed through PUBLIC EXECUTE');
select pg_temp.expect_error($q$select public.legal_finance_service_claim(pg_temp.lid('tenant_a'),'acc','sandbox',true)$q$,'42501','staff cannot dispatch service queue');
select pg_temp.login('finance');
select pg_temp.assert_true((select count(*) from public.legal_cash_transactions)>0,'fiscal editor can read case finance');
select pg_temp.expect_error($q$select public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('external','office','1.00','editor'))$q$,'42501','editor cannot confirm money');
select pg_temp.login('member');
select pg_temp.assert_true((select count(*) from public.legal_cash_transactions)=0,'nonfiscal member cannot read finance');
select pg_temp.expect_error($q$select public.legal_get_case_financial_context(pg_temp.lid('case'))$q$,'42501','context enforces fiscal ACL');
select pg_temp.login('outsider');
select pg_temp.assert_true((select count(*) from public.legal_fee_agreement_versions)=0,'outsider including selected platform tenant cannot read agreements');
select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_save_payment_connection('Synthetic fee sandbox','acct_synthetic','sandbox')).id where name='connection';
update legal_test_ids set id=(public.legal_prepare_charge(pg_temp.lid('fee'),jsonb_build_object('connection_id',pg_temp.lid('connection'),'amount','70.00','provider_customer_id','cus_synthetic','billing_type','PIX','due_on',(current_timestamp at time zone 'America/Sao_Paulo')::date+1,'idempotency_key',pg_temp.lid('key')))->>'id')::uuid where name='charge';
select public.legal_review_charge(pg_temp.lid('charge'),'Explicit synthetic payee, customer, amount and notification review');
select pg_temp.expect_error($q$select public.legal_prepare_charge(pg_temp.lid('fee'),jsonb_build_object('connection_id',pg_temp.lid('connection'),'amount','70.00','provider_customer_id','cus_synthetic','billing_type','PIX','due_on',(current_timestamp at time zone 'America/Sao_Paulo')::date+1,'idempotency_key',gen_random_uuid()))$q$,'22023','active external charge prevents duplicate attempt');
reset role;select pg_temp.login('owner','service_role');set local role service_role;
select pg_temp.assert_true(public.legal_finance_service_claim(null,null,null,false)='[]'::jsonb,'unconfigured provider never produces sendable work');
select pg_temp.assert_true(public.legal_finance_service_claim(pg_temp.lid('tenant_a'),'acct_synthetic','sandbox',false)='[]'::jsonb,'unconfigured binding persists state only for its own account');
select pg_temp.assert_true((select status='not_configured' from public.legal_charge_attempts where id=pg_temp.lid('charge')),'unconfigured state persisted');
select pg_temp.assert_true(public.legal_finance_service_claim(pg_temp.lid('tenant_b'),'acct_synthetic','sandbox',true)='[]'::jsonb,'server account binding prevents cross tenant claim');
create temp table finance_claim as select public.legal_finance_service_claim(pg_temp.lid('tenant_a'),'acct_synthetic','sandbox',true) payload;
update legal_test_ids set id=(select (payload->0->>'lease_token')::uuid from finance_claim) where name='lease';
select pg_temp.assert_true((select payload->0->>'amount'='70.00' from finance_claim),'approved charge claimed with exact decimal');
select pg_temp.assert_true(public.legal_finance_service_claim(pg_temp.lid('tenant_a'),'acct_synthetic','sandbox',true)='[]'::jsonb,'claimed attempt never sent twice');
select public.legal_finance_service_finish(pg_temp.lid('charge'),pg_temp.lid('lease'),'provider_accepted','pay_synthetic','https://sandbox.asaas.com/i/synthetic','PENDING');
select pg_temp.expect_error($q$select public.legal_finance_service_finish(pg_temp.lid('charge'),pg_temp.lid('lease'),'provider_accepted','pay_other')$q$,'22023','completed attempt cannot be relinked');
create function pg_temp.receipt(p_amount text default '70.00') returns jsonb language sql stable as $$select jsonb_build_object('provider_event_id','evt_synthetic','event_type','PAYMENT_RECEIVED','provider_created_at',now(),'provider_charge_id','pay_synthetic','external_reference',pg_temp.lid('charge'),'provider_customer_id','cus_synthetic','amount',p_amount,'body_hash',repeat('a',64),'safe_payload','{}'::jsonb)$$;
update legal_test_ids set id=(public.legal_finance_service_receipt(pg_temp.lid('tenant_a'),'acct_synthetic','sandbox',pg_temp.receipt())).id where name='receipt';
select pg_temp.assert_true((public.legal_finance_service_receipt(pg_temp.lid('tenant_a'),'acct_synthetic','sandbox',pg_temp.receipt())).id=pg_temp.lid('receipt'),'webhook replay is idempotent');
select pg_temp.expect_error($q$select public.legal_finance_service_receipt(pg_temp.lid('tenant_a'),'acct_synthetic','sandbox',pg_temp.receipt()||jsonb_build_object('body_hash',repeat('b',64)))$q$,'22023','replayed event with changed bytes denied');
select pg_temp.expect_error($q$select public.legal_finance_service_receipt(pg_temp.lid('tenant_a'),'acct_synthetic','sandbox',pg_temp.receipt('700.00'))$q$,'22023','receipt gross amount mismatch denied');
reset role;set local role authenticated;select pg_temp.login('owner');
select pg_temp.assert_true((public.legal_get_case_financial_context(pg_temp.lid('case'))->'obligations' @> jsonb_build_array(jsonb_build_object('id',pg_temp.lid('fee'),'paid','30.00','remaining','70.00'))),'provider accepted and webhook do not imply cash');
update legal_test_ids set id=(public.legal_record_cash_transaction(pg_temp.lid('case'),pg_temp.cash('external','office','70.00','provider-settled'))).id where name='tx2';
select public.legal_allocate_cash_transaction(pg_temp.lid('tx2'),pg_temp.lid('fee'),'70.00',gen_random_uuid(),'Statement verified received amount');
select public.legal_reconcile_payment_receipt(pg_temp.lid('receipt'),pg_temp.lid('tx2'),'Gross and net independently checked, no synthetic fee difference');
select pg_temp.assert_true((select status='reconciled' from public.legal_charge_attempts where id=pg_temp.lid('charge')),'full documented settlement closes charge');
select pg_temp.assert_true((select snapshot->'closing'->>'office'='30.00' from public.legal_financial_statement_versions where id=pg_temp.lid('statement')),'old approved statement remains immutable after new money');

reset role;
insert into legal_test_ids(name) values('portal_user'),('portal_party'),('portal_party2'),('portal_invite'),('portal_invite2'),('portal_provision'),('portal_member'),('portal_member2'),('portal_statement'),('portal_release');
set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_add_case_party(pg_temp.lid('case'),'Synthetic statement recipient','client',pg_temp.lid('customer_a'))).id where name='portal_party';
update legal_test_ids set id=(public.legal_add_case_party(pg_temp.lid('case2'),'Other case party','client',pg_temp.lid('customer_a'))).id where name='portal_party2';
create function pg_temp.portal_invite(p_party_id uuid) returns jsonb language sql stable as $$select jsonb_build_object('party_id',p_party_id,'email','finance-portal-'||pg_temp.lid('portal_user')||'@example.invalid','access_kind','client','scopes',jsonb_build_array('statements:read'),'allow_fiscal',true,'allow_medical',false,'public_title','Prestação de contas','purpose','Selected personal statement only','expires_at',now()+interval '30 days')$$;
update legal_test_ids set id=(public.legal_create_portal_invite(pg_temp.lid('case'),pg_temp.portal_invite(pg_temp.lid('portal_party')))).id where name='portal_invite';
select public.legal_review_portal_invite(pg_temp.lid('portal_invite'),'approved','Identity and contact reviewed separately from activation','documented_review',pg_temp.lid('document'));
reset role;select pg_temp.login('owner','service_role');set local role service_role;
update legal_test_ids set id=(public.legal_portal_service_reserve(pg_temp.lid('owner'),pg_temp.lid('portal_invite'),pg_temp.lid('portal_user'),gen_random_uuid())->>'id')::uuid where name='portal_provision';
reset role;
insert into auth.users(id,email,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at,created_at,updated_at) values(pg_temp.lid('portal_user'),'finance-portal-'||pg_temp.lid('portal_user')||'@example.invalid','authenticated','{}','{}',now(),now(),now());
set local role service_role;
select public.legal_portal_service_complete_provision(pg_temp.lid('owner'),pg_temp.lid('portal_provision'));
select public.legal_portal_service_issue(pg_temp.lid('owner'),pg_temp.lid('portal_invite'),repeat('e',64));
update legal_test_ids set id=(public.legal_portal_service_accept(pg_temp.lid('portal_user'),repeat('e',64))->>'membership_id')::uuid where name='portal_member';
select pg_temp.assert_true(public.legal_portal_service_statements(pg_temp.lid('portal_user'),pg_temp.lid('portal_member'))='[]'::jsonb,'statement scope does not automatically expose any financial version');
select pg_temp.expect_error($q$select public.legal_portal_service_statements(pg_temp.lid('outsider'),pg_temp.lid('portal_member'))$q$,'42501','statement cannot be read under another external actor');
reset role;set local role authenticated;select pg_temp.login('owner');
select pg_temp.expect_error($q$select public.legal_release_financial_statement(pg_temp.lid('statement'),pg_temp.lid('portal_member'),now()+interval '1 day','Release stale financial snapshot')$q$,'22023','changed money requires fresh statement review before new release');
update legal_test_ids set id=(public.legal_create_financial_statement(pg_temp.lid('case'),'Current personal statement',current_date-1,current_date,'Selected client custody and fees.')).id where name='portal_statement';
select pg_temp.expect_error($q$select public.legal_release_financial_statement(pg_temp.lid('portal_statement'),pg_temp.lid('portal_member'),now()+interval '1 day','Draft bypass')$q$,'22023','draft statement cannot be individually released');
select public.legal_review_financial_statement(pg_temp.lid('portal_statement'),'approved','Source dates and centavos independently reviewed');
update legal_test_ids set id=(public.legal_release_financial_statement(pg_temp.lid('portal_statement'),pg_temp.lid('portal_member'),now()+interval '1 day','Exact individually verified client')).id where name='portal_release';
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(jsonb_array_length(public.legal_portal_service_statements(pg_temp.lid('portal_user'),pg_temp.lid('portal_member')))=1,'only explicit individual release appears');
select pg_temp.assert_true(public.legal_portal_service_statements(pg_temp.lid('portal_user'),pg_temp.lid('portal_member'))->0->'snapshot'->'closing'->>'client'='150.00' and public.legal_portal_service_statements(pg_temp.lid('portal_user'),pg_temp.lid('portal_member'))->0->'snapshot'->'closing'->>'office'='100.00','external statement carries exact distinct custody balances');
select pg_temp.assert_true(public.legal_portal_service_statements(pg_temp.lid('portal_user'),pg_temp.lid('portal_member'))::text not like '%PRIVATE CLINICAL%' and public.legal_portal_service_statements(pg_temp.lid('portal_user'),pg_temp.lid('portal_member'))::text not like '%source_ids%' and public.legal_portal_service_statements(pg_temp.lid('portal_user'),pg_temp.lid('portal_member'))::text not like '%review_note%','fiscal statement omits clinical facts, private source links and review notes');
reset role;set local role authenticated;select pg_temp.login('owner');
-- FINANCE_PORTAL_CONCURRENCY_FIXTURE_READY
select public.legal_revoke_financial_statement_release(pg_temp.lid('portal_release'),'Individual statement no longer released');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(public.legal_portal_service_statements(pg_temp.lid('portal_user'),pg_temp.lid('portal_member'))='[]'::jsonb,'release revocation takes effect with the same old JWT');
reset role;set local role authenticated;select pg_temp.login('owner');
select public.legal_release_financial_statement(pg_temp.lid('portal_statement'),pg_temp.lid('portal_member'),now()+interval '1 day','Renewed independently reviewed release');
select public.legal_revoke_portal_access(null,pg_temp.lid('portal_member'),'Remove external case access');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.expect_error($q$select public.legal_portal_service_statements(pg_temp.lid('portal_user'),pg_temp.lid('portal_member'))$q$,'42501','membership revocation blocks every statement even if release remains current');
reset role;
insert into legal_test_ids(name) values('gateway_obligation'),('gateway_revoked_charge'),('gateway_disabled_charge');
set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_financial_obligation(pg_temp.lid('case'),pg_temp.obligation('Documented office reimbursement','reimbursement','receivable','office','25.00'))).id where name='gateway_obligation';
select public.legal_review_financial_obligation(pg_temp.lid('gateway_obligation'),'Receipt and ownership independently checked');
create function pg_temp.gateway_payload() returns jsonb language sql volatile as $$select jsonb_build_object('connection_id',pg_temp.lid('connection'),'amount','25.00','provider_customer_id','cus_synthetic','billing_type','PIX','due_on',(current_timestamp at time zone 'America/Sao_Paulo')::date+1,'idempotency_key',gen_random_uuid())$$;
update legal_test_ids set id=(public.legal_prepare_charge(pg_temp.lid('gateway_obligation'),pg_temp.gateway_payload())->>'id')::uuid where name='gateway_revoked_charge';
select public.legal_review_charge(pg_temp.lid('gateway_revoked_charge'),'Destination and amount checked while reviewer active');
reset role;select pg_temp.login('owner','service_role');update public.profiles set status='inactive' where id=pg_temp.lid('owner');
set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(public.legal_finance_service_claim(pg_temp.lid('tenant_a'),'acct_synthetic','sandbox',true)='[]'::jsonb,'revoked reviewer cannot authorize later provider work');
select pg_temp.assert_true((select status='failed' and provider_state='review_required' and lease_token is null and provider_charge_id is null from public.legal_charge_attempts where id=pg_temp.lid('gateway_revoked_charge')),'revocation leaves review-required attempt without send lease');
reset role;update public.profiles set status='active' where id=pg_temp.lid('owner');
set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_prepare_charge(pg_temp.lid('gateway_obligation'),pg_temp.gateway_payload())->>'id')::uuid where name='gateway_disabled_charge';
select public.legal_review_charge(pg_temp.lid('gateway_disabled_charge'),'Fresh review after status restored');
select pg_temp.login('finance');
select pg_temp.expect_error($q$select public.legal_disable_payment_connection(pg_temp.lid('connection'),'Editor cannot disable tenant connection')$q$,'42501','connection disable requires workspace administration');
select pg_temp.login('owner');select public.legal_disable_payment_connection(pg_temp.lid('connection'),'Stop new provider work; preserve recorded receipts');
select pg_temp.expect_error($q$select public.legal_prepare_charge(pg_temp.lid('gateway_obligation'),pg_temp.gateway_payload())$q$,'22023','disabled dedicated connection cannot prepare new charge');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(public.legal_finance_service_claim(pg_temp.lid('tenant_a'),'acct_synthetic','sandbox',true)='[]'::jsonb,'disabled connection produces no provider work');
select pg_temp.assert_true((select status='approved' and lease_token is null from public.legal_charge_attempts where id=pg_temp.lid('gateway_disabled_charge')),'disabling preserves reviewed history without claiming a job');
reset role;
select 'F5 finance individual statement regression PASS' as result;
rollback;
