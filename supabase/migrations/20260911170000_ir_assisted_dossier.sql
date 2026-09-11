-- F3 assisted IR dossier. No automatic legal/medical eligibility, diagnosis,
-- fiscal calculation, external filing, or provider identity verification.

create table public.ir_case_controls (
 case_id uuid primary key,tenant_id uuid not null,input_revision bigint not null default 0 check(input_revision>=0),
 workflow_status text not null default 'incomplete' check(workflow_status in ('incomplete','in_legal_review','proposed','decision_recorded')),
 updated_at timestamptz not null default now(),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict
);
create table public.ir_payers (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 200),payer_type text not null check(payer_type in ('inss','rpps','military','supplementary','employer','other')),
 registry_number text not null default '' check(length(registry_number)<=40),notes text not null default '' check(length(notes)<=2000),
 created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,tenant_id),unique(id,case_id,tenant_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict
);
create table public.ir_income_sources (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,payer_id uuid not null,
 income_kind text not null check(income_kind in ('retirement','pension','military_retirement','paid_reserve','salary','rent','supplementary_benefit','supplementary_redemption','other')),
 regime text not null default 'unknown' check(regime in ('rgps','rpps','military','supplementary','other','unknown')),
 product_type text not null default 'unknown' check(product_type in ('none','pgbl','vgbl','other','unknown')),
 pension_kind text not null default 'unknown' check(pension_kind in ('survivor','alimony','other','unknown')),
 income_event text not null default 'unknown' check(income_event in ('recurring','lump_sum','unknown')),
 benefit_number text not null default '' check(length(benefit_number)<=80),benefit_start_date date check(benefit_start_date is null or isfinite(benefit_start_date)),
 withholding_reported text not null default 'unknown' check(withholding_reported in ('yes','no','unknown')),
 notes text not null default '' check(length(notes)<=2000),created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,tenant_id),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(payer_id,case_id,tenant_id) references public.ir_payers(id,case_id,tenant_id) on delete restrict
);
create table public.ir_fact_revisions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,entity_type text not null check(entity_type in ('payer','income_source')),
 entity_id uuid not null,data jsonb not null,changed_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict
);
create table public.ir_evidence_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,
 category text not null check(category in ('general','medical','fiscal')),
 event_type text not null check(event_type in ('disease_onset_reported','diagnosis_reported','medical_report_issued','medical_evidence_received','benefit_started','withholding_started','withholding_stopped','tax_document_issued','administrative_protocol','judicial_protocol','other')),
 event_date date check(event_date is null or isfinite(event_date)),date_precision text not null check(date_precision in ('exact','estimated','unknown')),
 description text not null check(length(btrim(description)) between 1 and 4000),document_id uuid,source_page integer check(source_page>0),supersedes_id uuid,
 created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),unique(id,case_id,tenant_id),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(document_id,tenant_id) references public.legal_case_documents(id,tenant_id) on delete restrict,
 foreign key(supersedes_id,case_id,tenant_id) references public.ir_evidence_events(id,case_id,tenant_id) on delete restrict,
 check((date_precision='unknown' and event_date is null) or (date_precision<>'unknown' and event_date is not null)),
 check(source_page is null or document_id is not null)
);
create table public.ir_document_reviews (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,document_id uuid not null,
 category text not null check(category in ('general','medical','fiscal')),checks jsonb not null check(jsonb_typeof(checks)='object'),metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 result text not null check(result in ('sufficient','pending','inconsistent')),review_note text not null default '' check(length(review_note)<=4000),
 reviewer_id uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(document_id,tenant_id) references public.legal_case_documents(id,tenant_id) on delete restrict
);
create table public.ir_rule_versions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete restrict,
 rule_key text not null check(rule_key ~ '^[a-zA-Z0-9_-]{1,80}$'),version_number integer not null check(version_number>0),
 title text not null check(length(btrim(title)) between 1 and 200),scope jsonb not null default '{}'::jsonb check(jsonb_typeof(scope)='object'),
 criteria text not null check(length(btrim(criteria)) between 1 and 20000),sources jsonb not null check(jsonb_typeof(sources)='array'),
 status text not null default 'draft' check(status in ('draft','approved','rejected')),
 created_by uuid not null references public.profiles(id) on delete restrict,approved_by uuid references public.profiles(id) on delete restrict,
 review_note text not null default '' check(length(review_note)<=4000),created_at timestamptz not null default now(),reviewed_at timestamptz,
 unique(tenant_id,rule_key,version_number),unique(id,tenant_id),check(status='draft' or (approved_by is not null and reviewed_at is not null))
);
comment on table public.ir_rule_versions is 'Workspace-authored, versioned references. New entries are drafts; no pre-approved legal conclusions are seeded.';
create table public.ir_checklist_template_versions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete restrict,
 template_key text not null check(template_key ~ '^[a-zA-Z0-9_-]{1,80}$'),version_number integer not null check(version_number>0),
 title text not null check(length(btrim(title)) between 1 and 200),payer_types text[] not null default array[]::text[],
 route text not null check(route in ('administrative','judicial','both')),items jsonb not null check(jsonb_typeof(items)='array'),
 created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),
 unique(tenant_id,template_key,version_number),unique(id,tenant_id)
);
create table public.ir_case_checklist_items (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,template_version_id uuid not null,item_key text not null,
 payer_id uuid,category text not null check(category in ('general','medical','fiscal')),title text not null,
 gating_stage text not null check(gating_stage in ('intake','decision','filing','followup')),required boolean not null,
 document_request_id uuid,waiver_reason text,waived_by uuid references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),
 unique nulls not distinct(case_id,template_version_id,item_key,payer_id),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(template_version_id,tenant_id) references public.ir_checklist_template_versions(id,tenant_id) on delete restrict,
 foreign key(payer_id,case_id,tenant_id) references public.ir_payers(id,case_id,tenant_id) on delete restrict,
 foreign key(document_request_id,tenant_id) references public.legal_document_requests(id,tenant_id) on delete restrict,
 check((waived_by is null and waiver_reason is null) or (waived_by is not null and length(btrim(waiver_reason))>0))
);
create table public.ir_assessment_versions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,version_number integer not null,
 input_revision bigint not null,input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),snapshot jsonb not null,source_proposals jsonb not null,
 strategy text not null check(strategy in ('documents_first','administrative','judicial','combined')),
 summary text not null check(length(btrim(summary)) between 1 and 12000),status text not null default 'draft' check(status in ('draft','in_review','approved','superseded')),
 created_by uuid not null references public.profiles(id) on delete restrict,reviewer_id uuid references public.profiles(id) on delete restrict,
 review_note text not null default '' check(length(review_note)<=4000),created_at timestamptz not null default now(),reviewed_at timestamptz,
 unique(case_id,version_number),unique(id,tenant_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 check(status<>'approved' or (reviewer_id is not null and reviewed_at is not null))
);
create table public.ir_assessment_reviews (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,version_id uuid not null,
 decision text not null check(decision in ('approved','returned')),note text not null,reviewer_id uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),foreign key(version_id,tenant_id) references public.ir_assessment_versions(id,tenant_id) on delete restrict,
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict
);
create unique index if not exists legal_parties_id_case_tenant_uid on public.legal_case_parties(id,case_id,tenant_id);
create table public.legal_representations (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,representative_party_id uuid not null,
 basis text not null check(basis in ('power_of_attorney','court_order','legal_guardianship','other')),
 category text not null check(category in ('general','medical','fiscal')),
 scopes text[] not null default array['document_upload']::text[] check(scopes <@ array['document_upload']::text[] and cardinality(scopes)=1),
 evidence_document_id uuid not null,instrument_version_id uuid,valid_from timestamptz not null check(isfinite(valid_from)),valid_until timestamptz check(valid_until is null or isfinite(valid_until)),
 status text not null default 'draft' check(status in ('draft','active','revoked')),
 created_by uuid not null references public.profiles(id) on delete restrict,approved_by uuid references public.profiles(id) on delete restrict,
 approval_note text not null default '',approved_at timestamptz,revoked_by uuid references public.profiles(id) on delete restrict,
 revocation_reason text,revoked_at timestamptz,created_at timestamptz not null default now(),unique(id,case_id,tenant_id),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(representative_party_id,case_id,tenant_id) references public.legal_case_parties(id,case_id,tenant_id) on delete restrict,
 foreign key(evidence_document_id,tenant_id) references public.legal_case_documents(id,tenant_id) on delete restrict,
 foreign key(instrument_version_id,tenant_id) references public.legal_instrument_versions(id,tenant_id) on delete restrict,
 check(valid_until is null or valid_until>valid_from),check(status<>'active' or (approved_by is not null and approved_at is not null)),
 check(status<>'revoked' or (revoked_by is not null and revoked_at is not null and length(btrim(revocation_reason))>0))
);
alter table public.legal_document_requests add column representation_id uuid;
alter table public.legal_document_requests add constraint legal_request_representation_case_fk foreign key(representation_id,case_id,tenant_id)
 references public.legal_representations(id,case_id,tenant_id) on delete restrict;

-- Existing enums remain compatible; shared audit never contains medical/fiscal bodies.
alter table public.legal_case_events drop constraint legal_case_events_event_type_check;
alter table public.legal_case_events add constraint legal_case_events_event_type_check check(event_type in (
 'case_created','case_updated','member_granted','member_revoked','party_added','proceeding_added','manual','document_prepared','document_ready','document_abandoned','document_download','retention_changed',
 'operation_updated','interview_submitted','conflict_reviewed','document_requested','document_request_updated','instrument_created','instrument_version_created','instrument_reviewed','external_signature_recorded','task_updated','appointment_updated',
 'ir_fact_changed','ir_evidence_added','ir_document_reviewed','ir_checklist_changed','ir_assessment_changed','representation_changed'));

create or replace function public.ir_can_access_assessment(p_case_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select public.legal_can_access_category(p_case_id,'medical') and public.legal_can_access_category(p_case_id,'fiscal');
$$;
create or replace function public._ir_assert_assessment(p_case_id uuid,p_owner boolean default false)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public._legal_assert_operation(p_case_id,'medical',p_owner);
begin
 if not public.legal_can_access_category(p_case_id,'fiscal') then raise exception 'Both medical and fiscal permissions required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||':ir_rule_catalog',0));
 return t;
end;$$;
create or replace function public._ir_touch(p_case_id uuid)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare n bigint;
begin
 insert into public.ir_case_controls(case_id,tenant_id,input_revision) select id,tenant_id,1 from public.legal_cases where id=p_case_id
 on conflict(case_id) do update set input_revision=ir_case_controls.input_revision+1,workflow_status='incomplete',updated_at=now() returning input_revision into n;return n;
end;$$;
create or replace function public._ir_document(p_case_id uuid,p_document_id uuid,p_category text)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if not exists(select 1 from public.legal_case_documents where id=p_document_id and case_id=p_case_id and category=p_category and status='ready') then
  raise exception 'A ready document from this case and category is required' using errcode='22023';end if;
end;$$;
create or replace function public._ir_event_category(p_type text,p_requested text)
returns text language sql immutable set search_path=pg_catalog as $$
 select case when p_type in ('disease_onset_reported','diagnosis_reported','medical_report_issued','medical_evidence_received') then 'medical'
 when p_type in ('benefit_started','withholding_started','withholding_stopped','tax_document_issued') then 'fiscal'
 else p_requested end;
$$;

create or replace function public.ir_save_payer(p_case_id uuid,p_payload jsonb,p_payer_id uuid default null)
returns public.ir_payers language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_payers;t uuid:=public._legal_assert_operation(p_case_id,'fiscal');
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('name','payer_type','registry_number','notes')) then raise exception 'Unsupported payer fields' using errcode='22023';end if;
 if p_payer_id is not null then select * into r from public.ir_payers where id=p_payer_id and case_id=p_case_id for update;
  if not found then raise exception 'Payer access denied' using errcode='42501';end if;
 else r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.registry_number:='';r.notes:='';r.created_by:=auth.uid();r.created_at:=now();end if;
 r:=jsonb_populate_record(r,p_payload);r.updated_at:=now();
 insert into public.ir_payers values(r.*) on conflict(id) do update set name=excluded.name,payer_type=excluded.payer_type,registry_number=excluded.registry_number,notes=excluded.notes,updated_at=excluded.updated_at returning * into r;
 insert into public.ir_fact_revisions(tenant_id,case_id,entity_type,entity_id,data,changed_by) values(t,p_case_id,'payer',r.id,to_jsonb(r),auth.uid());
 perform public._ir_touch(p_case_id);perform public._legal_record_event(p_case_id,'ir_fact_changed','Dados fiscais atualizados.',jsonb_build_object('entity_type','payer','entity_id',r.id));return r;
end;$$;

create or replace function public.ir_save_income_source(p_case_id uuid,p_payload jsonb,p_source_id uuid default null)
returns public.ir_income_sources language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_income_sources;t uuid:=public._legal_assert_operation(p_case_id,'fiscal');
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('payer_id','income_kind','regime','product_type','pension_kind','income_event','benefit_number','benefit_start_date','withholding_reported','notes')) then raise exception 'Unsupported income source fields' using errcode='22023';end if;
 if p_source_id is not null then select * into r from public.ir_income_sources where id=p_source_id and case_id=p_case_id for update;
  if not found then raise exception 'Income source access denied' using errcode='42501';end if;
 else r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.regime:='unknown';r.product_type:='unknown';r.pension_kind:='unknown';r.income_event:='unknown';r.benefit_number:='';r.withholding_reported:='unknown';r.notes:='';r.created_by:=auth.uid();r.created_at:=now();end if;
 if p_payload->>'benefit_start_date' is not null and p_payload->>'benefit_start_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Benefit date must use YYYY-MM-DD' using errcode='22023';end if;
 r:=jsonb_populate_record(r,p_payload);r.updated_at:=now();
 if not exists(select 1 from public.ir_payers where id=r.payer_id and case_id=p_case_id) then raise exception 'Payer must belong to this case' using errcode='22023';end if;
 insert into public.ir_income_sources values(r.*) on conflict(id) do update set payer_id=excluded.payer_id,income_kind=excluded.income_kind,regime=excluded.regime,product_type=excluded.product_type,pension_kind=excluded.pension_kind,income_event=excluded.income_event,benefit_number=excluded.benefit_number,
 benefit_start_date=excluded.benefit_start_date,withholding_reported=excluded.withholding_reported,notes=excluded.notes,updated_at=excluded.updated_at returning * into r;
 insert into public.ir_fact_revisions(tenant_id,case_id,entity_type,entity_id,data,changed_by) values(t,p_case_id,'income_source',r.id,to_jsonb(r),auth.uid());
 perform public._ir_touch(p_case_id);perform public._legal_record_event(p_case_id,'ir_fact_changed','Rendimento atualizado; nenhuma isenção foi atribuída automaticamente.',jsonb_build_object('entity_type','income_source','entity_id',r.id));return r;
end;$$;

create or replace function public.ir_add_evidence_event(p_case_id uuid,p_payload jsonb)
returns public.ir_evidence_events language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_evidence_events;c text;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('category','event_type','event_date','date_precision','description','document_id','source_page','supersedes_id')) then raise exception 'Unsupported evidence fields' using errcode='22023';end if;
 if p_payload->>'event_date' is not null and p_payload->>'event_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Event date must use YYYY-MM-DD' using errcode='22023';end if;
 c:=public._ir_event_category(p_payload->>'event_type',p_payload->>'category');
 r.tenant_id:=public._legal_assert_operation(p_case_id,c);r.id:=gen_random_uuid();r.case_id:=p_case_id;r.created_by:=auth.uid();r.created_at:=now();r.date_precision:='unknown';
 r:=jsonb_populate_record(r,p_payload);
 if r.category is distinct from c then raise exception 'Event type requires its protected category' using errcode='22023';end if;
 if r.document_id is not null then perform public._ir_document(p_case_id,r.document_id,c);end if;
 if r.supersedes_id is not null and not exists(select 1 from public.ir_evidence_events where id=r.supersedes_id and case_id=p_case_id and category=c) then raise exception 'Superseded evidence must belong to this case/category' using errcode='22023';end if;
 insert into public.ir_evidence_events values(r.*) returning * into r;
 perform public._ir_touch(p_case_id);perform public._legal_record_event(p_case_id,'ir_evidence_added','Evento da cronologia registrado.',jsonb_build_object('evidence_event_id',r.id));return r;
end;$$;

create or replace function public.ir_record_document_review(p_document_id uuid,p_checks jsonb,p_result text,p_note text default '',p_metadata jsonb default '{}'::jsonb)
returns public.ir_document_reviews language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare d public.legal_case_documents;r public.ir_document_reviews;
begin
 select * into d from public.legal_case_documents where id=p_document_id;
 if not found then raise exception 'Document access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(d.case_id,d.category,true);perform public._ir_document(d.case_id,d.id,d.category);
 if p_checks is null or jsonb_typeof(p_checks)<>'object' or exists(select 1 from jsonb_each_text(p_checks) kv where kv.key not in ('identity','issuer','signature','date','readability','source') or kv.value not in ('present','absent','unclear','not_applicable')) then raise exception 'Invalid documentary checks' using errcode='22023';end if;
 if p_result in ('pending','inconsistent') and length(btrim(coalesce(p_note,'')))=0 then raise exception 'Document review needs a reason' using errcode='22023';end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>4000 or exists(select 1 from jsonb_object_keys(p_metadata) k where k not in ('issuer_name','professional_registration','document_nature','issued_on','reported_onset_on')) or (p_metadata ? 'document_nature' and p_metadata->>'document_nature' not in ('official','private','unknown')) then raise exception 'Invalid documentary metadata' using errcode='22023';end if;
 if p_metadata->>'reported_onset_on' is not null and d.category<>'medical' then raise exception 'Reported disease onset requires medical category' using errcode='22023';end if;
 if (p_metadata->>'issued_on' is not null and p_metadata->>'issued_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') or (p_metadata->>'reported_onset_on' is not null and p_metadata->>'reported_onset_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Document dates must use YYYY-MM-DD' using errcode='22023';end if;
 perform (p_metadata->>'issued_on')::date,(p_metadata->>'reported_onset_on')::date;
 insert into public.ir_document_reviews(tenant_id,case_id,document_id,category,checks,metadata,result,review_note,reviewer_id) values(d.tenant_id,d.case_id,d.id,d.category,p_checks,p_metadata,p_result,p_note,auth.uid()) returning * into r;
 perform public._ir_touch(d.case_id);perform public._legal_record_event(d.case_id,'ir_document_reviewed','Conferência documental registrada; sem diagnóstico automático.',jsonb_build_object('document_review_id',r.id));return r;
end;$$;

create or replace function public.ir_create_rule_version(p_payload jsonb)
returns public.ir_rule_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_rule_versions;u jsonb;
begin
 if not public.legal_can_create() then raise exception 'Rule authoring denied' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('rule_key','title','scope','criteria','sources')) then raise exception 'Unsupported rule fields' using errcode='22023';end if;
 r.id:=gen_random_uuid();r.tenant_id:=public.legal_actual_tenant();r.scope:='{}';r.status:='draft';r.review_note:='';r.created_by:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);
 if r.sources is null or jsonb_typeof(r.sources)<>'array' or jsonb_array_length(r.sources) not between 1 and 20 then raise exception 'Provide official reference URLs for review' using errcode='22023';end if;
 for u in select value from jsonb_array_elements(r.sources) loop
  if jsonb_typeof(u)<>'object' or coalesce(u->>'url','') !~ '^https://[^ /]+/' or length(u->>'url')>2000 then raise exception 'Reference must be an HTTPS URL' using errcode='22023';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(r.tenant_id::text||':ir_rule:'||r.rule_key,0));
 select coalesce(max(version_number),0)+1 into r.version_number from public.ir_rule_versions where tenant_id=r.tenant_id and rule_key=r.rule_key;
 insert into public.ir_rule_versions values(r.*) returning * into r;return r;
end;$$;

create or replace function public.ir_review_rule_version(p_version_id uuid,p_decision text,p_note text)
returns public.ir_rule_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_rule_versions;u jsonb;
begin
 if not public.legal_can_create() then raise exception 'Rule review denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(public.legal_actual_tenant()::text||':ir_rule_catalog',0));
 select * into r from public.ir_rule_versions where id=p_version_id and tenant_id=public.legal_actual_tenant() for update;
 if not found then raise exception 'Rule access denied' using errcode='42501';end if;
 if r.status<>'draft' or p_decision not in ('approved','rejected') or length(btrim(coalesce(p_note,'')))=0 then raise exception 'A draft and explicit professional review are required' using errcode='22023';end if;
 if p_decision='approved' then
  if length(btrim(coalesce(r.scope->>'validity_note',''))) not between 1 and 4000 then raise exception 'Rule approval requires an explicit validity note' using errcode='22023';end if;
  for u in select value from jsonb_array_elements(r.sources) loop
   if coalesce(u->>'checked_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Every source requires an ISO checked_on date before approval' using errcode='22023';end if;
   perform (u->>'checked_on')::date;
  end loop;
 end if;
 update public.ir_rule_versions set status=p_decision,approved_by=auth.uid(),review_note=p_note,reviewed_at=now() where id=r.id returning * into r;return r;
end;$$;

create or replace function public.ir_create_checklist_version(p_payload jsonb)
returns public.ir_checklist_template_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_checklist_template_versions;j jsonb;keys text[]:=array[]::text[];
begin
 if not public.legal_can_create() then raise exception 'Checklist authoring denied' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('template_key','title','payer_types','route','items')) then raise exception 'Unsupported checklist fields' using errcode='22023';end if;
 r.id:=gen_random_uuid();r.tenant_id:=public.legal_actual_tenant();r.payer_types:=array[]::text[];r.created_by:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);
 if r.items is null or jsonb_typeof(r.items)<>'array' or jsonb_array_length(r.items) not between 1 and 100 or not(r.payer_types<@array['inss','rpps','military','supplementary','employer','other']) then raise exception 'Invalid checklist items or payer types' using errcode='22023';end if;
 for j in select value from jsonb_array_elements(r.items) loop
  if jsonb_typeof(j)<>'object' or coalesce(j->>'key','') !~ '^[a-zA-Z0-9_-]{1,80}$' or coalesce(length(btrim(j->>'title')),0) not between 1 and 200
   or coalesce(j->>'category','') not in ('general','medical','fiscal') or coalesce(j->>'gating_stage','') not in ('intake','decision','filing','followup')
   or jsonb_typeof(j->'required') is distinct from 'boolean' or (j->>'key')=any(keys) then raise exception 'Invalid checklist item' using errcode='22023';end if;
  keys:=array_append(keys,j->>'key');
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(r.tenant_id::text||':ir_checklist:'||r.template_key,0));
 select coalesce(max(version_number),0)+1 into r.version_number from public.ir_checklist_template_versions where tenant_id=r.tenant_id and template_key=r.template_key;
 insert into public.ir_checklist_template_versions values(r.*) returning * into r;return r;
end;$$;

create or replace function public.ir_apply_checklist(p_case_id uuid,p_version_id uuid,p_payer_id uuid default null)
returns setof public.ir_case_checklist_items language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v public.ir_checklist_template_versions;j jsonb;t uuid:=public._legal_assert_operation(p_case_id);n integer;
begin
 select * into v from public.ir_checklist_template_versions where id=p_version_id and tenant_id=t;
 if not found then raise exception 'Checklist access denied' using errcode='42501';end if;
 if p_payer_id is not null then
  perform public._legal_assert_operation(p_case_id,'fiscal');
  if not exists(select 1 from public.ir_payers where id=p_payer_id and case_id=p_case_id and (cardinality(v.payer_types)=0 or payer_type=any(v.payer_types))) then raise exception 'Payer does not match checklist scope' using errcode='22023';end if;
 end if;
 for j in select value from jsonb_array_elements(v.items) loop
  perform public._legal_assert_operation(p_case_id,j->>'category');
 end loop;
 insert into public.ir_case_checklist_items(tenant_id,case_id,template_version_id,item_key,payer_id,category,title,gating_stage,required)
 select t,p_case_id,v.id,x.value->>'key',p_payer_id,x.value->>'category',x.value->>'title',x.value->>'gating_stage',(x.value->>'required')::boolean from jsonb_array_elements(v.items) x(value)
 on conflict(case_id,template_version_id,item_key,payer_id) do nothing;
 get diagnostics n=row_count;
 if n>0 then perform public._ir_touch(p_case_id);perform public._legal_record_event(p_case_id,'ir_checklist_changed','Checklist aplicado.',jsonb_build_object('template_version_id',v.id));end if;
 return query select * from public.ir_case_checklist_items where case_id=p_case_id and template_version_id=v.id and payer_id is not distinct from p_payer_id;
end;$$;

create or replace function public.ir_link_checklist_request(p_item_id uuid,p_request_id uuid)
returns public.ir_case_checklist_items language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_case_checklist_items;
begin
 select * into r from public.ir_case_checklist_items where id=p_item_id;
 if not found then raise exception 'Checklist item access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(r.case_id,r.category);
 select * into r from public.ir_case_checklist_items where id=p_item_id for update;
 if not exists(select 1 from public.legal_document_requests where id=p_request_id and case_id=r.case_id and category=r.category) then raise exception 'Request must match case and category' using errcode='22023';end if;
 update public.ir_case_checklist_items set document_request_id=p_request_id,waiver_reason=null,waived_by=null where id=r.id returning * into r;
 perform public._ir_touch(r.case_id);perform public._legal_record_event(r.case_id,'ir_checklist_changed','Solicitação vinculada ao checklist.',jsonb_build_object('item_id',r.id,'request_id',p_request_id));return r;
end;$$;

create or replace function public.ir_waive_checklist_item(p_item_id uuid,p_reason text)
returns public.ir_case_checklist_items language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_case_checklist_items;
begin
 select * into r from public.ir_case_checklist_items where id=p_item_id;
 if not found then raise exception 'Checklist item access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(r.case_id,r.category,true);
 if length(btrim(coalesce(p_reason,'')))=0 or length(p_reason)>2000 then raise exception 'A waiver requires a reason' using errcode='22023';end if;
 update public.ir_case_checklist_items set waiver_reason=p_reason,waived_by=auth.uid() where id=r.id returning * into r;
 perform public._ir_touch(r.case_id);perform public._legal_record_event(r.case_id,'ir_checklist_changed','Dispensa de item registrada pelo responsável.',jsonb_build_object('item_id',r.id));return r;
end;$$;

-- Representation records do not grant staff membership and bearer links do not
-- authenticate the named representative. Revocation is checked at use time.
create or replace function public._ir_representation_state(p_representation_id uuid)
returns text language plpgsql volatile security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_representations;
begin
 select * into r from public.legal_representations where id=p_representation_id;
 if not found then return 'invalid_evidence';end if;
 if r.status<>'active' then return r.status;end if;
 if r.valid_until is not null and r.valid_until<=clock_timestamp() then return 'expired';end if;
 if r.valid_from>clock_timestamp() then return 'not_started';end if;
 if not exists(select 1 from public.legal_case_documents where id=r.evidence_document_id and case_id=r.case_id and category=r.category and status='ready') then return 'invalid_evidence';end if;
 if r.instrument_version_id is not null and not exists(select 1 from public.legal_instrument_versions v join public.legal_instruments i on i.id=v.instrument_id
 where v.id=r.instrument_version_id and v.case_id=r.case_id and v.category=r.category and v.status='approved' and v.superseded_at is null and i.instrument_type='power_of_attorney') then return 'invalid_evidence';end if;
 return 'active';
end;$$;
create or replace function public._ir_representation_allows(p_representation_id uuid,p_case_id uuid)
returns boolean language sql volatile security definer set search_path=pg_catalog,public,pg_temp as $$
 select p_representation_id is null or exists(select 1 from public.legal_representations r where r.id=p_representation_id and r.case_id=p_case_id and 'document_upload'=any(r.scopes) and public._ir_representation_state(r.id)='active');
$$;

create or replace function public.legal_create_representation(p_case_id uuid,p_payload jsonb)
returns public.legal_representations language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_representations;d public.legal_case_documents;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('representative_party_id','basis','scopes','evidence_document_id','instrument_version_id','valid_from','valid_until')) then raise exception 'Unsupported representation fields' using errcode='22023';end if;
 select * into d from public.legal_case_documents where id=(p_payload->>'evidence_document_id')::uuid and case_id=p_case_id;
 if not found then raise exception 'Representation evidence denied' using errcode='42501';end if;
 r.tenant_id:=public._legal_assert_operation(p_case_id,d.category);perform public._ir_document(p_case_id,d.id,d.category);
 r.id:=gen_random_uuid();r.case_id:=p_case_id;r.category:=d.category;r.scopes:=array['document_upload'];r.valid_from:=now();r.status:='draft';r.created_by:=auth.uid();r.created_at:=now();r.approval_note:='';
 r:=jsonb_populate_record(r,p_payload);
 if not exists(select 1 from public.legal_case_parties where id=r.representative_party_id and case_id=p_case_id) then raise exception 'Representative must be a party of this case' using errcode='22023';end if;
 if r.instrument_version_id is not null and (r.basis<>'power_of_attorney' or not exists(select 1 from public.legal_instrument_versions v join public.legal_instruments i on i.id=v.instrument_id where v.id=r.instrument_version_id and v.case_id=p_case_id and v.category=r.category and v.status='approved' and v.superseded_at is null and i.instrument_type='power_of_attorney')) then raise exception 'A current approved power of attorney version is required' using errcode='22023';end if;
 insert into public.legal_representations values(r.*) returning * into r;
 perform public._ir_touch(p_case_id);perform public._legal_record_event(p_case_id,'representation_changed','Representação registrada para revisão.',jsonb_build_object('representation_id',r.id,'status','draft'));return r;
end;$$;

create or replace function public.legal_activate_representation(p_representation_id uuid,p_review_note text)
returns public.legal_representations language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_representations;
begin
 select * into r from public.legal_representations where id=p_representation_id;
 if not found then raise exception 'Representation access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(r.case_id,r.category,true);
 select * into r from public.legal_representations where id=p_representation_id for update;
 if r.status<>'draft' or length(btrim(coalesce(p_review_note,'')))=0 or length(p_review_note)>4000 or (r.valid_until is not null and r.valid_until<=clock_timestamp()) then raise exception 'Representation approval requires a current draft and review note' using errcode='22023';end if;
 perform public._ir_document(r.case_id,r.evidence_document_id,r.category);
 if r.instrument_version_id is not null and not exists(select 1 from public.legal_instrument_versions v join public.legal_instruments i on i.id=v.instrument_id where v.id=r.instrument_version_id and v.case_id=r.case_id and v.category=r.category and v.status='approved' and v.superseded_at is null and i.instrument_type='power_of_attorney') then raise exception 'Power of attorney version is not current and approved' using errcode='22023';end if;
 update public.legal_representations set status='active',approved_by=auth.uid(),approved_at=now(),approval_note=p_review_note where id=r.id returning * into r;
 perform public._ir_touch(r.case_id);perform public._legal_record_event(r.case_id,'representation_changed','Representação aprovada pelo responsável; sem autenticação automática da pessoa.',jsonb_build_object('representation_id',r.id,'status','active'));return r;
end;$$;

create or replace function public.legal_revoke_representation(p_representation_id uuid,p_reason text)
returns public.legal_representations language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_representations;
begin
 select * into r from public.legal_representations where id=p_representation_id;
 if not found then raise exception 'Representation access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(r.case_id,r.category,true);
 select * into r from public.legal_representations where id=p_representation_id for update;
 if length(btrim(coalesce(p_reason,'')))=0 or length(p_reason)>4000 then raise exception 'Revocation requires a reason' using errcode='22023';end if;
 if r.status='revoked' then return r;end if;
 update public.legal_representations set status='revoked',revoked_by=auth.uid(),revoked_at=now(),revocation_reason=p_reason where id=r.id returning * into r;
 -- Do not lock requests here: public upload and issuance lock request -> case.
 -- Every linked capability checks this state after acquiring the case lock.
 perform public._ir_touch(r.case_id);perform public._legal_record_event(r.case_id,'representation_changed','Representação revogada; coleta vinculada bloqueada.',jsonb_build_object('representation_id',r.id,'status','revoked'));return r;
end;$$;

create or replace function public.legal_set_request_representation(p_request_id uuid,p_representation_id uuid)
returns public.legal_document_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;m public.legal_representations;
begin
 select * into r from public.legal_document_requests where id=p_request_id for update;
 if not found then raise exception 'Request access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(r.case_id,r.category,true);
 if r.status not in ('open','rejected') then raise exception 'Only a pending request may change representation' using errcode='22023';end if;
 if p_representation_id is not null then
  select * into m from public.legal_representations where id=p_representation_id and case_id=r.case_id;
  if not found or not public.legal_can_access_category(r.case_id,m.category) or not public._ir_representation_allows(m.id,r.case_id) then raise exception 'Active representation from this case required' using errcode='42501';end if;
 end if;
 update public.legal_document_requests set representation_id=p_representation_id,expires_at=null,used_at=now(),updated_at=now() where id=r.id returning * into r;
 perform public._ir_touch(r.case_id);perform public._legal_record_event(r.case_id,'representation_changed','Vínculo de representação alterado; emita um novo link.',jsonb_build_object('request_id',r.id,'representation_id',p_representation_id));return r;
end;$$;

-- Server-built snapshots record the actual inputs, source references and review
-- trail. Hash comparison also detects F1/F2 changes that do not call _ir_touch.
create or replace function public._ir_build_snapshot(p_case_id uuid,p_proposals jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object(
 'input_revision',coalesce((select input_revision from public.ir_case_controls where case_id=p_case_id),0),
 'payers',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.ir_payers x where case_id=p_case_id),'[]'),
 'income_sources',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.ir_income_sources x where case_id=p_case_id),'[]'),
 'evidence_events',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.ir_evidence_events x where case_id=p_case_id),'[]'),
 'document_reviews',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.ir_document_reviews x where case_id=p_case_id),'[]'),
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'category',x.category,'status',x.status,'sha256',x.sha256) order by x.id) from public.legal_case_documents x where case_id=p_case_id),'[]'),
 'document_requests',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'category',x.category,'status',x.status,'document_id',x.document_id,'reviewed_by',x.reviewed_by,'review_note',x.review_note,'representation_id',x.representation_id) order by x.id) from public.legal_document_requests x where case_id=p_case_id),'[]'),
 'interviews',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.legal_interview_submissions x where case_id=p_case_id),'[]'),
 'checklist_items',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.ir_case_checklist_items x where case_id=p_case_id),'[]'),
 'rule_versions',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.ir_rule_versions x where x.id in(select v::uuid from jsonb_array_elements(p_proposals) j cross join lateral jsonb_array_elements_text(j->'rule_version_ids') v)),'[]'),
 'rule_catalog_heads',coalesce((select jsonb_agg(to_jsonb(h) order by h.rule_key) from (
 select distinct on (x.rule_key) x.rule_key,x.id,x.version_number from public.ir_rule_versions x
 where x.status='approved' and (x.tenant_id,x.rule_key) in(select r.tenant_id,r.rule_key from public.ir_rule_versions r where r.id in(select v::uuid from jsonb_array_elements(p_proposals) j cross join lateral jsonb_array_elements_text(j->'rule_version_ids') v))
 order by x.rule_key,x.version_number desc) h),'[]'),
 'representations',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('effective_status',public._ir_representation_state(x.id)) order by x.id) from public.legal_representations x where case_id=p_case_id),'[]')
 );
$$;

create or replace function public._ir_validate_proposals(p_case_id uuid,p_proposals jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j jsonb;v text;d public.legal_case_documents;e public.ir_evidence_events;n integer;
begin
 if p_proposals is null or jsonb_typeof(p_proposals)<>'array' or jsonb_array_length(p_proposals) not between 1 and 100 or octet_length(p_proposals::text)>200000 then raise exception 'One proposal per income source is required' using errcode='22023';end if;
 select count(*) into n from public.ir_income_sources where case_id=p_case_id;
 if n<>jsonb_array_length(p_proposals) or (select count(distinct x.value->>'source_id') from jsonb_array_elements(p_proposals) x(value))<>n then raise exception 'Every current source must appear once' using errcode='22023';end if;
 for j in select value from jsonb_array_elements(p_proposals) loop
  if jsonb_typeof(j)<>'object' or exists(select 1 from jsonb_object_keys(j) k where k not in ('source_id','proposal','rule_version_ids','evidence_event_ids','document_ids','reasoning','proposed_start_date','start_date_reason')) or coalesce(j->>'proposal','') not in ('needs_review','proposed_applicable','proposed_not_applicable') or length(btrim(coalesce(j->>'reasoning',''))) not between 1 and 4000 then raise exception 'Invalid source proposal' using errcode='22023';end if;
  if not exists(select 1 from public.ir_income_sources where id=(j->>'source_id')::uuid and case_id=p_case_id) then raise exception 'Proposal source must belong to this case' using errcode='22023';end if;
  if jsonb_typeof(j->'rule_version_ids') is distinct from 'array' or jsonb_typeof(j->'evidence_event_ids') is distinct from 'array' or jsonb_typeof(j->'document_ids') is distinct from 'array' then raise exception 'Proposal references must be arrays' using errcode='22023';end if;
  if j->>'proposed_start_date' is not null then
   if j->>'proposed_start_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Proposed date must use YYYY-MM-DD' using errcode='22023';end if;
   perform (j->>'proposed_start_date')::date;
   if length(btrim(coalesce(j->>'start_date_reason',''))) not between 1 and 4000 then raise exception 'A proposed start date requires legal reasoning' using errcode='22023';end if;
  end if;
  if length(coalesce(j->>'start_date_reason',''))>4000 then raise exception 'Start date reasoning too long' using errcode='22023';end if;
  for v in select value from jsonb_array_elements_text(j->'rule_version_ids') loop
   if not exists(select 1 from public.ir_rule_versions where id=v::uuid and tenant_id=public.legal_actual_tenant() and status='approved') then raise exception 'Only human-approved rules from this workspace may be referenced' using errcode='22023';end if;
  end loop;
  for v in select value from jsonb_array_elements_text(j->'evidence_event_ids') loop
   select * into e from public.ir_evidence_events where id=v::uuid and case_id=p_case_id;
   if not found or not public.legal_can_access_category(p_case_id,e.category) or exists(select 1 from public.ir_evidence_events where supersedes_id=e.id) then raise exception 'Evidence must be accessible and belong to this case' using errcode='22023';end if;
  end loop;
  for v in select value from jsonb_array_elements_text(j->'document_ids') loop
   select * into d from public.legal_case_documents where id=v::uuid and case_id=p_case_id and status='ready';
   if not found or not public.legal_can_access_category(p_case_id,d.category) then raise exception 'Document must be ready and accessible in this case' using errcode='22023';end if;
  end loop;
  if j->>'proposal'<>'needs_review' and (jsonb_array_length(j->'rule_version_ids')=0 or jsonb_array_length(j->'document_ids')+jsonb_array_length(j->'evidence_event_ids')=0) then raise exception 'A proposed conclusion requires reviewed sources and evidence' using errcode='22023';end if;
 end loop;
end;$$;

create or replace function public.ir_create_assessment_version(p_case_id uuid,p_source_proposals jsonb,p_strategy text,p_summary text)
returns public.ir_assessment_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_assessment_versions;t uuid:=public._ir_assert_assessment(p_case_id);s jsonb;n integer;
begin
 perform public._ir_validate_proposals(p_case_id,p_source_proposals);
 s:=public._ir_build_snapshot(p_case_id,p_source_proposals);
 select coalesce(max(version_number),0)+1 into n from public.ir_assessment_versions where case_id=p_case_id;
 update public.ir_assessment_versions set status='superseded' where case_id=p_case_id and status<>'superseded';
 insert into public.ir_assessment_versions(tenant_id,case_id,version_number,input_revision,input_hash,snapshot,source_proposals,strategy,summary,created_by)
 values(t,p_case_id,n,(s->>'input_revision')::bigint,encode(sha256(convert_to(s::text,'UTF8')),'hex'),s,p_source_proposals,p_strategy,p_summary,auth.uid()) returning * into r;
 insert into public.ir_case_controls(case_id,tenant_id,workflow_status) values(p_case_id,t,case when exists(select 1 from jsonb_array_elements(p_source_proposals) j where j->>'proposal'='needs_review') then 'incomplete' else 'proposed' end) on conflict(case_id) do update set workflow_status=excluded.workflow_status,updated_at=now();
 perform public._legal_record_event(p_case_id,'ir_assessment_changed','Proposta de análise criada para revisão humana.',jsonb_build_object('assessment_id',r.id,'version_number',n,'status','draft'));return r;
end;$$;

create or replace function public.ir_submit_assessment_review(p_version_id uuid)
returns public.ir_assessment_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_assessment_versions;
begin
 select * into r from public.ir_assessment_versions where id=p_version_id;
 if not found then raise exception 'Assessment access denied' using errcode='42501';end if;
 perform public._ir_assert_assessment(r.case_id);
 select * into r from public.ir_assessment_versions where id=p_version_id for update;
 if r.status<>'draft' or r.input_hash<>encode(sha256(convert_to(public._ir_build_snapshot(r.case_id,r.source_proposals)::text,'UTF8')),'hex') then raise exception 'Assessment changed or is stale; create a new version' using errcode='22023';end if;
 update public.ir_assessment_versions set status='in_review' where id=r.id returning * into r;
 update public.ir_case_controls set workflow_status='in_legal_review',updated_at=now() where case_id=r.case_id;
 perform public._legal_record_event(r.case_id,'ir_assessment_changed','Proposta enviada à revisão do responsável.',jsonb_build_object('assessment_id',r.id,'status','in_review'));return r;
end;$$;

create or replace function public.ir_review_assessment(p_version_id uuid,p_decision text,p_note text)
returns public.ir_assessment_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ir_assessment_versions;
begin
 select * into r from public.ir_assessment_versions where id=p_version_id;
 if not found then raise exception 'Assessment access denied' using errcode='42501';end if;
 perform public._ir_assert_assessment(r.case_id,true);
 select * into r from public.ir_assessment_versions where id=p_version_id for update;
 if p_decision is null or p_decision not in ('approved','returned') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 or r.status<>'in_review' then raise exception 'Assessment decision needs a pending review and a reason' using errcode='22023';end if;
 if r.input_hash<>encode(sha256(convert_to(public._ir_build_snapshot(r.case_id,r.source_proposals)::text,'UTF8')),'hex') then raise exception 'Assessment is stale; create a new version' using errcode='22023';end if;
 if p_decision='approved' and exists(select 1 from jsonb_array_elements(r.source_proposals) j where j->>'proposal'='needs_review') then raise exception 'Every source requires an explicit reviewed proposal before approval' using errcode='22023';end if;
 insert into public.ir_assessment_reviews(tenant_id,case_id,version_id,decision,note,reviewer_id) values(r.tenant_id,r.case_id,r.id,p_decision,p_note,auth.uid());
 update public.ir_assessment_versions set status=case when p_decision='approved' then 'approved' else 'draft' end,reviewer_id=auth.uid(),reviewed_at=now(),review_note=p_note where id=r.id returning * into r;
 update public.ir_case_controls set workflow_status=case when p_decision='approved' then 'decision_recorded' when exists(select 1 from jsonb_array_elements(r.source_proposals) j where j->>'proposal'='needs_review') then 'incomplete' else 'proposed' end,updated_at=now() where case_id=r.case_id;
 perform public._legal_record_event(r.case_id,'ir_assessment_changed','Revisão jurídica registrada; não representa deferimento externo.',jsonb_build_object('assessment_id',r.id,'decision',p_decision));return r;
end;$$;

create or replace function public.ir_get_case_context(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare c jsonb;r public.ir_assessment_versions;both_access boolean;current_snapshot boolean;
begin
 if not public.legal_can_access_case(p_case_id) then raise exception 'Case access denied' using errcode='42501';end if;
 select to_jsonb(x) into c from public.ir_case_controls x where case_id=p_case_id;
 if c is null then c:=jsonb_build_object('case_id',p_case_id,'tenant_id',public.legal_actual_tenant(),'input_revision',0,'workflow_status','incomplete','updated_at',null);end if;
 both_access:=public.ir_can_access_assessment(p_case_id);
 if both_access then
  select * into r from public.ir_assessment_versions where case_id=p_case_id order by version_number desc limit 1;
  if found then current_snapshot:=r.input_hash=encode(sha256(convert_to(public._ir_build_snapshot(p_case_id,r.source_proposals)::text,'UTF8')),'hex');end if;
 end if;
 return jsonb_build_object('control',c,'can_fiscal',public.legal_can_access_category(p_case_id,'fiscal'),'can_medical',public.legal_can_access_category(p_case_id,'medical'),'can_assess',both_access,
 'latest_assessment_id',r.id,'assessment_is_current',current_snapshot,
 'checklist_states',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'document_request_id',i.document_request_id,'state',case when i.waived_by is not null then 'waived' when q.id is null then 'pending' else q.status end) order by i.created_at,i.id) from public.ir_case_checklist_items i left join public.legal_document_requests q on q.id=i.document_request_id where i.case_id=p_case_id and public.legal_can_access_category(i.case_id,i.category)),'[]'),
 'representation_states',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'effective_status',public._ir_representation_state(x.id)) order by x.created_at,x.id) from public.legal_representations x where x.case_id=p_case_id and public.legal_can_access_category(x.case_id,x.category)),'[]'));
end;$$;

-- F2 capability flow, extended without changing its request/document contract.
create or replace function public.legal_issue_document_request_token(p_request_id uuid,p_token_hash text,p_expires_at timestamptz)
returns public.legal_document_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 select * into r from public.legal_document_requests where id=p_request_id for update;
 if not found then raise exception 'Request access denied' using errcode='42501'; end if;
 perform public._legal_assert_operation(r.case_id,r.category);
 if r.status not in ('open','rejected') or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '7 days' or coalesce(p_token_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid request link or expiry' using errcode='22023'; end if;
 if not public._ir_representation_allows(r.representation_id,r.case_id) then raise exception 'Representation no longer authorizes this collection' using errcode='42501';end if;
 if r.representation_id is not null then p_expires_at:=least(p_expires_at,(select valid_until from public.legal_representations where id=r.representation_id));end if;
 -- The active issuer becomes the responsible actor for the delegated upload.
 insert into public.legal_document_request_tokens(request_id,token_hash) values(r.id,p_token_hash)
 on conflict(request_id) do update set token_hash=excluded.token_hash,created_at=now();
 update public.legal_document_requests set created_by=auth.uid(),status='open',document_id=null,expires_at=p_expires_at,used_at=null,updated_at=now() where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'document_request_updated','Link de coleta renovado.',jsonb_build_object('request_id',r.id));return r;
end;$$;

create or replace function public.legal_public_document_request(p_token_hash text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service operation only' using errcode='42501'; end if;
 select d.* into r from public.legal_document_requests d join public.legal_document_request_tokens t on t.request_id=d.id where t.token_hash=p_token_hash;
 if not found or r.status<>'open' or r.used_at is not null or r.expires_at is null or r.expires_at<=clock_timestamp() or not public._legal_actor_can_edit(r.case_id,r.created_by,r.category) or not public._ir_representation_allows(r.representation_id,r.case_id) then raise exception 'Invalid or expired document link' using errcode='42501'; end if;
 return jsonb_build_object('id',r.id,'title','Envio de documento','expires_at',r.expires_at,'max_bytes',10485760);
end;$$;

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
 insert into public.legal_case_documents(id,tenant_id,case_id,category,display_name,file_name,mime_type,size_bytes,storage_path,uploaded_by)
 values(i,r.tenant_id,r.case_id,r.category,r.title,btrim(p_file_name),p_mime_type,p_size_bytes,r.tenant_id::text||'/'||r.case_id::text||'/'||i::text,r.created_by) returning * into d;
 update public.legal_document_requests set status='uploading',document_id=i,used_at=now(),updated_at=now() where id=r.id;
 insert into public.legal_case_events(tenant_id,case_id,actor_id,event_type,description,metadata)
 values(r.tenant_id,r.case_id,r.created_by,'document_prepared','Documento recebido pelo link de coleta; processamento iniciado.',jsonb_build_object('request_id',r.id,'document_id',i,'origin','public_request'));
 return d;
end;$$;

create or replace function public.legal_public_finalize_request_upload(p_token_hash text,p_document_id uuid,p_sha256 text)
returns public.legal_document_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service operation only' using errcode='42501'; end if;
 select q.* into r from public.legal_document_requests q join public.legal_document_request_tokens t on t.request_id=q.id where t.token_hash=p_token_hash for update of q;
 if not found or r.document_id is distinct from p_document_id or r.status not in ('uploading','submitted') or r.expires_at is null or r.expires_at<=clock_timestamp() then raise exception 'Upload request expired or cancelled' using errcode='42501'; end if;
 if (select token_hash from public.legal_document_request_tokens where request_id=r.id) is distinct from p_token_hash then raise exception 'Document link was rotated' using errcode='42501'; end if;
 perform public.legal_finalize_document(p_document_id,p_sha256);
 -- Finalizer holds the case lock: a concurrent representation revocation is
 -- now visible; failure rolls back document finalization and its audit too.
 if r.expires_at<=clock_timestamp() or not public._ir_representation_allows(r.representation_id,r.case_id) then raise exception 'Link expired or representation no longer authorizes this collection' using errcode='42501';end if;
 if r.status='submitted' then return r; end if;
 update public.legal_document_requests set status='submitted',updated_at=now() where id=r.id returning * into r;
 insert into public.legal_case_events(tenant_id,case_id,actor_id,event_type,description,metadata)
 values(r.tenant_id,r.case_id,r.created_by,'document_request_updated','Documento enviado pelo link de coleta.',jsonb_build_object('request_id',r.id,'document_id',p_document_id,'origin','public_request'));
 return r;
end;$$;


-- No authenticated or service direct writes. Narrow definer functions are the
-- only mutators; sensitive snapshots require both independent category grants.
do $$
declare t text;
begin
 foreach t in array array['ir_case_controls','ir_payers','ir_income_sources','ir_fact_revisions','ir_evidence_events','ir_document_reviews','ir_rule_versions','ir_checklist_template_versions','ir_case_checklist_items','ir_assessment_versions','ir_assessment_reviews','legal_representations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated,service_role',t);
 end loop;
 foreach t in array array['ir_payers','ir_income_sources','ir_fact_revisions'] loop
  execute format('create policy %I on public.%I for select to authenticated using(public.legal_can_access_category(case_id,''fiscal''))',t||'_read',t);
 end loop;
 foreach t in array array['ir_evidence_events','ir_document_reviews','ir_case_checklist_items','legal_representations'] loop
  execute format('create policy %I on public.%I for select to authenticated using(public.legal_can_access_category(case_id,category))',t||'_read',t);
 end loop;
 foreach t in array array['ir_assessment_versions','ir_assessment_reviews'] loop
  execute format('create policy %I on public.%I for select to authenticated using(public.ir_can_access_assessment(case_id))',t||'_read',t);
 end loop;
 foreach t in array array['ir_rule_versions','ir_checklist_template_versions'] loop
  execute format('create policy %I on public.%I for select to authenticated using(tenant_id=public.legal_actual_tenant() and public.legal_feature_enabled())',t||'_read',t);
 end loop;
 foreach t in array array['ir_payers','ir_income_sources','ir_fact_revisions','ir_evidence_events','ir_document_reviews','ir_case_checklist_items','ir_assessment_versions','ir_assessment_reviews','legal_representations'] loop
  execute format('create index %I on public.%I(tenant_id,case_id)',t||'_case_idx',t);
 end loop;
end;$$;
create policy ir_case_controls_read on public.ir_case_controls for select to authenticated using(public.legal_can_access_case(case_id));
create index legal_requests_representation_idx on public.legal_document_requests(representation_id) where representation_id is not null;

do $$
declare f record;
begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'ir\_%' escape '\' or p.proname like '\_ir\_%' escape '\' or p.proname=any(array['legal_create_representation','legal_activate_representation','legal_revoke_representation','legal_set_request_representation','legal_issue_document_request_token','legal_public_document_request','legal_public_prepare_request_upload','legal_public_finalize_request_upload'])) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname like 'legal_public_%' then execute format('grant execute on function %s to service_role',f.signature);
  elsif f.proname not like '\_ir\_%' escape '\' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;
select pg_notify('pgrst','reload schema');
