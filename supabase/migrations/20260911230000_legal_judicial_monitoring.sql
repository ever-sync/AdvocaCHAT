-- F6: permission-gated judicial ingestion and human distribution. No external activation or approved seeds.
create unique index if not exists judicial_proceedings_f6_reference on public.judicial_proceedings(id,case_id,tenant_id);
create unique index if not exists legal_case_tasks_f6_reference on public.legal_case_tasks(id,case_id,tenant_id);

create or replace function public._legal_judicial_payload(p_payload jsonb,p_keys text[]) returns void language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where not(k=any(p_keys))) then raise exception 'Unsupported judicial payload' using errcode='22023';end if;
end;$$;
create or replace function public._legal_judicial_date(p_value text) returns date language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$declare d date;begin
 if p_value is null or p_value='' then return null;end if;if p_value !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'ISO civil date required' using errcode='22023';end if;
 begin d:=p_value::date;exception when others then raise exception 'Invalid civil date' using errcode='22023';end;if not isfinite(d) then raise exception 'Finite civil date required' using errcode='22023';end if;return d;
end;$$;
create or replace function public._legal_judicial_timestamp(p_value text) returns timestamptz language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$declare d timestamptz;begin
 if p_value is null or p_value='' then return null;end if;if p_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Timestamp with explicit offset required' using errcode='22023';end if;
 begin d:=p_value::timestamptz;exception when others then raise exception 'Invalid timestamp' using errcode='22023';end;if not isfinite(d) then raise exception 'Finite timestamp required' using errcode='22023';end if;return d;
end;$$;
create or replace function public._legal_judicial_admin(p_actor_id uuid default auth.uid()) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.profiles p join public.legal_workspace_features w on w.tenant_id=p.tenant_id and w.enabled where p.id=p_actor_id and p.status='active' and p.role='admin' and (p_actor_id is distinct from auth.uid() or p.tenant_id=public.legal_actual_tenant()));
$$;
create or replace function public.legal_judicial_is_admin() returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$select public._legal_judicial_admin();$$;
create or replace function public.legal_judicial_can_access(p_case_id uuid,p_category text) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select public.legal_can_access_case(p_case_id) and case when p_category='restricted' then public.legal_can_access_category(p_case_id,'medical') and public.legal_can_access_category(p_case_id,'fiscal') else public.legal_can_access_category(p_case_id,p_category) end;
$$;
create or replace function public._legal_judicial_assert(p_case_id uuid,p_category text default 'restricted',p_owner boolean default false) returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare t uuid;begin
 t:=public._legal_assert_operation(p_case_id,'general',p_owner);if not public.legal_judicial_can_access(p_case_id,p_category) then raise exception 'Judicial category access denied' using errcode='42501';end if;return t;
end;$$;
create or replace function public._legal_judicial_actor(p_case_id uuid,p_actor_id uuid,p_category text default 'restricted') returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select case when p_category='restricted' then public._legal_actor_can_edit(p_case_id,p_actor_id,'medical') and public._legal_actor_can_edit(p_case_id,p_actor_id,'fiscal') else public._legal_actor_can_edit(p_case_id,p_actor_id,p_category) end;
$$;
create or replace function public._legal_judicial_document(p_case_id uuid,p_document_id uuid,p_category text default 'restricted') returns public.legal_case_documents language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare d public.legal_case_documents;begin
 select * into d from public.legal_case_documents where id=p_document_id and case_id=p_case_id and status='ready';
 if not found or not public.legal_can_access_category(p_case_id,d.category) or (p_category<>'restricted' and d.category not in ('general',p_category)) then raise exception 'Ready evidence in the same case and category required' using errcode='42501';end if;return d;
end;$$;

create table public.legal_judicial_source_versions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),provider text not null check(provider in ('manual','escavador','datajud')),
 source_key text not null check(length(btrim(source_key)) between 1 and 80),version_number integer not null check(version_number>0),title text not null check(length(btrim(title)) between 1 and 200),
 api_version text not null default '' check(length(api_version)<=100),documentation_url text not null default '' check(length(documentation_url)<=2000),checked_on date check(isfinite(checked_on)),terms_version text not null default '' check(length(terms_version)<=300),
 permission_document_id uuid references public.legal_case_documents(id),allowed_operations text[] not null default '{}',valid_from date check(isfinite(valid_from)),valid_until date check(isfinite(valid_until)),scope jsonb not null default '{}',limitations text not null default '' check(length(limitations)<=4000),
 state text not null default 'draft' check(state in ('draft','approved','rejected','revoked')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text not null default '' check(length(review_note)<=4000),
 unique(id,tenant_id),unique(tenant_id,source_key,version_number),check(valid_until is null or valid_from is null or valid_until>=valid_from),check(allowed_operations<@array['consult_cnj','discover_oab','monitor_process','monitor_diary','read_updates','reconcile_monitor']::text[])
);
create table public.legal_judicial_connections(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),provider text not null check(provider in ('escavador','datajud')),account_id text not null check(length(btrim(account_id)) between 1 and 200),environment text not null check(environment in ('production','sandbox')),source_version_id uuid not null,
 enabled boolean not null default false,state text not null default 'not_configured' check(state in ('permission_pending','not_configured','disabled','active','degraded','rate_limited','quota_exhausted','coverage_unknown')),limits jsonb not null,
 last_success_at timestamptz,last_error_code text,created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 minute_window timestamptz,minute_requests integer not null default 0,day_window date,day_requests integer not null default 0,
 unique(id,tenant_id),unique(provider,account_id),foreign key(source_version_id,tenant_id) references public.legal_judicial_source_versions(id,tenant_id)
);
create table public.legal_judicial_coverages(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,connection_id uuid not null,scope jsonb not null,capability text not null check(capability in ('consult_cnj','discover_oab','monitor_process','monitor_diary','read_updates','reconcile_monitor')),
 coverage_start_on date check(isfinite(coverage_start_on)),expected_interval_minutes integer not null check(expected_interval_minutes between 1 and 525600),tolerated_delay_minutes integer not null check(tolerated_delay_minutes between 0 and 525600),
 state text not null default 'unknown' check(state in ('unknown','verified','degraded','interrupted')),review_note text not null check(length(btrim(review_note)) between 1 and 4000),reviewed_by uuid not null references public.profiles(id),reviewed_at timestamptz not null default clock_timestamp(),last_capture_at timestamptz,
 foreign key(connection_id,tenant_id) references public.legal_judicial_connections(id,tenant_id),unique(id,tenant_id)
);
create table public.legal_judicial_jobs(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid,proceeding_id uuid,connection_id uuid not null,operation text not null check(operation in ('consult_cnj','discover_oab','monitor_process','monitor_diary','read_updates','reconcile_monitor')),query jsonb not null,
 state text not null default 'queued' check(state in ('queued','sending','retry_wait','succeeded','failed','unknown','cancelled','permission_pending','not_configured','quota_exhausted')),attempts integer not null default 0 check(attempts between 0 and 3),request_count integer not null default 0,max_requests integer not null check(max_requests between 1 and 5),budget_units integer not null check(budget_units between 0 and 100000),authorization_note text not null check(length(btrim(authorization_note)) between 1 and 4000),
 idempotency_key uuid not null,payload_hash text not null,next_attempt_at timestamptz not null default clock_timestamp(),provider_monitor_id text,monitor_kind text,result_summary jsonb not null default '{}',lease_token uuid,lease_until timestamptz,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 foreign key(connection_id,tenant_id) references public.legal_judicial_connections(id,tenant_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id),foreign key(proceeding_id,case_id,tenant_id) references public.judicial_proceedings(id,case_id,tenant_id),unique(tenant_id,idempotency_key),unique(id,tenant_id),check(proceeding_id is null or case_id is not null),check(request_count between 0 and max_requests)
);
create index legal_judicial_jobs_claim on public.legal_judicial_jobs(connection_id,state,next_attempt_at);
create table public.legal_judicial_originals(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),original_text text not null check(octet_length(original_text) between 1 and 1048576),content_type text not null default 'text/plain' check(content_type in ('text/plain','application/json')),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),created_at timestamptz not null default clock_timestamp(),unique(id,tenant_id)
);
create table public.legal_judicial_inbox(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid,connection_id uuid,provider text not null check(provider in ('manual','escavador','datajud')),provider_event_id text not null check(length(provider_event_id) between 1 and 200),version_number integer not null check(version_number>0),original_id uuid not null,original_sha256 text not null,parser_version text not null check(length(btrim(parser_version)) between 1 and 100),event_type text not null check(length(btrim(event_type)) between 1 and 100),title text not null default 'Entrada judicial para conferir' check(length(btrim(title)) between 1 and 200),
 extracted_from_inbox_id uuid,category text not null default 'restricted' check(category in ('general','medical','fiscal','restricted')),candidates jsonb not null default '[]',provider_monitor_ids text[] not null default '{}',
 source_updated_at timestamptz,decision_signed_at timestamptz,made_available_on date,published_on date,communication_sent_at timestamptz,provider_received_at timestamptz,source_consulted_at timestamptz,awareness_effective_on date,temporal_notes text not null default '' check(length(temporal_notes)<=4000),captured_at timestamptz not null default clock_timestamp(),
 association_state text not null default 'unmatched' check(association_state in ('unmatched','ambiguous','confirmed','rejected','quarantined')),quarantine_reason text,proceeding_id uuid,evidence_document_id uuid,revision integer not null default 1,review_note text not null default '' check(length(review_note)<=4000),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,created_by uuid references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id),foreign key(connection_id,tenant_id) references public.legal_judicial_connections(id,tenant_id),foreign key(original_id,tenant_id) references public.legal_judicial_originals(id,tenant_id),foreign key(proceeding_id,case_id,tenant_id) references public.judicial_proceedings(id,case_id,tenant_id),foreign key(evidence_document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id),unique(id,case_id,tenant_id),unique(id,tenant_id),
 check(provider='manual' or category='restricted'),check(association_state<>'confirmed' or (case_id is not null and proceeding_id is not null and evidence_document_id is not null)),check(isfinite(source_updated_at) and isfinite(decision_signed_at) and isfinite(made_available_on) and isfinite(published_on) and isfinite(communication_sent_at) and isfinite(provider_received_at) and isfinite(source_consulted_at) and isfinite(awareness_effective_on))
);
alter table public.legal_judicial_inbox add constraint legal_judicial_extract_reference foreign key(extracted_from_inbox_id,tenant_id) references public.legal_judicial_inbox(id,tenant_id);
create unique index legal_judicial_external_dedup on public.legal_judicial_inbox(connection_id,provider_event_id,original_sha256) where connection_id is not null;
create index legal_judicial_inbox_case on public.legal_judicial_inbox(case_id,source_updated_at desc,captured_at desc);
create table public.legal_judicial_association_reviews(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,inbox_id uuid not null,case_id uuid not null,proceeding_id uuid,decision text not null,revision integer not null,evidence_document_id uuid,note text not null,reviewed_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),foreign key(inbox_id,tenant_id) references public.legal_judicial_inbox(id,tenant_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id)
);
create table public.legal_judicial_triage(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,inbox_id uuid not null unique,assignee_id uuid not null,substitute_id uuid,state text not null default 'pending' check(state in ('pending','accepted','completed','cancelled')),internal_received_at timestamptz not null default clock_timestamp(),accepted_at timestamptz,due_at timestamptz check(isfinite(due_at)),task_id uuid not null,note text not null check(length(btrim(note)) between 1 and 2000),revision integer not null default 1,created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(inbox_id,case_id,tenant_id) references public.legal_judicial_inbox(id,case_id,tenant_id),foreign key(task_id,case_id,tenant_id) references public.legal_case_tasks(id,case_id,tenant_id),foreign key(assignee_id,tenant_id) references public.profiles(id,tenant_id),foreign key(substitute_id,tenant_id) references public.profiles(id,tenant_id),check(substitute_id is null or substitute_id<>assignee_id)
);
create table public.legal_judicial_task_links(
 task_id uuid primary key,tenant_id uuid not null,case_id uuid not null,category text not null check(category in ('general','medical','fiscal','restricted')),reference_kind text not null check(reference_kind in ('triage','deadline_check','deadline_reviewed')),reference_id uuid not null,
 foreign key(task_id,case_id,tenant_id) references public.legal_case_tasks(id,case_id,tenant_id)
);
create table public.legal_judicial_audit(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),case_id uuid,category text not null default 'restricted',actor_id uuid references public.profiles(id),event_type text not null,metadata jsonb not null default '{}',created_at timestamptz not null default clock_timestamp(),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id)
);
create or replace function public._legal_judicial_event(p_tenant_id uuid,p_case_id uuid,p_type text,p_metadata jsonb default '{}',p_actor_id uuid default auth.uid(),p_category text default 'restricted') returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 insert into public.legal_judicial_audit(tenant_id,case_id,actor_id,event_type,metadata,category) values(p_tenant_id,p_case_id,p_actor_id,p_type,p_metadata,p_category);
end;$$;
create or replace function public._legal_judicial_job_projection(p_job public.legal_judicial_jobs) returns jsonb language sql immutable set search_path=pg_catalog,public,pg_temp as $$select to_jsonb(p_job)-array['lease_token','lease_until','payload_hash'];$$;
create or replace function public._legal_judicial_connection_projection(p_connection public.legal_judicial_connections) returns jsonb language sql immutable set search_path=pg_catalog,public,pg_temp as $$select to_jsonb(p_connection)-array['minute_window','minute_requests','day_window','day_requests'];$$;

create or replace function public.legal_judicial_create_source_version(p_payload jsonb) returns public.legal_judicial_source_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_source_versions;t uuid:=public.legal_actual_tenant();begin
 if not public._legal_judicial_admin() then raise exception 'Source administration required' using errcode='42501';end if;
 perform public._legal_judicial_payload(p_payload,array['provider','source_key','title','api_version','documentation_url','checked_on','terms_version','permission_document_id','allowed_operations','valid_from','valid_until','scope','limitations']);
 perform pg_advisory_xact_lock(hashtextextended('legal_judicial_catalog:'||t,0));if not public._legal_judicial_admin() or t is distinct from public.legal_actual_tenant() then raise exception 'Source administration revoked' using errcode='42501';end if;
 r.id:=gen_random_uuid();r.tenant_id:=t;r.created_by:=auth.uid();r.created_at:=clock_timestamp();r.state:='draft';r.review_note:='';r.api_version:='';r.documentation_url:='';r.terms_version:='';r.scope:='{}';r.allowed_operations:='{}';r.limitations:='';r:=jsonb_populate_record(r,p_payload);
 r.checked_on:=public._legal_judicial_date(p_payload->>'checked_on');r.valid_from:=public._legal_judicial_date(p_payload->>'valid_from');r.valid_until:=public._legal_judicial_date(p_payload->>'valid_until');
 select coalesce(max(version_number),0)+1 into r.version_number from public.legal_judicial_source_versions where tenant_id=t and source_key=r.source_key;
 if jsonb_typeof(r.scope)<>'object' or octet_length(r.scope::text)>16000 then raise exception 'Bounded source scope required' using errcode='22023';end if;
 if r.permission_document_id is not null and not exists(select 1 from public.legal_case_documents d where d.id=r.permission_document_id and d.tenant_id=t and d.category='general' and d.status='ready' and public.legal_can_access_case(d.case_id)) then raise exception 'Accessible general permission proof required' using errcode='42501';end if;
 insert into public.legal_judicial_source_versions values(r.*) returning * into r;perform public._legal_judicial_event(t,null,'source_drafted',jsonb_build_object('version_id',r.id));return r;
end;$$;
create or replace function public.legal_judicial_review_source(p_version_id uuid,p_decision text,p_note text) returns public.legal_judicial_source_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_source_versions;t uuid:=public.legal_actual_tenant();begin
 if not public._legal_judicial_admin() then raise exception 'Source administration required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('legal_judicial_catalog:'||t,0));if not public._legal_judicial_admin() or t is distinct from public.legal_actual_tenant() then raise exception 'Source administration revoked' using errcode='42501';end if;select * into r from public.legal_judicial_source_versions where id=p_version_id and tenant_id=t for update;if not found then raise exception 'Source access denied' using errcode='42501';end if;
 if p_decision not in ('approved','rejected','revoked') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 or (p_decision='revoked' and r.state<>'approved') or (p_decision<>'revoked' and r.state<>'draft') then raise exception 'Draft review or explicit approved-source revocation required' using errcode='22023';end if;
 if p_decision='approved' and (r.valid_from is null or r.valid_until is null or r.checked_on is null or r.checked_on>public._ir4_today() or r.documentation_url !~ '^https://[^[:space:]]+$' or length(btrim(r.terms_version))=0 or length(btrim(r.api_version))=0 or cardinality(r.allowed_operations)=0 or r.scope='{}'::jsonb or length(btrim(r.limitations))=0 or not exists(select 1 from public.legal_case_documents d where d.id=r.permission_document_id and d.tenant_id=t and d.status='ready' and d.category='general' and public.legal_can_access_case(d.case_id))) then raise exception 'Approval requires accessible permission proof, terms, finite validity, scope and checked documentation' using errcode='22023';end if;
 update public.legal_judicial_source_versions set state=p_decision,review_note=btrim(p_note),reviewed_by=auth.uid(),reviewed_at=clock_timestamp() where id=r.id returning * into r;
 perform public._legal_judicial_event(t,null,'source_reviewed',jsonb_build_object('version_id',r.id,'decision',p_decision));return r;
end;$$;
create or replace function public._legal_judicial_source_allowed(p_source_id uuid,p_operation text) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.legal_judicial_source_versions s join public.profiles p on p.id=s.reviewed_by and p.tenant_id=s.tenant_id and p.status='active' and p.role='admin' join public.legal_case_documents d on d.id=s.permission_document_id and d.tenant_id=s.tenant_id and d.status='ready' and d.category='general'
 where s.id=p_source_id and exists(select 1 from public.legal_cases proof_case where proof_case.id=d.case_id and proof_case.tenant_id=s.tenant_id and (proof_case.owner_id=p.id or exists(select 1 from public.legal_case_members member where member.case_id=proof_case.id and member.profile_id=p.id))) and s.provider='escavador' and s.state='approved' and (clock_timestamp() at time zone 'America/Sao_Paulo')::date between s.valid_from and s.valid_until and p_operation=any(s.allowed_operations) and not exists(select 1 from public.legal_judicial_source_versions newer where newer.tenant_id=s.tenant_id and newer.source_key=s.source_key and newer.state='approved' and newer.version_number>s.version_number));
$$;
create or replace function public.legal_judicial_service_configure(p_actor_id uuid,p_expected_tenant_id uuid,p_account_id text,p_source_version_id uuid,p_enabled boolean,p_limits jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare s public.legal_judicial_source_versions;c public.legal_judicial_connections;begin
 perform public._legal_portal_service();perform public._legal_judicial_payload(p_limits,array['environment','requests_per_minute','requests_per_day']);
 if not public._legal_judicial_admin(p_actor_id) or p_expected_tenant_id is null or not exists(select 1 from public.profiles where id=p_actor_id and tenant_id=p_expected_tenant_id and status='active') then raise exception 'Server-owned tenant binding and active administrator required' using errcode='42501';end if;
 select * into s from public.legal_judicial_source_versions where id=p_source_version_id and tenant_id=p_expected_tenant_id;
 if not found or s.provider not in ('escavador','datajud') or p_enabled is null or coalesce(length(btrim(p_account_id)),0) not between 1 and 200 or p_limits->>'environment' not in ('production','sandbox') or (p_limits->>'requests_per_minute')::integer not between 1 and 120 or (p_limits->>'requests_per_day')::integer not between 1 and 10000 or not(p_limits ?& array['environment','requests_per_minute','requests_per_day']) then raise exception 'Valid source, account and bounded limits required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('legal_judicial_account:'||s.provider||':'||p_account_id,0));
 select * into c from public.legal_judicial_connections where provider=s.provider and account_id=p_account_id for update;
 if found and c.tenant_id<>p_expected_tenant_id then raise exception 'Provider account belongs to another tenant binding' using errcode='42501';end if;
 if not public._legal_judicial_admin(p_actor_id) or not exists(select 1 from public.profiles where id=p_actor_id and tenant_id=p_expected_tenant_id and status='active') then raise exception 'Connection administration revoked' using errcode='42501';end if;
 if c.id is null then insert into public.legal_judicial_connections(tenant_id,provider,account_id,environment,source_version_id,enabled,state,limits,created_by) values(p_expected_tenant_id,s.provider,p_account_id,p_limits->>'environment',s.id,p_enabled,case when not p_enabled then 'disabled' when s.provider='datajud' or s.state<>'approved' then 'permission_pending' else 'not_configured' end,p_limits,p_actor_id) returning * into c;
 else update public.legal_judicial_connections set source_version_id=s.id,enabled=p_enabled,limits=p_limits,environment=p_limits->>'environment',state=case when not p_enabled then 'disabled' when s.provider='datajud' or s.state<>'approved' then 'permission_pending' else 'not_configured' end,updated_at=clock_timestamp() where id=c.id returning * into c;end if;
 perform public._legal_judicial_event(c.tenant_id,null,'connection_configured',jsonb_build_object('connection_id',c.id,'enabled',c.enabled),p_actor_id);return public._legal_judicial_connection_projection(c);
end;$$;
create or replace function public.legal_judicial_save_coverage(p_connection_id uuid,p_payload jsonb,p_coverage_id uuid default null) returns public.legal_judicial_coverages language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare c public.legal_judicial_connections;r public.legal_judicial_coverages;begin
 if not public._legal_judicial_admin() then raise exception 'Coverage administration required' using errcode='42501';end if;
 perform public._legal_judicial_payload(p_payload,array['scope','capability','coverage_start_on','expected_interval_minutes','tolerated_delay_minutes','state','review_note']);select * into c from public.legal_judicial_connections where id=p_connection_id and tenant_id=public.legal_actual_tenant() for update;if not found then raise exception 'Connection access denied' using errcode='42501';end if;
 if not public._legal_judicial_admin() or c.tenant_id is distinct from public.legal_actual_tenant() then raise exception 'Coverage administration revoked' using errcode='42501';end if;
 if p_coverage_id is not null then select * into r from public.legal_judicial_coverages where id=p_coverage_id and connection_id=c.id;if not found then raise exception 'Coverage access denied' using errcode='42501';end if;else r.id:=gen_random_uuid();r.tenant_id:=c.tenant_id;r.connection_id:=c.id;r.state:='unknown';end if;
 r:=jsonb_populate_record(r,p_payload);r.coverage_start_on:=public._legal_judicial_date(p_payload->>'coverage_start_on');r.reviewed_by:=auth.uid();r.reviewed_at:=clock_timestamp();
 if r.scope is null or jsonb_typeof(r.scope)<>'object' or r.scope='{}'::jsonb or octet_length(r.scope::text)>16000 or (r.state='verified' and r.coverage_start_on is null) then raise exception 'Explicit coverage scope and start required' using errcode='22023';end if;
 insert into public.legal_judicial_coverages values(r.*) on conflict(id) do update set scope=excluded.scope,capability=excluded.capability,coverage_start_on=excluded.coverage_start_on,expected_interval_minutes=excluded.expected_interval_minutes,tolerated_delay_minutes=excluded.tolerated_delay_minutes,state=excluded.state,review_note=excluded.review_note,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at returning * into r;
 perform public._legal_judicial_event(c.tenant_id,null,'coverage_reviewed',jsonb_build_object('coverage_id',r.id));return r;
end;$$;
create or replace function public._legal_judicial_query(p_operation text,p_query jsonb) returns void language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$declare element jsonb;begin
 perform public._legal_judicial_payload(p_query,array['cnj','oab_number','oab_state','oab_type','term','origins_ids','variations','limit_appearances','provider_monitor_id','monitor_kind','cursor']);
 if octet_length(p_query::text)>8000 or exists(select 1 from jsonb_each_text(p_query) x where x.value ~* 'https?://') then raise exception 'Bounded provider identifiers without URLs required' using errcode='22023';end if;
 if p_query?'cnj' and not public.legal_valid_cnj(regexp_replace(p_query->>'cnj','\D','','g')) then raise exception 'Valid CNJ required' using errcode='22023';end if;
 if p_operation in ('consult_cnj','read_updates','monitor_process') and not(p_query?'cnj') then raise exception 'CNJ required for selected operation' using errcode='22023';end if;
 if p_operation='discover_oab' and (coalesce(p_query->>'oab_number','') !~ '^[0-9]{1,12}[A-Za-z]?$' or coalesce(p_query->>'oab_state','') !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$' or coalesce(p_query->>'oab_type','') not in ('ADVOGADO','ESTAGIARIO','SUPLEMENTAR','CONSULTOR_ESTRANGEIRO')) then raise exception 'OAB number, state and explicit inscription type required' using errcode='22023';end if;
 if p_operation='reconcile_monitor' and (coalesce(length(p_query->>'provider_monitor_id'),0) not between 1 and 120 or p_query->>'monitor_kind' not in ('process','diary')) then raise exception 'Known monitor ID and kind required for reconciliation' using errcode='22023';end if;
 if p_operation='monitor_diary' then
  if (p_query?'cnj' or coalesce(length(btrim(p_query->>'term')),0) not between 1 and 200) or coalesce((p_query->>'limit_appearances')::integer,0) not between 1 and 10000 then raise exception 'Explicit diary term/process and appearance budget required' using errcode='22023';end if;
  if (jsonb_typeof(p_query->'origins_ids') is distinct from 'array' or jsonb_array_length(p_query->'origins_ids') not between 1 and 20) then raise exception 'Diary term requires bounded explicit origins' using errcode='22023';end if;
 end if;
 if p_query?'origins_ids' then for element in select value from jsonb_array_elements(p_query->'origins_ids') loop if jsonb_typeof(element)<>'number' or element::text !~ '^[1-9][0-9]{0,9}$' or element::text::numeric>2147483647 then raise exception 'Invalid diary origin' using errcode='22023';end if;end loop;end if;
 if p_query?'variations' and (jsonb_typeof(p_query->'variations')<>'array' or jsonb_array_length(p_query->'variations')>3 or exists(select 1 from jsonb_array_elements_text(p_query->'variations') x where length(x) not between 1 and 200)) then raise exception 'Bounded diary variations required' using errcode='22023';end if;
 if p_query?'cursor' then perform public._legal_judicial_payload(p_query->'cursor',array['cursor','li','page']);if octet_length((p_query->'cursor')::text)>1500 then raise exception 'Bounded cursor required' using errcode='22023';end if;end if;
end;$$;
create or replace function public.legal_judicial_enqueue(p_connection_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare c public.legal_judicial_connections;r public.legal_judicial_jobs;old public.legal_judicial_jobs;p public.judicial_proceedings;t uuid:=public.legal_actual_tenant();begin
 perform public._legal_judicial_payload(p_payload,array['case_id','proceeding_id','operation','query','max_requests','budget_units','authorization_note','idempotency_key']);
 r:=jsonb_populate_record(r,p_payload);if r.case_id is not null then perform public._legal_judicial_assert(r.case_id,'restricted',true);else if not public._legal_judicial_admin() then raise exception 'Unassociated discovery requires workspace administrator' using errcode='42501';end if;end if;
 select * into c from public.legal_judicial_connections where id=p_connection_id and tenant_id=t for update;if not found then raise exception 'Connection access denied' using errcode='42501';end if;
 if r.case_id is not null then perform public._legal_judicial_assert(r.case_id,'restricted',true);elsif not public._legal_judicial_admin() or t is distinct from public.legal_actual_tenant() then raise exception 'Discovery administration revoked' using errcode='42501';end if;
 perform public._legal_judicial_query(r.operation,r.query);
 if r.operation='discover_oab' and r.case_id is not null then raise exception 'OAB discovery cannot authorize or associate a case' using errcode='22023';end if;
 if r.case_id is not null then select * into p from public.judicial_proceedings where id=r.proceeding_id and case_id=r.case_id and tenant_id=t;if not found or (r.query?'cnj' and p.cnj_number<>regexp_replace(r.query->>'cnj','\D','','g')) then raise exception 'Same-case proceeding and matching CNJ required' using errcode='22023';end if;end if;
 if r.operation in ('monitor_process','monitor_diary') and (r.budget_units is null or r.budget_units<=0) then raise exception 'Monitor creation requires explicit consumption authorization' using errcode='22023';end if;
 if r.operation='reconcile_monitor' and not exists(select 1 from public.legal_judicial_jobs known where known.connection_id=c.id and known.provider_monitor_id=r.query->>'provider_monitor_id' and known.monitor_kind=r.query->>'monitor_kind' and known.case_id is not distinct from r.case_id) then raise exception 'Monitor must have a verified reference in this workspace and case' using errcode='22023';end if;
 r.payload_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');select * into old from public.legal_judicial_jobs where tenant_id=t and idempotency_key=r.idempotency_key;
 if found then if old.payload_hash<>r.payload_hash or old.connection_id<>c.id then raise exception 'Judicial job idempotency payload mismatch' using errcode='22023';end if;return public._legal_judicial_job_projection(old);end if;
 r.id:=gen_random_uuid();r.tenant_id:=t;r.connection_id:=c.id;r.state:=case when not c.enabled then 'not_configured' when not public._legal_judicial_source_allowed(c.source_version_id,r.operation) then 'permission_pending' else 'queued' end;r.attempts:=0;r.request_count:=0;r.next_attempt_at:=clock_timestamp();r.result_summary:='{}';r.created_by:=auth.uid();r.created_at:=clock_timestamp();r.updated_at:=clock_timestamp();
 insert into public.legal_judicial_jobs values(r.*) returning * into r;perform public._legal_judicial_event(t,r.case_id,'job_authorized',jsonb_build_object('job_id',r.id,'operation',r.operation));return public._legal_judicial_job_projection(r);
end;$$;

create or replace function public._legal_judicial_lock_job(p_job_id uuid) returns public.legal_judicial_jobs language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_jobs;begin
 select * into r from public.legal_judicial_jobs where id=p_job_id;if not found then raise exception 'Judicial job unavailable' using errcode='42501';end if;
 if r.case_id is not null then perform 1 from public.legal_cases where id=r.case_id for update;end if;
 select * into r from public.legal_judicial_jobs where id=p_job_id for update;return r;
end;$$;
create or replace function public._legal_judicial_job_actor(p_job public.legal_judicial_jobs) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select case when p_job.case_id is null then public._legal_judicial_admin(p_job.created_by) and exists(select 1 from public.profiles where id=p_job.created_by and tenant_id=p_job.tenant_id) else public._legal_judicial_actor(p_job.case_id,p_job.created_by) and exists(select 1 from public.legal_cases where id=p_job.case_id and owner_id=p_job.created_by) end;
$$;
create or replace function public.legal_judicial_retry_job(p_job_id uuid,p_note text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_jobs;begin
 r:=public._legal_judicial_lock_job(p_job_id);if r.tenant_id is distinct from public.legal_actual_tenant() then raise exception 'Job access denied' using errcode='42501';end if;
 if r.case_id is null then if not public._legal_judicial_admin() then raise exception 'Discovery administration required' using errcode='42501';end if;else perform public._legal_judicial_assert(r.case_id,'restricted',true);end if;
 if r.operation in ('monitor_process','monitor_diary') or r.state not in ('failed','retry_wait','permission_pending','not_configured','quota_exhausted') or r.attempts>=3 or length(btrim(coalesce(p_note,''))) not between 1 and 2000 then raise exception 'Only bounded safe lookup retry is allowed; monitor ambiguity requires reconciliation' using errcode='22023';end if;
 update public.legal_judicial_jobs set state='queued',next_attempt_at=greatest(next_attempt_at,clock_timestamp()),updated_at=clock_timestamp(),created_by=auth.uid() where id=r.id returning * into r;
 perform public._legal_judicial_event(r.tenant_id,r.case_id,'job_retry_authorized',jsonb_build_object('job_id',r.id));return public._legal_judicial_job_projection(r);
end;$$;
create or replace function public.legal_judicial_cancel_job(p_job_id uuid,p_note text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_jobs;begin
 r:=public._legal_judicial_lock_job(p_job_id);if r.tenant_id is distinct from public.legal_actual_tenant() then raise exception 'Job access denied' using errcode='42501';end if;
 if r.case_id is null then if not public._legal_judicial_admin() then raise exception 'Discovery administration required' using errcode='42501';end if;else perform public._legal_judicial_assert(r.case_id,'restricted',true);end if;
 if r.state in ('sending','unknown','succeeded') or length(btrim(coalesce(p_note,''))) not between 1 and 2000 then raise exception 'Only unsent job may be cancelled; reconcile external state otherwise' using errcode='22023';end if;
 update public.legal_judicial_jobs set state='cancelled',result_summary=result_summary||jsonb_build_object('cancel_note',btrim(p_note)),updated_at=clock_timestamp() where id=r.id returning * into r;
 perform public._legal_judicial_event(r.tenant_id,r.case_id,'job_cancelled',jsonb_build_object('job_id',r.id));return public._legal_judicial_job_projection(r);
end;$$;
create or replace function public._legal_judicial_scope_matches(p_scope jsonb,p_job public.legal_judicial_jobs) returns boolean language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$declare court_name text;query_value jsonb:=p_job.query;operation_value text:=p_job.operation;original public.legal_judicial_jobs;begin
 if p_scope is null or jsonb_typeof(p_scope)<>'object' then return false;end if;
 if operation_value='reconcile_monitor' then select * into original from public.legal_judicial_jobs where connection_id=p_job.connection_id and provider_monitor_id=p_job.query->>'provider_monitor_id' and monitor_kind=p_job.query->>'monitor_kind' and operation in ('monitor_process','monitor_diary') order by created_at desc limit 1;if not found then return false;end if;query_value:=original.query;operation_value:=original.operation;end if;
 if operation_value='discover_oab' then return coalesce(p_scope->>'oab_state'='*' or p_scope->>'oab_state'=query_value->>'oab_state',false);end if;
 if operation_value='monitor_diary' then return jsonb_typeof(p_scope->'origins_ids')='array' and jsonb_typeof(query_value->'origins_ids')='array' and (p_scope->'origins_ids') @> (query_value->'origins_ids');end if;
 select court into court_name from public.judicial_proceedings where id=p_job.proceeding_id and case_id=p_job.case_id;
 return coalesce(p_scope->>'court'='*' or (nullif(court_name,'') is not null and p_scope->>'court'=court_name),false);
end;$$;
create or replace function public._legal_judicial_job_scope(p_job public.legal_judicial_jobs,p_source_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.legal_judicial_source_versions s where s.id=p_source_id and public._legal_judicial_scope_matches(s.scope,p_job)) and exists(select 1 from public.legal_judicial_coverages c join public.profiles reviewer on reviewer.id=c.reviewed_by and reviewer.tenant_id=c.tenant_id and reviewer.status='active' and reviewer.role='admin' where c.connection_id=p_job.connection_id and c.capability=p_job.operation and c.state in ('verified','degraded') and c.coverage_start_on is not null and c.coverage_start_on<=(clock_timestamp() at time zone 'America/Sao_Paulo')::date and public._legal_judicial_scope_matches(c.scope,p_job));
$$;

create or replace function public.legal_judicial_service_claim(p_expected_tenant_id uuid,p_account_id text,p_provider text,p_configured boolean,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_jobs;c public.legal_judicial_connections;result jsonb:='[]';begin
 perform public._legal_portal_service();if p_expected_tenant_id is null or p_account_id is null or p_provider not in ('escavador','datajud') or p_limit not between 1 and 20 then raise exception 'Explicit server connection binding and bounded limit required' using errcode='22023';end if;
 for r in select j.* from public.legal_judicial_jobs j join public.legal_judicial_connections x on x.id=j.connection_id where j.tenant_id=p_expected_tenant_id and x.provider=p_provider and x.account_id=p_account_id and j.state in ('queued','retry_wait','permission_pending','not_configured','sending') and j.next_attempt_at<=clock_timestamp() order by j.created_at,j.id limit p_limit loop
  if r.case_id is not null then perform 1 from public.legal_cases where id=r.case_id for update skip locked;if not found then continue;end if;end if;
  select * into r from public.legal_judicial_jobs where id=r.id for update skip locked;if not found then continue;end if;
  select * into c from public.legal_judicial_connections where id=r.connection_id for update;
  if c.tenant_id is distinct from p_expected_tenant_id or c.provider is distinct from p_provider or c.account_id is distinct from p_account_id then continue;end if;
  if r.state='sending' then
   if r.lease_until<=clock_timestamp() then update public.legal_judicial_jobs set state=case when r.operation in ('monitor_process','monitor_diary') or r.attempts>=3 then 'unknown' else 'retry_wait' end,lease_token=null,lease_until=null,next_attempt_at=clock_timestamp()+interval '60 seconds',result_summary=result_summary||'{"error_code":"lease_expired"}'::jsonb,updated_at=clock_timestamp() where id=r.id;end if;continue;
  end if;
  if r.state not in ('queued','retry_wait','permission_pending','not_configured') or r.attempts>=3 then continue;end if;
  if not public._legal_judicial_job_actor(r) then update public.legal_judicial_jobs set state='failed',result_summary='{"error_code":"review_required"}',updated_at=clock_timestamp() where id=r.id;continue;end if;
  if not public._legal_judicial_source_allowed(c.source_version_id,r.operation) then update public.legal_judicial_jobs set state='permission_pending',updated_at=clock_timestamp() where id=r.id;update public.legal_judicial_connections set state='permission_pending',last_error_code='permission_required' where id=c.id;continue;end if;
  if not public._legal_judicial_job_scope(r,c.source_version_id) then update public.legal_judicial_jobs set state='permission_pending',result_summary=result_summary||'{"error_code":"coverage_required"}'::jsonb,updated_at=clock_timestamp() where id=r.id;update public.legal_judicial_connections set state='coverage_unknown',last_error_code='coverage_required' where id=c.id;continue;end if;
  if not c.enabled or p_configured is distinct from true then update public.legal_judicial_jobs set state='not_configured',updated_at=clock_timestamp() where id=r.id;update public.legal_judicial_connections set state=case when c.enabled then 'not_configured' else 'disabled' end where id=c.id;continue;end if;
  update public.legal_judicial_jobs set state='sending',attempts=attempts+1,request_count=0,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where id=r.id returning * into r;
  result:=result||jsonb_build_array(jsonb_build_object('id',r.id,'lease_token',r.lease_token,'operation',r.operation,'query',r.query,'max_requests',r.max_requests,'request_count',r.request_count,'source_version_id',c.source_version_id,'connection',jsonb_build_object('provider',c.provider,'account_id',c.account_id,'environment',c.environment)));
 end loop;return result;
end;$$;
create or replace function public.legal_judicial_service_authorize_attempt(p_job_id uuid,p_lease_token uuid,p_expected_tenant_id uuid,p_account_id text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_jobs;c public.legal_judicial_connections;reason text;minute_now timestamptz;day_now date;begin
 perform public._legal_portal_service();r:=public._legal_judicial_lock_job(p_job_id);select * into c from public.legal_judicial_connections where id=r.connection_id for update;
 if c.tenant_id is distinct from p_expected_tenant_id or c.account_id is distinct from p_account_id or r.state<>'sending' or r.lease_token is distinct from p_lease_token or p_lease_token is null then raise exception 'Current bound judicial lease required' using errcode='42501';end if;
 minute_now:=date_trunc('minute',clock_timestamp());day_now:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;
 if r.lease_until<=clock_timestamp() then reason:='lease_expired';elsif not public._legal_judicial_job_actor(r) then reason:='review_required';elsif not c.enabled then reason:='disabled';elsif not public._legal_judicial_source_allowed(c.source_version_id,r.operation) then reason:='permission_required';elsif not public._legal_judicial_job_scope(r,c.source_version_id) then reason:='coverage_required';elsif r.request_count>=r.max_requests then reason:='job_request_limit';end if;
 if c.minute_window is distinct from minute_now then c.minute_requests:=0;c.minute_window:=minute_now;end if;if c.day_window is distinct from day_now then c.day_requests:=0;c.day_window:=day_now;end if;
 if reason is null and c.day_requests>=(c.limits->>'requests_per_day')::integer then reason:='daily_quota';elsif reason is null and c.minute_requests>=(c.limits->>'requests_per_minute')::integer then reason:='minute_quota';end if;
 if reason is not null then
  update public.legal_judicial_jobs set state=case when reason in ('permission_required','coverage_required') then 'permission_pending' when reason='daily_quota' then 'quota_exhausted' when reason='minute_quota' and r.operation not in ('monitor_process','monitor_diary') and r.attempts<3 then 'retry_wait' when reason='job_request_limit' then 'succeeded' when reason='lease_expired' and r.operation in ('monitor_process','monitor_diary') then 'unknown' else 'failed' end,lease_token=null,lease_until=null,next_attempt_at=clock_timestamp()+interval '60 seconds',result_summary=result_summary||jsonb_build_object('error_code',reason,'complete',false),updated_at=clock_timestamp() where id=r.id;
  update public.legal_judicial_connections set state=case when reason='daily_quota' then 'quota_exhausted' when reason='minute_quota' then 'rate_limited' when reason='permission_required' then 'permission_pending' when reason='disabled' then 'disabled' when reason='coverage_required' then 'coverage_unknown' else 'degraded' end,last_error_code=reason where id=c.id;
  return jsonb_build_object('allowed',false,'max_response_bytes',1048576,'reason',reason);
 end if;
 update public.legal_judicial_connections set minute_window=c.minute_window,minute_requests=c.minute_requests+1,day_window=c.day_window,day_requests=c.day_requests+1 where id=c.id;
 update public.legal_judicial_jobs set request_count=request_count+1,updated_at=clock_timestamp() where id=r.id;
 return jsonb_build_object('allowed',true,'max_response_bytes',1048576);
end;$$;
create or replace function public.legal_judicial_service_finish(p_job_id uuid,p_lease_token uuid,p_status text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_jobs;c public.legal_judicial_connections;next_state text;begin
 perform public._legal_portal_service();perform public._legal_judicial_payload(p_payload,array['provider_monitor_id','monitor_kind','next_cursor','items_count','error_code']);r:=public._legal_judicial_lock_job(p_job_id);select * into c from public.legal_judicial_connections where id=r.connection_id for update;
 if r.state<>'sending' or r.lease_token is distinct from p_lease_token or p_lease_token is null then raise exception 'Current judicial lease required' using errcode='42501';end if;
 if p_status not in ('succeeded','retryable_error','rate_limited','quota_exhausted','permanent_error','unknown') or octet_length(p_payload::text)>5000 or (p_payload?'error_code' and p_payload->>'error_code' !~ '^[a-zA-Z0-9_:-]{1,100}$') or (p_payload?'items_count' and coalesce((p_payload->>'items_count')::integer,-1) not between 0 and 100000) or (p_payload?'provider_monitor_id' and coalesce(length(p_payload->>'provider_monitor_id'),0) not between 1 and 120) then raise exception 'Bounded normalized completion required' using errcode='22023';end if;
 if p_payload?'next_cursor' then perform public._legal_judicial_payload(p_payload->'next_cursor',array['cursor','li','page']);if octet_length((p_payload->'next_cursor')::text)>1500 or (p_payload->'next_cursor')::text ~* 'https?://' then raise exception 'Cursor cannot contain provider URL' using errcode='22023';end if;end if;
 if p_status='succeeded' and r.operation in ('monitor_process','monitor_diary') and (not(p_payload?'provider_monitor_id') or p_payload->>'monitor_kind' is distinct from case when r.operation='monitor_process' then 'process' else 'diary' end) then raise exception 'Successful monitor creation requires a verified provider ID and kind' using errcode='22023';end if;
 next_state:=case when p_status='succeeded' then 'succeeded' when p_status='unknown' then 'unknown' when p_status='quota_exhausted' then 'quota_exhausted' when p_status='permanent_error' then 'failed' when r.operation in ('monitor_process','monitor_diary') then 'unknown' when r.attempts<3 then 'retry_wait' else 'failed' end;
 update public.legal_judicial_jobs set state=next_state,provider_monitor_id=coalesce(p_payload->>'provider_monitor_id',provider_monitor_id),monitor_kind=coalesce(p_payload->>'monitor_kind',monitor_kind),result_summary=p_payload||jsonb_build_object('complete',p_status='succeeded' and not(p_payload?'next_cursor')),query=case when p_payload?'next_cursor' then query||jsonb_build_object('cursor',p_payload->'next_cursor') else query end,lease_token=null,lease_until=null,next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*(2^r.attempts)::integer)),updated_at=clock_timestamp() where id=r.id returning * into r;
 update public.legal_judicial_connections set last_success_at=case when p_status='succeeded' then clock_timestamp() else last_success_at end,last_error_code=case when p_payload?'next_cursor' then 'pagination_incomplete' else p_payload->>'error_code' end,state=case when not enabled then 'disabled' when p_status='rate_limited' then 'rate_limited' when p_status='quota_exhausted' then 'quota_exhausted' when p_status<>'succeeded' or p_payload?'next_cursor' then 'degraded' when not public._legal_judicial_source_allowed(c.source_version_id,r.operation) then 'permission_pending' when public._legal_judicial_job_scope(r,c.source_version_id) then 'active' else 'coverage_unknown' end,updated_at=clock_timestamp() where id=c.id;
 update public.legal_judicial_coverages set last_capture_at=case when p_status='succeeded' then clock_timestamp() else last_capture_at end,state=case when p_status='quota_exhausted' then 'interrupted' when p_status<>'succeeded' or p_payload?'next_cursor' then 'degraded' when state='degraded' then 'verified' else state end where connection_id=c.id and capability=r.operation;
 perform public._legal_judicial_event(r.tenant_id,r.case_id,'job_finished',jsonb_build_object('job_id',r.id,'state',r.state),r.created_by);return public._legal_judicial_job_projection(r);
end;$$;

create or replace function public._legal_judicial_populate_event(p_row public.legal_judicial_inbox,p_payload jsonb) returns public.legal_judicial_inbox language plpgsql set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_inbox:=p_row;x jsonb;begin
 r:=jsonb_populate_record(r,p_payload-array['original_sha256','original_text','quarantine_reason']);
 r.source_updated_at:=public._legal_judicial_timestamp(p_payload->>'source_updated_at');r.decision_signed_at:=public._legal_judicial_timestamp(p_payload->>'decision_signed_at');r.made_available_on:=public._legal_judicial_date(p_payload->>'made_available_on');r.published_on:=public._legal_judicial_date(p_payload->>'published_on');r.communication_sent_at:=public._legal_judicial_timestamp(p_payload->>'communication_sent_at');r.provider_received_at:=public._legal_judicial_timestamp(p_payload->>'provider_received_at');r.source_consulted_at:=public._legal_judicial_timestamp(p_payload->>'source_consulted_at');r.awareness_effective_on:=public._legal_judicial_date(p_payload->>'awareness_effective_on');
 if jsonb_typeof(r.candidates)<>'array' or jsonb_array_length(r.candidates)>100 or cardinality(r.provider_monitor_ids)>100 or exists(select 1 from unnest(r.provider_monitor_ids) v where length(v) not between 1 and 120) then raise exception 'Bounded event candidates and monitor identifiers required' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(r.candidates) loop perform public._legal_judicial_payload(x,array['cnj','oab_number','oab_state','title']);if octet_length(x::text)>1000 or (x?'cnj' and not public.legal_valid_cnj(regexp_replace(x->>'cnj','\D','','g'))) then raise exception 'Invalid candidate metadata' using errcode='22023';end if;end loop;return r;
end;$$;
create or replace function public.legal_judicial_service_ingest(p_expected_tenant_id uuid,p_account_id text,p_provider text,p_event_id text,p_raw_original text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare c public.legal_judicial_connections;r public.legal_judicial_inbox;old public.legal_judicial_inbox;o public.legal_judicial_originals;digest text;changed boolean;begin
 perform public._legal_portal_service();perform public._legal_judicial_payload(p_payload,array['original_sha256','parser_version','event_type','title','provider_monitor_ids','candidates','source_updated_at','decision_signed_at','made_available_on','published_on','communication_sent_at','provider_received_at','source_consulted_at','awareness_effective_on','temporal_notes','quarantine_reason']);
 if p_expected_tenant_id is null or p_provider<>'escavador' or octet_length(p_raw_original) not between 1 and 1048576 or p_raw_original is null or coalesce(length(p_event_id),0) not between 1 and 200 then raise exception 'Supported bound provider and bounded original required' using errcode='22023';end if;
 digest:=encode(sha256(convert_to(p_raw_original,'UTF8')),'hex');if p_payload->>'original_sha256' is distinct from digest then raise exception 'Original body hash mismatch' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('legal_judicial_ingest:'||p_expected_tenant_id,0));
 select * into c from public.legal_judicial_connections where tenant_id=p_expected_tenant_id and account_id=p_account_id and provider=p_provider for update;
 if not found or not c.enabled or not exists(select 1 from public.legal_judicial_source_versions s where s.id=c.source_version_id and exists(select 1 from unnest(s.allowed_operations) op where public._legal_judicial_source_allowed(s.id,op))) then raise exception 'Current provider permission and server account binding required' using errcode='42501';end if;
 select * into old from public.legal_judicial_inbox where connection_id=c.id and provider_event_id=p_event_id and original_sha256=digest;
 if found then return jsonb_build_object('id',old.id,'status',old.association_state,'duplicate',true,'changed',coalesce(old.quarantine_reason='changed_payload',false));end if;
 if (select coalesce(sum(octet_length(original_text)),0) from public.legal_judicial_originals where tenant_id=c.tenant_id)+octet_length(p_raw_original)>268435456 or (select count(*) from public.legal_judicial_inbox where connection_id=c.id and captured_at>=date_trunc('day',clock_timestamp()))>=least(20000,(c.limits->>'requests_per_day')::integer*20) then raise exception 'Judicial original capacity or daily receipt limit reached' using errcode='22023';end if;
 select * into old from public.legal_judicial_inbox where connection_id=c.id and provider_event_id=p_event_id order by version_number desc limit 1;changed:=found;
 insert into public.legal_judicial_originals(tenant_id,original_text,content_type,sha256) values(c.tenant_id,p_raw_original,'application/json',digest) returning * into o;
 r.id:=gen_random_uuid();r.tenant_id:=c.tenant_id;r.connection_id:=c.id;r.provider:=c.provider;r.provider_event_id:=p_event_id;r.version_number:=coalesce(old.version_number,0)+1;r.original_id:=o.id;r.original_sha256:=digest;r.parser_version:='unknown';r.title:='Entrada judicial para conferir';r.category:='restricted';r.candidates:='[]';r.provider_monitor_ids:='{}';r.temporal_notes:='';r.captured_at:=clock_timestamp();r.created_at:=clock_timestamp();r.review_note:='';r.revision:=1;
 r:=public._legal_judicial_populate_event(r,p_payload);r.category:='restricted';r.case_id:=null;r.proceeding_id:=null;r.evidence_document_id:=null;
 if p_payload?'quarantine_reason' and p_payload->>'quarantine_reason' not in ('missing_event_id','unsupported_event','too_many_monitors') then raise exception 'Normalized quarantine reason required' using errcode='22023';end if;
 r.quarantine_reason:=case when changed then 'changed_payload' else p_payload->>'quarantine_reason' end;r.association_state:=case when r.quarantine_reason is not null then 'quarantined' when jsonb_array_length(r.candidates)>1 then 'ambiguous' else 'unmatched' end;
 insert into public.legal_judicial_inbox values(r.*) returning * into r;perform public._legal_judicial_event(c.tenant_id,null,'original_received',jsonb_build_object('inbox_id',r.id,'changed',changed),null);return jsonb_build_object('id',r.id,'status',r.association_state,'duplicate',false,'changed',changed);
end;$$;
create or replace function public.legal_judicial_record_manual_event(p_case_id uuid,p_payload jsonb) returns public.legal_judicial_inbox language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_inbox;o public.legal_judicial_originals;t uuid;cat text:=coalesce(p_payload->>'category','restricted');begin
 t:=public._legal_judicial_assert(p_case_id,cat,true);perform public._legal_judicial_payload(p_payload,array['title','event_type','category','original_text','extracted_from_inbox_id','evidence_document_id','proceeding_id','parser_version','source_updated_at','decision_signed_at','made_available_on','published_on','communication_sent_at','provider_received_at','source_consulted_at','awareness_effective_on','temporal_notes']);
 perform public._legal_judicial_document(p_case_id,(p_payload->>'evidence_document_id')::uuid,cat);
 if p_payload?'extracted_from_inbox_id' and not exists(select 1 from public.legal_judicial_inbox source where source.id=(p_payload->>'extracted_from_inbox_id')::uuid and source.tenant_id=t and (source.case_id=p_case_id or (source.case_id is null and public._legal_judicial_admin())) and (source.category=cat or cat='restricted')) then raise exception 'Authorized source and preserved category required for a single-case extract' using errcode='42501';end if;
 if not exists(select 1 from public.judicial_proceedings where id=(p_payload->>'proceeding_id')::uuid and case_id=p_case_id) then raise exception 'Same-case proceeding required for a confirmed manual event' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('legal_judicial_ingest:'||t,0));if (select coalesce(sum(octet_length(original_text)),0) from public.legal_judicial_originals where tenant_id=t)+coalesce(octet_length(p_payload->>'original_text'),0)>268435456 then raise exception 'Judicial original tenant capacity reached' using errcode='22023';end if;
 insert into public.legal_judicial_originals(tenant_id,original_text,sha256) values(t,p_payload->>'original_text',encode(sha256(convert_to(p_payload->>'original_text','UTF8')),'hex')) returning * into o;
 r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.provider:='manual';r.provider_event_id:=r.id::text;r.version_number:=1;r.original_id:=o.id;r.original_sha256:=o.sha256;r.category:=cat;r.parser_version:='manual-v1';r.candidates:='[]';r.provider_monitor_ids:='{}';r.temporal_notes:='';r.captured_at:=clock_timestamp();r.created_at:=clock_timestamp();r.created_by:=auth.uid();r.association_state:='confirmed';r.review_note:='Conferência documental manual do responsável.';r.reviewed_by:=auth.uid();r.reviewed_at:=clock_timestamp();r.revision:=1;
 r:=public._legal_judicial_populate_event(r,p_payload);insert into public.legal_judicial_inbox values(r.*) returning * into r;
 insert into public.legal_judicial_association_reviews(tenant_id,inbox_id,case_id,proceeding_id,decision,revision,evidence_document_id,note,reviewed_by) values(t,r.id,p_case_id,r.proceeding_id,'confirmed',r.revision,r.evidence_document_id,r.review_note,auth.uid());
 perform public._legal_judicial_event(t,p_case_id,'manual_event_recorded',jsonb_build_object('inbox_id',r.id),auth.uid(),cat);return r;
end;$$;
create or replace function public.legal_judicial_review_association(p_inbox_id uuid,p_case_id uuid,p_proceeding_id uuid,p_decision text,p_evidence_document_id uuid,p_note text) returns public.legal_judicial_inbox language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_inbox;p public.judicial_proceedings;t uuid;begin
 select * into r from public.legal_judicial_inbox where id=p_inbox_id;if not found or r.tenant_id is distinct from public.legal_actual_tenant() then raise exception 'Inbox access denied' using errcode='42501';end if;
 if r.case_id is null and not public._legal_judicial_admin() then raise exception 'Unassociated originals require administrator review' using errcode='42501';end if;
 if r.case_id is not null and r.case_id<>p_case_id then raise exception 'Do not move originals between cases; reject the wrong association and preserve its restricted evidence' using errcode='22023';end if;
 t:=public._legal_judicial_assert(p_case_id,r.category,true);select * into r from public.legal_judicial_inbox where id=p_inbox_id for update;
 if r.case_id is not null and r.case_id<>p_case_id then raise exception 'Concurrent association changed; review again' using errcode='22023';end if;
 if p_decision not in ('confirmed','rejected') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 then raise exception 'Explicit human association decision and note required' using errcode='22023';end if;
 perform public._legal_judicial_document(p_case_id,p_evidence_document_id,r.category);select * into p from public.judicial_proceedings where id=p_proceeding_id and case_id=p_case_id and tenant_id=t;if not found then raise exception 'Same-case proceeding required' using errcode='22023';end if;
 if p_decision='confirmed' and jsonb_array_length(r.candidates)>1 then raise exception 'Multi-candidate original requires a separately evidenced single-case manual extract; do not distribute the full page' using errcode='22023';end if;
 if p_decision='confirmed' and exists(select 1 from jsonb_array_elements(r.candidates) x where x?'cnj' and regexp_replace(x->>'cnj','\D','','g')<>p.cnj_number) then raise exception 'Candidate CNJ conflicts with selected proceeding' using errcode='22023';end if;
 update public.legal_judicial_inbox set case_id=p_case_id,proceeding_id=p.id,association_state=p_decision,evidence_document_id=p_evidence_document_id,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=btrim(p_note),revision=revision+1 where id=r.id returning * into r;
 insert into public.legal_judicial_association_reviews(tenant_id,inbox_id,case_id,proceeding_id,decision,revision,evidence_document_id,note,reviewed_by) values(t,r.id,p_case_id,p.id,p_decision,r.revision,p_evidence_document_id,btrim(p_note),auth.uid());perform public._legal_judicial_event(t,p_case_id,'association_reviewed',jsonb_build_object('inbox_id',r.id,'revision',r.revision,'decision',p_decision),auth.uid(),r.category);return r;
end;$$;
create or replace function public.legal_judicial_read_original(p_inbox_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_inbox;o public.legal_judicial_originals;locked_case uuid;begin
 select * into r from public.legal_judicial_inbox where id=p_inbox_id;if not found or r.tenant_id is distinct from public.legal_actual_tenant() then raise exception 'Original access denied' using errcode='42501';end if;
 locked_case:=r.case_id;if locked_case is not null then perform 1 from public.legal_cases where id=locked_case for update;end if;select * into r from public.legal_judicial_inbox where id=p_inbox_id for share;
 if r.case_id is distinct from locked_case then raise exception 'Original association changed; reopen with current case access' using errcode='42501';end if;
 if (r.case_id is null and not public._legal_judicial_admin()) or (r.case_id is not null and not public.legal_judicial_can_access(r.case_id,r.category)) then raise exception 'Current original category access required' using errcode='42501';end if;
 select * into o from public.legal_judicial_originals where id=r.original_id;perform public._legal_judicial_event(r.tenant_id,r.case_id,'original_read',jsonb_build_object('inbox_id',r.id),auth.uid(),r.category);return jsonb_build_object('original_text',o.original_text,'content_type',o.content_type,'sha256',o.sha256);
end;$$;

create or replace function public._legal_f2_save_case_task(p_case_id uuid,p_payload jsonb,p_task_id uuid default null)
returns public.legal_case_tasks language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_case_tasks;t public.legal_task_templates;tenant uuid:=public._legal_assert_operation(p_case_id);
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
 ('title','notes','template_id','assignee_id','substitute_id','due_at','status','cancellation_reason')) then raise exception 'Unsupported task fields' using errcode='22023'; end if;
 perform 1 from public.legal_cases where id=p_case_id for update;
 if p_task_id is not null then
  select * into r from public.legal_case_tasks where id=p_task_id and case_id=p_case_id for update;
  if not found then raise exception 'Task access denied' using errcode='42501'; end if;
 else
  r.id:=gen_random_uuid();r.tenant_id:=tenant;r.case_id:=p_case_id;r.notes:='';r.status:='open';r.cancellation_reason:='';r.created_by:=auth.uid();r.created_at:=now();
  select owner_id into r.assignee_id from public.legal_cases where id=p_case_id;
 end if;
 r:=jsonb_populate_record(r,p_payload);
 if r.template_id is not null then
  select * into t from public.legal_task_templates where id=r.template_id and tenant_id=tenant;
  if not found then raise exception 'Template access denied' using errcode='42501'; end if;
  if p_task_id is null then
   if not(p_payload?'title') then r.title:=t.title;end if;
   if not(p_payload?'notes') then r.notes:=t.notes;end if;
   if not(p_payload?'due_at') and t.default_due_days is not null then r.due_at:=now()+make_interval(days=>t.default_due_days);end if;
  end if;
 end if;
 perform public._legal_validate_assignee(p_case_id,r.assignee_id);
 if r.substitute_id is not null then perform public._legal_validate_assignee(p_case_id,r.substitute_id);end if;
 r.updated_at:=now();
 insert into public.legal_case_tasks values(r.*) on conflict(id) do update set title=excluded.title,notes=excluded.notes,template_id=excluded.template_id,
 assignee_id=excluded.assignee_id,substitute_id=excluded.substitute_id,due_at=excluded.due_at,status=excluded.status,cancellation_reason=excluded.cancellation_reason,updated_at=excluded.updated_at returning * into r;
 perform public._legal_record_event(p_case_id,'task_updated','Tarefa atualizada.',jsonb_build_object('task_id',r.id,'status',r.status,'assignee_id',r.assignee_id,'substitute_id',r.substitute_id));return r;
end;$$;
create or replace function public.legal_judicial_can_read_task(p_task_id uuid,p_case_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select public.legal_can_access_case(p_case_id) and not exists(select 1 from public.legal_judicial_task_links l where l.task_id=p_task_id and not public.legal_judicial_can_access(l.case_id,l.category));
$$;
create or replace function public.legal_save_case_task(p_case_id uuid,p_payload jsonb,p_task_id uuid default null) returns public.legal_case_tasks language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 perform public._legal_assert_operation(p_case_id);
 if p_task_id is not null and exists(select 1 from public.legal_judicial_task_links where task_id=p_task_id) then raise exception 'Judicial tasks require their reviewed judicial workflow' using errcode='42501';end if;
 return public._legal_f2_save_case_task(p_case_id,p_payload,p_task_id);
end;$$;
create policy legal_judicial_task_category on public.legal_case_tasks as restrictive for select to authenticated using(public.legal_judicial_can_read_task(id,case_id));
create or replace function public.legal_judicial_assign(p_inbox_id uuid,p_assignee_id uuid,p_substitute_id uuid,p_due_at timestamptz,p_note text) returns public.legal_judicial_triage language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare i public.legal_judicial_inbox;r public.legal_judicial_triage;task public.legal_case_tasks;t uuid;begin
 select * into i from public.legal_judicial_inbox where id=p_inbox_id;t:=public._legal_judicial_assert(i.case_id,i.category,true);select * into i from public.legal_judicial_inbox where id=p_inbox_id for update;
 if i.association_state<>'confirmed' or length(btrim(coalesce(p_note,''))) not between 1 and 2000 or (p_due_at is not null and not isfinite(p_due_at)) then raise exception 'Confirmed association, finite internal date and assignment note required' using errcode='22023';end if;
 if not public._legal_judicial_actor(i.case_id,p_assignee_id,i.category) or (p_substitute_id is not null and (p_substitute_id=p_assignee_id or not public._legal_judicial_actor(i.case_id,p_substitute_id,i.category))) then raise exception 'Active case participants with explicit source category permissions required' using errcode='22023';end if;
 select * into r from public.legal_judicial_triage where inbox_id=i.id for update;
 task:=public._legal_f2_save_case_task(i.case_id,jsonb_build_object('title','Conferir entrada judicial','notes','Conferência interna com fonte e atribuição no módulo judicial; não representa ciência eletrônica.','assignee_id',p_assignee_id,'substitute_id',p_substitute_id,'due_at',p_due_at,'status','open'),r.task_id);
 if r.id is null then insert into public.legal_judicial_triage(tenant_id,case_id,inbox_id,assignee_id,substitute_id,due_at,task_id,note,created_by) values(t,i.case_id,i.id,p_assignee_id,p_substitute_id,p_due_at,task.id,btrim(p_note),auth.uid()) returning * into r;
 insert into public.legal_judicial_task_links(task_id,tenant_id,case_id,category,reference_kind,reference_id) values(task.id,t,i.case_id,i.category,'triage',r.id);
 else update public.legal_judicial_triage set assignee_id=p_assignee_id,substitute_id=p_substitute_id,due_at=p_due_at,note=btrim(p_note),state='pending',accepted_at=null,revision=revision+1 where id=r.id returning * into r;end if;
 perform public._legal_judicial_event(t,i.case_id,'assignment_recorded',jsonb_build_object('triage_id',r.id,'assignee_id',r.assignee_id,'substitute_id',r.substitute_id),auth.uid(),i.category);return r;
end;$$;
create or replace function public.legal_judicial_accept_assignment(p_triage_id uuid,p_note text) returns public.legal_judicial_triage language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r public.legal_judicial_triage;i public.legal_judicial_inbox;begin
 select * into r from public.legal_judicial_triage where id=p_triage_id;select * into i from public.legal_judicial_inbox where id=r.inbox_id;perform public._legal_judicial_assert(r.case_id,i.category);select * into r from public.legal_judicial_triage where id=p_triage_id for update;
 if auth.uid() is distinct from r.assignee_id and auth.uid() is distinct from r.substitute_id then raise exception 'Only current assignee or substitute may accept internal handling' using errcode='42501';end if;
 if r.state not in ('pending','accepted') or length(btrim(coalesce(p_note,''))) not between 1 and 2000 then raise exception 'Pending assignment and internal acceptance note required' using errcode='22023';end if;
 update public.legal_judicial_triage set state='accepted',accepted_at=coalesce(accepted_at,clock_timestamp()),note=btrim(p_note) where id=r.id returning * into r;perform public._legal_judicial_event(r.tenant_id,r.case_id,'assignment_accepted_internally',jsonb_build_object('triage_id',r.id),auth.uid(),i.category);return r;
end;$$;
create or replace function public.legal_judicial_update_task_status(p_task_id uuid,p_status text,p_note text) returns public.legal_case_tasks language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare l public.legal_judicial_task_links;r public.legal_case_tasks;begin
 select * into l from public.legal_judicial_task_links where task_id=p_task_id;perform public._legal_judicial_assert(l.case_id,l.category);select * into r from public.legal_case_tasks where id=p_task_id;
 if auth.uid() is distinct from r.assignee_id and auth.uid() is distinct from r.substitute_id and not public.legal_can_access_case(l.case_id,true,true) then raise exception 'Current assigned staff or case owner required' using errcode='42501';end if;
 if p_status not in ('open','completed','cancelled') or length(btrim(coalesce(p_note,''))) not between 1 and 1000 then raise exception 'Task status and reason required' using errcode='22023';end if;
 r:=public._legal_f2_save_case_task(l.case_id,jsonb_build_object('status',p_status,'cancellation_reason',case when p_status='cancelled' then btrim(p_note) else '' end),p_task_id);
 if l.reference_kind='triage' then update public.legal_judicial_triage set state=case when p_status='open' then 'pending' else p_status end,revision=revision+1 where id=l.reference_id;end if;
 perform public._legal_judicial_event(l.tenant_id,l.case_id,'judicial_task_status_changed',jsonb_build_object('task_id',r.id,'status',p_status),auth.uid(),l.category);return r;
end;$$;

create or replace function public.legal_judicial_context(p_case_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$declare t uuid:=public.legal_actual_tenant();is_admin boolean:=public._legal_judicial_admin();begin
 if t is null or not public.legal_feature_enabled() or (p_case_id is not null and not public.legal_can_access_case(p_case_id)) then raise exception 'Judicial workspace access denied' using errcode='42501';end if;
 return jsonb_build_object('tenant_id',t,'user_id',auth.uid(),'can_manage_sources',is_admin,'can_edit_catalog',public.legal_can_create(),'can_approve_catalog',is_admin,'can_edit_case',coalesce(public.legal_can_access_case(p_case_id,true) and public.legal_judicial_can_access(p_case_id,'restricted'),false),'can_review_case',coalesce(public.legal_can_access_case(p_case_id,true,true) and public.legal_judicial_can_access(p_case_id,'restricted'),false),
 'sources',coalesce((select jsonb_agg(to_jsonb(s) order by created_at desc,id) from public.legal_judicial_source_versions s where tenant_id=t),'[]'),
 'connections',coalesce((select jsonb_agg(public._legal_judicial_connection_projection(c) order by created_at,id) from public.legal_judicial_connections c where tenant_id=t),'[]'),
 'coverages',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('is_late',c.last_capture_at is null or c.last_capture_at+make_interval(mins=>c.expected_interval_minutes+c.tolerated_delay_minutes)<clock_timestamp()) order by reviewed_at,id) from public.legal_judicial_coverages c where tenant_id=t),'[]'),
 'jobs',coalesce((select jsonb_agg(public._legal_judicial_job_projection(j) order by created_at desc,id) from public.legal_judicial_jobs j where tenant_id=t and ((p_case_id is null and j.case_id is null and is_admin) or (j.case_id=p_case_id and public.legal_judicial_can_access(j.case_id,'restricted')))),'[]'),
 'inbox',coalesce((select jsonb_agg(to_jsonb(i) order by coalesce(i.source_updated_at,i.captured_at) desc,i.version_number desc,i.id) from public.legal_judicial_inbox i where tenant_id=t and ((p_case_id is null and i.case_id is null and is_admin) or (i.case_id=p_case_id and public.legal_judicial_can_access(i.case_id,i.category)))),'[]'),
 'triage',coalesce((select jsonb_agg(to_jsonb(r) order by internal_received_at desc,r.id) from public.legal_judicial_triage r join public.legal_judicial_inbox i on i.id=r.inbox_id where r.case_id=p_case_id and public.legal_judicial_can_access(r.case_id,i.category)),'[]'),
 'calendars','[]'::jsonb,'rules','[]'::jsonb,'deadlines','[]'::jsonb,'deadline_states','[]'::jsonb);
end;$$;

-- The SECURITY DEFINER My Day query also enforces the new task category boundary.
create or replace function public.legal_my_day(p_from timestamptz,p_until timestamptz,p_limit integer default 50,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;begin
 if public.legal_actual_tenant() is null or not public.legal_feature_enabled() then raise exception 'Active legal workspace required' using errcode='42501';end if;
 if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until) or p_until<=p_from or p_limit not between 1 and 100 or p_offset not between 0 and 100000 then raise exception 'Invalid work queue range or pagination' using errcode='22023';end if;
 with items as (
 select id,case_id,'task'::text kind,title,due_at,status,assignee_id,id source_id from public.legal_case_tasks where public.legal_judicial_can_read_task(id,case_id) and status='open' and (assignee_id=auth.uid() or substitute_id=auth.uid())
 union all select id,case_id,'appointment',title,starts_at,status,assignee_id,id from public.legal_appointments where public.legal_can_access_case(case_id) and status='scheduled' and (assignee_id=auth.uid() or substitute_id=auth.uid())
 union all select r.id,r.case_id,'waiting_client',r.title,r.due_at,q.status,r.created_by,r.id from public.legal_portal_requests r join public.legal_document_requests q on q.id=r.request_id where public.legal_can_access_category(r.case_id,r.category) and q.status in ('open','submitted','uploading') and r.created_by=auth.uid()
 union all select r.id,r.case_id,'withholding_reopened','Retenção retomada: conferir documentação',null::timestamptz,r.status,r.reviewer_id,r.id from public.ir_cessation_records r where public.legal_can_access_category(r.case_id,'fiscal') and r.reviewer_id=auth.uid() and r.status='reopened' and not exists(select 1 from public.ir_cessation_records newer where newer.source_id=r.source_id and (newer.observed_on,newer.created_at,newer.id)>(r.observed_on,r.created_at,r.id))
 union all select j.id,j.case_id,'communication','Revisar estado da comunicação',j.updated_at,j.state,c.reviewed_by,c.id from public.legal_communication_jobs j join public.legal_communication_versions c on c.id=j.communication_id where public.legal_can_access_category(c.case_id,c.category) and j.state in ('failed','unknown') and c.reviewed_by=auth.uid()
 ),page as(select * from items where due_at is null or (due_at>=p_from and due_at<p_until) order by due_at nulls last,id limit p_limit+1 offset p_offset)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by due_at nulls last,id) from (select * from page limit p_limit) x),'[]'),'has_more',(select count(*)>p_limit from page)) into result;return result;
end;$$;

-- Private originals, leases and immutable audit are accessible only through their reviewed RPCs.
do $$declare tab text;fn record;begin
 foreach tab in array array['legal_judicial_source_versions','legal_judicial_connections','legal_judicial_coverages','legal_judicial_jobs','legal_judicial_originals','legal_judicial_inbox','legal_judicial_association_reviews','legal_judicial_triage','legal_judicial_task_links','legal_judicial_audit'] loop
  execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated,legal_portal,service_role',tab);execute format('grant select on public.%I to service_role',tab);
 end loop;
 foreach tab in array array['legal_judicial_source_versions','legal_judicial_coverages'] loop
  execute format('grant select on public.%I to authenticated',tab);execute format('create policy judicial_catalog_read on public.%I for select to authenticated using(tenant_id=public.legal_actual_tenant() and public.legal_feature_enabled())',tab);
 end loop;
 foreach tab in array array['legal_judicial_inbox','legal_judicial_association_reviews','legal_judicial_triage','legal_judicial_task_links','legal_judicial_audit'] loop execute format('grant select on public.%I to authenticated',tab);end loop;
 for fn in select p.oid::regprocedure sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '\_legal\_judicial\_%' escape '\' or p.proname like 'legal\_judicial\_%' escape '\' or p.proname='_legal_f2_save_case_task') loop
  execute format('revoke all on function %s from public,anon,authenticated,legal_portal,service_role',fn.sig);
  if fn.proname like 'legal_judicial_service_%' then execute format('grant execute on function %s to service_role',fn.sig);
  elsif fn.proname like 'legal_judicial_%' then execute format('grant execute on function %s to authenticated',fn.sig);end if;
 end loop;
end;$$;
create policy judicial_inbox_read on public.legal_judicial_inbox for select to authenticated using(tenant_id=public.legal_actual_tenant() and public.legal_feature_enabled() and ((case_id is null and public.legal_judicial_is_admin()) or (case_id is not null and public.legal_judicial_can_access(case_id,category))));
create policy judicial_association_read on public.legal_judicial_association_reviews for select to authenticated using(exists(select 1 from public.legal_judicial_inbox i where i.id=inbox_id and public.legal_judicial_can_access(i.case_id,i.category)));
create policy judicial_triage_read on public.legal_judicial_triage for select to authenticated using(exists(select 1 from public.legal_judicial_inbox i where i.id=inbox_id and public.legal_judicial_can_access(i.case_id,i.category)));
create policy judicial_task_link_read on public.legal_judicial_task_links for select to authenticated using(public.legal_judicial_can_access(case_id,category));
create policy judicial_audit_read on public.legal_judicial_audit for select to authenticated using(tenant_id=public.legal_actual_tenant() and public.legal_feature_enabled() and ((case_id is null and public.legal_judicial_is_admin()) or (case_id is not null and public.legal_judicial_can_access(case_id,category))));
-- Policy helpers expose booleans only; application functions remain explicitly scoped.
grant execute on function public.legal_judicial_is_admin() to authenticated;
notify pgrst,'reload schema';
