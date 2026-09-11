-- F5: case finances, separate from SaaS billing and IR tax principal.
-- Canonical decimal text at the API boundary; all arithmetic uses numeric.
create unique index if not exists legal_instrument_versions_finance_reference on public.legal_instrument_versions(id,case_id,tenant_id);
create unique index if not exists legal_portal_memberships_finance_reference on public.legal_portal_memberships(id,case_id,tenant_id);

create table public.legal_fee_agreement_versions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,case_id uuid not null,
 agreement_key text not null check(length(btrim(agreement_key)) between 1 and 80),version_number integer not null check(version_number>0),
 instrument_version_id uuid not null,acceptance_record_id uuid references public.legal_external_signature_records(id),title text not null check(length(btrim(title)) between 1 and 180),
 model text not null check(model in ('fixed','success')),fixed_amount text not null check(fixed_amount ~ '^[0-9]{1,14}\.[0-9]{2}$'),
 success_rate text not null check(success_rate ~ '^(0(\.[0-9]{1,9})?|1(\.0{1,9})?)$'),
 basis_kind text not null check(basis_kind in ('manual','ir_recovery','ir_decision')),
 trigger_description text not null check(length(btrim(trigger_description)) between 1 and 4000),exclusions text not null default '' check(length(exclusions)<=4000),
 status text not null default 'draft' check(status in ('draft','approved','rejected')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text not null default '' check(length(review_note)<=4000),superseded_at timestamptz,
 unique(id,case_id,tenant_id),unique(case_id,agreement_key,version_number),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete cascade,
 foreign key(instrument_version_id,case_id,tenant_id) references public.legal_instrument_versions(id,case_id,tenant_id),
 check((model='fixed' and fixed_amount::numeric>0 and success_rate::numeric=0 and basis_kind='manual') or (model='success' and fixed_amount::numeric=0 and success_rate::numeric>0))
);
create table public.legal_fee_basis_versions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,agreement_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 180),source_ids uuid[] not null default '{}',document_id uuid,proof_line text not null default '1' check(length(btrim(proof_line)) between 1 and 80),supersedes_basis_id uuid,superseded_at timestamptz,
 base_amount text not null check(base_amount ~ '^[0-9]{1,14}\.[0-9]{2}$'),deductions text not null check(deductions ~ '^[0-9]{1,14}\.[0-9]{2}$'),
 effective_base text not null check(effective_base ~ '^[0-9]{1,14}\.[0-9]{2}$'),fee_amount text not null check(fee_amount ~ '^[0-9]{1,14}\.[0-9]{2}$'),
 source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),snapshot jsonb not null,
 justification text not null check(length(btrim(justification)) between 1 and 4000),status text not null default 'draft' check(status in ('draft','approved','rejected')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text not null default '' check(length(review_note)<=4000),
 unique(id,case_id,tenant_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete cascade,
 foreign key(agreement_id,case_id,tenant_id) references public.legal_fee_agreement_versions(id,case_id,tenant_id),
 foreign key(document_id) references public.legal_case_documents(id),foreign key(supersedes_basis_id,case_id,tenant_id) references public.legal_fee_basis_versions(id,case_id,tenant_id),check(deductions::numeric<=base_amount::numeric)
);
create table public.legal_financial_obligations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 180),category text not null check(category in ('fee','cost','reimbursement','advance','client_transfer')),
 direction text not null check(direction in ('receivable','payable')),funds_owner text not null check(funds_owner in ('client','office')),
 beneficiary text not null check(beneficiary in ('office','client','third_party')),amount text not null check(amount ~ '^[0-9]{1,14}\.[0-9]{2}$' and amount::numeric>0),due_on date not null check(isfinite(due_on)),
 agreement_id uuid,basis_id uuid,document_id uuid,notes text not null default '' check(length(notes)<=4000),
 status text not null default 'draft' check(status in ('draft','approved','cancelled')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text not null default '' check(length(review_note)<=4000),cancel_reason text,
 unique(id,case_id,tenant_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete cascade,
 foreign key(agreement_id,case_id,tenant_id) references public.legal_fee_agreement_versions(id,case_id,tenant_id),
 foreign key(basis_id,case_id,tenant_id) references public.legal_fee_basis_versions(id,case_id,tenant_id),foreign key(document_id) references public.legal_case_documents(id),
 check((category='fee' and agreement_id is not null and basis_id is not null and direction='receivable' and funds_owner='office' and beneficiary='office') or (category<>'fee' and agreement_id is null and basis_id is null)),
 check(category<>'client_transfer' or (direction='payable' and funds_owner='client' and beneficiary='client')),
 check(category<>'advance' or (direction='receivable' and funds_owner='client'))
);
create table public.legal_cash_transactions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,
 from_owner text not null check(from_owner in ('external','client','office')),to_owner text not null check(to_owner in ('external','client','office')),
 amount text not null check(amount ~ '^[0-9]{1,14}\.[0-9]{2}$' and amount::numeric>0),occurred_on date not null check(isfinite(occurred_on)),
 document_id uuid not null,proof_hash text not null check(proof_hash ~ '^[0-9a-f]{64}$'),proof_line text not null check(length(btrim(proof_line)) between 1 and 80),reference text not null check(length(btrim(reference)) between 1 and 180),
 reverses_id uuid,transfer_obligation_id uuid,compensation_authorized boolean not null default false,reason text not null check(length(btrim(reason)) between 1 and 4000),
 idempotency_key uuid not null,payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 unique(id,case_id,tenant_id),unique(tenant_id,idempotency_key),unique(tenant_id,proof_hash,proof_line),unique(tenant_id,reference),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete cascade,
 foreign key(reverses_id,case_id,tenant_id) references public.legal_cash_transactions(id,case_id,tenant_id),
 foreign key(transfer_obligation_id,case_id,tenant_id) references public.legal_financial_obligations(id,case_id,tenant_id),foreign key(document_id) references public.legal_case_documents(id),
 check(from_owner<>to_owner),check(from_owner='external' or to_owner='external' or transfer_obligation_id is not null)
);
create table public.legal_cash_allocations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,cash_transaction_id uuid not null,obligation_id uuid not null,
 kind text not null check(kind in ('settlement','refund')),original_allocation_id uuid,amount text not null check(amount ~ '^[0-9]{1,14}\.[0-9]{2}$' and amount::numeric>0),
 idempotency_key uuid not null,reason text not null check(length(btrim(reason)) between 1 and 4000),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(id,case_id,tenant_id),unique(tenant_id,idempotency_key),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete cascade,
 foreign key(cash_transaction_id,case_id,tenant_id) references public.legal_cash_transactions(id,case_id,tenant_id),
 foreign key(obligation_id,case_id,tenant_id) references public.legal_financial_obligations(id,case_id,tenant_id),
 foreign key(original_allocation_id,case_id,tenant_id) references public.legal_cash_allocations(id,case_id,tenant_id),
 check((kind='refund')=(original_allocation_id is not null))
);
create table public.legal_financial_statement_versions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,version_number integer not null check(version_number>0),
 title text not null check(length(btrim(title)) between 1 and 180),period_start date not null,period_end date not null,
 public_note text not null check(length(btrim(public_note)) between 1 and 4000),snapshot jsonb not null,input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
 status text not null default 'draft' check(status in ('draft','approved','returned')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text not null default '' check(length(review_note)<=4000),
 unique(id,case_id,tenant_id),unique(case_id,version_number),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete cascade,
 check(isfinite(period_start) and isfinite(period_end) and period_start<=period_end)
);
create table public.legal_financial_statement_releases(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,statement_id uuid not null,membership_id uuid not null,
 expires_at timestamptz not null check(isfinite(expires_at)),released_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 reason text not null check(length(btrim(reason)) between 1 and 4000),revoked_at timestamptz,revoked_by uuid references public.profiles(id),revocation_reason text,
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete cascade,
 foreign key(statement_id,case_id,tenant_id) references public.legal_financial_statement_versions(id,case_id,tenant_id),
 foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id)
);
create unique index legal_statement_active_release on public.legal_financial_statement_releases(statement_id,membership_id) where revoked_at is null;
create table public.legal_payment_connections(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,
 provider text not null default 'asaas' check(provider='asaas'),environment text not null check(environment in ('sandbox','production')),
 label text not null check(length(btrim(label)) between 1 and 180),account_id text not null check(length(btrim(account_id)) between 1 and 180),
 status text not null default 'not_configured' check(status in ('not_configured','ready','disabled')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),verified_at timestamptz,
 unique(id,tenant_id)
);
create table public.legal_charge_attempts(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,obligation_id uuid not null,connection_id uuid not null,
 amount text not null check(amount ~ '^[0-9]{1,14}\.[0-9]{2}$' and amount::numeric>0),provider_customer_id text not null check(length(btrim(provider_customer_id)) between 1 and 180),
 billing_type text not null check(billing_type in ('PIX','BOLETO','CREDIT_CARD')),due_on date not null check(isfinite(due_on)),
 idempotency_key uuid not null,payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),status text not null default 'draft' check(status in ('draft','approved','not_configured','sending','provider_accepted','unknown','failed','cancelled')),
 provider_charge_id text,provider_url text,provider_state text,cancel_reason text,review_note text not null default '' check(length(review_note)<=4000),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,case_id,tenant_id),unique(tenant_id,idempotency_key),unique(connection_id,provider_charge_id),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete cascade,
 foreign key(obligation_id,case_id,tenant_id) references public.legal_financial_obligations(id,case_id,tenant_id),foreign key(connection_id,tenant_id) references public.legal_payment_connections(id,tenant_id)
);
create table public.legal_payment_receipts(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,charge_id uuid not null,connection_id uuid not null,
 provider_event_id text not null check(length(provider_event_id) between 1 and 200),event_type text not null check(length(event_type) between 1 and 100),provider_created_at timestamptz,
 amount text,body_hash text not null check(body_hash ~ '^[0-9a-f]{64}$'),safe_payload jsonb not null,status text not null default 'needs_reconciliation' check(status in ('needs_reconciliation','reconciled','ignored')),
 received_at timestamptz not null default clock_timestamp(),cash_transaction_id uuid,reconciliation_note text,
 unique(connection_id,provider_event_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete cascade,
 foreign key(charge_id,case_id,tenant_id) references public.legal_charge_attempts(id,case_id,tenant_id),foreign key(connection_id,tenant_id) references public.legal_payment_connections(id,tenant_id),
 foreign key(cash_transaction_id,case_id,tenant_id) references public.legal_cash_transactions(id,case_id,tenant_id)
);

-- All case scans have bounded case scope; serialization uses the existing case lock.
do $$declare t text;begin
 foreach t in array array['legal_fee_agreement_versions','legal_fee_basis_versions','legal_financial_obligations','legal_cash_transactions','legal_cash_allocations','legal_financial_statement_versions','legal_financial_statement_releases','legal_charge_attempts','legal_payment_receipts'] loop
  execute format('create index %I on public.%I(case_id)',t||'_case_idx',t);
 end loop;
end$$;

create or replace function public._legal_finance_assert(p_case_id uuid,p_owner boolean default false)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin return public._legal_assert_operation(p_case_id,'fiscal',p_owner);end;$$;
create or replace function public._legal_finance_payload(p_payload jsonb,p_allowed text[])
returns void language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>100000 or exists(select 1 from jsonb_object_keys(p_payload) x where not(x=any(p_allowed))) then raise exception 'Unsupported case financial fields' using errcode='22023';end if;
end;$$;
create or replace function public._legal_finance_document(p_case_id uuid,p_document_id uuid)
returns public.legal_case_documents language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare d public.legal_case_documents;
begin
 select * into d from public.legal_case_documents where id=p_document_id and case_id=p_case_id and status='ready' and category in ('general','fiscal');
 if not found or not public.legal_can_access_category(p_case_id,d.category) then raise exception 'Financial evidence must be an accessible ready general or fiscal document' using errcode='42501';end if;return d;
end;$$;
create or replace function public._legal_finance_balance(p_case_id uuid,p_owner text,p_until date default null)
returns numeric language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select coalesce(sum(case when to_owner=p_owner then amount::numeric else 0 end-case when from_owner=p_owner then amount::numeric else 0 end),0)
 from public.legal_cash_transactions where case_id=p_case_id and (p_until is null or occurred_on<=p_until);
$$;
create or replace function public._legal_finance_paid(p_obligation_id uuid)
returns numeric language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select coalesce(sum(case when kind='settlement' then amount::numeric else -amount::numeric end),0) from public.legal_cash_allocations where obligation_id=p_obligation_id;
$$;

-- Extend the current event constraint without removing earlier phase values.
do $$declare expression text;begin
 select pg_get_expr(conbin,conrelid) into expression from pg_constraint where conrelid='public.legal_case_events'::regclass and conname='legal_case_events_event_type_check';
 if expression is null then raise exception 'Legal event constraint missing';end if;
 alter table public.legal_case_events drop constraint legal_case_events_event_type_check;
 execute format('alter table public.legal_case_events add constraint legal_case_events_event_type_check check ((%s) or event_type in (''financial_changed'',''financial_statement_released'',''financial_report_read''))',expression);
end$$;

create or replace function public._legal_finance_contract_current(p_agreement_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.legal_fee_agreement_versions a
 join public.legal_instrument_versions v on v.id=a.instrument_version_id and v.case_id=a.case_id
 join public.legal_instruments i on i.id=v.instrument_id
 join public.legal_external_signature_records s on s.id=a.acceptance_record_id and s.version_id=v.id
 join public.legal_case_documents d on d.id=s.document_id and d.case_id=a.case_id
 where a.id=p_agreement_id and a.status='approved' and a.superseded_at is null
 and v.status='approved' and v.superseded_at is null and i.instrument_type='contract'
 and v.category in ('general','fiscal') and d.status='ready' and d.category=v.category);
$$;

create or replace function public.legal_create_fee_agreement(p_case_id uuid,p_payload jsonb)
returns public.legal_fee_agreement_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public._legal_finance_assert(p_case_id);r public.legal_fee_agreement_versions;v public.legal_instrument_versions;n integer;
begin
 perform public._legal_finance_payload(p_payload,array['agreement_key','instrument_version_id','title','model','fixed_amount','success_rate','basis_kind','trigger_description','exclusions']);
 select * into v from public.legal_instrument_versions where id=(p_payload->>'instrument_version_id')::uuid and case_id=p_case_id;
 if not found or v.status<>'approved' or v.superseded_at is not null or v.category not in ('general','fiscal') or not public.legal_can_access_category(p_case_id,v.category) or not exists(select 1 from public.legal_instruments where id=v.instrument_id and instrument_type='contract') then raise exception 'A current approved accessible contract is required' using errcode='22023';end if;
 if jsonb_typeof(p_payload->'success_rate') is distinct from 'string' then raise exception 'Rate must be a decimal string' using errcode='22023';end if;
 select coalesce(max(version_number),0)+1 into n from public.legal_fee_agreement_versions where case_id=p_case_id and agreement_key=btrim(p_payload->>'agreement_key');
 insert into public.legal_fee_agreement_versions(tenant_id,case_id,agreement_key,version_number,instrument_version_id,title,model,fixed_amount,success_rate,basis_kind,trigger_description,exclusions,created_by)
 values(t,p_case_id,btrim(p_payload->>'agreement_key'),n,v.id,btrim(p_payload->>'title'),p_payload->>'model',public._ir4_json_money(p_payload,'fixed_amount'),public._ir4_coefficient(p_payload->>'success_rate'),p_payload->>'basis_kind',btrim(p_payload->>'trigger_description'),coalesce(p_payload->>'exclusions',''),auth.uid()) returning * into r;
 perform public._legal_record_event(p_case_id,'financial_changed','Condições de honorários preparadas para revisão.',jsonb_build_object('agreement_id',r.id));return r;
end;$$;

create or replace function public.legal_review_fee_agreement(p_version_id uuid,p_decision text,p_note text,p_acceptance_record_id uuid default null)
returns public.legal_fee_agreement_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_fee_agreement_versions;
begin
 select * into r from public.legal_fee_agreement_versions where id=p_version_id;
 if not found then raise exception 'Agreement access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(r.case_id,true);select * into r from public.legal_fee_agreement_versions where id=p_version_id;
 if r.status<>'draft' or coalesce(p_decision,'') not in ('approved','rejected') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 then raise exception 'Review requires a draft and a professional note' using errcode='22023';end if;
 if p_decision='approved' then
  if not exists(select 1 from public.legal_external_signature_records s join public.legal_case_documents d on d.id=s.document_id join public.legal_instrument_versions v on v.id=s.version_id where s.id=p_acceptance_record_id and s.case_id=r.case_id and s.version_id=r.instrument_version_id and d.status='ready' and d.category in ('general','fiscal') and v.status='approved' and v.superseded_at is null and public.legal_can_access_category(r.case_id,d.category)) then raise exception 'Review the external acceptance evidence of this exact contract version' using errcode='22023';end if;
  if exists(select 1 from public.legal_fee_agreement_versions where case_id=r.case_id and agreement_key=r.agreement_key and status='approved' and version_number>r.version_number) then raise exception 'A newer agreement was already approved' using errcode='22023';end if;
  update public.legal_fee_agreement_versions set superseded_at=now() where case_id=r.case_id and agreement_key=r.agreement_key and status='approved' and superseded_at is null;
 end if;
 update public.legal_fee_agreement_versions set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(p_note),acceptance_record_id=case when p_decision='approved' then p_acceptance_record_id else null end where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'financial_changed','Condições de honorários revisadas; nenhuma cobrança emitida.',jsonb_build_object('agreement_id',r.id));return r;
end;$$;

create or replace function public._legal_finance_basis_sources(p_case_id uuid,p_kind text,p_source_ids uuid[],p_document_id uuid,p_manual_amount text,p_proof_line text,p_worker boolean default false)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;proof_document public.legal_case_documents;actual_count integer;
begin
 if p_worker then perform public._legal_portal_service();end if;
 if cardinality(p_source_ids)>100 or cardinality(p_source_ids)<>(select count(distinct x) from unnest(p_source_ids) x) then raise exception 'Bounded distinct fee sources required' using errcode='22023';end if;
 if p_kind='manual' then
  if p_worker then select * into proof_document from public.legal_case_documents where id=p_document_id and case_id=p_case_id and status='ready' and category in ('general','fiscal');if not found then raise exception 'Basis proof unavailable' using errcode='22023';end if;else proof_document:=public._legal_finance_document(p_case_id,p_document_id);end if;
  if cardinality(p_source_ids)<>0 then raise exception 'Manual basis cannot contain IR source IDs' using errcode='22023';end if;
  return jsonb_build_object('kind','manual','amount',public._ir4_money(p_manual_amount),'document_id',proof_document.id,'sha256',proof_document.sha256,'proof_line',p_proof_line);
 end if;
 if not p_worker and not public.ir_can_access_assessment(p_case_id) then raise exception 'Reading an IR basis requires both medical and fiscal access' using errcode='42501';end if;
 if cardinality(p_source_ids)=0 or p_document_id is not null then raise exception 'Select documented IR facts for the contractual basis' using errcode='22023';end if;
 if p_kind='ir_recovery' then
  select count(*),jsonb_build_object('kind',p_kind,'amount',sum(r.amount::numeric)::numeric(16,2)::text,'facts',jsonb_agg(jsonb_build_object('id',r.id,'amount',r.amount,'received_on',r.received_on,'document_id',d.id,'sha256',d.sha256,'status',d.status,'proof_line',r.proof_line) order by r.id)) into actual_count,result
  from public.ir_recoveries r join public.legal_case_documents d on d.id=r.document_id where r.id=any(p_source_ids) and r.case_id=p_case_id and d.case_id=p_case_id and d.category='fiscal' and d.status='ready';
 elsif p_kind='ir_decision' then
  select count(*),jsonb_build_object('kind',p_kind,'amount',sum(e.recognized_amount::numeric)::numeric(16,2)::text,'facts',jsonb_agg(jsonb_build_object('id',e.id,'amount',e.recognized_amount,'occurred_on',e.occurred_on,'document_id',d.id,'sha256',d.sha256,'status',d.status,'latest_decision_id',(select x.id from public.ir_claim_events x where x.claim_id=e.claim_id and x.event_type in ('decision_granted','decision_partial','decision_denied') order by x.occurred_on desc,x.created_at desc,x.id desc limit 1)) order by e.id)) into actual_count,result
  from public.ir_claim_events e join public.legal_case_documents d on d.id=e.document_id where e.id=any(p_source_ids) and e.case_id=p_case_id and e.event_type in ('decision_granted','decision_partial') and d.case_id=p_case_id and d.category in ('general','fiscal') and d.status='ready'
  and e.id=(select x.id from public.ir_claim_events x where x.claim_id=e.claim_id and x.event_type in ('decision_granted','decision_partial','decision_denied') order by x.occurred_on desc,x.created_at desc,x.id desc limit 1);
 else raise exception 'Unsupported contractual basis' using errcode='22023';end if;
 if actual_count<>cardinality(p_source_ids) then raise exception 'Fee source is unavailable, superseded, or outside this case' using errcode='22023';end if;return result;
end;$$;

create or replace function public.legal_create_fee_basis(p_agreement_id uuid,p_payload jsonb)
returns public.legal_fee_basis_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare a public.legal_fee_agreement_versions;r public.legal_fee_basis_versions;s jsonb;ids uuid[];base text;deduction text;fee text;line text;
begin
 select * into a from public.legal_fee_agreement_versions where id=p_agreement_id;
 if not found then raise exception 'Agreement access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(a.case_id,true);select * into a from public.legal_fee_agreement_versions where id=p_agreement_id;
 if not public._legal_finance_contract_current(a.id) then raise exception 'Current approved agreement and acceptance evidence required' using errcode='22023';end if;
 perform public._legal_finance_payload(p_payload,array['title','source_ids','document_id','proof_line','base_amount','deductions','justification','supersedes_basis_id']);
 if jsonb_typeof(p_payload->'source_ids') is distinct from 'array' then raise exception 'Source IDs must be an array' using errcode='22023';end if;
 select coalesce(array_agg(value::uuid),array[]::uuid[]) into ids from jsonb_array_elements_text(p_payload->'source_ids');
 line:=btrim(coalesce(p_payload->>'proof_line','1'));
 s:=public._legal_finance_basis_sources(a.case_id,a.basis_kind,ids,(p_payload->>'document_id')::uuid,case when a.basis_kind='manual' then public._ir4_json_money(p_payload,'base_amount') else null end,line);
 base:=s->>'amount';deduction:=public._ir4_json_money(p_payload,'deductions');
 if deduction::numeric>base::numeric or (a.model='fixed' and deduction::numeric<>0) then raise exception 'Invalid deduction of contractual basis' using errcode='22023';end if;
 fee:=case when a.model='fixed' then a.fixed_amount else round((base::numeric-deduction::numeric)*a.success_rate::numeric,2)::numeric(16,2)::text end;
 insert into public.legal_fee_basis_versions(tenant_id,case_id,agreement_id,title,source_ids,document_id,proof_line,base_amount,deductions,effective_base,fee_amount,source_hash,snapshot,justification,created_by,supersedes_basis_id)
 values(a.tenant_id,a.case_id,a.id,btrim(p_payload->>'title'),ids,(p_payload->>'document_id')::uuid,line,base,deduction,(base::numeric-deduction::numeric)::numeric(16,2)::text,fee,encode(sha256(convert_to(s::text,'UTF8')),'hex'),jsonb_build_object('sources',s,'model',a.model,'fixed_amount',a.fixed_amount,'success_rate',a.success_rate,'rounding','half_up_2','agreement_version',a.version_number),btrim(p_payload->>'justification'),auth.uid(),(p_payload->>'supersedes_basis_id')::uuid) returning * into r;
 perform public._legal_record_event(a.case_id,'financial_changed','Base contratual preparada para revisão, sem cobrança.',jsonb_build_object('basis_id',r.id));return r;
end;$$;

create or replace function public._legal_finance_basis_current(p_basis_id uuid,p_worker boolean default false)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare b public.legal_fee_basis_versions;a public.legal_fee_agreement_versions;s jsonb;
begin
 select * into b from public.legal_fee_basis_versions where id=p_basis_id;select * into a from public.legal_fee_agreement_versions where id=b.agreement_id;
 if b.id is null or b.superseded_at is not null or not public._legal_finance_contract_current(a.id) then return false;end if;
 s:=public._legal_finance_basis_sources(b.case_id,a.basis_kind,b.source_ids,b.document_id,b.base_amount,b.proof_line,p_worker);
 return b.source_hash=encode(sha256(convert_to(s::text,'UTF8')),'hex');
 exception when sqlstate '22023' then return false;
end;$$;

create or replace function public.legal_review_fee_basis(p_basis_id uuid,p_decision text,p_note text)
returns public.legal_fee_basis_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare b public.legal_fee_basis_versions;a public.legal_fee_agreement_versions;
begin
 select * into b from public.legal_fee_basis_versions where id=p_basis_id;
 if not found then raise exception 'Fee basis access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(b.case_id,true);select * into b from public.legal_fee_basis_versions where id=p_basis_id;select * into a from public.legal_fee_agreement_versions where id=b.agreement_id;
 if b.status<>'draft' or coalesce(p_decision,'') not in ('approved','rejected') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 then raise exception 'Review requires a draft basis and a note' using errcode='22023';end if;
 if p_decision='approved' then
  if not public._legal_finance_basis_current(b.id) then raise exception 'Contractual basis is stale; create a new version' using errcode='22023';end if;
  if b.supersedes_basis_id is not null then
   if not exists(select 1 from public.legal_fee_basis_versions old join public.legal_fee_agreement_versions oa on oa.id=old.agreement_id where old.id=b.supersedes_basis_id and old.case_id=b.case_id and old.status='approved' and old.superseded_at is null and oa.agreement_key=a.agreement_key) or exists(select 1 from public.legal_financial_obligations where basis_id=b.supersedes_basis_id and status<>'cancelled') then raise exception 'Only an approved basis without active obligations may be superseded' using errcode='22023';end if;
  end if;
  if exists(select 1 from public.legal_fee_basis_versions old join public.legal_fee_agreement_versions oa on oa.id=old.agreement_id where old.case_id=b.case_id and old.status='approved' and old.superseded_at is null and old.id is distinct from b.supersedes_basis_id and oa.agreement_key=a.agreement_key and (a.model='fixed' or old.source_ids&&b.source_ids or (a.basis_kind='manual' and old.snapshot->'sources'->>'sha256'=b.snapshot->'sources'->>'sha256' and old.proof_line=b.proof_line))) then raise exception 'This contractual source was already approved; split its existing fee into installments instead' using errcode='22023';end if;
  update public.legal_fee_basis_versions set superseded_at=now() where id=b.supersedes_basis_id;
 end if;
 update public.legal_fee_basis_versions set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(p_note) where id=b.id returning * into b;
 perform public._legal_record_event(b.case_id,'financial_changed','Base contratual revisada pelo responsável.',jsonb_build_object('basis_id',b.id));return b;
end;$$;

create or replace function public._legal_finance_check_obligation(p_obligation public.legal_financial_obligations,p_worker boolean default false)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare b public.legal_fee_basis_versions;reserved numeric;
begin
 if p_obligation.category='fee' then
  select * into b from public.legal_fee_basis_versions where id=p_obligation.basis_id and case_id=p_obligation.case_id and agreement_id=p_obligation.agreement_id;
  if not found or b.status<>'approved' or not public._legal_finance_basis_current(b.id,p_worker) then raise exception 'Fee obligation requires its current approved contractual basis' using errcode='22023';end if;
  select coalesce(sum(amount::numeric),0) into reserved from public.legal_financial_obligations where basis_id=b.id and status<>'cancelled' and id<>p_obligation.id;
  if reserved+p_obligation.amount::numeric>b.fee_amount::numeric then raise exception 'Installments exceed the fee approved for this basis' using errcode='22023';end if;
 else
  if p_worker then perform public._legal_portal_service();if not exists(select 1 from public.legal_case_documents where id=p_obligation.document_id and case_id=p_obligation.case_id and status='ready' and category in ('general','fiscal')) then raise exception 'Obligation proof unavailable' using errcode='22023';end if;
  else perform public._legal_finance_document(p_obligation.case_id,p_obligation.document_id);end if;
 end if;
end;$$;

create or replace function public.legal_create_financial_obligation(p_case_id uuid,p_payload jsonb)
returns public.legal_financial_obligations language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public._legal_finance_assert(p_case_id);r public.legal_financial_obligations;
begin
 perform public._legal_finance_payload(p_payload,array['title','category','direction','funds_owner','beneficiary','amount','due_on','agreement_id','basis_id','document_id','notes']);
 r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.status:='draft';r.notes:='';r.review_note:='';r.created_by:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);
 r.amount:=public._ir4_json_money(p_payload,'amount');r.due_on:=public._ir4_date(p_payload->>'due_on');r.title:=btrim(r.title);
 perform public._legal_finance_check_obligation(r);
 insert into public.legal_financial_obligations values(r.*) returning * into r;
 perform public._legal_record_event(p_case_id,'financial_changed','Obrigação preparada; aprovação e recebimento são etapas distintas.',jsonb_build_object('obligation_id',r.id));return r;
end;$$;

create or replace function public.legal_review_financial_obligation(p_obligation_id uuid,p_note text)
returns public.legal_financial_obligations language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_financial_obligations;
begin
 select * into r from public.legal_financial_obligations where id=p_obligation_id;
 if not found then raise exception 'Obligation access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(r.case_id,true);select * into r from public.legal_financial_obligations where id=p_obligation_id;
 if r.status<>'draft' or length(btrim(coalesce(p_note,''))) not between 1 and 4000 then raise exception 'Approval requires draft and review note' using errcode='22023';end if;
 perform public._legal_finance_check_obligation(r);
 update public.legal_financial_obligations set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(p_note) where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'financial_changed','Obrigação aprovada; sem baixa ou emissão automática.',jsonb_build_object('obligation_id',r.id));return r;
end;$$;

create or replace function public.legal_cancel_financial_obligation(p_obligation_id uuid,p_reason text)
returns public.legal_financial_obligations language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_financial_obligations;
begin
 select * into r from public.legal_financial_obligations where id=p_obligation_id;
 if not found then raise exception 'Obligation access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(r.case_id,true);select * into r from public.legal_financial_obligations where id=p_obligation_id;
 if length(btrim(coalesce(p_reason,''))) not between 1 and 4000 then raise exception 'Cancellation requires a reason' using errcode='22023';end if;
 if r.status='cancelled' then return r;end if;
 if public._legal_finance_paid(r.id)<>0 or exists(select 1 from public.legal_charge_attempts where obligation_id=r.id and status in ('sending','provider_accepted','unknown')) then raise exception 'Reconcile settled money and external charges before cancellation' using errcode='22023';end if;
 update public.legal_financial_obligations set status='cancelled',cancel_reason=btrim(p_reason) where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'financial_changed','Obrigação cancelada com histórico preservado.',jsonb_build_object('obligation_id',r.id));return r;
end;$$;

create or replace function public.legal_allocate_cash_transaction(p_transaction_id uuid,p_obligation_id uuid,p_amount text,p_idempotency_key uuid,p_reason text,p_original_allocation_id uuid default null)
returns public.legal_cash_allocations language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare tx public.legal_cash_transactions;o public.legal_financial_obligations;r public.legal_cash_allocations;original public.legal_cash_allocations;amount_value text:=public._ir4_money(p_amount);kind_value text:=case when p_original_allocation_id is null then 'settlement' else 'refund' end;available numeric;
begin
 select * into tx from public.legal_cash_transactions where id=p_transaction_id;
 if not found then raise exception 'Cash transaction access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(tx.case_id,true);
 select * into tx from public.legal_cash_transactions where id=p_transaction_id;
 select * into o from public.legal_financial_obligations where id=p_obligation_id and case_id=tx.case_id;
 if not found or o.status<>'approved' then raise exception 'Allocate only to an approved obligation in this case' using errcode='22023';end if;
 if amount_value::numeric<=0 or p_idempotency_key is null or length(btrim(coalesce(p_reason,''))) not between 1 and 4000 then raise exception 'Positive allocation, idempotency key and reason required' using errcode='22023';end if;
 select * into r from public.legal_cash_allocations where tenant_id=tx.tenant_id and idempotency_key=p_idempotency_key;
 if found then
  if r.cash_transaction_id<>tx.id or r.obligation_id<>o.id or r.amount<>amount_value or r.reason<>btrim(p_reason) or r.kind<>kind_value or r.original_allocation_id is distinct from p_original_allocation_id then raise exception 'Idempotency key reused with a different allocation' using errcode='22023';end if;return r;
 end if;
 select tx.amount::numeric-coalesce(sum(amount::numeric),0) into available from public.legal_cash_allocations where cash_transaction_id=tx.id;
 if amount_value::numeric>available then raise exception 'Allocation exceeds unallocated transaction amount' using errcode='22023';end if;
 if kind_value='settlement' then
  if amount_value::numeric>(tx.amount::numeric-(select coalesce(sum(amount::numeric),0) from public.legal_cash_transactions where reverses_id=tx.id)-(select coalesce(sum(a.amount::numeric-(select coalesce(sum(f.amount::numeric),0) from public.legal_cash_allocations f where f.original_allocation_id=a.id)),0) from public.legal_cash_allocations a where a.cash_transaction_id=tx.id and a.kind='settlement')) then raise exception 'Allocation exceeds cash remaining after reversals' using errcode='22023';end if;
  if tx.reverses_id is not null or (o.direction='receivable' and tx.to_owner<>o.funds_owner) or (o.direction='payable' and tx.from_owner<>o.funds_owner) or (tx.from_owner<>'external' and tx.to_owner<>'external' and (o.category<>'fee' or tx.transfer_obligation_id<>o.id)) then raise exception 'Movement direction or ownership does not settle this obligation' using errcode='22023';end if;
  if public._legal_finance_paid(o.id)+amount_value::numeric>o.amount::numeric then raise exception 'Payment exceeds outstanding obligation; keep excess unallocated' using errcode='22023';end if;
 else
  select * into original from public.legal_cash_allocations where id=p_original_allocation_id and obligation_id=o.id and case_id=tx.case_id and kind='settlement';
  if not found or tx.reverses_id is distinct from original.cash_transaction_id then raise exception 'Refund must reference the original cash movement and allocation' using errcode='22023';end if;
  if amount_value::numeric+(select coalesce(sum(amount::numeric),0) from public.legal_cash_allocations where original_allocation_id=original.id)>original.amount::numeric then raise exception 'Refund exceeds original settled amount' using errcode='22023';end if;
 end if;
 insert into public.legal_cash_allocations(tenant_id,case_id,cash_transaction_id,obligation_id,kind,original_allocation_id,amount,idempotency_key,reason,created_by)
 values(tx.tenant_id,tx.case_id,tx.id,o.id,kind_value,p_original_allocation_id,amount_value,p_idempotency_key,btrim(p_reason),auth.uid()) returning * into r;
 perform public._legal_record_event(tx.case_id,'financial_changed','Movimento conciliado sem apagar pagamentos anteriores.',jsonb_build_object('allocation_id',r.id));return r;
end;$$;

create or replace function public.legal_record_cash_transaction(p_case_id uuid,p_payload jsonb)
returns public.legal_cash_transactions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public._legal_finance_assert(p_case_id,true);r public.legal_cash_transactions;old public.legal_cash_transactions;original public.legal_cash_transactions;d public.legal_case_documents;o public.legal_financial_obligations;a public.legal_cash_allocations;normalized jsonb;owner_value text;refund_item jsonb;required_refund numeric;provided_refund numeric:=0;
begin
 perform public._legal_finance_payload(p_payload,array['from_owner','to_owner','amount','occurred_on','document_id','proof_line','reference','reverses_id','transfer_obligation_id','reason','idempotency_key','allocation_reversals','compensation_authorized']);
 normalized:=p_payload||jsonb_build_object('amount',public._ir4_json_money(p_payload,'amount'),'proof_line',btrim(p_payload->>'proof_line'),'reference',btrim(p_payload->>'reference'),'reason',btrim(p_payload->>'reason'));
 r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.created_by:=auth.uid();r.created_at:=clock_timestamp();r.compensation_authorized:=false;r:=jsonb_populate_record(r,normalized-'allocation_reversals');r.occurred_on:=public._ir4_fact_date(normalized->>'occurred_on');r.payload_hash:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
 select * into old from public.legal_cash_transactions where tenant_id=t and idempotency_key=r.idempotency_key;
 if found then
  if old.case_id<>p_case_id or old.payload_hash<>r.payload_hash then raise exception 'Idempotency key reused with another cash movement' using errcode='22023';end if;return old;
 end if;
 if normalized ? 'allocation_reversals' and (jsonb_typeof(normalized->'allocation_reversals') is distinct from 'array' or jsonb_array_length(normalized->'allocation_reversals')>100) then raise exception 'Bounded reversal allocation array required' using errcode='22023';end if;
 d:=public._legal_finance_document(p_case_id,r.document_id);r.proof_hash:=d.sha256;
 if r.reverses_id is not null then
  select * into original from public.legal_cash_transactions where id=r.reverses_id and case_id=p_case_id;
  if not found or original.reverses_id is not null or r.from_owner<>original.to_owner or r.to_owner<>original.from_owner or r.transfer_obligation_id is distinct from original.transfer_obligation_id or r.occurred_on<original.occurred_on then raise exception 'Reversal must reverse one original movement, preserving its ownership and date' using errcode='22023';end if;
  r.compensation_authorized:=original.compensation_authorized;
  if r.amount::numeric+(select coalesce(sum(amount::numeric),0) from public.legal_cash_transactions where reverses_id=original.id)>original.amount::numeric then raise exception 'Reversal exceeds the original movement' using errcode='22023';end if;
 elsif r.from_owner<>'external' and r.to_owner<>'external' then
  select * into o from public.legal_financial_obligations where id=r.transfer_obligation_id and case_id=p_case_id and category='fee' and status='approved';
  if not found or r.compensation_authorized is distinct from true or r.from_owner<>'client' or r.to_owner<>'office' or not public._legal_finance_contract_current(o.agreement_id) or r.amount::numeric>o.amount::numeric-public._legal_finance_paid(o.id) then raise exception 'Client funds compensation requires an approved fee, current contract and remaining amount' using errcode='22023';end if;
 elsif r.transfer_obligation_id is not null then raise exception 'External movement cannot claim an internal compensation obligation' using errcode='22023';end if;
 if r.from_owner<>'external' and r.amount::numeric>public._legal_finance_balance(p_case_id,r.from_owner) then raise exception 'Insufficient documented custody balance for this owner' using errcode='22023';end if;
 insert into public.legal_cash_transactions values(r.*) returning * into r;
 -- Dates are documentary dates without invented intra-day times. Reject an
 -- outflow that leaves a negative documented end-of-day balance in the history.
 foreach owner_value in array array['client','office'] loop
  perform public._ir4_money(public._legal_finance_balance(p_case_id,owner_value)::text);
  if exists(select 1 from (select sum(delta) over(order by occurred_on) balance from (select occurred_on,sum(case when to_owner=owner_value then amount::numeric else 0 end-case when from_owner=owner_value then amount::numeric else 0 end) delta from public.legal_cash_transactions where case_id=p_case_id group by occurred_on) days) running where balance<0) then raise exception 'Documented daily custody balance would become negative' using errcode='22023';end if;
 end loop;
 if r.reverses_id is null and jsonb_array_length(coalesce(normalized->'allocation_reversals','[]'))>0 then raise exception 'Allocation refunds require an actual reversal' using errcode='22023';end if;
 if r.from_owner<>'external' and r.to_owner<>'external' then
  if jsonb_array_length(coalesce(normalized->'allocation_reversals','[]'))>0 then raise exception 'Internal compensation reversal is allocated automatically' using errcode='22023';end if;
  if r.reverses_id is null then perform public.legal_allocate_cash_transaction(r.id,r.transfer_obligation_id,r.amount,r.id,'Compensação documental explicitamente revisada.');
  else
   select * into a from public.legal_cash_allocations where cash_transaction_id=original.id and kind='settlement' and obligation_id=original.transfer_obligation_id;
   if not found then raise exception 'Original compensation allocation is missing' using errcode='22023';end if;
   perform public.legal_allocate_cash_transaction(r.id,r.transfer_obligation_id,r.amount,r.id,'Reversão documental da compensação.',a.id);
  end if;
 elsif r.reverses_id is not null then
  for refund_item in select value from jsonb_array_elements(coalesce(normalized->'allocation_reversals','[]')) loop
   perform public._legal_finance_payload(refund_item,array['allocation_id','amount']);
   select * into a from public.legal_cash_allocations where id=(refund_item->>'allocation_id')::uuid and cash_transaction_id=original.id and kind='settlement';
   if not found then raise exception 'Reversal allocation must belong to the original movement' using errcode='22023';end if;
   perform public.legal_allocate_cash_transaction(r.id,a.obligation_id,public._ir4_json_money(refund_item,'amount'),gen_random_uuid(),'Reversão documental explícita.',a.id);
   provided_refund:=provided_refund+public._ir4_json_money(refund_item,'amount')::numeric;
  end loop;
  select coalesce(sum(ar.amount::numeric-(select coalesce(sum(f.amount::numeric),0) from public.legal_cash_allocations f where f.original_allocation_id=ar.id)),0) into required_refund from public.legal_cash_allocations ar where ar.cash_transaction_id=original.id and ar.kind='settlement';
  if required_refund>original.amount::numeric-(select coalesce(sum(amount::numeric),0) from public.legal_cash_transactions where reverses_id=original.id) then raise exception 'Reversal must explicitly refund enough original allocations to preserve paid balance' using errcode='22023';end if;
 end if;
 perform public._legal_record_event(p_case_id,'financial_changed','Movimento financeiro comprovado registrado; sem transferência bancária automática.',jsonb_build_object('transaction_id',r.id));return r;
end;$$;

create or replace function public._legal_finance_statement_snapshot(p_case_id uuid,p_start date,p_end date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare movements jsonb;obligations jsonb;
begin
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_start>p_end or p_end>public._ir4_today() then raise exception 'A finite completed statement period is required' using errcode='22023';end if;
 if (select count(*) from public.legal_cash_transactions where case_id=p_case_id)>10000 or (select count(*) from public.legal_financial_obligations where case_id=p_case_id)>10000 then raise exception 'Statement exceeds supported size; split and export through support' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'date',occurred_on,'from_owner',from_owner,'to_owner',to_owner,'amount',amount,'reference',reference,'reverses_id',reverses_id) order by occurred_on,created_at,id),'[]') into movements from public.legal_cash_transactions where case_id=p_case_id and occurred_on between p_start and p_end;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'category',o.category,'direction',o.direction,'funds_owner',o.funds_owner,'amount',o.amount,'paid',public._ir4_money(public._legal_finance_paid(o.id)::text),'remaining',public._ir4_money((o.amount::numeric-public._legal_finance_paid(o.id))::text),'due_on',o.due_on) order by o.due_on,o.id),'[]') into obligations from public.legal_financial_obligations o where o.case_id=p_case_id and o.status='approved';
 return jsonb_build_object('currency','BRL','opening',jsonb_build_object('client',public._ir4_money(public._legal_finance_balance(p_case_id,'client',p_start-1)::text),'office',public._ir4_money(public._legal_finance_balance(p_case_id,'office',p_start-1)::text)),
 'closing',jsonb_build_object('client',public._ir4_money(public._legal_finance_balance(p_case_id,'client',p_end)::text),'office',public._ir4_money(public._legal_finance_balance(p_case_id,'office',p_end)::text)),
 'movements',movements,'obligations',obligations,'obligations_basis','current_at_generation');
end;$$;
create or replace function public.legal_create_financial_statement(p_case_id uuid,p_title text,p_period_start date,p_period_end date,p_public_note text)
returns public.legal_financial_statement_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public._legal_finance_assert(p_case_id);s jsonb;r public.legal_financial_statement_versions;n integer;
begin
 s:=public._legal_finance_statement_snapshot(p_case_id,p_period_start,p_period_end);select coalesce(max(version_number),0)+1 into n from public.legal_financial_statement_versions where case_id=p_case_id;
 insert into public.legal_financial_statement_versions(tenant_id,case_id,version_number,title,period_start,period_end,public_note,snapshot,input_hash,created_by)
 values(t,p_case_id,n,btrim(p_title),p_period_start,p_period_end,btrim(p_public_note),s||jsonb_build_object('generated_at',clock_timestamp()),encode(sha256(convert_to(s::text,'UTF8')),'hex'),auth.uid()) returning * into r;
 perform public._legal_record_event(p_case_id,'financial_changed','Prestação de contas preparada para revisão.',jsonb_build_object('statement_id',r.id));return r;
end;$$;
create or replace function public.legal_review_financial_statement(p_statement_id uuid,p_decision text,p_note text)
returns public.legal_financial_statement_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_financial_statement_versions;current_hash text;
begin
 select * into r from public.legal_financial_statement_versions where id=p_statement_id;if not found then raise exception 'Statement access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(r.case_id,true);select * into r from public.legal_financial_statement_versions where id=p_statement_id;
 if r.status<>'draft' or p_decision is null or p_decision not in ('approved','returned') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 then raise exception 'Draft, explicit decision and review note required' using errcode='22023';end if;
 current_hash:=encode(sha256(convert_to(public._legal_finance_statement_snapshot(r.case_id,r.period_start,r.period_end)::text,'UTF8')),'hex');
 if p_decision='approved' and r.input_hash<>current_hash then raise exception 'Statement inputs changed; create a new version' using errcode='22023';end if;
 update public.legal_financial_statement_versions set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(p_note) where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'financial_changed','Prestação de contas revisada; liberação individual ainda necessária.',jsonb_build_object('statement_id',r.id,'decision',p_decision));return r;
end;$$;
create or replace function public.legal_release_financial_statement(p_statement_id uuid,p_membership_id uuid,p_expires_at timestamptz,p_reason text)
returns public.legal_financial_statement_releases language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare s public.legal_financial_statement_versions;m public.legal_portal_memberships;r public.legal_financial_statement_releases;
begin
 select * into s from public.legal_financial_statement_versions where id=p_statement_id;if not found then raise exception 'Statement access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(s.case_id,true);select * into s from public.legal_financial_statement_versions where id=p_statement_id;
 select * into m from public.legal_portal_memberships where id=p_membership_id and case_id=s.case_id;if not found then raise exception 'Recipient access denied' using errcode='42501';end if;
 m:=public._legal_portal_assert_member(m.identity_id,m.id,'statements:read','fiscal');
 if s.status<>'approved' or s.input_hash<>encode(sha256(convert_to(public._legal_finance_statement_snapshot(s.case_id,s.period_start,s.period_end)::text,'UTF8')),'hex') then raise exception 'Only a current approved statement can be released' using errcode='22023';end if;
 if p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '1 year' or p_expires_at>m.expires_at then raise exception 'Release expiration must fit recipient access and one year' using errcode='22023';end if;
 insert into public.legal_financial_statement_releases(tenant_id,case_id,statement_id,membership_id,expires_at,released_by,reason) values(s.tenant_id,s.case_id,s.id,m.id,p_expires_at,auth.uid(),btrim(p_reason)) returning * into r;
 perform public._legal_record_event(s.case_id,'financial_statement_released','Prestação de contas liberada individualmente.',jsonb_build_object('statement_id',s.id,'release_id',r.id,'membership_id',m.id));return r;
end;$$;
create or replace function public.legal_revoke_financial_statement_release(p_release_id uuid,p_reason text)
returns public.legal_financial_statement_releases language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_financial_statement_releases;
begin
 select * into r from public.legal_financial_statement_releases where id=p_release_id;if not found then raise exception 'Release access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(r.case_id,true);select * into r from public.legal_financial_statement_releases where id=p_release_id;
 if length(btrim(coalesce(p_reason,''))) not between 1 and 4000 then raise exception 'Revocation reason required' using errcode='22023';end if;
 if r.revoked_at is not null then return r;end if;
 update public.legal_financial_statement_releases set revoked_at=clock_timestamp(),revoked_by=auth.uid(),revocation_reason=btrim(p_reason) where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'financial_changed','Liberação financeira revogada para novas consultas.',jsonb_build_object('release_id',r.id));return r;
end;$$;
create or replace function public.legal_portal_service_statements(p_actor_id uuid,p_membership_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.legal_portal_memberships;result jsonb;
begin
 perform public._legal_portal_service();m:=public._legal_portal_assert_member(p_actor_id,p_membership_id,'statements:read','fiscal');
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'version_number',s.version_number,'period_start',s.period_start,'period_end',s.period_end,'public_note',s.public_note,'snapshot',s.snapshot,'published_at',r.created_at,'expires_at',r.expires_at) order by r.created_at desc,s.id),'[]') into result from public.legal_financial_statement_releases r join public.legal_financial_statement_versions s on s.id=r.statement_id and s.case_id=r.case_id where r.membership_id=m.id and r.case_id=m.case_id and r.revoked_at is null and r.expires_at>clock_timestamp() and s.status='approved';
 perform public._legal_portal_event(m.case_id,m.id,p_actor_id,'financial_statements_read',jsonb_build_object('count',jsonb_array_length(result)));return result;
end;$$;
create or replace function public.legal_get_case_financial_context(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if not public.legal_can_access_category(p_case_id,'fiscal') then raise exception 'Financial case access denied' using errcode='42501';end if;
 return jsonb_build_object('client_balance',public._ir4_money(public._legal_finance_balance(p_case_id,'client')::text),'office_balance',public._ir4_money(public._legal_finance_balance(p_case_id,'office')::text),
 'obligations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'paid',public._ir4_money(public._legal_finance_paid(o.id)::text),'remaining',public._ir4_money((o.amount::numeric-public._legal_finance_paid(o.id))::text))) from public.legal_financial_obligations o where o.case_id=p_case_id),'[]'),
 'transactions',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'unallocated',public._ir4_money((case when t.reverses_id is null then t.amount::numeric-(select coalesce(sum(x.amount::numeric),0) from public.legal_cash_transactions x where x.reverses_id=t.id)-(select coalesce(sum(a.amount::numeric-(select coalesce(sum(f.amount::numeric),0) from public.legal_cash_allocations f where f.original_allocation_id=a.id)),0) from public.legal_cash_allocations a where a.cash_transaction_id=t.id) else t.amount::numeric-(select coalesce(sum(a.amount::numeric),0) from public.legal_cash_allocations a where a.cash_transaction_id=t.id) end)::text),'reversed',public._ir4_money((select coalesce(sum(x.amount::numeric),0) from public.legal_cash_transactions x where x.reverses_id=t.id)::text))) from public.legal_cash_transactions t where t.case_id=p_case_id),'[]'));
end;$$;

-- Dedicated fee gateway. Credentials and the authoritative tenant/account binding
-- live only in the worker. Registering metadata never authorizes use of a key.
alter table public.legal_charge_attempts add column lease_token uuid,add column lease_until timestamptz;
alter table public.legal_charge_attempts drop constraint legal_charge_attempts_status_check;
alter table public.legal_charge_attempts add constraint legal_charge_attempts_status_check check(status in ('draft','approved','not_configured','sending','provider_accepted','unknown','failed','cancelled','reconciled'));
alter table public.legal_payment_receipts add constraint legal_receipt_amount_check check(amount is null or amount ~ '^[0-9]{1,14}\.[0-9]{2}$');
create unique index legal_payment_connection_account on public.legal_payment_connections(tenant_id,provider,environment,account_id);

create or replace function public.legal_save_payment_connection(p_label text,p_account_id text,p_environment text)
returns public.legal_payment_connections language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public.legal_actual_tenant();r public.legal_payment_connections;
begin
 if t is null or not public.legal_feature_enabled() or not exists(select 1 from public.profiles where id=auth.uid() and tenant_id=t and role='admin' and status='active') then raise exception 'Workspace administration required' using errcode='42501';end if;
 insert into public.legal_payment_connections(tenant_id,label,account_id,environment,created_by) values(t,btrim(p_label),btrim(p_account_id),p_environment,auth.uid())
 on conflict(tenant_id,provider,environment,account_id) do update set label=excluded.label returning * into r;return r;
end;$$;
create or replace function public.legal_disable_payment_connection(p_connection_id uuid,p_reason text)
returns public.legal_payment_connections language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public.legal_actual_tenant();r public.legal_payment_connections;
begin
 if t is null or not public.legal_feature_enabled() or not exists(select 1 from public.profiles where id=auth.uid() and tenant_id=t and role='admin' and status='active') then raise exception 'Workspace administration required' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,''))) not between 1 and 4000 then raise exception 'Disconnection reason required' using errcode='22023';end if;
 select * into r from public.legal_payment_connections where id=p_connection_id and tenant_id=t for update;if not found then raise exception 'Connection access denied' using errcode='42501';end if;
 update public.legal_payment_connections set status='disabled' where id=r.id returning * into r;return r;
end;$$;

create or replace function public._legal_finance_public_charge(p_charge public.legal_charge_attempts)
returns jsonb language sql immutable set search_path=pg_catalog,public,pg_temp as $$
 select to_jsonb(p_charge)-array['lease_token','lease_until','payload_hash'];
$$;

create or replace function public.legal_prepare_charge(p_obligation_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare o public.legal_financial_obligations;r public.legal_charge_attempts;old public.legal_charge_attempts;c public.legal_payment_connections;payload jsonb;
begin
 select * into o from public.legal_financial_obligations where id=p_obligation_id;if not found then raise exception 'Obligation access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(o.case_id,true);select * into o from public.legal_financial_obligations where id=p_obligation_id;
 perform public._legal_finance_payload(p_payload,array['connection_id','amount','provider_customer_id','billing_type','due_on','idempotency_key']);
 payload:=p_payload||jsonb_build_object('amount',public._ir4_json_money(p_payload,'amount'),'provider_customer_id',btrim(p_payload->>'provider_customer_id'));
 r:=jsonb_populate_record(r,payload);r.id:=gen_random_uuid();r.tenant_id:=o.tenant_id;r.case_id:=o.case_id;r.obligation_id:=o.id;r.payload_hash:=encode(sha256(convert_to((payload||jsonb_build_object('obligation_id',o.id))::text,'UTF8')),'hex');r.status:='draft';r.created_by:=auth.uid();r.created_at:=now();r.updated_at:=now();r.review_note:='';
 select * into old from public.legal_charge_attempts where tenant_id=o.tenant_id and idempotency_key=r.idempotency_key;
 if found then if old.payload_hash<>r.payload_hash then raise exception 'Charge idempotency key reused' using errcode='22023';end if;return public._legal_finance_public_charge(old);end if;
 select * into c from public.legal_payment_connections where id=r.connection_id and tenant_id=o.tenant_id and status<>'disabled';if not found then raise exception 'Dedicated fee connection required' using errcode='22023';end if;
 if o.status<>'approved' or o.direction<>'receivable' or o.funds_owner<>'office' or o.category='advance' or r.amount::numeric<=0 or r.amount::numeric>9999999999.99 or r.amount::numeric>o.amount::numeric-public._legal_finance_paid(o.id) or r.due_on<public._ir4_today() then raise exception 'Only an approved outstanding office receivable and a valid charge amount/date can be charged' using errcode='22023';end if;
 perform public._legal_finance_check_obligation(o);
 if exists(select 1 from public.legal_charge_attempts where obligation_id=o.id and status not in ('failed','cancelled','reconciled')) then raise exception 'Reconcile or cancel the existing attempt before another charge' using errcode='22023';end if;
 insert into public.legal_charge_attempts values(r.*) returning * into r;
 perform public._legal_record_event(o.case_id,'financial_changed','Cobrança preparada para revisão de valor, cliente e destino.',jsonb_build_object('attempt_id',r.id));return public._legal_finance_public_charge(r);
end;$$;
create or replace function public.legal_review_charge(p_attempt_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_charge_attempts;o public.legal_financial_obligations;
begin
 select * into r from public.legal_charge_attempts where id=p_attempt_id;if not found then raise exception 'Charge access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(r.case_id,true);select * into r from public.legal_charge_attempts where id=p_attempt_id;select * into o from public.legal_financial_obligations where id=r.obligation_id;
 if r.status<>'draft' or length(btrim(coalesce(p_note,''))) not between 1 and 4000 or o.status<>'approved' or r.amount::numeric>o.amount::numeric-public._legal_finance_paid(o.id) or r.due_on<public._ir4_today() then raise exception 'Draft, current outstanding amount/date and explicit destination review required' using errcode='22023';end if;
 perform public._legal_finance_check_obligation(o);
 update public.legal_charge_attempts set status='approved',review_note=btrim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'financial_changed','Cobrança aprovada; envio depende de conexão própria configurada.',jsonb_build_object('attempt_id',r.id));return public._legal_finance_public_charge(r);
end;$$;
create or replace function public.legal_cancel_unsent_charge(p_attempt_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_charge_attempts;
begin
 select * into r from public.legal_charge_attempts where id=p_attempt_id;if not found then raise exception 'Charge access denied' using errcode='42501';end if;perform public._legal_finance_assert(r.case_id,true);select * into r from public.legal_charge_attempts where id=p_attempt_id;
 if r.status not in ('draft','approved','not_configured','failed','cancelled') or r.provider_charge_id is not null or length(btrim(coalesce(p_reason,''))) not between 1 and 4000 then raise exception 'Only an unsent attempt can be cancelled locally; external charges require provider reconciliation' using errcode='22023';end if;
 update public.legal_charge_attempts set status='cancelled',cancel_reason=btrim(p_reason),updated_at=now() where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'financial_changed','Tentativa não enviada cancelada; justificativa restrita ao financeiro.',jsonb_build_object('attempt_id',r.id));return public._legal_finance_public_charge(r);
end;$$;
create or replace function public.legal_finance_service_claim(p_expected_tenant_id uuid,p_account_id text,p_environment text,p_configured boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_charge_attempts;c public.legal_payment_connections;o public.legal_financial_obligations;result jsonb:='[]';
begin
 perform public._legal_portal_service();
 if p_expected_tenant_id is null or nullif(btrim(p_account_id),'') is null or p_environment is null or p_environment not in ('sandbox','production') then return result;end if;
 for r in select a.* from public.legal_charge_attempts a join public.legal_payment_connections x on x.id=a.connection_id where (a.status in ('approved','not_configured') or (a.status='sending' and a.lease_until<now())) and a.tenant_id=p_expected_tenant_id and x.account_id=p_account_id and x.environment=p_environment and x.status<>'disabled' order by a.created_at,a.id limit 10 loop
  perform 1 from public.legal_cases where id=r.case_id for update skip locked;if not found then continue;end if;
  select * into r from public.legal_charge_attempts where id=r.id;
  if r.status='sending' and r.lease_until<now() then update public.legal_charge_attempts set status='unknown',updated_at=now() where id=r.id;continue;end if;
  if r.status not in ('approved','not_configured') then continue;end if;
  select * into o from public.legal_financial_obligations where id=r.obligation_id;select * into c from public.legal_payment_connections where id=r.connection_id for update;
  if c.status='disabled' or c.tenant_id is distinct from p_expected_tenant_id or c.account_id is distinct from p_account_id or c.environment is distinct from p_environment then continue;end if;
  if p_configured is distinct from true then update public.legal_charge_attempts set status='not_configured',updated_at=now() where id=r.id;continue;end if;
  if not public._legal_actor_can_edit(r.case_id,r.reviewed_by,'fiscal') or not exists(select 1 from public.legal_cases where id=r.case_id and owner_id=r.reviewed_by) or o.status<>'approved' or r.reviewed_by is null or r.amount::numeric>o.amount::numeric-public._legal_finance_paid(o.id) or r.due_on<public._ir4_today() or not exists(select 1 from public.legal_workspace_features where tenant_id=r.tenant_id and enabled) then
   update public.legal_charge_attempts set status='failed',provider_state='review_required',updated_at=now() where id=r.id;continue;
  end if;
  begin perform public._legal_finance_check_obligation(o,true);exception when sqlstate '22023' or sqlstate '42501' then update public.legal_charge_attempts set status='failed',provider_state='stale_contract_or_basis',updated_at=now() where id=r.id;continue;end;
  update public.legal_charge_attempts set status='sending',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now() where id=r.id returning * into r;
  update public.legal_payment_connections set status='ready' where id=c.id;
  result:=result||jsonb_build_array(to_jsonb(r)||jsonb_build_object('connection',jsonb_build_object('id',c.id,'account_id',c.account_id,'environment',c.environment)));
 end loop;return result;
end;$$;
create or replace function public.legal_finance_service_finish(p_attempt_id uuid,p_lease_token uuid,p_status text,p_provider_id text default null,p_provider_url text default null,p_provider_state text default null)
returns public.legal_charge_attempts language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_charge_attempts;
begin
 perform public._legal_portal_service();select * into r from public.legal_charge_attempts where id=p_attempt_id;if not found then raise exception 'Unknown charge' using errcode='22023';end if;
 perform 1 from public.legal_cases where id=r.case_id for update;select * into r from public.legal_charge_attempts where id=p_attempt_id;
 if r.lease_token is distinct from p_lease_token or p_lease_token is null or r.status not in ('sending','unknown') then raise exception 'Charge lease mismatch or completed' using errcode='22023';end if;
 if p_status is null or p_status not in ('provider_accepted','unknown','failed') or (p_status='provider_accepted' and length(btrim(coalesce(p_provider_id,''))) not between 1 and 180) or length(coalesce(p_provider_url,''))>2048 or length(coalesce(p_provider_state,''))>120 then raise exception 'Invalid provider outcome' using errcode='22023';end if;
 if p_provider_url is not null and p_provider_url !~ '^https://(www\.)?(sandbox\.)?asaas\.com/' then raise exception 'Unsupported payment URL' using errcode='22023';end if;
 if r.provider_charge_id is not null and r.provider_charge_id is distinct from p_provider_id then raise exception 'Provider identifier mismatch' using errcode='22023';end if;
 update public.legal_charge_attempts set status=p_status,provider_charge_id=p_provider_id,provider_url=p_provider_url,provider_state=p_provider_state,lease_until=null,updated_at=now() where id=r.id returning * into r;return r;
end;$$;
create or replace function public.legal_finance_service_receipt(p_expected_tenant_id uuid,p_account_id text,p_environment text,p_payload jsonb)
returns public.legal_payment_receipts language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_payment_receipts;old public.legal_payment_receipts;a public.legal_charge_attempts;c public.legal_payment_connections;
begin
 perform public._legal_portal_service();perform public._legal_finance_payload(p_payload,array['provider_event_id','event_type','provider_created_at','provider_charge_id','external_reference','provider_customer_id','amount','body_hash','safe_payload']);
 select x.* into a from public.legal_charge_attempts x join public.legal_payment_connections y on y.id=x.connection_id where x.tenant_id=p_expected_tenant_id and y.account_id=p_account_id and y.environment=p_environment and x.id::text=p_payload->>'external_reference';
 if not found then raise exception 'Unmatched fee payment account or reference' using errcode='22023';end if;
 perform 1 from public.legal_cases where id=a.case_id for update;select * into a from public.legal_charge_attempts where id=a.id;
 select * into c from public.legal_payment_connections where id=a.connection_id;
 if a.status not in ('sending','provider_accepted','unknown','reconciled') or a.provider_customer_id is distinct from p_payload->>'provider_customer_id' or length(coalesce(p_payload->>'provider_charge_id','')) not between 1 and 180 or (a.provider_charge_id is not null and a.provider_charge_id is distinct from p_payload->>'provider_charge_id') then raise exception 'Payment does not match the reviewed charge' using errcode='22023';end if;
 if p_payload->>'amount' is not null and public._ir4_json_money(p_payload,'amount')<>a.amount then raise exception 'Provider gross amount differs from reviewed charge; investigate manually' using errcode='22023';end if;
 select * into old from public.legal_payment_receipts where connection_id=c.id and provider_event_id=p_payload->>'provider_event_id';
 if found then if old.body_hash is distinct from p_payload->>'body_hash' then raise exception 'Provider event id repeated with different bytes' using errcode='22023';end if;return old;end if;
 if jsonb_typeof(p_payload->'safe_payload') is distinct from 'object' or octet_length((p_payload->'safe_payload')::text)>12000 then raise exception 'Bounded provider receipt projection required' using errcode='22023';end if;
 insert into public.legal_payment_receipts(tenant_id,case_id,charge_id,connection_id,provider_event_id,event_type,provider_created_at,amount,body_hash,safe_payload)
 values(a.tenant_id,a.case_id,a.id,c.id,p_payload->>'provider_event_id',p_payload->>'event_type',(p_payload->>'provider_created_at')::timestamptz,case when p_payload->>'amount' is null then null else public._ir4_json_money(p_payload,'amount') end,p_payload->>'body_hash',p_payload->'safe_payload') returning * into r;
 if a.provider_charge_id is null then update public.legal_charge_attempts set provider_charge_id=p_payload->>'provider_charge_id',updated_at=now() where id=a.id;end if;
 return r;
end;$$;
create or replace function public.legal_reconcile_payment_receipt(p_receipt_id uuid,p_cash_transaction_id uuid,p_note text)
returns public.legal_payment_receipts language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_payment_receipts;a public.legal_charge_attempts;tx public.legal_cash_transactions;
begin
 select * into r from public.legal_payment_receipts where id=p_receipt_id;if not found then raise exception 'Receipt access denied' using errcode='42501';end if;
 perform public._legal_finance_assert(r.case_id,true);select * into r from public.legal_payment_receipts where id=p_receipt_id;
 select * into a from public.legal_charge_attempts where id=r.charge_id;select * into tx from public.legal_cash_transactions where id=p_cash_transaction_id and case_id=r.case_id;
 if not found or length(btrim(coalesce(p_note,''))) not between 1 and 4000 then raise exception 'Documented cash movement and reconciliation note required' using errcode='22023';end if;
 if r.status='reconciled' then if r.cash_transaction_id is distinct from tx.id then raise exception 'Receipt already reconciled to another movement' using errcode='22023';end if;return r;end if;
 if r.status<>'needs_reconciliation' or not exists(select 1 from public.legal_cash_allocations where cash_transaction_id=tx.id and obligation_id=a.obligation_id) or not ((r.event_type in ('PAYMENT_RECEIVED','PAYMENT_RECEIVED_IN_CASH') and tx.from_owner='external' and tx.to_owner='office' and tx.reverses_id is null) or (r.event_type in ('PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_CHARGEBACK_REQUESTED') and tx.from_owner='office' and tx.to_owner='external' and tx.reverses_id is not null)) then raise exception 'Only a received/refunded event can reconcile a matching documented settlement or reversal' using errcode='22023';end if;
 if exists(select 1 from public.legal_payment_receipts where cash_transaction_id=tx.id and charge_id<>a.id and status='reconciled') then raise exception 'Cash movement is already linked to another charge' using errcode='22023';end if;
 update public.legal_payment_receipts set status='reconciled',cash_transaction_id=tx.id,reconciliation_note=btrim(p_note) where id=r.id returning * into r;
 if public._legal_finance_paid(a.obligation_id)>=(select amount::numeric from public.legal_financial_obligations where id=a.obligation_id) then update public.legal_charge_attempts set status='reconciled',updated_at=now() where id=a.id;end if;
 perform public._legal_record_event(r.case_id,'financial_changed','Evento do provedor conciliado documentalmente; conferência restrita ao financeiro.',jsonb_build_object('receipt_id',r.id,'transaction_id',tx.id));return r;
end;$$;

-- Immutable history: no direct application writes, including service_role.
do $$declare t text;begin
 foreach t in array array['legal_fee_agreement_versions','legal_fee_basis_versions','legal_financial_obligations','legal_cash_transactions','legal_cash_allocations','legal_financial_statement_versions','legal_financial_statement_releases','legal_payment_connections','legal_charge_attempts','legal_payment_receipts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role,legal_portal',t);
  execute format('grant select on public.%I to service_role',t);
  if t='legal_charge_attempts' then grant select(id,tenant_id,case_id,obligation_id,connection_id,amount,provider_customer_id,billing_type,due_on,idempotency_key,status,provider_charge_id,provider_url,provider_state,cancel_reason,review_note,reviewed_by,reviewed_at,created_by,created_at,updated_at) on public.legal_charge_attempts to authenticated;
  else execute format('grant select on public.%I to authenticated',t);end if;
  if t='legal_payment_connections' then execute format('create policy %I on public.%I for select to authenticated using(tenant_id=public.legal_actual_tenant() and public.legal_feature_enabled())',t||'_read',t);
  else execute format('create policy %I on public.%I for select to authenticated using(public.legal_can_access_category(case_id,''fiscal''))',t||'_read',t);end if;
 end loop;
end$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (left(p.proname,15)='_legal_finance_' or left(p.proname,22)='legal_finance_service_' or p.proname=any(array[
 'legal_create_fee_agreement','legal_review_fee_agreement','legal_create_fee_basis','legal_review_fee_basis','legal_create_financial_obligation','legal_review_financial_obligation','legal_cancel_financial_obligation','legal_allocate_cash_transaction','legal_record_cash_transaction','legal_create_financial_statement','legal_review_financial_statement','legal_release_financial_statement','legal_revoke_financial_statement_release','legal_portal_service_statements','legal_get_case_financial_context','legal_save_payment_connection','legal_disable_payment_connection','legal_prepare_charge','legal_review_charge','legal_cancel_unsent_charge','legal_reconcile_payment_receipt'])) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role,legal_portal',f.signature);
  if left(f.proname,22)='legal_finance_service_' or f.proname='legal_portal_service_statements' then execute format('grant execute on function %s to service_role',f.signature);
  elsif left(f.proname,15)<>'_legal_finance_' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end$$;
select pg_notify('pgrst','reload schema');
