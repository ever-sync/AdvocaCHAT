-- F4: bounded, deterministic ordinary IR calculations and evidenced operations.
-- Monetary storage/JSON uses canonical decimal TEXT to avoid IEEE-754 transport
-- loss. All validation and arithmetic below uses PostgreSQL NUMERIC exclusively.
-- No seeded approvals, automatic entitlement, filing, prescription or interest.

create or replace function public._ir4_money(p_value text,p_nullable boolean default false)
returns text language plpgsql immutable set search_path=pg_catalog as $$
begin
 if p_value is null and p_nullable then return null;end if;
 if coalesce(p_value,'') !~ '^(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?$' then raise exception 'Money requires a finite canonical decimal with at most two places' using errcode='22023';end if;
 return (p_value::numeric)::numeric(16,2)::text;
end;$$;
create or replace function public._ir4_coefficient(p_value text)
returns numeric language plpgsql immutable set search_path=pg_catalog as $$
begin
 if coalesce(p_value,'') !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,9})?$' then raise exception 'Coefficient requires a finite decimal with at most nine places' using errcode='22023';end if;
 return p_value::numeric;
end;$$;
create or replace function public._ir4_date(p_value text,p_nullable boolean default false)
returns date language plpgsql immutable set search_path=pg_catalog as $$
begin
 if p_value is null and p_nullable then return null;end if;
 if coalesce(p_value,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Date requires YYYY-MM-DD' using errcode='22023';end if;
 return p_value::date;
end;$$;

-- Additive case-scoped keys reinforce the existing RPC checks.
create unique index if not exists ir_income_source_case_tenant_uid on public.ir_income_sources(id,case_id,tenant_id);
create unique index if not exists ir_assessment_case_tenant_uid on public.ir_assessment_versions(id,case_id,tenant_id);
create unique index if not exists legal_document_case_tenant_uid on public.legal_case_documents(id,case_id,tenant_id);
create unique index if not exists legal_task_case_tenant_uid on public.legal_case_tasks(id,case_id,tenant_id);

create table public.ir_tax_imports (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,document_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 200),format text not null check(format in ('csv','manual')),supersedes_import_id uuid,
 status text not null default 'draft' check(status in ('draft','reviewed','rejected','superseded')),reviewer_id uuid references public.profiles(id),review_note text not null default '' check(length(review_note)<=4000),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),reviewed_at timestamptz,
 unique(id,case_id,tenant_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id) on delete restrict,
 foreign key(supersedes_import_id,case_id,tenant_id) references public.ir_tax_imports(id,case_id,tenant_id) on delete restrict
);
create table public.ir_tax_import_reviews (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,import_id uuid not null,from_status text not null,decision text not null,note text not null,
 reviewer_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(import_id,case_id,tenant_id) references public.ir_tax_imports(id,case_id,tenant_id) on delete restrict
);
create table public.ir_tax_entries (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,import_id uuid not null,row_number integer not null check(row_number between 1 and 500),
 source_id uuid,payment_date date check(payment_date is null or isfinite(payment_date)),competence text check(competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),calendar_year integer,exercise integer,
 income_tax_kind text not null default 'unknown' check(income_tax_kind in ('ordinary','thirteenth','rra','regressive','foreign','other','unknown')),
 gross text check(gross is null or gross=public._ir4_money(gross)),taxable text check(taxable is null or taxable=public._ir4_money(taxable)),
 withheld text check(withheld is null or withheld=public._ir4_money(withheld)),legal_deductions text check(legal_deductions is null or legal_deductions=public._ir4_money(legal_deductions)),
 source_page integer check(source_page>0),source_line text check(length(source_line)<=80),notes text not null default '' check(length(notes)<=2000),raw_data jsonb not null default '{}'::jsonb check(jsonb_typeof(raw_data)='object'),
 unique(import_id,row_number),unique(id,case_id,tenant_id),foreign key(import_id,case_id,tenant_id) references public.ir_tax_imports(id,case_id,tenant_id) on delete restrict,
 foreign key(source_id,case_id,tenant_id) references public.ir_income_sources(id,case_id,tenant_id) on delete restrict,
 check(calendar_year is null or (calendar_year between 1 and 9998)),check(exercise is null or (calendar_year is not null and exercise=calendar_year+1)),
 check(gross is null or taxable is null or taxable::numeric<=gross::numeric)
);
create table public.ir_tax_parameter_versions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),parameter_key text not null check(parameter_key ~ '^[a-zA-Z0-9_-]{1,80}$'),version_number integer not null,
 title text not null check(length(btrim(title)) between 1 and 200),periodicity text not null check(periodicity in ('monthly','annual')),
 valid_from date not null check(isfinite(valid_from)),valid_until date not null check(isfinite(valid_until)),calendar_year integer not null check(calendar_year between 1 and 9998),exercise integer not null,
 body jsonb not null check(jsonb_typeof(body)='object'),status text not null default 'draft' check(status in ('draft','approved','rejected')),
 created_by uuid not null references public.profiles(id),reviewer_id uuid references public.profiles(id),review_note text not null default '' check(length(review_note)<=4000),created_at timestamptz not null default now(),reviewed_at timestamptz,
 unique(tenant_id,parameter_key,version_number),unique(id,tenant_id),check(exercise=calendar_year+1),check(valid_until>=valid_from),
 check(extract(year from valid_from)=calendar_year and extract(year from valid_until)=calendar_year),
 check(periodicity<>'annual' or (valid_from=make_date(calendar_year,1,1) and valid_until=make_date(calendar_year,12,31)))
);
create table public.ir_parameter_validations (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,parameter_version_id uuid not null,taxable text not null,legal_deductions text not null,deduction_mode text not null,
 expected_tax text not null,expected_source text not null check(length(btrim(expected_source)) between 1 and 4000),review_note text not null check(length(btrim(review_note)) between 1 and 4000),
 result jsonb not null,matches_expected boolean not null,reviewer_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(parameter_version_id,tenant_id) references public.ir_tax_parameter_versions(id,tenant_id) on delete restrict
);
create table public.ir_period_reviews (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,source_id uuid not null,assessment_id uuid not null,
 period_start date not null check(isfinite(period_start)),period_end date not null check(isfinite(period_end)),landmark_date date not null check(isfinite(landmark_date)),
 decision text not null check(decision in ('include','exclude','needs_review')),basis text not null check(length(btrim(basis)) between 1 and 4000),limitations text not null default '' check(length(limitations)<=4000),
 document_id uuid not null,reviewer_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(id,case_id,tenant_id),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,foreign key(source_id,case_id,tenant_id) references public.ir_income_sources(id,case_id,tenant_id) on delete restrict,
 foreign key(assessment_id,case_id,tenant_id) references public.ir_assessment_versions(id,case_id,tenant_id) on delete restrict,foreign key(document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id) on delete restrict,
 check(period_end>=period_start)
);
create table public.ir_calculation_versions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,version_number integer not null,assessment_id uuid not null,
 periodicity text not null check(periodicity in ('monthly','annual')),calendar_year integer not null check(calendar_year between 1 and 9998),month integer check(month between 1 and 12),
 deduction_mode text not null check(deduction_mode in ('legal','simplified','most_favorable')),input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),snapshot jsonb not null,adjustments jsonb not null,result jsonb not null,refusals jsonb not null,
 status text not null check(status in ('incomplete','draft','in_review','approved','superseded')),tax_residency text not null default 'unknown' check(tax_residency in ('resident','non_resident','unknown')),inventory_complete boolean not null,completeness_note text not null check(length(completeness_note)<=4000),
 created_by uuid not null references public.profiles(id),reviewer_id uuid references public.profiles(id),review_note text not null default '' check(length(review_note)<=4000),created_at timestamptz not null default now(),reviewed_at timestamptz,
 unique(case_id,version_number),unique(id,case_id,tenant_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(assessment_id,case_id,tenant_id) references public.ir_assessment_versions(id,case_id,tenant_id) on delete restrict,
 check((periodicity='annual' and month is null) or (periodicity='monthly' and month is not null))
);
create table public.ir_calculation_reviews (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,calculation_id uuid not null,decision text not null check(decision in ('approved','returned')),
 note text not null,inventory_complete boolean not null,reviewer_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(calculation_id,case_id,tenant_id) references public.ir_calculation_versions(id,case_id,tenant_id) on delete restrict
);
create table public.ir_tax_returns (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,calendar_year integer not null check(calendar_year between 1 and 9998),exercise integer not null,
 return_kind text not null check(return_kind in ('original','amending')),previous_return_id uuid,document_id uuid not null,receipt_document_id uuid,receipt_number text not null default '' check(length(receipt_number)<=200),
 status text not null check(status in ('draft','filed','processing','settled','cancelled')),reported_tax text not null,reported_refund text not null,paid_quotas text not null,
 notes text not null default '' check(length(notes)<=4000),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(id,case_id,tenant_id),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,foreign key(previous_return_id,case_id,tenant_id) references public.ir_tax_returns(id,case_id,tenant_id) on delete restrict,
 foreign key(document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id) on delete restrict,foreign key(receipt_document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id) on delete restrict,
 check(exercise=calendar_year+1),check(return_kind<>'amending' or previous_return_id is not null)
);
create table public.ir_claims (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,payer_id uuid not null,
 route text not null check(route in ('administrative','judicial')),channel text not null check(channel in ('source','dirpf','perdcomp','court','other')),claim_kind text not null check(claim_kind in ('cessation','restitution','combined')),
 title text not null check(length(btrim(title)) between 1 and 200),assessment_id uuid,calculation_id uuid,status text not null default 'draft' check(status in ('draft','submitted','awaiting','partially_granted','granted','denied','closed')),
 jurisdiction text not null default '' check(length(jurisdiction)<=2000),standing text not null default '' check(length(standing)<=2000),strategy_note text not null default '' check(length(strategy_note)<=4000),
 strategy_reviewer_id uuid references public.profiles(id),strategy_reviewed_at timestamptz,recognized_amount text not null default '0.00',created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(id,case_id,tenant_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,foreign key(payer_id,case_id,tenant_id) references public.ir_payers(id,case_id,tenant_id) on delete restrict,
 foreign key(assessment_id,case_id,tenant_id) references public.ir_assessment_versions(id,case_id,tenant_id) on delete restrict,foreign key(calculation_id,case_id,tenant_id) references public.ir_calculation_versions(id,case_id,tenant_id) on delete restrict,
 check(route<>'judicial' or channel='court'),check(route<>'administrative' or channel<>'court')
);
create table public.ir_claim_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,claim_id uuid not null,
 event_type text not null check(event_type in ('protocol','requirement','appeal','decision_granted','decision_partial','decision_denied','closed','note')),
 description text not null check(length(btrim(description)) between 1 and 4000),occurred_on date not null check(isfinite(occurred_on)),document_id uuid,
 protocol_reference text not null default '' check(length(protocol_reference)<=200),recognized_amount text,task_id uuid,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(claim_id,case_id,tenant_id) references public.ir_claims(id,case_id,tenant_id) on delete restrict,foreign key(document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id) on delete restrict
);
create table public.ir_payment_principals (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,customer_id uuid not null,source_id uuid not null,payment_document_id uuid not null,proof_hash text not null check(proof_hash ~ '^[0-9a-f]{64}$'),
 proof_line text not null check(length(btrim(proof_line)) between 1 and 80),payment_reference text not null check(length(btrim(payment_reference)) between 1 and 200),
 period_start date not null check(isfinite(period_start)),period_end date not null check(isfinite(period_end)),paid_on date not null check(isfinite(paid_on)),tax_code text not null default 'IRPF' check(tax_code='IRPF'),amount text not null,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),status text not null default 'draft' check(status in ('draft','verified')),reviewer_id uuid references public.profiles(id),review_note text not null default '' check(length(review_note)<=4000),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(id,case_id,tenant_id),unique(tenant_id,fingerprint),unique(tenant_id,customer_id,tax_code,payment_reference),unique(tenant_id,customer_id,tax_code,proof_hash,proof_line),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,foreign key(customer_id,tenant_id) references public.customers(id,tenant_id) on delete restrict,
 foreign key(source_id,case_id,tenant_id) references public.ir_income_sources(id,case_id,tenant_id) on delete restrict,foreign key(payment_document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id) on delete restrict,check(period_end>=period_start)
);
create table public.ir_principal_allocations (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,principal_id uuid not null,claim_id uuid not null,amount text not null,
 status text not null default 'active' check(status in ('active','released')),idempotency_key uuid not null,reason text not null check(length(btrim(reason)) between 1 and 4000),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),released_at timestamptz,release_reason text check(length(release_reason)<=4000),
 unique(tenant_id,idempotency_key),unique(id,case_id,tenant_id),foreign key(principal_id,case_id,tenant_id) references public.ir_payment_principals(id,case_id,tenant_id) on delete restrict,
 foreign key(claim_id,case_id,tenant_id) references public.ir_claims(id,case_id,tenant_id) on delete restrict
);
create table public.ir_recoveries (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,allocation_id uuid not null,principal_id uuid not null,claim_id uuid not null,amount text not null,
 received_on date not null check(isfinite(received_on)),channel text not null check(channel in ('source_refund','administrative_refund','judicial_payment')),document_id uuid not null,
 reference text not null check(length(btrim(reference)) between 1 and 200),proof_line text not null default '1' check(length(btrim(proof_line)) between 1 and 80),fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),idempotency_key uuid not null,recorded_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(tenant_id,idempotency_key),unique(tenant_id,reference),unique(tenant_id,fingerprint),
 foreign key(allocation_id,case_id,tenant_id) references public.ir_principal_allocations(id,case_id,tenant_id) on delete restrict,
 foreign key(principal_id,case_id,tenant_id) references public.ir_payment_principals(id,case_id,tenant_id) on delete restrict,
 foreign key(claim_id,case_id,tenant_id) references public.ir_claims(id,case_id,tenant_id) on delete restrict,
 foreign key(document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id) on delete restrict
);
create table public.ir_claim_overlaps (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,claim_a_id uuid not null,claim_b_id uuid not null,
 reason text not null check(length(btrim(reason)) between 1 and 4000),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(claim_a_id,claim_b_id),check(claim_a_id<claim_b_id),
 foreign key(claim_a_id,case_id,tenant_id) references public.ir_claims(id,case_id,tenant_id) on delete restrict,
 foreign key(claim_b_id,case_id,tenant_id) references public.ir_claims(id,case_id,tenant_id) on delete restrict
);
create table public.ir_cessation_records (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,source_id uuid not null,observed_on date not null check(isfinite(observed_on)),
 competence text not null check(competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),previous_withheld text not null,current_withheld text not null,before_document_id uuid not null,after_document_id uuid not null,
 status text not null check(status in ('verified','reopened','ongoing')),review_note text not null check(length(btrim(review_note)) between 1 and 4000),reviewer_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,foreign key(source_id,case_id,tenant_id) references public.ir_income_sources(id,case_id,tenant_id) on delete restrict,
 foreign key(before_document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id) on delete restrict,foreign key(after_document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id) on delete restrict
);


create table public.ir_tax_return_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,return_id uuid not null,
 from_status text not null,to_status text not null,receipt_document_id uuid,receipt_number text not null default '',note text not null,
 actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(return_id,case_id,tenant_id) references public.ir_tax_returns(id,case_id,tenant_id) on delete restrict,
 foreign key(receipt_document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id) on delete restrict
);
create table public.ir_claim_strategy_reviews (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,claim_id uuid not null,assessment_id uuid not null,calculation_id uuid,
 jurisdiction text not null,standing text not null,note text not null,reviewer_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(claim_id,case_id,tenant_id) references public.ir_claims(id,case_id,tenant_id) on delete restrict,
 foreign key(assessment_id,case_id,tenant_id) references public.ir_assessment_versions(id,case_id,tenant_id) on delete restrict,
 foreign key(calculation_id,case_id,tenant_id) references public.ir_calculation_versions(id,case_id,tenant_id) on delete restrict
);
alter table public.ir_claim_events add foreign key(task_id,case_id,tenant_id) references public.legal_case_tasks(id,case_id,tenant_id) on delete restrict;

do $$declare r record;begin
 for r in select * from (values
 ('ir_parameter_validations','taxable'),('ir_parameter_validations','legal_deductions'),('ir_parameter_validations','expected_tax'),
 ('ir_tax_returns','reported_tax'),('ir_tax_returns','reported_refund'),('ir_tax_returns','paid_quotas'),('ir_claims','recognized_amount'),
 ('ir_claim_events','recognized_amount'),('ir_payment_principals','amount'),('ir_principal_allocations','amount'),('ir_recoveries','amount'),
 ('ir_cessation_records','previous_withheld'),('ir_cessation_records','current_withheld')) x(t,c) loop
 execute format('alter table public.%I add check(%I is null or %I=public._ir4_money(%I))',r.t,r.c,r.c,r.c);
 end loop;
end;$$;
alter table public.ir_payment_principals add check(amount::numeric>0);
alter table public.ir_principal_allocations add check(amount::numeric>0);
alter table public.ir_recoveries add check(amount::numeric>0);
alter table public.legal_case_events drop constraint legal_case_events_event_type_check;
alter table public.legal_case_events add constraint legal_case_events_event_type_check check(event_type in (
 'case_created','case_updated','member_granted','member_revoked','party_added','proceeding_added','manual','document_prepared','document_ready','document_abandoned','document_download','retention_changed',
 'operation_updated','interview_submitted','conflict_reviewed','document_requested','document_request_updated','instrument_created','instrument_version_created','instrument_reviewed','external_signature_recorded','task_updated','appointment_updated',
 'ir_fact_changed','ir_evidence_added','ir_document_reviewed','ir_checklist_changed','ir_assessment_changed','representation_changed',
 'ir_tax_imported','ir_calculation_changed','ir_claim_changed','ir_payment_changed','ir_cessation_recorded','ir_report_exported'));

create or replace function public._ir4_assert(p_case_id uuid,p_owner boolean default false)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public._ir_assert_assessment(p_case_id,p_owner);
begin
 perform pg_advisory_xact_lock(hashtextextended(t::text||':ir_tax_parameters',0));return t;
end;$$;
create or replace function public._ir4_ready_document(p_case_id uuid,p_document_id uuid,p_fiscal_only boolean default false)
returns public.legal_case_documents language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare d public.legal_case_documents;
begin
 select * into d from public.legal_case_documents where id=p_document_id and case_id=p_case_id and status='ready';
 if not found or not public.legal_can_access_category(p_case_id,d.category) or (p_fiscal_only and d.category<>'fiscal') then raise exception 'A ready authorized document in the proper case/category is required' using errcode='22023';end if;return d;
end;$$;
create or replace function public._ir4_populate_entry(p_row public.ir_tax_entries,p_payload jsonb)
returns public.ir_tax_entries language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_tax_entries:=p_row;j jsonb;k text;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('row_number','source_id','payment_date','competence','calendar_year','exercise','income_tax_kind','gross','taxable','withheld','legal_deductions','source_page','source_line','notes','raw_data')) then raise exception 'Unsupported import entry fields' using errcode='22023';end if;
 j:=p_payload-'row_number';
 foreach k in array array['gross','taxable','withheld','legal_deductions'] loop
  if j ? k then
   if jsonb_typeof(j->k) not in ('string','null') then raise exception 'Monetary JSON values must be decimal strings' using errcode='22023';end if;
   j:=jsonb_set(j,array[k],coalesce(to_jsonb(public._ir4_money(j->>k,true)),'null'::jsonb));
  end if;
 end loop;
 if j ? 'payment_date' then perform public._ir4_date(j->>'payment_date',true);end if;
 r:=jsonb_populate_record(r,j);
 if r.source_id is not null and not exists(select 1 from public.ir_income_sources where id=r.source_id and case_id=r.case_id) then raise exception 'Income source must belong to this case' using errcode='22023';end if;
 return r;
end;$$;

create or replace function public.ir_create_tax_import(p_case_id uuid,p_document_id uuid,p_title text,p_format text,p_lines jsonb,p_supersedes_import_id uuid default null)
returns public.ir_tax_imports language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_tax_imports;e public.ir_tax_entries;t uuid:=public._legal_assert_operation(p_case_id,'fiscal');j jsonb;n integer:=0;
begin
 perform public._ir4_ready_document(p_case_id,p_document_id,true);
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 500 or octet_length(p_lines::text)>1048576 then raise exception 'Import requires 1-500 rows within 1MiB' using errcode='22023';end if;
 if p_supersedes_import_id is not null and not exists(select 1 from public.ir_tax_imports where id=p_supersedes_import_id and case_id=p_case_id and status in ('reviewed','rejected')) then raise exception 'Import revision must reference a reviewed/rejected import in this case' using errcode='22023';end if;
 insert into public.ir_tax_imports(tenant_id,case_id,document_id,title,format,supersedes_import_id,created_by) values(t,p_case_id,p_document_id,p_title,p_format,p_supersedes_import_id,auth.uid()) returning * into r;
 for j in select value from jsonb_array_elements(p_lines) loop
  n:=n+1;e:=null;e.id:=gen_random_uuid();e.tenant_id:=t;e.case_id:=p_case_id;e.import_id:=r.id;e.row_number:=n;e.income_tax_kind:='unknown';e.notes:='';e.raw_data:='{}';
  e:=public._ir4_populate_entry(e,j);insert into public.ir_tax_entries values(e.*);
 end loop;
 perform public._legal_record_event(p_case_id,'ir_tax_imported','Importação fiscal registrada para conferência.',jsonb_build_object('import_id',r.id));return r;
end;$$;

create or replace function public.ir_update_tax_entry(p_entry_id uuid,p_payload jsonb)
returns public.ir_tax_entries language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare e public.ir_tax_entries;
begin
 select * into e from public.ir_tax_entries where id=p_entry_id;
 if not found then raise exception 'Entry access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(e.case_id,'fiscal');
 select * into e from public.ir_tax_entries where id=p_entry_id for update;
 if not exists(select 1 from public.ir_tax_imports where id=e.import_id and status='draft') then raise exception 'Reviewed entries are immutable; create a revised import' using errcode='22023';end if;
 e:=public._ir4_populate_entry(e,p_payload);
 update public.ir_tax_entries set source_id=e.source_id,payment_date=e.payment_date,competence=e.competence,calendar_year=e.calendar_year,exercise=e.exercise,income_tax_kind=e.income_tax_kind,gross=e.gross,taxable=e.taxable,withheld=e.withheld,legal_deductions=e.legal_deductions,source_page=e.source_page,source_line=e.source_line,notes=e.notes,raw_data=e.raw_data where id=e.id returning * into e;
 perform public._legal_record_event(e.case_id,'ir_tax_imported','Linha fiscal corrigida antes da revisão.',jsonb_build_object('entry_id',e.id));return e;
end;$$;

create or replace function public.ir_review_tax_import(p_import_id uuid,p_decision text,p_note text)
returns public.ir_tax_imports language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_tax_imports;
begin
 select * into r from public.ir_tax_imports where id=p_import_id;
 if not found then raise exception 'Import access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(r.case_id,'fiscal',true);
 select * into r from public.ir_tax_imports where id=p_import_id for update;
 if (r.status<>'draft' and not(r.status='reviewed' and p_decision='rejected')) or coalesce(p_decision,'') not in ('reviewed','rejected') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 then raise exception 'A draft and explicit review note are required' using errcode='22023';end if;
 if p_decision='reviewed' and exists(select 1 from public.ir_tax_entries e where e.import_id=r.id and (source_id is null or payment_date is null or competence is null or calendar_year is null or exercise is null or length(btrim(coalesce(source_line,'')))=0 or income_tax_kind='unknown' or gross is null or taxable is null or withheld is null or legal_deductions is null or extract(year from payment_date)<>calendar_year or payment_date>public._ir4_today())) then raise exception 'Resolve missing facts, payment year and classifications before review' using errcode='22023';end if;
 if p_decision='reviewed' and r.supersedes_import_id is not null then
  if not exists(select 1 from public.ir_tax_imports where id=r.supersedes_import_id and status in ('reviewed','rejected')) then raise exception 'Original import was already superseded' using errcode='22023';end if;
  update public.ir_tax_imports set status='superseded' where id=r.supersedes_import_id;
 end if;
 insert into public.ir_tax_import_reviews(tenant_id,case_id,import_id,from_status,decision,note,reviewer_id) values(r.tenant_id,r.case_id,r.id,r.status,p_decision,p_note,auth.uid());
 update public.ir_tax_imports set status=p_decision,reviewer_id=auth.uid(),reviewed_at=now(),review_note=p_note where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'ir_tax_imported','Conferência de importação registrada.',jsonb_build_object('import_id',r.id,'decision',p_decision));return r;
end;$$;

create or replace function public._ir4_validate_parameters(p_body jsonb)
returns void language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
declare b jsonb;u jsonb;prior numeric:=-1;v numeric;n integer:=0;k text;
begin
 if p_body is null or jsonb_typeof(p_body)<>'object' or octet_length(p_body::text)>100000 or exists(select 1 from jsonb_object_keys(p_body) x where x not in ('jurisdiction','coverage','brackets','simplified','reduction','rounding','validity_note','sources')) or p_body->>'jurisdiction' is distinct from 'BR' or p_body->>'coverage' is distinct from 'ordinary_resident' then raise exception 'Unsupported tax parameter schema/coverage' using errcode='22023';end if;
 if jsonb_typeof(p_body->'brackets') is distinct from 'array' or jsonb_array_length(p_body->'brackets') not between 1 and 20 then raise exception 'Provide ordered tax brackets' using errcode='22023';end if;
 for b in select value from jsonb_array_elements(p_body->'brackets') loop
  n:=n+1;
  if jsonb_typeof(b)<>'object' or exists(select 1 from jsonb_object_keys(b) x where x not in ('upper_bound','rate','deduction')) or not(b ? 'upper_bound') then raise exception 'Invalid tax bracket' using errcode='22023';end if;
  if jsonb_typeof(b->'rate') is distinct from 'string' or jsonb_typeof(b->'deduction') is distinct from 'string' or jsonb_typeof(b->'upper_bound') not in ('string','null') then raise exception 'Bracket financial values must be strings' using errcode='22023';end if;
  if b->>'upper_bound' is null then
   if n<>jsonb_array_length(p_body->'brackets') then raise exception 'Only final bracket may have no upper bound' using errcode='22023';end if;
  else
   v:=public._ir4_money(b->>'upper_bound')::numeric;
   if v<=prior or n=jsonb_array_length(p_body->'brackets') then raise exception 'Bracket bounds must rise and final bracket must be unbounded' using errcode='22023';end if;prior:=v;
  end if;
  if public._ir4_coefficient(b->>'rate')>1 then raise exception 'Tax rate must be a fraction between zero and one' using errcode='22023';end if;
  perform public._ir4_money(b->>'deduction');
 end loop;
 b:=p_body->'simplified';
 if jsonb_typeof(b) is distinct from 'object' or exists(select 1 from jsonb_object_keys(b) x where x not in ('fixed','percent','cap')) then raise exception 'Invalid simplified deduction schema' using errcode='22023';end if;
 if jsonb_typeof(b->'fixed') is distinct from 'string' or jsonb_typeof(b->'percent') is distinct from 'string' or jsonb_typeof(b->'cap') is distinct from 'string' then raise exception 'Deduction financial values must be strings' using errcode='22023';end if;
 perform public._ir4_money(b->>'fixed'),public._ir4_money(b->>'cap');
 if public._ir4_coefficient(b->>'percent')>1 then raise exception 'Deduction percentage must be a fraction' using errcode='22023';end if;
 b:=p_body->'reduction';
 if jsonb_typeof(b) is distinct from 'object' or exists(select 1 from jsonb_object_keys(b) x where x not in ('enabled','zero_until','phaseout_until','full_cap','intercept','slope','boundary')) or jsonb_typeof(b->'enabled') is distinct from 'boolean' or coalesce(b->>'boundary','') not in ('formula','zero_at_upper') then raise exception 'Invalid reduction schema or boundary policy' using errcode='22023';end if;
 foreach k in array array['zero_until','phaseout_until','full_cap','intercept','slope'] loop
  if jsonb_typeof(b->k) is distinct from 'string' then raise exception 'Reduction financial values must be strings' using errcode='22023';end if;
  if k<>'slope' then perform public._ir4_money(b->>k);end if;
 end loop;
 perform public._ir4_coefficient(b->>'slope');
 if (b->>'enabled')::boolean and (b->>'phaseout_until')::numeric<=(b->>'zero_until')::numeric then raise exception 'Reduction range is invalid' using errcode='22023';end if;
 b:=p_body->'rounding';
 if jsonb_typeof(b) is distinct from 'object' or exists(select 1 from jsonb_object_keys(b) x where x not in ('mode','scale','tax_stage','reduction_stage')) or b->>'mode' is distinct from 'half_up' or b->>'scale' is distinct from '2' or coalesce(b->>'tax_stage','') not in ('before_reduction','final_only') or coalesce(b->>'reduction_stage','') not in ('round','exact') then raise exception 'Unsupported rounding policy' using errcode='22023';end if;
 if jsonb_typeof(p_body->'sources') is distinct from 'array' or jsonb_array_length(p_body->'sources') not between 1 and 20 then raise exception 'Parameter sources are required' using errcode='22023';end if;
 for u in select value from jsonb_array_elements(p_body->'sources') loop
  if jsonb_typeof(u)<>'object' or coalesce(u->>'url','') !~ '^https://[^ /]+/' or length(u->>'url')>2000 or length(coalesce(u->>'title',''))>200 or exists(select 1 from jsonb_object_keys(u) x where x not in ('url','checked_on','version_note','title')) then raise exception 'Invalid source reference' using errcode='22023';end if;
  perform public._ir4_date(u->>'checked_on');
 end loop;
 if length(btrim(coalesce(p_body->>'validity_note',''))) not between 1 and 4000 then raise exception 'Explicit parameter validity note is required' using errcode='22023';end if;
end;$$;

create or replace function public._ir4_tax(p_body jsonb,p_taxable numeric,p_legal_deductions numeric,p_deduction_mode text)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
declare b jsonb;s numeric;s_raw numeric;d numeric;base numeric;rate numeric;ded numeric;before_raw numeric;before_tax numeric;red_raw numeric:=0;red_used numeric:=0;due numeric;residual numeric:=0;
begin
 if p_taxable is null or p_legal_deductions is null or p_taxable<0 or p_legal_deductions<0 or coalesce(p_deduction_mode,'') not in ('legal','simplified','most_favorable') then raise exception 'Invalid deterministic tax input' using errcode='22023';end if;
 s:=least((p_body->'simplified'->>'cap')::numeric,(p_body->'simplified'->>'fixed')::numeric+p_taxable*(p_body->'simplified'->>'percent')::numeric);
 s_raw:=s;s:=round(s,2);d:=case p_deduction_mode when 'legal' then p_legal_deductions when 'simplified' then s else greatest(p_legal_deductions,s) end;base:=greatest(p_taxable-d,0);
 for b in select value from jsonb_array_elements(p_body->'brackets') loop
  if b->>'upper_bound' is null or base<=(b->>'upper_bound')::numeric then rate:=(b->>'rate')::numeric;ded:=(b->>'deduction')::numeric;exit;end if;
 end loop;
 before_raw:=greatest(base*rate-ded,0);before_tax:=case when p_body->'rounding'->>'tax_stage'='before_reduction' then round(before_raw,2) else before_raw end;
 b:=p_body->'reduction';
 if (b->>'enabled')::boolean then
  if p_taxable<=(b->>'zero_until')::numeric then red_raw:=(b->>'full_cap')::numeric;
  elsif p_taxable<=(b->>'phaseout_until')::numeric then
   red_raw:=greatest((b->>'intercept')::numeric-(b->>'slope')::numeric*p_taxable,0);
   if p_taxable=(b->>'phaseout_until')::numeric then residual:=red_raw;if b->>'boundary'='zero_at_upper' then red_raw:=0;end if;end if;
  end if;
 end if;
 red_used:=least(before_tax,case when p_body->'rounding'->>'reduction_stage'='round' then round(red_raw,2) else red_raw end);
 due:=round(greatest(before_tax-red_used,0),2);
 return jsonb_build_object('taxable',p_taxable::numeric(30,2)::text,'legal_deductions',p_legal_deductions::numeric(30,2)::text,'simplified_deduction',s::numeric(30,2)::text,'simplified_deduction_raw',s_raw::text,'simplified_rounding','half_up_2',
 'deduction_used',d::numeric(30,2)::text,'base',base::numeric(30,2)::text,'rate',rate::text,'bracket_deduction',ded::numeric(30,2)::text,'tax_before_reduction',before_tax::text,
 'reduction_raw',red_raw::text,'reduction_used',red_used::text,'tax_due',due::numeric(30,2)::text,'boundary_formula_residual',residual::text,'rounding',p_body->'rounding');
end;$$;

create or replace function public.ir_create_tax_parameter_version(p_payload jsonb)
returns public.ir_tax_parameter_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_tax_parameter_versions;
begin
 if not public.legal_can_create() then raise exception 'Parameter authoring denied' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('parameter_key','title','periodicity','valid_from','valid_until','calendar_year','exercise','body')) then raise exception 'Unsupported parameter fields' using errcode='22023';end if;
 perform public._ir4_validate_parameters(p_payload->'body');perform public._ir4_date(p_payload->>'valid_from'),public._ir4_date(p_payload->>'valid_until');
 r.id:=gen_random_uuid();r.tenant_id:=public.legal_actual_tenant();r.status:='draft';r.created_by:=auth.uid();r.created_at:=now();r.review_note:='';r:=jsonb_populate_record(r,p_payload);
 perform pg_advisory_xact_lock(hashtextextended(r.tenant_id::text||':ir_tax_parameters',0));
 select coalesce(max(version_number),0)+1 into r.version_number from public.ir_tax_parameter_versions where tenant_id=r.tenant_id and parameter_key=r.parameter_key;
 insert into public.ir_tax_parameter_versions values(r.*) returning * into r;return r;
end;$$;

create or replace function public.ir_record_parameter_validation(p_version_id uuid,p_payload jsonb)
returns public.ir_parameter_validations language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare p public.ir_tax_parameter_versions;r public.ir_parameter_validations;
begin
 if not public.legal_can_create() then raise exception 'Parameter validation denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(public.legal_actual_tenant()::text||':ir_tax_parameters',0));
 select * into p from public.ir_tax_parameter_versions where id=p_version_id and tenant_id=public.legal_actual_tenant();
 if not found or p.status<>'draft' then raise exception 'Only a draft from this workspace can be validated' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('taxable','legal_deductions','deduction_mode','expected_tax','expected_source','review_note')) then raise exception 'Unsupported validation fields' using errcode='22023';end if;
 r.id:=gen_random_uuid();r.tenant_id:=p.tenant_id;r.parameter_version_id:=p.id;r.reviewer_id:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);
 r.taxable:=public._ir4_json_money(p_payload,'taxable');r.legal_deductions:=public._ir4_json_money(p_payload,'legal_deductions');r.expected_tax:=public._ir4_json_money(p_payload,'expected_tax');
 r.result:=public._ir4_tax(p.body,r.taxable::numeric,r.legal_deductions::numeric,r.deduction_mode);r.matches_expected:=(r.result->>'tax_due')::numeric=r.expected_tax::numeric;
 insert into public.ir_parameter_validations values(r.*) returning * into r;return r;
end;$$;

create or replace function public.ir_review_tax_parameter_version(p_version_id uuid,p_decision text,p_note text)
returns public.ir_tax_parameter_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_tax_parameter_versions;
begin
 if not public.legal_can_create() then raise exception 'Parameter review denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(public.legal_actual_tenant()::text||':ir_tax_parameters',0));
 select * into r from public.ir_tax_parameter_versions where id=p_version_id and tenant_id=public.legal_actual_tenant() for update;
 if not found then raise exception 'Parameter access denied' using errcode='42501';end if;
 if r.status<>'draft' or coalesce(p_decision,'') not in ('approved','rejected') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 then raise exception 'Draft and explicit professional review required' using errcode='22023';end if;
 if p_decision='approved' and (not exists(select 1 from public.ir_parameter_validations where parameter_version_id=r.id and matches_expected) or exists(select 1 from public.ir_parameter_validations where parameter_version_id=r.id and not matches_expected)) then raise exception 'Independent examples must match before approval; fix divergent parameters in a new version' using errcode='22023';end if;
 update public.ir_tax_parameter_versions set status=p_decision,reviewer_id=auth.uid(),review_note=p_note,reviewed_at=now() where id=r.id returning * into r;return r;
end;$$;

create or replace function public.ir_record_period_review(p_case_id uuid,p_payload jsonb)
returns public.ir_period_reviews language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_period_reviews;t uuid:=public._ir4_assert(p_case_id,true);a public.ir_assessment_versions;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('source_id','assessment_id','period_start','period_end','landmark_date','decision','basis','limitations','document_id')) then raise exception 'Unsupported period review fields' using errcode='22023';end if;
 r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.reviewer_id:=auth.uid();r.created_at:=now();r.limitations:='';r:=jsonb_populate_record(r,p_payload);
 r.period_start:=public._ir4_date(p_payload->>'period_start');r.period_end:=public._ir4_date(p_payload->>'period_end');r.landmark_date:=public._ir4_fact_date(p_payload->>'landmark_date');
 perform public._ir4_ready_document(p_case_id,r.document_id);
 select * into a from public.ir_assessment_versions where id=r.assessment_id and case_id=p_case_id;
 if not found or a.status<>'approved' or a.input_hash<>encode(sha256(convert_to(public._ir_build_snapshot(p_case_id,a.source_proposals)::text,'UTF8')),'hex') then raise exception 'Period review requires a current approved legal assessment' using errcode='22023';end if;
 if not exists(select 1 from public.ir_income_sources where id=r.source_id and case_id=p_case_id) then raise exception 'Period source must belong to this case' using errcode='22023';end if;
 insert into public.ir_period_reviews values(r.*) returning * into r;
 perform public._legal_record_event(p_case_id,'ir_calculation_changed','Marco e período registrados por revisão humana.',jsonb_build_object('period_review_id',r.id));return r;
end;$$;

create or replace function public._ir4_snapshot(p_case_id uuid,p_payload jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object('engine_version','ordinary_numeric_v1','configuration',p_payload,
 'assessment',(select to_jsonb(a)||jsonb_build_object('current_input_hash',encode(sha256(convert_to(public._ir_build_snapshot(p_case_id,a.source_proposals)::text,'UTF8')),'hex')) from public.ir_assessment_versions a where a.id=(p_payload->>'assessment_id')::uuid and a.case_id=p_case_id),
 'imports',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.ir_tax_imports i where case_id=p_case_id),'[]'),
 'entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.ir_tax_entries e where case_id=p_case_id),'[]'),
 'parameters',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.ir_tax_parameter_versions p where p.id in(select value::uuid from jsonb_array_elements_text(p_payload->'parameter_ids'))),'[]'),
 'parameter_heads',coalesce((select jsonb_agg(to_jsonb(h) order by h.parameter_key) from (select distinct on (p.parameter_key) p.parameter_key,p.id,p.version_number from public.ir_tax_parameter_versions p where p.status='approved' and (p.tenant_id,p.parameter_key) in(select v.tenant_id,v.parameter_key from public.ir_tax_parameter_versions v where v.id in(select value::uuid from jsonb_array_elements_text(p_payload->'parameter_ids'))) order by p.parameter_key,p.version_number desc) h),'[]'),
 'period_reviews',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.ir_period_reviews p where case_id=p_case_id),'[]'),
 'tax_returns',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.ir_tax_returns r where case_id=p_case_id),'[]'),
 'payment_principals',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.ir_payment_principals p where case_id=p_case_id),'[]'),
 'recoveries',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.ir_recoveries r where case_id=p_case_id),'[]'));
$$;

create or replace function public._ir4_compute(p_case_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare a public.ir_assessment_versions;entry_row public.ir_tax_entries;p public.ir_tax_parameter_versions;g record;j jsonb;v uuid;review public.ir_period_reviews;
 start_date date;end_date date;year_value integer:=(p_payload->>'calendar_year')::integer;month_value integer:=(p_payload->>'month')::integer;
 imports uuid[];parameters uuid[];issues jsonb:='[]';groups jsonb:='[]';baseline numeric:=0;proposed numeric:=0;withheld_total numeric:=0;
 bt numeric;pt numeric;bd numeric;pd numeric;effective_taxable numeric;effective_deductions numeric;bm jsonb;pm jsonb;n integer;amount_value text;
begin
 if p_payload->>'periodicity'='annual' then start_date:=make_date(year_value,1,1);end_date:=make_date(year_value,12,31);
 else start_date:=make_date(year_value,month_value,1);end_date:=(start_date+interval '1 month - 1 day')::date;end if;
 select coalesce(array_agg(value::uuid),array[]::uuid[]) into imports from jsonb_array_elements_text(p_payload->'import_ids');
 select coalesce(array_agg(value::uuid),array[]::uuid[]) into parameters from jsonb_array_elements_text(p_payload->'parameter_ids');
 select * into a from public.ir_assessment_versions where id=(p_payload->>'assessment_id')::uuid and case_id=p_case_id;
 if not found then raise exception 'Assessment must belong to this case' using errcode='42501';end if;
 if a.status<>'approved' or a.input_hash<>encode(sha256(convert_to(public._ir_build_snapshot(p_case_id,a.source_proposals)::text,'UTF8')),'hex') then issues:=issues||jsonb_build_array(jsonb_build_object('code','assessment_not_current','message','A avaliação jurídica deve estar aprovada e atual.'));end if;
 if p_payload->>'tax_residency'<>'resident' then issues:=issues||jsonb_build_array(jsonb_build_object('code','residency_not_covered','message','Residência fiscal precisa ser confirmada; não residente está fora deste motor.'));end if;
 if not (p_payload->>'inventory_complete')::boolean or length(btrim(p_payload->>'completeness_note'))=0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','inventory_incomplete','message','Confirme a abrangência de fontes, naturezas e pagamentos; nenhum total parcial será apresentado.'));end if;
 foreach v in array imports loop
  if not exists(select 1 from public.ir_tax_imports where id=v and case_id=p_case_id) then raise exception 'Import must belong to this case' using errcode='42501';end if;
  if not exists(select 1 from public.ir_tax_imports where id=v and status='reviewed') then issues:=issues||jsonb_build_array(jsonb_build_object('code','import_not_reviewed','message','Há importação ainda não conferida ou substituída.'));end if;
 end loop;
 foreach v in array parameters loop
  if not exists(select 1 from public.ir_tax_parameter_versions where id=v and tenant_id=public.legal_actual_tenant()) then raise exception 'Parameter access denied' using errcode='42501';end if;
 end loop;
 if exists(select 1 from public.ir_tax_imports i join public.ir_tax_entries e on e.import_id=i.id where i.case_id=p_case_id and i.status in ('draft','reviewed') and (e.payment_date between start_date and end_date or e.payment_date is null) and (i.status<>'reviewed' or not(i.id=any(imports)))) then issues:=issues||jsonb_build_array(jsonb_build_object('code','scope_entries_missing','message','Existem linhas do período ausentes da seleção ou sem revisão.'));end if;
 select count(*) into n from public.ir_tax_entries where import_id=any(imports) and payment_date between start_date and end_date;
 if n=0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','no_period_entries','message','Não há linhas conferidas para o período solicitado.'));end if;
 if exists(select 1 from public.ir_tax_entries e join public.ir_income_sources s on s.id=e.source_id where e.import_id=any(imports) and e.payment_date between start_date and end_date and (e.income_tax_kind<>'ordinary' or s.income_kind='other' or (s.income_kind='pension' and s.pension_kind='unknown') or (s.income_kind in ('supplementary_benefit','supplementary_redemption') and (s.product_type='unknown' or s.income_event='unknown')))) then issues:=issues||jsonb_build_array(jsonb_build_object('code','income_not_covered','message','RRA, 13º, regime regressivo, exterior, outras naturezas ou classificações incompletas exigem contrato específico.'));end if;
 if p_payload->>'periodicity'='annual' and year_value>=2026 and (select coalesce(sum(gross::numeric),0) from public.ir_tax_entries where import_id=any(imports) and payment_date between start_date and end_date)>600000 then issues:=issues||jsonb_build_array(jsonb_build_object('code','minimum_tax_not_covered','message','Tributação mínima e suas exclusões precisam de avaliação específica; este motor não produz o total anual.'));end if;
 if exists(select 1 from public.ir_tax_entries e join public.ir_tax_imports i on i.id=e.import_id join public.legal_case_documents d on d.id=i.document_id where e.import_id=any(imports) and e.payment_date between start_date and end_date group by d.sha256,e.source_page,coalesce(e.source_line,e.row_number::text),e.source_id,e.payment_date,e.income_tax_kind having count(*)>1) then issues:=issues||jsonb_build_array(jsonb_build_object('code','duplicate_document_rows','message','Uma mesma linha de prova foi importada mais de uma vez.'));end if;
 for j in select value from jsonb_array_elements(p_payload->'adjustments') loop
  select * into entry_row from public.ir_tax_entries where id=(j->>'entry_id')::uuid and case_id=p_case_id and import_id=any(imports) and payment_date between start_date and end_date;
  if not found then raise exception 'Adjustment must reference an included entry' using errcode='22023';end if;
  if (j->>'proposed_taxable')::numeric>entry_row.gross::numeric then raise exception 'Proposed taxable cannot exceed documented gross' using errcode='22023';end if;
  if (j->>'proposed_taxable')::numeric<entry_row.taxable::numeric then
   select * into review from public.ir_period_reviews where id=(j->>'period_review_id')::uuid and case_id=p_case_id and source_id=entry_row.source_id and assessment_id=a.id;
   if not found or review.decision<>'include' or entry_row.payment_date not between review.period_start and review.period_end or not exists(select 1 from jsonb_array_elements(a.source_proposals) x where x->>'source_id'=entry_row.source_id::text and x->>'proposal'='proposed_applicable') then issues:=issues||jsonb_build_array(jsonb_build_object('code','period_not_reviewed','message','Redução de rendimento exige fundamento aprovado e período expressamente revisado.'));end if;
  end if;
 end loop;
 if jsonb_array_length(issues)=0 then
  for g in select case when p_payload->>'periodicity'='annual' then null::uuid else s.payer_id end payer_id,min(e.payment_date) min_date,max(e.payment_date) max_date,array_agg(e.id order by e.id) entry_ids
   from public.ir_tax_entries e join public.ir_income_sources s on s.id=e.source_id where e.import_id=any(imports) and e.payment_date between start_date and end_date
   group by case when p_payload->>'periodicity'='annual' then null::uuid else s.payer_id end loop
   select count(*) into n from public.ir_tax_parameter_versions x where x.id=any(parameters) and x.status='approved' and x.periodicity=p_payload->>'periodicity' and x.calendar_year=year_value and x.valid_from<=g.min_date and x.valid_until>=g.max_date;
   if n<>1 then issues:=issues||jsonb_build_array(jsonb_build_object('code','parameter_coverage_missing','message','O grupo exige exatamente uma tabela aprovada que cubra seus pagamentos; não há substituição por ano vizinho.'));continue;end if;
   select * into p from public.ir_tax_parameter_versions x where x.id=any(parameters) and x.status='approved' and x.periodicity=p_payload->>'periodicity' and x.calendar_year=year_value and x.valid_from<=g.min_date and x.valid_until>=g.max_date;
   bt:=0;pt:=0;bd:=0;pd:=0;
   for entry_row in select * from public.ir_tax_entries where id=any(g.entry_ids) loop
    select value into j from jsonb_array_elements(p_payload->'adjustments') where value->>'entry_id'=entry_row.id::text;
    effective_taxable:=coalesce(j->>'proposed_taxable',entry_row.taxable)::numeric;effective_deductions:=coalesce(j->>'proposed_legal_deductions',entry_row.legal_deductions)::numeric;
    bt:=bt+entry_row.taxable::numeric;pt:=pt+effective_taxable;bd:=bd+entry_row.legal_deductions::numeric;pd:=pd+effective_deductions;withheld_total:=withheld_total+entry_row.withheld::numeric;
   end loop;
   bm:=public._ir4_tax(p.body,bt,bd,p_payload->>'deduction_mode');pm:=public._ir4_tax(p.body,pt,pd,p_payload->>'deduction_mode');
   baseline:=baseline+(bm->>'tax_due')::numeric;proposed:=proposed+(pm->>'tax_due')::numeric;
   groups:=groups||jsonb_build_array(jsonb_build_object('payer_id',g.payer_id,'period',case when p_payload->>'periodicity'='annual' then year_value::text else to_char(start_date,'YYYY-MM') end,'entry_ids',to_jsonb(g.entry_ids),'parameter_version_id',p.id,'baseline',bm,'proposed',pm));
  end loop;
 end if;
 if jsonb_array_length(issues)>0 then groups:='[]';end if;
 return jsonb_build_object('refusals',issues,'result',jsonb_build_object('scope',case when p_payload->>'periodicity'='annual' then 'annual_ordinary' else 'monthly_by_payer' end,
 'baseline_tax',case when jsonb_array_length(issues)=0 then baseline::numeric(30,2)::text else null end,'proposed_tax',case when jsonb_array_length(issues)=0 then proposed::numeric(30,2)::text else null end,
 'hypothesis_difference',case when jsonb_array_length(issues)=0 then (baseline-proposed)::numeric(30,2)::text else null end,'withheld_reported',case when jsonb_array_length(issues)=0 then withheld_total::numeric(30,2)::text else null end,
 'recognized_credit',null,'received',null,'groups',groups,'monetary_update',jsonb_build_object('status','not_calculated','reason','Juros e atualização exigem série, marcos e parâmetros próprios homologados.')));
end;$$;

create or replace function public.ir_create_calculation_version(p_case_id uuid,p_payload jsonb)
returns public.ir_calculation_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_calculation_versions;t uuid:=public._ir4_assert(p_case_id);j jsonb;k text;cfg jsonb;outcome jsonb;sn jsonb;adjusted jsonb:='[]';n integer;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>200000 or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('assessment_id','periodicity','calendar_year','month','import_ids','parameter_ids','adjustments','deduction_mode','inventory_complete','completeness_note','tax_residency')) then raise exception 'Unsupported calculation fields' using errcode='22023';end if;
 cfg:=jsonb_build_object('month',null,'adjustments','[]'::jsonb,'inventory_complete',false,'completeness_note','','tax_residency','unknown')||p_payload;
 if coalesce(cfg->>'periodicity','') not in ('monthly','annual') or coalesce(cfg->>'deduction_mode','') not in ('legal','simplified','most_favorable') or coalesce(cfg->>'tax_residency','') not in ('resident','non_resident','unknown') or jsonb_typeof(cfg->'inventory_complete') is distinct from 'boolean' or coalesce(cfg->>'calendar_year','') !~ '^[0-9]{1,4}$' then raise exception 'Invalid period, mode, residence or completeness declaration' using errcode='22023';end if;
 if (cfg->>'calendar_year')::integer not between 1 and 9998 or (cfg->>'periodicity'='monthly' and (coalesce(cfg->>'month','') !~ '^[0-9]{1,2}$' or (cfg->>'month')::integer not between 1 and 12)) or (cfg->>'periodicity'='annual' and cfg->>'month' is not null) then raise exception 'Invalid calendar period' using errcode='22023';end if;
 foreach k in array array['import_ids','parameter_ids','adjustments'] loop
  if jsonb_typeof(cfg->k) is distinct from 'array' or jsonb_array_length(cfg->k)>500 then raise exception 'Calculation selections must be bounded arrays' using errcode='22023';end if;
 end loop;
 if (select count(*) from jsonb_array_elements_text(cfg->'import_ids'))<>(select count(distinct value) from jsonb_array_elements_text(cfg->'import_ids')) or (select count(*) from jsonb_array_elements_text(cfg->'parameter_ids'))<>(select count(distinct value) from jsonb_array_elements_text(cfg->'parameter_ids')) then raise exception 'Duplicate selections are not allowed' using errcode='22023';end if;
 for j in select value from jsonb_array_elements(cfg->'adjustments') loop
  if jsonb_typeof(j)<>'object' or exists(select 1 from jsonb_object_keys(j) x where x not in ('entry_id','proposed_taxable','proposed_legal_deductions','period_review_id','reason')) or jsonb_typeof(j->'proposed_taxable') is distinct from 'string' or length(btrim(coalesce(j->>'reason',''))) not between 1 and 4000 then raise exception 'Invalid fiscal adjustment' using errcode='22023';end if;
  j:=jsonb_set(j,'{proposed_taxable}',to_jsonb(public._ir4_money(j->>'proposed_taxable')));
  if j ? 'proposed_legal_deductions' then
   if jsonb_typeof(j->'proposed_legal_deductions') is distinct from 'string' then raise exception 'Proposed deduction must be a decimal string' using errcode='22023';end if;
   j:=jsonb_set(j,'{proposed_legal_deductions}',to_jsonb(public._ir4_money(j->>'proposed_legal_deductions')));
  end if;
  adjusted:=adjusted||jsonb_build_array(j);
 end loop;
 if jsonb_array_length(adjusted)<>(select count(distinct x.value->>'entry_id') from jsonb_array_elements(adjusted) x(value)) then raise exception 'Each entry may be adjusted once' using errcode='22023';end if;
 cfg:=jsonb_set(cfg,'{adjustments}',adjusted);
 outcome:=public._ir4_compute(p_case_id,cfg);sn:=public._ir4_snapshot(p_case_id,cfg);
 select coalesce(max(version_number),0)+1 into n from public.ir_calculation_versions where case_id=p_case_id;
 update public.ir_calculation_versions set status='superseded' where case_id=p_case_id and periodicity=cfg->>'periodicity' and calendar_year=(cfg->>'calendar_year')::integer and month is not distinct from (cfg->>'month')::integer and status<>'superseded';
 insert into public.ir_calculation_versions(tenant_id,case_id,version_number,assessment_id,periodicity,calendar_year,month,deduction_mode,input_hash,snapshot,adjustments,result,refusals,status,tax_residency,inventory_complete,completeness_note,created_by)
 values(t,p_case_id,n,(cfg->>'assessment_id')::uuid,cfg->>'periodicity',(cfg->>'calendar_year')::integer,(cfg->>'month')::integer,cfg->>'deduction_mode',encode(sha256(convert_to(sn::text,'UTF8')),'hex'),sn,adjusted,outcome->'result',outcome->'refusals',case when jsonb_array_length(outcome->'refusals')>0 then 'incomplete' else 'draft' end,cfg->>'tax_residency',(cfg->>'inventory_complete')::boolean,cfg->>'completeness_note',auth.uid()) returning * into r;
 perform public._legal_record_event(p_case_id,'ir_calculation_changed','Memória fiscal versionada; valores não constituem crédito reconhecido.',jsonb_build_object('calculation_id',r.id,'status',r.status));return r;
end;$$;

create or replace function public._ir4_calculation_current(p_calculation_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select coalesce((select v.input_hash=encode(sha256(convert_to(public._ir4_snapshot(v.case_id,v.snapshot->'configuration')::text,'UTF8')),'hex') from public.ir_calculation_versions v where id=p_calculation_id),false);
$$;
create or replace function public.ir_submit_calculation_review(p_version_id uuid)
returns public.ir_calculation_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_calculation_versions;
begin
 select * into r from public.ir_calculation_versions where id=p_version_id;
 if not found then raise exception 'Calculation access denied' using errcode='42501';end if;
 perform public._ir4_assert(r.case_id);
 select * into r from public.ir_calculation_versions where id=p_version_id for update;
 if r.status<>'draft' or not public._ir4_calculation_current(r.id) then raise exception 'Only a complete current draft may enter review' using errcode='22023';end if;
 update public.ir_calculation_versions set status='in_review' where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'ir_calculation_changed','Memória enviada à revisão fiscal/jurídica.',jsonb_build_object('calculation_id',r.id));return r;
end;$$;
create or replace function public.ir_review_calculation(p_version_id uuid,p_decision text,p_note text,p_inventory_complete boolean default false)
returns public.ir_calculation_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_calculation_versions;
begin
 select * into r from public.ir_calculation_versions where id=p_version_id;
 if not found then raise exception 'Calculation access denied' using errcode='42501';end if;
 perform public._ir4_assert(r.case_id,true);
 select * into r from public.ir_calculation_versions where id=p_version_id for update;
 if r.status<>'in_review' or coalesce(p_decision,'') not in ('approved','returned') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 or not public._ir4_calculation_current(r.id) then raise exception 'Calculation review needs a current pending version and a reason' using errcode='22023';end if;
 if p_decision='approved' and p_inventory_complete is distinct from true then raise exception 'Reviewer must explicitly confirm complete coverage' using errcode='22023';end if;
 insert into public.ir_calculation_reviews(tenant_id,case_id,calculation_id,decision,note,inventory_complete,reviewer_id) values(r.tenant_id,r.case_id,r.id,p_decision,p_note,coalesce(p_inventory_complete,false),auth.uid());
 update public.ir_calculation_versions set status=case when p_decision='approved' then 'approved' else 'draft' end,reviewer_id=auth.uid(),reviewed_at=now(),review_note=p_note where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'ir_calculation_changed','Revisão fiscal registrada; não implica reconhecimento ou recebimento externo.',jsonb_build_object('calculation_id',r.id,'decision',p_decision));return r;
end;$$;

-- Actual operational facts use the explicit Brazilian office date. Future
-- normative tables are allowed; future receipts/filings are not recorded as done.
create or replace function public._ir4_today()
returns date language sql volatile set search_path=pg_catalog as $$select (clock_timestamp() at time zone 'America/Sao_Paulo')::date$$;
create or replace function public._ir4_fact_date(p_value text)
returns date language plpgsql volatile set search_path=pg_catalog,public,pg_temp as $$
declare d date:=public._ir4_date(p_value);
begin
 if d>public._ir4_today() then raise exception 'An effective event cannot be dated in the future (America/Sao_Paulo)' using errcode='22023';end if;return d;
end;$$;
create or replace function public._ir4_json_money(p_payload jsonb,p_key text,p_nullable boolean default false)
returns text language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
begin
 if p_payload->>p_key is null and p_nullable then return null;end if;
 if jsonb_typeof(p_payload->p_key) is distinct from 'string' then raise exception 'Monetary JSON values must be strings' using errcode='22023';end if;
 return public._ir4_money(p_payload->>p_key,p_nullable);
end;$$;

create or replace function public.ir_record_tax_return(p_case_id uuid,p_payload jsonb)
returns public.ir_tax_returns language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_tax_returns;t uuid:=public._legal_assert_operation(p_case_id,'fiscal',true);
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('calendar_year','exercise','return_kind','previous_return_id','document_id','receipt_document_id','receipt_number','status','reported_tax','reported_refund','paid_quotas','notes')) then raise exception 'Unsupported tax return fields' using errcode='22023';end if;
 r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.receipt_number:='';r.notes:='';r.created_by:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);
 r.reported_tax:=public._ir4_json_money(p_payload,'reported_tax');r.reported_refund:=public._ir4_json_money(p_payload,'reported_refund');r.paid_quotas:=public._ir4_json_money(p_payload,'paid_quotas');
 perform public._ir4_ready_document(p_case_id,r.document_id,true);
 if r.receipt_document_id is not null then perform public._ir4_ready_document(p_case_id,r.receipt_document_id,true);end if;
 if r.status<>'draft' and (r.receipt_document_id is null or length(btrim(r.receipt_number))=0) then raise exception 'A recorded filing needs a receipt document and reference' using errcode='22023';end if;
 if r.previous_return_id is not null and not exists(select 1 from public.ir_tax_returns where id=r.previous_return_id and case_id=p_case_id and calendar_year=r.calendar_year and exercise=r.exercise) then raise exception 'Prior declaration must match this case and year' using errcode='22023';end if;
 insert into public.ir_tax_returns values(r.*) returning * into r;
 perform public._legal_record_event(p_case_id,'ir_claim_changed','Declaração/recibo registrado manualmente; sem transmissão automática.',jsonb_build_object('tax_return_id',r.id));return r;
end;$$;

create or replace function public.ir_create_claim(p_case_id uuid,p_payload jsonb)
returns public.ir_claims language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_claims;t uuid:=public._ir4_assert(p_case_id);
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('payer_id','route','channel','claim_kind','title','assessment_id','calculation_id')) then raise exception 'Unsupported claim fields' using errcode='22023';end if;
 r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.status:='draft';r.jurisdiction:='';r.standing:='';r.strategy_note:='';r.recognized_amount:='0.00';r.created_by:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);
 if r.calculation_id is not null and r.assessment_id is null then select assessment_id into r.assessment_id from public.ir_calculation_versions where id=r.calculation_id and case_id=p_case_id;end if;
 if not exists(select 1 from public.ir_payers where id=r.payer_id and case_id=p_case_id) or (r.assessment_id is not null and not exists(select 1 from public.ir_assessment_versions where id=r.assessment_id and case_id=p_case_id)) or (r.calculation_id is not null and not exists(select 1 from public.ir_calculation_versions where id=r.calculation_id and case_id=p_case_id and (r.assessment_id is null or assessment_id=r.assessment_id))) then raise exception 'Claim references must belong to this case and assessment' using errcode='22023';end if;
 insert into public.ir_claims values(r.*) returning * into r;
 perform public._legal_record_event(p_case_id,'ir_claim_changed','Pedido por pagador e rota criado como rascunho.',jsonb_build_object('claim_id',r.id));return r;
end;$$;

create or replace function public.ir_review_claim_strategy(p_claim_id uuid,p_jurisdiction text,p_standing text,p_note text)
returns public.ir_claims language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_claims;a public.ir_assessment_versions;
begin
 select * into r from public.ir_claims where id=p_claim_id;
 if not found then raise exception 'Claim access denied' using errcode='42501';end if;
 perform public._ir4_assert(r.case_id,true);
 select * into r from public.ir_claims where id=p_claim_id for update;
 if length(btrim(coalesce(p_jurisdiction,''))) not between 1 and 2000 or length(btrim(coalesce(p_standing,''))) not between 1 and 2000 or length(btrim(coalesce(p_note,''))) not between 1 and 4000 then raise exception 'Review jurisdiction, standing and strategy explicitly' using errcode='22023';end if;
 select * into a from public.ir_assessment_versions where id=r.assessment_id and case_id=r.case_id;
 if not found or a.status<>'approved' or a.input_hash<>encode(sha256(convert_to(public._ir_build_snapshot(r.case_id,a.source_proposals)::text,'UTF8')),'hex') then raise exception 'A new strategy requires the current approved legal assessment' using errcode='22023';end if;
 if r.calculation_id is not null and (not exists(select 1 from public.ir_calculation_versions where id=r.calculation_id and status='approved') or not public._ir4_calculation_current(r.calculation_id)) then raise exception 'A new strategy requires a current approved calculation' using errcode='22023';end if;
 insert into public.ir_claim_strategy_reviews(tenant_id,case_id,claim_id,assessment_id,calculation_id,jurisdiction,standing,note,reviewer_id) values(r.tenant_id,r.case_id,r.id,r.assessment_id,r.calculation_id,p_jurisdiction,p_standing,p_note,auth.uid());
 update public.ir_claims set jurisdiction=p_jurisdiction,standing=p_standing,strategy_note=p_note,strategy_reviewer_id=auth.uid(),strategy_reviewed_at=now() where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'ir_claim_changed','Competência, legitimidade e estratégia revisadas.',jsonb_build_object('claim_id',r.id));return r;
end;$$;

create or replace function public.ir_record_claim_event(p_claim_id uuid,p_payload jsonb)
returns public.ir_claim_events language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c public.ir_claims;r public.ir_claim_events;task public.legal_case_tasks;j jsonb;
begin
 select * into c from public.ir_claims where id=p_claim_id;
 if not found then raise exception 'Claim access denied' using errcode='42501';end if;
 perform public._ir4_assert(c.case_id,true);
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('event_type','description','occurred_on','document_id','protocol_reference','recognized_amount','due_at','assignee_id','substitute_id')) then raise exception 'Unsupported claim event fields' using errcode='22023';end if;
 r.id:=gen_random_uuid();r.tenant_id:=c.tenant_id;r.case_id:=c.case_id;r.claim_id:=c.id;r.protocol_reference:='';r.created_by:=auth.uid();r.created_at:=clock_timestamp();r:=jsonb_populate_record(r,p_payload-array['due_at','assignee_id','substitute_id']);
 r.occurred_on:=public._ir4_fact_date(p_payload->>'occurred_on');r.recognized_amount:=public._ir4_json_money(p_payload,'recognized_amount',true);
 if r.document_id is not null then perform public._ir4_ready_document(c.case_id,r.document_id);end if;
 if r.event_type in ('protocol','appeal','decision_granted','decision_partial','decision_denied') and r.document_id is null then raise exception 'Protocol, appeal or decision requires documentary evidence' using errcode='22023';end if;
 if r.event_type='protocol' and length(btrim(r.protocol_reference))=0 then raise exception 'Protocol receipt reference is required' using errcode='22023';end if;
 if r.event_type in ('decision_granted','decision_partial') and r.recognized_amount is null then raise exception 'Record the amount recognized by the decision separately, including explicit zero for cessation-only' using errcode='22023';end if;
 if p_payload->>'due_at' is not null then
  if r.event_type not in ('requirement','appeal') or not isfinite((p_payload->>'due_at')::timestamptz) then raise exception 'Only a requirement or appeal may create a finite manual deadline' using errcode='22023';end if;
  j:=jsonb_build_object('title','Exigência/recurso de pedido — conferir documento restrito','notes','Prazo informado manualmente pelo responsável; não calculado automaticamente.','due_at',p_payload->>'due_at','assignee_id',coalesce(p_payload->>'assignee_id',c.created_by::text));
  if p_payload->>'substitute_id' is not null then j:=j||jsonb_build_object('substitute_id',p_payload->>'substitute_id');end if;
  task:=public.legal_save_case_task(c.case_id,j);r.task_id:=task.id;
 end if;
 -- A verified external fact remains recordable after its receipt changes F3's
 -- input hash. This records evidence; it never submits a new act externally.
 insert into public.ir_claim_events values(r.*) returning * into r;
 -- Past events are retained without regressing a newer outcome. For equal
 -- occurred_on dates, recorded wall-clock time then UUID define the sequence.
 update public.ir_claims set status=coalesce((select case x.event_type when 'protocol' then 'submitted' when 'requirement' then 'awaiting' when 'appeal' then 'submitted' when 'decision_granted' then 'granted' when 'decision_partial' then 'partially_granted' when 'decision_denied' then 'denied' when 'closed' then 'closed' end from public.ir_claim_events x where x.claim_id=c.id and x.event_type<>'note' order by x.occurred_on desc,x.created_at desc,x.id desc limit 1),'draft'),
 recognized_amount=coalesce((select case when x.event_type='decision_denied' then '0.00' else x.recognized_amount end from public.ir_claim_events x where x.claim_id=c.id and x.event_type in ('decision_granted','decision_partial','decision_denied') order by x.occurred_on desc,x.created_at desc,x.id desc limit 1),'0.00') where id=c.id;
 perform public._legal_record_event(c.case_id,'ir_claim_changed','Fato externo do pedido registrado com conferência manual.',jsonb_build_object('claim_id',c.id,'claim_event_id',r.id));return r;
end;$$;

create or replace function public.ir_link_claim_overlap(p_claim_a_id uuid,p_claim_b_id uuid,p_reason text)
returns public.ir_claim_overlaps language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c public.ir_claims;r public.ir_claim_overlaps;
begin
 select * into c from public.ir_claims where id=p_claim_a_id;
 if not found then raise exception 'Claim access denied' using errcode='42501';end if;
 perform public._ir4_assert(c.case_id,true);
 if p_claim_a_id=p_claim_b_id or not exists(select 1 from public.ir_claims where id=p_claim_b_id and case_id=c.case_id) then raise exception 'Overlap requires two distinct claims in this case' using errcode='22023';end if;
 insert into public.ir_claim_overlaps(tenant_id,case_id,claim_a_id,claim_b_id,reason,created_by) values(c.tenant_id,c.case_id,least(p_claim_a_id,p_claim_b_id),greatest(p_claim_a_id,p_claim_b_id),p_reason,auth.uid()) on conflict(claim_a_id,claim_b_id) do nothing;
 select * into r from public.ir_claim_overlaps where claim_a_id=least(p_claim_a_id,p_claim_b_id) and claim_b_id=greatest(p_claim_a_id,p_claim_b_id);
 perform public._legal_record_event(c.case_id,'ir_claim_changed','Sobreposição entre pedidos registrada.',jsonb_build_object('overlap_id',r.id));return r;
end;$$;

create or replace function public.ir_update_claim_draft(p_claim_id uuid,p_payload jsonb)
returns public.ir_claims language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_claims;
begin
 select * into r from public.ir_claims where id=p_claim_id;
 if not found then raise exception 'Claim access denied' using errcode='42501';end if;
 perform public._ir4_assert(r.case_id,true);
 select * into r from public.ir_claims where id=p_claim_id for update;
 if r.status<>'draft' then raise exception 'Only draft preparation may change; preserve filed references' using errcode='22023';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('payer_id','route','channel','claim_kind','title','assessment_id','calculation_id')) then raise exception 'Unsupported draft fields' using errcode='22023';end if;
 r:=jsonb_populate_record(r,p_payload);
 if r.calculation_id is not null and r.assessment_id is null then select assessment_id into r.assessment_id from public.ir_calculation_versions where id=r.calculation_id and case_id=r.case_id;end if;
 if not exists(select 1 from public.ir_payers where id=r.payer_id and case_id=r.case_id) or (r.assessment_id is not null and not exists(select 1 from public.ir_assessment_versions where id=r.assessment_id and case_id=r.case_id)) or (r.calculation_id is not null and not exists(select 1 from public.ir_calculation_versions where id=r.calculation_id and case_id=r.case_id and assessment_id=r.assessment_id)) then raise exception 'Draft references must match case and assessment' using errcode='22023';end if;
 update public.ir_claims set payer_id=r.payer_id,route=r.route,channel=r.channel,claim_kind=r.claim_kind,title=r.title,assessment_id=r.assessment_id,calculation_id=r.calculation_id,jurisdiction='',standing='',strategy_note='',strategy_reviewer_id=null,strategy_reviewed_at=null where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'ir_claim_changed','Preparação do pedido atualizada; revise novamente a estratégia.',jsonb_build_object('claim_id',r.id));return r;
end;$$;

create or replace function public.ir_create_payment_principal(p_case_id uuid,p_payload jsonb)
returns public.ir_payment_principals language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_payment_principals;d public.legal_case_documents;t uuid:=public._legal_assert_operation(p_case_id,'fiscal');
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('customer_id','source_id','payment_document_id','proof_line','payment_reference','period_start','period_end','paid_on','tax_code','amount')) then raise exception 'Unsupported principal fields' using errcode='22023';end if;
 r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.tax_code:='IRPF';r.status:='draft';r.review_note:='';r.created_by:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);
 r.amount:=public._ir4_json_money(p_payload,'amount');r.period_start:=public._ir4_date(p_payload->>'period_start');r.period_end:=public._ir4_date(p_payload->>'period_end');r.paid_on:=public._ir4_fact_date(p_payload->>'paid_on');
 r.proof_line:=btrim(r.proof_line);r.payment_reference:=btrim(r.payment_reference);
 if not exists(select 1 from public.legal_cases where id=p_case_id and customer_id=r.customer_id) and not exists(select 1 from public.legal_case_parties where case_id=p_case_id and customer_id=r.customer_id) then raise exception 'Payment taxpayer must be linked to the case' using errcode='22023';end if;
 if not exists(select 1 from public.ir_income_sources where id=r.source_id and case_id=p_case_id) then raise exception 'Payment source must belong to the case' using errcode='22023';end if;
 d:=public._ir4_ready_document(p_case_id,r.payment_document_id,true);r.proof_hash:=d.sha256;
 r.fingerprint:=encode(sha256(convert_to(concat_ws('|',r.customer_id::text,r.tax_code,r.period_start::text,r.period_end::text,d.sha256,r.proof_line),'UTF8')),'hex');
 insert into public.ir_payment_principals values(r.*) returning * into r;
 perform public._legal_record_event(p_case_id,'ir_payment_changed','Pagamento principal registrado para conferência; não representa crédito reconhecido.',jsonb_build_object('principal_id',r.id));return r;
end;$$;

create or replace function public.ir_verify_payment_principal(p_principal_id uuid,p_note text)
returns public.ir_payment_principals language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_payment_principals;
begin
 select * into r from public.ir_payment_principals where id=p_principal_id;
 if not found then raise exception 'Principal access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(r.case_id,'fiscal',true);
 select * into r from public.ir_payment_principals where id=p_principal_id for update;
 if length(btrim(coalesce(p_note,''))) not between 1 and 4000 then raise exception 'Payment verification needs a professional note' using errcode='22023';end if;
 perform public._ir4_ready_document(r.case_id,r.payment_document_id,true);
 if r.status='verified' then return r;end if;
 update public.ir_payment_principals set status='verified',reviewer_id=auth.uid(),review_note=p_note where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'ir_payment_changed','Comprovante de pagamento conferido.',jsonb_build_object('principal_id',r.id));return r;
end;$$;

create or replace function public._ir4_principal_balance(p_principal_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object('id',p.id,'principal',p.amount,'allocated',coalesce(b.reserved,0)::numeric(30,2)::text,'received',coalesce(b.received,0)::numeric(30,2)::text,
 'available',(p.amount::numeric-coalesce(b.reserved,0)-coalesce(b.received,0))::numeric(30,2)::text)
 from public.ir_payment_principals p left join lateral (
 select sum(case when a.status='active' then greatest(a.amount::numeric-coalesce(r.received,0),0) else 0 end) reserved,sum(coalesce(r.received,0)) received
 from public.ir_principal_allocations a left join lateral(select sum(amount::numeric) received from public.ir_recoveries where allocation_id=a.id) r on true where a.principal_id=p.id
 ) b on true where p.id=p_principal_id;
$$;

create or replace function public.ir_allocate_principal(p_principal_id uuid,p_claim_id uuid,p_amount text,p_idempotency_key uuid,p_reason text)
returns public.ir_principal_allocations language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare p public.ir_payment_principals;r public.ir_principal_allocations;money text:=public._ir4_money(p_amount);
begin
 select * into p from public.ir_payment_principals where id=p_principal_id;
 if not found then raise exception 'Principal access denied' using errcode='42501';end if;
 perform public._ir4_assert(p.case_id,true);
 select * into p from public.ir_payment_principals where id=p_principal_id for update;
 if not exists(select 1 from public.ir_claims where id=p_claim_id and case_id=p.case_id) then raise exception 'Allocation claim must belong to the case' using errcode='22023';end if;
 if p_idempotency_key is null or length(btrim(coalesce(p_reason,''))) not between 1 and 4000 or money::numeric<=0 then raise exception 'Positive allocation, idempotency key and reason required' using errcode='22023';end if;
 select * into r from public.ir_principal_allocations where tenant_id=p.tenant_id and idempotency_key=p_idempotency_key;
 if found then
  if r.principal_id<>p.id or r.claim_id<>p_claim_id or r.amount<>money or r.reason<>p_reason then raise exception 'Idempotency key already used with another allocation' using errcode='22023';end if;return r;
 end if;
 if p.status<>'verified' or money::numeric>(public._ir4_principal_balance(p.id)->>'available')::numeric then raise exception 'Principal is unverified or already allocated/received; double appropriation denied' using errcode='22023';end if;
 insert into public.ir_principal_allocations(tenant_id,case_id,principal_id,claim_id,amount,idempotency_key,reason,created_by) values(p.tenant_id,p.case_id,p.id,p_claim_id,money,p_idempotency_key,p_reason,auth.uid()) returning * into r;
 perform public._legal_record_event(p.case_id,'ir_payment_changed','Principal vinculado ao pedido sob controle de saldo.',jsonb_build_object('allocation_id',r.id));return r;
end;$$;

create or replace function public.ir_release_allocation(p_allocation_id uuid,p_reason text)
returns public.ir_principal_allocations language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_principal_allocations;
begin
 select * into r from public.ir_principal_allocations where id=p_allocation_id;
 if not found then raise exception 'Allocation access denied' using errcode='42501';end if;
 perform public._ir4_assert(r.case_id,true);perform 1 from public.ir_payment_principals where id=r.principal_id for update;
 select * into r from public.ir_principal_allocations where id=p_allocation_id for update;
 if length(btrim(coalesce(p_reason,''))) not between 1 and 4000 then raise exception 'Release requires a reason' using errcode='22023';end if;
 if r.status='released' then return r;end if;
 update public.ir_principal_allocations set status='released',released_at=now(),release_reason=p_reason where id=r.id returning * into r;
 -- Received principal remains consumed; release frees only unpaid reservation.
 perform public._legal_record_event(r.case_id,'ir_payment_changed','Reserva não recebida liberada; recebimentos preservados.',jsonb_build_object('allocation_id',r.id));return r;
end;$$;

create or replace function public.ir_record_recovery(p_allocation_id uuid,p_payload jsonb)
returns public.ir_recoveries language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare a public.ir_principal_allocations;r public.ir_recoveries;old public.ir_recoveries;d public.legal_case_documents;
begin
 select * into a from public.ir_principal_allocations where id=p_allocation_id;
 if not found then raise exception 'Allocation access denied' using errcode='42501';end if;
 perform public._ir4_assert(a.case_id,true);perform 1 from public.ir_payment_principals where id=a.principal_id for update;
 select * into a from public.ir_principal_allocations where id=p_allocation_id;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('amount','received_on','channel','document_id','reference','proof_line','idempotency_key')) then raise exception 'Unsupported recovery fields' using errcode='22023';end if;
 r.id:=gen_random_uuid();r.tenant_id:=a.tenant_id;r.case_id:=a.case_id;r.allocation_id:=a.id;r.principal_id:=a.principal_id;r.claim_id:=a.claim_id;r.proof_line:='1';r.recorded_by:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);
 r.amount:=public._ir4_json_money(p_payload,'amount');r.received_on:=public._ir4_fact_date(p_payload->>'received_on');r.reference:=btrim(r.reference);r.proof_line:=btrim(r.proof_line);
 d:=public._ir4_ready_document(a.case_id,r.document_id,true);
 r.fingerprint:=encode(sha256(convert_to(d.sha256||'|'||r.proof_line,'UTF8')),'hex');
 select * into old from public.ir_recoveries where tenant_id=r.tenant_id and idempotency_key=r.idempotency_key;
 if found then
  if old.allocation_id<>a.id or old.amount<>r.amount or old.received_on<>r.received_on or old.channel<>r.channel or old.document_id<>r.document_id or old.reference<>r.reference or old.proof_line<>r.proof_line then raise exception 'Idempotency key already used with another receipt' using errcode='22023';end if;return old;
 end if;
 if a.status<>'active' or r.amount::numeric<=0 or r.amount::numeric+(select coalesce(sum(amount::numeric),0) from public.ir_recoveries where allocation_id=a.id)>a.amount::numeric then raise exception 'Receipt exceeds active allocation or already consumed principal' using errcode='22023';end if;
 insert into public.ir_recoveries values(r.*) returning * into r;
 perform public._legal_record_event(a.case_id,'ir_payment_changed','Recebimento comprovado conciliado; sem movimento bancário automático.',jsonb_build_object('recovery_id',r.id));return r;
end;$$;

create or replace function public.ir_record_cessation(p_case_id uuid,p_payload jsonb)
returns public.ir_cessation_records language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_cessation_records;t uuid:=public._legal_assert_operation(p_case_id,'fiscal',true);
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('source_id','observed_on','competence','previous_withheld','current_withheld','before_document_id','after_document_id','review_note')) then raise exception 'Unsupported cessation fields' using errcode='22023';end if;
 r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.reviewer_id:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);
 r.observed_on:=public._ir4_fact_date(p_payload->>'observed_on');r.previous_withheld:=public._ir4_json_money(p_payload,'previous_withheld');r.current_withheld:=public._ir4_json_money(p_payload,'current_withheld');
 perform public._ir4_ready_document(p_case_id,r.before_document_id,true);perform public._ir4_ready_document(p_case_id,r.after_document_id,true);
 if r.before_document_id=r.after_document_id then raise exception 'Compare two distinct payroll/benefit documents' using errcode='22023';end if;
 if not exists(select 1 from public.ir_income_sources where id=r.source_id and case_id=p_case_id) then raise exception 'Cessation source must belong to this case' using errcode='22023';end if;
 r.status:=case when r.current_withheld::numeric=0 then 'verified' when r.previous_withheld::numeric=0 then 'reopened' else 'ongoing' end;
 insert into public.ir_cessation_records values(r.*) returning * into r;
 perform public._legal_record_event(p_case_id,'ir_cessation_recorded','Folhas comparadas para conferir retenção efetiva.',jsonb_build_object('cessation_id',r.id));return r;
end;$$;

create or replace function public.ir_get_financial_context(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare fiscal boolean;combined boolean;
begin
 if not public.legal_can_access_case(p_case_id) then raise exception 'Case access denied' using errcode='42501';end if;
 fiscal:=public.legal_can_access_category(p_case_id,'fiscal');combined:=public.ir_can_access_assessment(p_case_id);
 return jsonb_build_object('can_fiscal',fiscal,'can_calculate',combined,'operational_timezone','America/Sao_Paulo',
 'calculation_states',case when combined then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'is_current',public._ir4_calculation_current(c.id)) order by c.version_number) from public.ir_calculation_versions c where case_id=p_case_id),'[]') else '[]'::jsonb end,
 'principal_balances',case when fiscal then coalesce((select jsonb_agg(public._ir4_principal_balance(p.id) order by p.created_at,p.id) from public.ir_payment_principals p where case_id=p_case_id),'[]') else '[]'::jsonb end,
 'overlaps',case when combined then coalesce((select jsonb_agg(jsonb_build_object('claim_a_id',o.claim_a_id,'claim_b_id',o.claim_b_id) order by o.id) from public.ir_claim_overlaps o where case_id=p_case_id),'[]') else '[]'::jsonb end);
end;$$;

create or replace function public.ir_update_tax_return_status(p_return_id uuid,p_status text,p_receipt_document_id uuid default null,p_receipt_number text default null,p_note text default '')
returns public.ir_tax_returns language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_tax_returns;old_status text;receipt uuid;reference text;
begin
 select * into r from public.ir_tax_returns where id=p_return_id;
 if not found then raise exception 'Tax return access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(r.case_id,'fiscal',true);
 select * into r from public.ir_tax_returns where id=p_return_id for update;
 if coalesce(p_status,'') not in ('filed','processing','settled','cancelled') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 or r.status='cancelled' then raise exception 'Return status change needs a current record and note' using errcode='22023';end if;
 if p_status<>'cancelled' and array_position(array['draft','filed','processing','settled'],p_status)<array_position(array['draft','filed','processing','settled'],r.status) then raise exception 'Do not overwrite a later return situation with an earlier stage' using errcode='22023';end if;
 receipt:=coalesce(p_receipt_document_id,r.receipt_document_id);reference:=coalesce(p_receipt_number,r.receipt_number);
 perform public._ir4_ready_document(r.case_id,receipt,true);
 if length(btrim(coalesce(reference,'')))=0 then raise exception 'Receipt reference is required for an effective return status' using errcode='22023';end if;
 old_status:=r.status;
 update public.ir_tax_returns set status=p_status,receipt_document_id=receipt,receipt_number=reference where id=r.id returning * into r;
 insert into public.ir_tax_return_events(tenant_id,case_id,return_id,from_status,to_status,receipt_document_id,receipt_number,note,actor_id) values(r.tenant_id,r.case_id,r.id,old_status,p_status,receipt,reference,p_note,auth.uid());
 perform public._legal_record_event(r.case_id,'ir_claim_changed','Situação da declaração atualizada por conferência; não implica recebimento.',jsonb_build_object('tax_return_id',r.id));return r;
end;$$;

create or replace function public.ir_read_calculation_report(p_version_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_calculation_versions;t uuid;
begin
 select * into r from public.ir_calculation_versions where id=p_version_id;
 if not found then raise exception 'Report access denied' using errcode='42501';end if;
 perform 1 from public.legal_cases where id=r.case_id for update;
 if not public.ir_can_access_assessment(r.case_id) then raise exception 'Report requires both medical and fiscal access' using errcode='42501';end if;
 t:=public.legal_actual_tenant();
 perform pg_advisory_xact_lock(hashtextextended(t::text||':ir_rule_catalog',0));
 perform pg_advisory_xact_lock(hashtextextended(t::text||':ir_tax_parameters',0));
 select * into r from public.ir_calculation_versions where id=p_version_id;
 perform public._legal_record_event(r.case_id,'ir_report_exported','Demonstrativo fiscal histórico consultado/exportado.',jsonb_build_object('calculation_id',r.id));
 return jsonb_build_object('calculation',to_jsonb(r),'is_current',public._ir4_calculation_current(r.id),'generated_at',clock_timestamp());
end;$$;

-- Preserve original CSV bytes/hash in the existing private document flow.
alter table public.legal_case_documents drop constraint legal_case_documents_mime_type_check;
alter table public.legal_case_documents add constraint legal_case_documents_mime_type_check check(mime_type in ('application/pdf','image/jpeg','image/png','text/plain','text/csv'));
update storage.buckets set allowed_mime_types=case when allowed_mime_types is null then null else array(select distinct x from unnest(allowed_mime_types||array['text/csv']) x) end where id='legal-case-documents';
create or replace function public.legal_prepare_document(p_case_id uuid,p_category text,p_display_name text,p_file_name text,p_mime_type text,p_size_bytes bigint)
returns public.legal_case_documents language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_tenant uuid; v_row public.legal_case_documents;
begin
  -- Lock before checking access, serializing concurrent member revocations.
  perform 1 from public.legal_cases where id=p_case_id for update;
  if not public.legal_can_access_case(p_case_id,true) or not public.legal_can_access_category(p_case_id,p_category) then
    raise exception 'Document upload denied' using errcode='42501';
  end if;
  v_tenant:=public.legal_actual_tenant();
  -- Prepared rows reserve the case quota before upload.
  if p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>10485760 then
    raise exception 'Document must contain 1 byte to 10 MiB' using errcode='22023';
  end if;
  if (select coalesce(sum(size_bytes),0) from public.legal_case_documents where case_id=p_case_id and status in ('prepared','ready'))+p_size_bytes>209715200 then
    raise exception 'Case document limit of 200 MiB exceeded' using errcode='22023';
  end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png','text/plain','text/csv') then raise exception 'Unsupported legal document MIME' using errcode='23514';end if;
  insert into public.legal_case_documents(id,tenant_id,case_id,category,display_name,file_name,mime_type,size_bytes,storage_path,uploaded_by)
    values(v_id,v_tenant,p_case_id,p_category,btrim(p_display_name),btrim(p_file_name),p_mime_type,p_size_bytes,
      v_tenant::text||'/'||p_case_id::text||'/'||v_id::text,auth.uid()) returning * into v_row;
  perform public._legal_record_event(p_case_id,'document_prepared','Recebimento de documento iniciado.',jsonb_build_object('document_id',v_id));
  return v_row;
end;
$$;

create or replace function public.legal_public_prepare_request_upload(p_token_hash text,p_file_name text,p_mime_type text,p_size_bytes bigint)
returns public.legal_case_documents language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;d public.legal_case_documents;i uuid:=gen_random_uuid();
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service operation only' using errcode='42501'; end if;
 select q.* into r from public.legal_document_requests q join public.legal_document_request_tokens t on t.request_id=q.id where t.token_hash=p_token_hash for update of q;
 if not found then raise exception 'Invalid document link' using errcode='42501'; end if;
 if (select token_hash from public.legal_document_request_tokens where request_id=r.id) is distinct from p_token_hash then raise exception 'Document link was rotated' using errcode='42501'; end if;
 perform 1 from public.legal_cases where id=r.case_id for update;
 if r.status<>'open' or r.used_at is not null or r.expires_at is null or r.expires_at<=clock_timestamp() or not public._legal_actor_can_edit(r.case_id,r.created_by,r.category) or not public._ir_representation_allows(r.representation_id,r.case_id) then raise exception 'Invalid or expired document link' using errcode='42501'; end if;
 if p_size_bytes is null or p_size_bytes not between 1 and 10485760 or (select coalesce(sum(size_bytes),0) from public.legal_case_documents where case_id=r.case_id and status in ('prepared','ready'))+p_size_bytes>209715200 then raise exception 'Document quota exceeded' using errcode='22023'; end if;
 if p_mime_type not in ('application/pdf','image/jpeg','image/png','text/plain','text/csv') then raise exception 'Unsupported legal document MIME' using errcode='23514';end if;
 insert into public.legal_case_documents(id,tenant_id,case_id,category,display_name,file_name,mime_type,size_bytes,storage_path,uploaded_by)
 values(i,r.tenant_id,r.case_id,r.category,r.title,btrim(p_file_name),p_mime_type,p_size_bytes,r.tenant_id::text||'/'||r.case_id::text||'/'||i::text,r.created_by) returning * into d;
 update public.legal_document_requests set status='uploading',document_id=i,used_at=now(),updated_at=now() where id=r.id;
 insert into public.legal_case_events(tenant_id,case_id,actor_id,event_type,description,metadata)
 values(r.tenant_id,r.case_id,r.created_by,'document_prepared','Documento recebido pelo link de coleta; processamento iniciado.',jsonb_build_object('request_id',r.id,'document_id',i,'origin','public_request'));
 return d;
end;$$;


-- Revoke inherited defaults as well as named-role grants. Monetary bodies are
-- only read by the appropriate category; combined analyses need both grants.
do $$declare t text;begin
 foreach t in array array['ir_tax_imports','ir_tax_import_reviews','ir_tax_entries','ir_tax_parameter_versions','ir_parameter_validations','ir_period_reviews','ir_calculation_versions','ir_calculation_reviews','ir_tax_returns','ir_tax_return_events','ir_claims','ir_claim_events','ir_claim_strategy_reviews','ir_payment_principals','ir_principal_allocations','ir_recoveries','ir_claim_overlaps','ir_cessation_records'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated,service_role',t);
 end loop;
 foreach t in array array['ir_tax_parameter_versions','ir_parameter_validations'] loop
  execute format('create policy %I on public.%I for select to authenticated using(tenant_id=public.legal_actual_tenant() and public.legal_feature_enabled())',t||'_read',t);
 end loop;
 foreach t in array array['ir_tax_imports','ir_tax_import_reviews','ir_tax_entries','ir_tax_returns','ir_tax_return_events','ir_payment_principals','ir_cessation_records'] loop
  execute format('create policy %I on public.%I for select to authenticated using(public.legal_can_access_category(case_id,''fiscal''))',t||'_read',t);
 end loop;
 foreach t in array array['ir_period_reviews','ir_calculation_versions','ir_calculation_reviews','ir_claims','ir_claim_events','ir_claim_strategy_reviews','ir_principal_allocations','ir_recoveries','ir_claim_overlaps'] loop
  execute format('create policy %I on public.%I for select to authenticated using(public.ir_can_access_assessment(case_id))',t||'_read',t);
 end loop;
 foreach t in array array['ir_tax_imports','ir_tax_import_reviews','ir_tax_entries','ir_period_reviews','ir_calculation_versions','ir_calculation_reviews','ir_tax_returns','ir_tax_return_events','ir_claims','ir_claim_events','ir_claim_strategy_reviews','ir_payment_principals','ir_principal_allocations','ir_recoveries','ir_claim_overlaps','ir_cessation_records'] loop
  execute format('create index %I on public.%I(tenant_id,case_id)',t||'_case_idx',t);
 end loop;
end;$$;
create index ir_tax_entries_payment_idx on public.ir_tax_entries(case_id,payment_date);
create index ir_allocations_principal_idx on public.ir_principal_allocations(principal_id,status);
create index ir_recoveries_allocation_idx on public.ir_recoveries(allocation_id);

do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like '\_ir4\_%' escape '\' or p.proname=any(array[
 'ir_create_tax_import','ir_update_tax_entry','ir_review_tax_import','ir_create_tax_parameter_version','ir_record_parameter_validation','ir_review_tax_parameter_version',
 'ir_record_period_review','ir_create_calculation_version','ir_submit_calculation_review','ir_review_calculation','ir_record_tax_return','ir_update_tax_return_status',
 'ir_create_claim','ir_update_claim_draft','ir_review_claim_strategy','ir_record_claim_event','ir_link_claim_overlap','ir_create_payment_principal','ir_verify_payment_principal',
 'ir_allocate_principal','ir_release_allocation','ir_record_recovery','ir_record_cessation','ir_get_financial_context','ir_read_calculation_report',
 'legal_prepare_document','legal_public_prepare_request_upload'])) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname='legal_public_prepare_request_upload' then execute format('grant execute on function %s to service_role',f.signature);
  elsif f.proname not like '\_ir4\_%' escape '\' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;
select pg_notify('pgrst','reload schema');
