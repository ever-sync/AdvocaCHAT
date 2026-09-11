-- F5 finance IR source/contract regression. Run ONLY in a disposable/local or isolated staging
-- database after migrations, with postgres privileges. Synthetic data rolls back.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/legal_case_finance_ir_basis.sql
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

insert into legal_test_ids(name) values('case2'),('payer'),('employer'),('source'),('salary'),('source2'),('csv'),('csv_duplicate'),('medical'),('receipt'),('receipt2'),('statement'),('other_document'),('rule'),('evidence'),('assessment'),('period'),('import'),('entry'),('salary_entry'),('duplicate_import'),('bad_import'),('parameter'),('parameter_new'),('annual_parameter'),('calc'),('calc2'),('claim'),('claim2'),('return'),('principal'),('allocation'),('allocation2'),('recovery'),('allocation_key'),('recovery_key');

-- Official expectations are independent of this implementation. See F4-C01..10
-- in docs/FASE_4_FONTES_E_CALCULOS.md and Receita tables 2025/2026. Bodies are
-- synthetic test inputs only: this transaction never seeds approved production.
create function pg_temp.tax_body(p_kind text) returns jsonb language plpgsql as $$
declare b jsonb;
begin
 b:='{"jurisdiction":"BR","coverage":"ordinary_resident","brackets":[{"upper_bound":"2428.80","rate":"0","deduction":"0.00"},{"upper_bound":"2826.65","rate":"0.075","deduction":"182.16"},{"upper_bound":"3751.05","rate":"0.15","deduction":"394.16"},{"upper_bound":"4664.68","rate":"0.225","deduction":"675.49"},{"upper_bound":null,"rate":"0.275","deduction":"908.73"}],"simplified":{"fixed":"607.20","percent":"0","cap":"607.20"},"reduction":{"enabled":false,"zero_until":"0.00","phaseout_until":"0.00","full_cap":"0.00","intercept":"0.00","slope":"0","boundary":"zero_at_upper"},"rounding":{"mode":"half_up","scale":2,"tax_stage":"before_reduction","reduction_stage":"round"},"validity_note":"Synthetic validation of official table; no real client or approval","sources":[{"url":"https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026","checked_on":"2026-09-11","title":"Receita table"}]}';
 if p_kind='m25a' then
  b:=jsonb_set(b,'{brackets}','[{"upper_bound":"2259.20","rate":"0","deduction":"0.00"},{"upper_bound":"2826.65","rate":"0.075","deduction":"169.44"},{"upper_bound":"3751.05","rate":"0.15","deduction":"381.44"},{"upper_bound":"4664.68","rate":"0.225","deduction":"662.77"},{"upper_bound":null,"rate":"0.275","deduction":"896.00"}]');
  b:=jsonb_set(b,'{simplified}','{"fixed":"564.80","percent":"0","cap":"564.80"}');
 elsif p_kind='m26' then b:=jsonb_set(b,'{reduction}','{"enabled":true,"zero_until":"5000.00","phaseout_until":"7350.00","full_cap":"312.89","intercept":"978.62","slope":"0.133145","boundary":"zero_at_upper"}');
 elsif p_kind in ('a25','a26') then
  b:=jsonb_set(b,'{brackets}','[{"upper_bound":"29145.60","rate":"0","deduction":"0.00"},{"upper_bound":"33919.80","rate":"0.075","deduction":"2185.92"},{"upper_bound":"45012.60","rate":"0.15","deduction":"4729.91"},{"upper_bound":"55976.16","rate":"0.225","deduction":"8105.85"},{"upper_bound":null,"rate":"0.275","deduction":"10904.66"}]');
  b:=jsonb_set(b,'{simplified}','{"fixed":"0.00","percent":"0.2","cap":"17640.00"}');
  b:=jsonb_set(b,'{reduction}','{"enabled":true,"zero_until":"60000.00","phaseout_until":"88200.00","full_cap":"2694.15","intercept":"8429.73","slope":"0.095575","boundary":"zero_at_upper"}');
  if p_kind='a25' then
   b:=jsonb_set(b,'{brackets}','[{"upper_bound":"28467.20","rate":"0","deduction":"0.00"},{"upper_bound":"33919.80","rate":"0.075","deduction":"2135.04"},{"upper_bound":"45012.60","rate":"0.15","deduction":"4679.03"},{"upper_bound":"55976.16","rate":"0.225","deduction":"8054.97"},{"upper_bound":null,"rate":"0.275","deduction":"10853.78"}]');
   b:=jsonb_set(b,'{simplified,cap}','"16754.34"');b:=jsonb_set(b,'{reduction,enabled}','false');
  end if;
 end if;return b;
end;$$;
do $$declare x record;r jsonb;begin
 for x in select * from (values
 ('F4-C01','m26','3036.00','257.73','0.00'),('F4-C02','m26','4000.00','373.41','0.00'),('F4-C03','m26','5000.00','509.60','0.00'),
 ('F4-C04','m26','6000.00','649.60','382.88'),('F4-C05','m26','7607.20','0.00','1016.27'),
 ('F4-C06','m25a','5000.00','0.00','335.15'),('F4-C07','m25b','5000.00','0.00','312.89'),
 ('F4-C08','a25','60000.00','0.00','2745.03'),('F4-C09','a26','60000.00','0.00','0.00'),('F4-C10','a26','72000.00','0.00','3387.01')) v(label,kind,taxable,deductions,expected) loop
  perform public._ir4_validate_parameters(pg_temp.tax_body(x.kind));
  r:=public._ir4_tax(pg_temp.tax_body(x.kind),x.taxable::numeric,x.deductions::numeric,'most_favorable');
  perform pg_temp.assert_true(r->>'tax_due'=x.expected,x.label||' exact independent expected tax');
 end loop;
end;$$;
select pg_temp.assert_true(public._ir4_tax(pg_temp.tax_body('m26'),3036,257.73,'most_favorable')->>'base'='2428.80','official C01 typographic subtraction is corrected explicitly');
select pg_temp.assert_true((public._ir4_tax(pg_temp.tax_body('a26'),88200,0,'most_favorable')->>'boundary_formula_residual')::numeric=0.015,'annual boundary raw residual remains visible');
select pg_temp.assert_true(public._ir4_tax(pg_temp.tax_body('a26'),88200,0,'most_favorable')->>'tax_due'='8499.34','reviewed zero-at-upper policy is explicit');
select pg_temp.assert_true(public._ir4_tax(jsonb_set(pg_temp.tax_body('a26'),'{reduction,boundary}','"formula"'),88200,0,'most_favorable')->>'tax_due'='8499.32','formula boundary alternative exposes two-cent difference without tolerance');
do $$declare x record;begin
 for x in select * from (values ('2428.80','0.00'),('2428.81','0.00'),('2826.65','29.84'),('2826.66','29.84'),('3751.05','168.50'),('3751.06','168.50'),('4664.68','374.06'),('4664.69','374.06')) v(base,expected) loop
  perform pg_temp.assert_true(public._ir4_tax(pg_temp.tax_body('m25b'),x.base::numeric,0,'legal')->>'tax_due'=x.expected,'monthly bracket edge '||x.base);
 end loop;
end;$$;
select pg_temp.assert_true(public._ir4_money('90071992547409.01')='90071992547409.01','decimal beyond safe integer cents stays exact');
select pg_temp.expect_error($q$select public._ir4_money('NaN')$q$,'22023','NaN rejected');
select pg_temp.expect_error($q$select public._ir4_money('Infinity')$q$,'22023','infinite money rejected');
select pg_temp.expect_error($q$select public._ir4_money('-1.00')$q$,'22023','negative monetary input rejected');
select pg_temp.expect_error($q$select public._ir4_money('1.001')$q$,'22023','extra decimal place is not rounded silently');
select pg_temp.expect_error($q$select public._ir4_validate_parameters(jsonb_set(pg_temp.tax_body('m26'),'{simplified,cap}','607.20'))$q$,'22023','JSON numeric parameter money rejected');
select pg_temp.expect_error($q$select public._ir4_validate_parameters(jsonb_set(pg_temp.tax_body('m26'),'{brackets,1,rate}','0.075'))$q$,'22023','JSON numeric coefficient rejected');

set local role authenticated;
select pg_temp.login('owner');
select public.legal_set_workspace_enabled(true);
update legal_test_ids set id=(public.legal_create_case('F4 synthetic case',pg_temp.lid('customer_a'))).id where name='case';
update legal_test_ids set id=(public.legal_create_case('F4 separate case',pg_temp.lid('customer_a'))).id where name='case2';
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('member'),true,true,true);
select public.legal_set_case_member(pg_temp.lid('case'),pg_temp.lid('finance'),true,false,true);
update legal_test_ids set id=(public.ir_save_payer(pg_temp.lid('case'),'{"name":"Synthetic INSS","payer_type":"inss"}')).id where name='payer';
update legal_test_ids set id=(public.ir_save_payer(pg_temp.lid('case'),'{"name":"Synthetic employer","payer_type":"employer"}')).id where name='employer';
update legal_test_ids set id=(public.ir_save_income_source(pg_temp.lid('case'),jsonb_build_object('payer_id',pg_temp.lid('payer'),'income_kind','retirement','regime','rgps'))).id where name='source';
update legal_test_ids set id=(public.ir_save_income_source(pg_temp.lid('case'),jsonb_build_object('payer_id',pg_temp.lid('employer'),'income_kind','salary','regime','other'))).id where name='salary';
update legal_test_ids set id=(public.ir_save_payer(pg_temp.lid('case2'),'{"name":"Other payer","payer_type":"inss"}')).id where name='quota_case';
update legal_test_ids set id=(public.ir_save_income_source(pg_temp.lid('case2'),jsonb_build_object('payer_id',pg_temp.lid('quota_case'),'income_kind','retirement','regime','rgps'))).id where name='source2';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'fiscal','Original CSV','original.csv','text/csv',10)).id where name='csv';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'fiscal','Same bytes again','copy.csv','text/csv',10)).id where name='csv_duplicate';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'medical','Medical evidence','medical.pdf','application/pdf',10)).id where name='medical';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'fiscal','Payment proof','proof.pdf','application/pdf',10)).id where name='receipt';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'fiscal','Receipt confirmation','confirmation.pdf','application/pdf',10)).id where name='receipt2';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'fiscal','Payroll after','payroll.pdf','application/pdf',10)).id where name='statement';
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case2'),'fiscal','Other case proof','other.pdf','application/pdf',10)).id where name='other_document';
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}'::jsonb from public.legal_case_documents where id in(select id from legal_test_ids where name in('csv','csv_duplicate','medical','receipt','receipt2','statement','other_document'));
select pg_temp.login('owner','service_role');
set local role service_role;
select public.legal_finalize_document(id,case when id in(pg_temp.lid('csv'),pg_temp.lid('csv_duplicate')) then repeat('1',64) when id in(pg_temp.lid('receipt'),pg_temp.lid('other_document')) then repeat('2',64) else encode(sha256(convert_to(id::text,'UTF8')),'hex') end) from public.legal_case_documents where id in(select id from legal_test_ids where name in('csv','csv_duplicate','medical','receipt','receipt2','statement','other_document'));
reset role;
set local role authenticated;
select pg_temp.login('owner');
update legal_test_ids set id=(public.ir_create_rule_version('{"rule_key":"f4_synthetic","title":"Synthetic F4 reference","criteria":"Individual reviewed scope, no real legal conclusion","scope":{"validity_note":"Synthetic reviewed validity"},"sources":[{"url":"https://www.planalto.gov.br/ccivil_03/leis/l7713.htm","checked_on":"2026-09-11"}]}')).id where name='rule';
select public.ir_review_rule_version(pg_temp.lid('rule'),'approved','Synthetic legal review only');
update legal_test_ids set id=(public.ir_add_evidence_event(pg_temp.lid('case'),jsonb_build_object('category','medical','event_type','diagnosis_reported','event_date','2020-01-01','date_precision','exact','description','Synthetic protected clinical detail','document_id',pg_temp.lid('medical')))).id where name='evidence';
create function pg_temp.assessment_payload() returns jsonb language sql stable as $$select jsonb_agg(jsonb_build_object('source_id',id,'proposal',case when income_kind='salary' then 'proposed_not_applicable' else 'proposed_applicable' end,'rule_version_ids',jsonb_build_array(pg_temp.lid('rule')),'evidence_event_ids',jsonb_build_array(pg_temp.lid('evidence')),'document_ids',jsonb_build_array(pg_temp.lid('medical')),'reasoning','Synthetic case-by-case human rationale')) from public.ir_income_sources where case_id=pg_temp.lid('case')$$;
update legal_test_ids set id=(public.ir_create_assessment_version(pg_temp.lid('case'),pg_temp.assessment_payload(),'administrative','Synthetic assessment for tax regression')).id where name='assessment';
select public.ir_submit_assessment_review(pg_temp.lid('assessment'));
select public.ir_review_assessment(pg_temp.lid('assessment'),'approved','Synthetic individual source review');
update legal_test_ids set id=(public.ir_record_period_review(pg_temp.lid('case'),jsonb_build_object('source_id',pg_temp.lid('source'),'assessment_id',pg_temp.lid('assessment'),'period_start','2026-01-01','period_end','2026-12-31','landmark_date','2020-01-01','decision','include','basis','Synthetic reviewed legal landmark; no automatic five-year rule','document_id',pg_temp.lid('medical')))).id where name='period';

create function pg_temp.tax_lines() returns jsonb language sql stable as $$select jsonb_build_array(
 jsonb_build_object('source_id',pg_temp.lid('source'),'payment_date','2026-01-02','competence','2025-12','calendar_year',2026,'exercise',2027,'income_tax_kind','ordinary','gross','6000.00','taxable','6000.00','withheld','562.63','legal_deductions','649.60','source_line','2','raw_data',jsonb_build_object('gross','6.000,00')),
 jsonb_build_object('source_id',pg_temp.lid('salary'),'payment_date','2026-01-02','competence','2026-01','calendar_year',2026,'exercise',2027,'income_tax_kind','ordinary','gross','4000.00','taxable','4000.00','withheld','114.76','legal_deductions','373.41','source_line','3'))$$;
update legal_test_ids set id=(public.ir_create_tax_import(pg_temp.lid('case'),pg_temp.lid('csv'),'Original reviewed file','csv',pg_temp.tax_lines())).id where name='import';
update legal_test_ids set id=(select id from public.ir_tax_entries where import_id=pg_temp.lid('import') and row_number=1) where name='entry';
update legal_test_ids set id=(select id from public.ir_tax_entries where import_id=pg_temp.lid('import') and row_number=2) where name='salary_entry';
select pg_temp.assert_true((select payment_date='2026-01-02'::date and competence='2025-12' and calendar_year=2026 and exercise=2027 from public.ir_tax_entries where id=pg_temp.lid('entry')),'payment date, competence, calendar year and exercise remain distinct');
select pg_temp.assert_true((select gross='6000.00' and raw_data->>'gross'='6.000,00' from public.ir_tax_entries where id=pg_temp.lid('entry')),'canonical amount and original imported text preserved separately');
select public.ir_review_tax_import(pg_temp.lid('import'),'reviewed','Compared every line with original CSV');
select pg_temp.expect_error($q$select public.ir_update_tax_entry(pg_temp.lid('entry'),'{"taxable":"0.00"}')$q$,'22023','reviewed source rows cannot be rewritten');
select pg_temp.expect_error($q$select public.ir_create_tax_import(pg_temp.lid('case'),pg_temp.lid('medical'),'Wrong category','manual',pg_temp.tax_lines())$q$,'22023','tax import cannot pull medical file into fiscal-only access');
select pg_temp.expect_error($q$select public.ir_create_tax_import(pg_temp.lid('case'),pg_temp.lid('other_document'),'Wrong case','manual',pg_temp.tax_lines())$q$,'22023','tax import document cannot cross case');
select pg_temp.expect_error($q$select public.ir_create_tax_import(pg_temp.lid('case'),pg_temp.lid('csv'),'Number bypass','csv',jsonb_set(pg_temp.tax_lines(),'{0,gross}','6000.00'))$q$,'22023','numeric JSON import money is rejected');
select pg_temp.expect_error($q$update public.ir_tax_entries set gross='1.00'$q$,'42501','direct fiscal mutation denied');

update legal_test_ids set id=(public.ir_create_tax_parameter_version(jsonb_build_object('parameter_key','monthly_2026','title','2026 reviewed table','periodicity','monthly','calendar_year',2026,'exercise',2027,'valid_from','2026-01-01','valid_until','2026-12-31','body',pg_temp.tax_body('m26')))).id where name='parameter';
select pg_temp.assert_true((select status='draft' from public.ir_tax_parameter_versions where id=pg_temp.lid('parameter')),'new parameters remain unapproved draft');
select pg_temp.expect_error($q$select public.ir_review_tax_parameter_version(pg_temp.lid('parameter'),'approved','No independent example')$q$,'22023','approval requires independent expected example');
select pg_temp.expect_error($q$select public.ir_record_parameter_validation(pg_temp.lid('parameter'),'{"taxable":6000,"legal_deductions":"649.60","deduction_mode":"most_favorable","expected_tax":"382.88","expected_source":"RFB C04","review_note":"Synthetic"}')$q$,'22023','validation payload refuses JSON Number');
select public.ir_record_parameter_validation(pg_temp.lid('parameter'),'{"taxable":"6000.00","legal_deductions":"649.60","deduction_mode":"most_favorable","expected_tax":"382.88","expected_source":"Receita official example 4 — independent published result","review_note":"Synthetic equality check only"}');
select public.ir_review_tax_parameter_version(pg_temp.lid('parameter'),'approved','Synthetic validation of official arithmetic, no real-client homologation');
create function pg_temp.calc_payload() returns jsonb language sql stable as $$select jsonb_build_object('assessment_id',pg_temp.lid('assessment'),'periodicity','monthly','calendar_year',2026,'month',1,'import_ids',jsonb_build_array(pg_temp.lid('import')),'parameter_ids',jsonb_build_array(pg_temp.lid('parameter')),'deduction_mode','most_favorable','tax_residency','resident','inventory_complete',true,'completeness_note','All sources, natures and payments for this monthly scope reviewed','adjustments',jsonb_build_array(jsonb_build_object('entry_id',pg_temp.lid('entry'),'proposed_taxable','0.00','proposed_legal_deductions','0.00','period_review_id',pg_temp.lid('period'),'reason','Synthetic professional reclassification according to reviewed source and period')))$$;
update legal_test_ids set id=(public.ir_create_calculation_version(pg_temp.lid('case'),pg_temp.calc_payload())).id where name='calc';
select pg_temp.assert_true((select status='draft' and result->>'baseline_tax'='382.88' and result->>'proposed_tax'='0.00' and result->>'hypothesis_difference'='382.88' and result->>'withheld_reported'='677.39' from public.ir_calculation_versions where id=pg_temp.lid('calc')),'payer groups calculate exact tax difference separately from withholding');
select pg_temp.assert_true((select jsonb_array_length(result->'groups')=2 and result->>'recognized_credit' is null and result->>'received' is null from public.ir_calculation_versions where id=pg_temp.lid('calc')),'multiple payers stay separate without inferred recognized/received credit');
select pg_temp.assert_true((select length(input_hash)=64 and snapshot->>'engine_version'='ordinary_numeric_v1' from public.ir_calculation_versions where id=pg_temp.lid('calc')),'versioned memory contains reproducible input hash and engine identity');
select public.ir_submit_calculation_review(pg_temp.lid('calc'));
select pg_temp.expect_error($q$select public.ir_review_calculation(pg_temp.lid('calc'),'approved','Missing completeness')$q$,'22023','reviewer must independently confirm coverage');
select pg_temp.login('member');
select pg_temp.expect_error($q$select public.ir_review_calculation(pg_temp.lid('calc'),'approved','Editor bypass',true)$q$,'42501','combined editor cannot approve calculation');
select pg_temp.login('owner');
select public.ir_review_calculation(pg_temp.lid('calc'),'approved','Reviewed memory and full period coverage',true);
select pg_temp.assert_true(public.ir_read_calculation_report(pg_temp.lid('calc'))->>'is_current'='true','authorized report exports current immutable memory');
select pg_temp.expect_error($q$update public.ir_calculation_versions set result='{}'$q$,'42501','approved results cannot be edited directly');

-- New approved parameter heads stale old approvals; drafts alone do not.
update legal_test_ids set id=(public.ir_create_tax_parameter_version(jsonb_build_object('parameter_key','monthly_2026','title','Rechecked source version','periodicity','monthly','calendar_year',2026,'exercise',2027,'valid_from','2026-01-01','valid_until','2026-12-31','body',pg_temp.tax_body('m26')))).id where name='parameter_new';
select pg_temp.assert_true(public.ir_read_calculation_report(pg_temp.lid('calc'))->>'is_current'='true','new parameter draft does not invalidate approved memory');
select public.ir_record_parameter_validation(pg_temp.lid('parameter_new'),'{"taxable":"6000.00","legal_deductions":"649.60","deduction_mode":"most_favorable","expected_tax":"382.88","expected_source":"Receita C04 independent expected","review_note":"Source rechecked"}');
select public.ir_review_tax_parameter_version(pg_temp.lid('parameter_new'),'approved','New reference reviewed');
select pg_temp.assert_true(public.ir_read_calculation_report(pg_temp.lid('calc'))->>'is_current'='false','new approved parameters require fresh memory while history remains exportable');
update legal_test_ids set id=(public.ir_create_calculation_version(pg_temp.lid('case'),jsonb_set(pg_temp.calc_payload(),'{parameter_ids}',jsonb_build_array(pg_temp.lid('parameter_new'))))).id where name='calc2';
select public.ir_submit_calculation_review(pg_temp.lid('calc2'));
select public.ir_review_calculation(pg_temp.lid('calc2'),'approved','Refreshed parameter and coverage review',true);

update legal_test_ids set id=(public.ir_create_claim(pg_temp.lid('case'),jsonb_build_object('payer_id',pg_temp.lid('payer'),'route','administrative','channel','source','claim_kind','combined','title','Synthetic source request'))).id where name='claim';
select public.ir_update_claim_draft(pg_temp.lid('claim'),jsonb_build_object('calculation_id',pg_temp.lid('calc2')));
select pg_temp.assert_true((select assessment_id=pg_temp.lid('assessment') from public.ir_claims where id=pg_temp.lid('claim')),'completing draft infers matching assessment from calculation');
select public.ir_review_claim_strategy(pg_temp.lid('claim'),'Fonte pagadora revisada','Beneficiário e legitimidade revisados','Synthetic administrative strategy');
update legal_test_ids set id=(public.ir_create_claim(pg_temp.lid('case'),jsonb_build_object('payer_id',pg_temp.lid('payer'),'route','judicial','channel','court','claim_kind','restitution','title','Independent judicial route','assessment_id',pg_temp.lid('assessment'),'calculation_id',pg_temp.lid('calc2')))).id where name='claim2';
select public.ir_review_claim_strategy(pg_temp.lid('claim2'),'Competência judicial revisada','Legitimidade passiva revisada','Synthetic judicial strategy');
select public.ir_link_claim_overlap(pg_temp.lid('claim'),pg_temp.lid('claim2'),'Potential overlap of the same principal; allocate only once');
select public.ir_link_claim_overlap(pg_temp.lid('claim2'),pg_temp.lid('claim'),'Same overlap reverse order');
select pg_temp.assert_true((select count(*) from public.ir_claim_overlaps)=1,'claim overlap link is idempotent in either order');
select pg_temp.expect_error($q$select public.ir_record_claim_event(pg_temp.lid('claim'),jsonb_build_object('event_type','protocol','description','No proof','occurred_on',(current_date-2)::text,'protocol_reference','SYNTHETIC'))$q$,'22023','protocol cannot be recorded without ready receipt');
select public.ir_record_claim_event(pg_temp.lid('claim'),jsonb_build_object('event_type','decision_granted','description','Synthetic evidenced external decision','occurred_on',(current_date-1)::text,'document_id',pg_temp.lid('receipt'),'recognized_amount','50.00'));
select public.ir_record_claim_event(pg_temp.lid('claim'),jsonb_build_object('event_type','protocol','description','Older protocol imported later','occurred_on',(current_date-8)::text,'document_id',pg_temp.lid('receipt'),'protocol_reference','OLDER-PROTOCOL'));
select pg_temp.assert_true((select status='granted' and recognized_amount='50.00' from public.ir_claims where id=pg_temp.lid('claim')),'out-of-order older protocol cannot regress later decision');
select public.ir_record_claim_event(pg_temp.lid('claim'),jsonb_build_object('event_type','decision_denied','description','Even earlier superseded denial','occurred_on',(current_date-4)::text,'document_id',pg_temp.lid('receipt')));
select pg_temp.assert_true((select status='granted' and recognized_amount='50.00' from public.ir_claims where id=pg_temp.lid('claim')),'older denial cannot erase a later recognized amount');
select pg_temp.expect_error($q$select public.ir_update_claim_draft(pg_temp.lid('claim'),'{"title":"Rewrite filed request"}')$q$,'22023','filed claim references stay preserved');
select pg_temp.expect_error($q$select public.ir_record_claim_event(pg_temp.lid('claim'),jsonb_build_object('event_type','protocol','description','Future fact','occurred_on',(current_date+2)::text,'document_id',pg_temp.lid('receipt'),'protocol_reference','FUTURE'))$q$,'22023','future filing cannot be marked effective');
select public.ir_record_claim_event(pg_temp.lid('claim2'),jsonb_build_object('event_type','requirement','description','Synthetic restricted demand','occurred_on',(current_date-1)::text,'document_id',pg_temp.lid('medical'),'due_at',now()+interval '10 days','assignee_id',pg_temp.lid('member')));
select pg_temp.assert_true((select count(*) from public.legal_case_tasks where notes like '%informado manualmente%')=1,'requirement creates explicitly manual task');
select pg_temp.assert_true(not exists(select 1 from public.legal_case_tasks where title like '%restricted%' or notes like '%restricted%'),'shared task omits confidential demand contents');

update legal_test_ids set id=(public.ir_record_tax_return(pg_temp.lid('case'),jsonb_build_object('calendar_year',2025,'exercise',2026,'return_kind','original','document_id',pg_temp.lid('receipt'),'status','draft','reported_tax','100.00','reported_refund','0.00','paid_quotas','100.00'))).id where name='return';
select pg_temp.expect_error($q$select public.ir_update_tax_return_status(pg_temp.lid('return'),'filed',null,null,'No receipt')$q$,'22023','filing original return requires receipt');
select public.ir_update_tax_return_status(pg_temp.lid('return'),'filed',pg_temp.lid('receipt2'),'SYNTHETIC-RETURN','Original filing recorded');
select public.ir_update_tax_return_status(pg_temp.lid('return'),'processing',null,null,'Processing confirmed by responsible professional');
select public.ir_update_tax_return_status(pg_temp.lid('return'),'settled',null,null,'Settlement status recorded separately from cash');
select pg_temp.assert_true((select count(*) from public.ir_tax_returns)=1 and (select count(*) from public.ir_tax_return_events)=3,'one original declaration progresses with append-only situation history');
select pg_temp.assert_true((select reported_tax='100.00' and paid_quotas='100.00' from public.ir_tax_returns where id=pg_temp.lid('return')),'status changes preserve declaration financial content');
select pg_temp.expect_error($q$select public.ir_update_tax_return_status(pg_temp.lid('return'),'filed',null,null,'Regress status')$q$,'22023','later return state cannot regress silently');
select pg_temp.expect_error($q$select public.ir_record_tax_return(pg_temp.lid('case'),jsonb_build_object('calendar_year',2026,'exercise',2027,'return_kind','amending','previous_return_id',pg_temp.lid('return'),'document_id',pg_temp.lid('receipt'),'status','draft','reported_tax','0.00','reported_refund','0.00','paid_quotas','0.00'))$q$,'22023','rectification must match original calendar year');
select pg_temp.assert_true((select count(*) from public.ir_recoveries)=0,'settled declaration did not fabricate received cash');

update legal_test_ids set id=(public.ir_create_payment_principal(pg_temp.lid('case'),jsonb_build_object('customer_id',pg_temp.lid('customer_a'),'source_id',pg_temp.lid('source'),'payment_document_id',pg_temp.lid('receipt'),'proof_line','IRPF-1','payment_reference','SYNTHETIC-PAYMENT','period_start','2025-01-01','period_end','2025-12-31','paid_on','2026-01-02','amount','100.00'))).id where name='principal';
select pg_temp.expect_error($q$select public.ir_allocate_principal(pg_temp.lid('principal'),pg_temp.lid('claim'),'70.00',pg_temp.lid('allocation_key'),'Before verification')$q$,'22023','unverified payment cannot be appropriated');
select public.ir_verify_payment_principal(pg_temp.lid('principal'),'Verified actual synthetic tax payment evidence');
update legal_test_ids set id=(public.ir_allocate_principal(pg_temp.lid('principal'),pg_temp.lid('claim'),'70.00',pg_temp.lid('allocation_key'),'Allocate partial principal')).id where name='allocation';
select pg_temp.assert_true((public.ir_allocate_principal(pg_temp.lid('principal'),pg_temp.lid('claim'),'70.00',pg_temp.lid('allocation_key'),'Allocate partial principal')).id=pg_temp.lid('allocation'),'allocation retry is idempotent');
select pg_temp.expect_error($q$select public.ir_allocate_principal(pg_temp.lid('principal'),pg_temp.lid('claim2'),'40.00',gen_random_uuid(),'Double appropriation')$q$,'22023','overlapping claims cannot reserve above principal');
select pg_temp.expect_error($q$select public.ir_allocate_principal(pg_temp.lid('principal'),pg_temp.lid('claim'),'60.00',pg_temp.lid('allocation_key'),'Changed request')$q$,'22023','same idempotency key cannot change amount');
update legal_test_ids set id=(public.ir_allocate_principal(pg_temp.lid('principal'),pg_temp.lid('claim2'),'30.00',gen_random_uuid(),'Allocate remaining principal')).id where name='allocation2';
select pg_temp.assert_true(public.ir_get_financial_context(pg_temp.lid('case'))->'principal_balances'->0->>'available'='0.00','principal is fully reserved once across both routes');
select pg_temp.expect_error($q$select public.ir_create_payment_principal(pg_temp.lid('case2'),jsonb_build_object('customer_id',pg_temp.lid('customer_a'),'source_id',pg_temp.lid('source2'),'payment_document_id',pg_temp.lid('other_document'),'proof_line','IRPF-1','payment_reference','ALTERED-REFERENCE','period_start','2024-01-01','period_end','2024-12-31','paid_on','2026-01-02','amount','100.00'))$q$,'23505','same payment proof SHA and line cannot be duplicated in another case or period');
update legal_test_ids set id=(public.ir_record_recovery(pg_temp.lid('allocation'),jsonb_build_object('amount','20.00','received_on',(current_date-1)::text,'channel','source_refund','document_id',pg_temp.lid('receipt2'),'reference','BANK-RECEIPT-1','idempotency_key',pg_temp.lid('recovery_key')))).id where name='recovery';
select pg_temp.assert_true((public.ir_record_recovery(pg_temp.lid('allocation'),jsonb_build_object('amount','20.00','received_on',(current_date-1)::text,'channel','source_refund','document_id',pg_temp.lid('receipt2'),'reference','BANK-RECEIPT-1','idempotency_key',pg_temp.lid('recovery_key')))).id=pg_temp.lid('recovery'),'receipt retry cannot duplicate cash');
select pg_temp.expect_error($q$select public.ir_record_recovery(pg_temp.lid('allocation'),jsonb_build_object('amount','20.00','received_on',(current_date-1)::text,'channel','source_refund','document_id',pg_temp.lid('receipt2'),'reference','ALTERED-RECEIPT-REFERENCE','idempotency_key',gen_random_uuid()))$q$,'23505','same receipt proof cannot be reused with a new reference');
select public.ir_release_allocation(pg_temp.lid('allocation'),'Unused reservation released; actual receipt retained');
select pg_temp.assert_true(public.ir_get_financial_context(pg_temp.lid('case'))->'principal_balances'->0->>'received'='20.00' and public.ir_get_financial_context(pg_temp.lid('case'))->'principal_balances'->0->>'allocated'='30.00' and public.ir_get_financial_context(pg_temp.lid('case'))->'principal_balances'->0->>'available'='50.00','release frees only unreceived reservation and preserves receipt consumption');
select pg_temp.expect_error($q$select public.ir_allocate_principal(pg_temp.lid('principal'),pg_temp.lid('claim'),'51.00',gen_random_uuid(),'Exceeds remainder')$q$,'22023','received principal cannot be reallocated after release');
select pg_temp.expect_error($q$select public.ir_record_recovery(pg_temp.lid('allocation2'),jsonb_build_object('amount','31.00','received_on',(current_date-1)::text,'channel','judicial_payment','document_id',pg_temp.lid('receipt'),'reference','OVER-AMOUNT','idempotency_key',gen_random_uuid()))$q$,'22023','receipt cannot exceed its allocation');
select pg_temp.expect_error($q$select public.ir_record_recovery(pg_temp.lid('allocation2'),jsonb_build_object('amount','1.00','received_on',(current_date+1)::text,'channel','judicial_payment','document_id',pg_temp.lid('receipt'),'reference','FUTURE-RECEIPT','idempotency_key',gen_random_uuid()))$q$,'22023','future receipt cannot be shown as received');
select pg_temp.expect_error($q$select public.ir_record_recovery(pg_temp.lid('allocation2'),jsonb_build_object('amount',1.00,'received_on',(current_date-1)::text,'channel','judicial_payment','document_id',pg_temp.lid('receipt'),'reference','NUMBER-RECEIPT','idempotency_key',gen_random_uuid()))$q$,'22023','JSON numeric receipt money rejected');
select pg_temp.expect_error($q$delete from public.ir_recoveries$q$,'42501','receipt history cannot be deleted');

select public.ir_record_cessation(pg_temp.lid('case'),jsonb_build_object('source_id',pg_temp.lid('source'),'observed_on',(current_date-1)::text,'competence','2026-01','previous_withheld','562.63','current_withheld','0.00','before_document_id',pg_temp.lid('receipt'),'after_document_id',pg_temp.lid('statement'),'review_note','Both payroll proofs reviewed'));
select public.ir_record_cessation(pg_temp.lid('case'),jsonb_build_object('source_id',pg_temp.lid('source'),'observed_on',(current_date-1)::text,'competence','2026-02','previous_withheld','0.00','current_withheld','5.00','before_document_id',pg_temp.lid('receipt'),'after_document_id',pg_temp.lid('statement'),'review_note','Withholding reopened in supplied payroll'));
select public.ir_record_cessation(pg_temp.lid('case'),jsonb_build_object('source_id',pg_temp.lid('source'),'observed_on',(current_date-1)::text,'competence','2026-03','previous_withheld','5.00','current_withheld','5.00','before_document_id',pg_temp.lid('receipt'),'after_document_id',pg_temp.lid('statement'),'review_note','Withholding still ongoing'));
select pg_temp.assert_true((select array_agg(status order by competence)=array['verified','reopened','ongoing'] from public.ir_cessation_records),'cessation, reopened and ongoing withholding remain distinct');
select pg_temp.expect_error($q$select public.ir_record_cessation(pg_temp.lid('case'),jsonb_build_object('source_id',pg_temp.lid('source'),'observed_on',(current_date+1)::text,'competence','2026-04','previous_withheld','5.00','current_withheld','0.00','before_document_id',pg_temp.lid('receipt'),'after_document_id',pg_temp.lid('statement'),'review_note','Future claim'))$q$,'22023','future cessation cannot be shown as verified');


reset role;
insert into legal_test_ids(name) values('fee_instrument'),('fee_version'),('fee_signature'),('fee_recovery_agreement'),('fee_decision_agreement'),('fee_recovery_basis'),('fee_decision_basis'),('fee_duplicate_basis'),('fee_recovery_obligation'),('fee_decision_obligation'),('fee_connection'),('fee_charge'),('fee_decision_event');
set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_prepare_document(pg_temp.lid('case'),'general','Synthetic accepted fee contract','fee-contract.pdf','application/pdf',10)).id where name='document';
reset role;select pg_temp.login('owner','service_role');
insert into storage.objects(bucket_id,name,metadata) select 'legal-case-documents',storage_path,'{"size":10}' from public.legal_case_documents where id=pg_temp.lid('document');
set local role service_role;select public.legal_finalize_document(pg_temp.lid('document'),repeat('b',64));
reset role;set local role authenticated;select pg_temp.login('owner');
update legal_test_ids set id=(public.legal_create_instrument(pg_temp.lid('case'),'contract','Synthetic source-specific success fee','general','The independently reviewed contract identifies its success components.')).id where name='fee_instrument';
update legal_test_ids set id=(select id from public.legal_instrument_versions where instrument_id=pg_temp.lid('fee_instrument')) where name='fee_version';
select public.legal_submit_instrument_review(pg_temp.lid('fee_version'));
select public.legal_review_instrument(pg_temp.lid('fee_version'),'approved','Exact terms reviewed');
update legal_test_ids set id=(public.legal_record_external_signature(pg_temp.lid('fee_version'),pg_temp.lid('document'),'Synthetic documentary acceptance')).id where name='fee_signature';
create function pg_temp.success_contract(p_key text,p_basis text,p_rate text) returns jsonb language sql stable as $$select jsonb_build_object('agreement_key',p_key,'instrument_version_id',pg_temp.lid('fee_version'),'title','Reviewed component '||p_key,'model','success','fixed_amount','0.00','success_rate',p_rate,'basis_kind',p_basis,'trigger_description','Only the explicitly reviewed source fulfills this component','exclusions','No unrelated sources or client-custody inference')$$;
update legal_test_ids set id=(public.legal_create_fee_agreement(pg_temp.lid('case'),pg_temp.success_contract('actual_received','ir_recovery','0.25'))).id where name='fee_recovery_agreement';
select public.legal_review_fee_agreement(pg_temp.lid('fee_recovery_agreement'),'approved','This component uses actual evidenced recoveries',pg_temp.lid('fee_signature'));
update legal_test_ids set id=(public.legal_create_fee_basis(pg_temp.lid('fee_recovery_agreement'),jsonb_build_object('title','Actual received source','source_ids',jsonb_build_array(pg_temp.lid('recovery')),'base_amount','999999.00','deductions','1.01','justification','Only the proven 20.00 source, not a typed amount'))).id where name='fee_recovery_basis';
select pg_temp.assert_true((select base_amount='20.00' and effective_base='18.99' and fee_amount='4.75' and snapshot->>'rounding'='half_up_2' from public.legal_fee_basis_versions where id=pg_temp.lid('fee_recovery_basis')),'actual source overrides typed principal and computes 18.99 x .25 = 4.75 exactly');
select public.legal_review_fee_basis(pg_temp.lid('fee_recovery_basis'),'approved','Centavos and source checked');
update legal_test_ids set id=(public.legal_create_fee_basis(pg_temp.lid('fee_recovery_agreement'),jsonb_build_object('title','Duplicate source','source_ids',jsonb_build_array(pg_temp.lid('recovery')),'deductions','0.00','justification','Attempt to reuse already appropriated source'))).id where name='fee_duplicate_basis';
select pg_temp.expect_error($q$select public.legal_review_fee_basis(pg_temp.lid('fee_duplicate_basis'),'approved','Duplicate reviewer attempt')$q$,'22023','same recovery cannot become two approved bases in one contractual component');
select pg_temp.expect_error($q$select public.legal_create_fee_basis(pg_temp.lid('fee_recovery_agreement'),jsonb_build_object('title','Duplicate selected source','source_ids',jsonb_build_array(pg_temp.lid('recovery'),pg_temp.lid('recovery')),'deductions','0.00','justification','Repeated source in same input'))$q$,'22023','duplicate source identifiers cannot multiply a base');
select pg_temp.expect_error($q$select public.legal_create_fee_basis(pg_temp.lid('fee_recovery_agreement'),jsonb_build_object('title','Foreign source','source_ids',jsonb_build_array(gen_random_uuid()),'deductions','0.00','justification','Invalid outside-case ID'))$q$,'22023','missing or cross-case IR source cannot enter fee base');
create function pg_temp.fee_obligation(p_agreement uuid,p_basis uuid,p_amount text) returns jsonb language sql stable as $$select jsonb_build_object('title','Reviewed source-specific fee','category','fee','direction','receivable','funds_owner','office','beneficiary','office','amount',p_amount,'due_on',current_date+1,'agreement_id',p_agreement,'basis_id',p_basis)$$;
update legal_test_ids set id=(public.legal_create_financial_obligation(pg_temp.lid('case'),pg_temp.fee_obligation(pg_temp.lid('fee_recovery_agreement'),pg_temp.lid('fee_recovery_basis'),'4.75'))).id where name='fee_recovery_obligation';
select public.legal_review_financial_obligation(pg_temp.lid('fee_recovery_obligation'),'Exact recovery-based obligation reviewed');
select pg_temp.assert_true(public.legal_get_case_financial_context(pg_temp.lid('case'))->>'office_balance'='0.00' and public.legal_get_case_financial_context(pg_temp.lid('case'))->>'client_balance'='0.00','IR recovery is neither office revenue nor assumed client custody');
update legal_test_ids set id=(select id from public.ir_claim_events where claim_id=pg_temp.lid('claim') and event_type='decision_granted') where name='fee_decision_event';
update legal_test_ids set id=(public.legal_create_fee_agreement(pg_temp.lid('case'),pg_temp.success_contract('reviewed_decision','ir_decision','0.1'))).id where name='fee_decision_agreement';
select public.legal_review_fee_agreement(pg_temp.lid('fee_decision_agreement'),'approved','This separate component expressly uses a reviewed decision',pg_temp.lid('fee_signature'));
update legal_test_ids set id=(public.legal_create_fee_basis(pg_temp.lid('fee_decision_agreement'),jsonb_build_object('title','Explicit decision source','source_ids',jsonb_build_array(pg_temp.lid('fee_decision_event')),'deductions','0.00','justification','Contractually distinguished from actual cash receipt'))).id where name='fee_decision_basis';
select public.legal_review_fee_basis(pg_temp.lid('fee_decision_basis'),'approved','Current favorable decision and terms checked');
select pg_temp.assert_true((select base_amount='50.00' and fee_amount='5.00' from public.legal_fee_basis_versions where id=pg_temp.lid('fee_decision_basis')),'decision-based contractual fee uses decision value without fabricating cash');
update legal_test_ids set id=(public.legal_create_financial_obligation(pg_temp.lid('case'),pg_temp.fee_obligation(pg_temp.lid('fee_decision_agreement'),pg_temp.lid('fee_decision_basis'),'5.00'))).id where name='fee_decision_obligation';
select public.legal_review_financial_obligation(pg_temp.lid('fee_decision_obligation'),'Decision-based fee obligation reviewed');
update legal_test_ids set id=(public.legal_save_payment_connection('Synthetic IR fee account','acct_ir_synthetic','sandbox')).id where name='fee_connection';
create function pg_temp.charge_payload(p_amount text) returns jsonb language sql stable as $$select jsonb_build_object('connection_id',pg_temp.lid('fee_connection'),'amount',p_amount,'provider_customer_id','cus_ir_synthetic','billing_type','PIX','due_on',current_date+1,'idempotency_key',gen_random_uuid())$$;
update legal_test_ids set id=(public.legal_prepare_charge(pg_temp.lid('fee_decision_obligation'),pg_temp.charge_payload('5.00'))->>'id')::uuid where name='fee_charge';
select public.legal_review_charge(pg_temp.lid('fee_charge'),'Current source and destination reviewed before changed decision');
select public.ir_record_claim_event(pg_temp.lid('claim'),jsonb_build_object('event_type','decision_denied','description','New evidenced decision supersedes earlier favorable amount','occurred_on',current_date::text,'document_id',pg_temp.lid('receipt')));
select pg_temp.expect_error($q$select public.legal_create_fee_basis(pg_temp.lid('fee_decision_agreement'),jsonb_build_object('title','Stale decision','source_ids',jsonb_build_array(pg_temp.lid('fee_decision_event')),'deductions','0.00','justification','Old decision cannot be used again'))$q$,'22023','superseded decision cannot create a new fee base');
reset role;set local role service_role;select pg_temp.login('owner','service_role');
select pg_temp.assert_true(public.legal_finance_service_claim(pg_temp.lid('tenant_a'),'acct_ir_synthetic','sandbox',true)='[]'::jsonb,'a changed decision must prevent dispatch of a new gateway charge based on stale reviewed source');
reset role;set local role authenticated;select pg_temp.login('owner');
select public.legal_cancel_unsent_charge(pg_temp.lid('fee_charge'),'Cancel stale draft for reanalysis');
select pg_temp.expect_error($q$select public.legal_prepare_charge(pg_temp.lid('fee_decision_obligation'),pg_temp.charge_payload('5.00'))$q$,'22023','new charge preparation revalidates the underlying contractual basis');
select pg_temp.assert_true(public.legal_get_case_financial_context(pg_temp.lid('case'))->>'office_balance'='0.00','stale decision handling never invents a receipt');
reset role;
select 'F5 finance IR source regression PASS' as result;
rollback;
