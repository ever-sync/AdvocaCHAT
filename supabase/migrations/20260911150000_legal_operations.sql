-- F2: internal legal operations. No provider is connected by this migration.
-- Drafts, decisions and external evidence are distinct; legacy CRM is preserved.

create table public.legal_operation_settings (
 tenant_id uuid primary key references public.tenants(id) on delete restrict,
 services text[] not null default array['Assessoria jurídica'],
 pipeline_stages text[] not null default array['Triagem','Análise','Proposta','Contratação','Em andamento','Encerrado'],
 closure_reasons text[] not null default array['Concluído','Desistência','Não contratado'],
 updated_at timestamptz not null default now()
);
create table public.legal_case_operations (
 case_id uuid primary key, tenant_id uuid not null,
 service_name text not null, stage_name text not null, closure_reason text not null default '',
 updated_at timestamptz not null default now(),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict
);
create table public.legal_interview_templates (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
 title text not null check(length(btrim(title)) between 1 and 200),
 category text not null check(category in ('general','medical','fiscal')),
 created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(), unique(id,tenant_id)
);
create table public.legal_interview_template_versions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, template_id uuid not null,
 version_number integer not null check(version_number>0), questions jsonb not null check(jsonb_typeof(questions)='array'),
 created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
 unique(template_id,version_number), unique(id,tenant_id),
 foreign key(template_id,tenant_id) references public.legal_interview_templates(id,tenant_id) on delete restrict
);
create table public.legal_interview_submissions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, case_id uuid not null, template_version_id uuid not null,
 category text not null check(category in ('general','medical','fiscal')), answers jsonb not null check(jsonb_typeof(answers)='object'),
 submitted_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(template_version_id,tenant_id) references public.legal_interview_template_versions(id,tenant_id) on delete restrict
);
create table public.legal_conflict_reviews (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,
 decision text not null check(decision in ('pending','clear','potential','blocked')),
 notes text not null check(length(btrim(notes)) between 1 and 4000),
 reviewer_id uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict
);
comment on table public.legal_conflict_reviews is 'Human review only; no automatic conflict clearance or search into inaccessible cases.';

create table public.legal_document_requests (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,
 category text not null check(category in ('general','medical','fiscal')),
 title text not null check(length(btrim(title)) between 1 and 200),instructions text not null default '' check(length(instructions)<=2000),due_at timestamptz,
 status text not null default 'open' check(status in ('open','uploading','submitted','approved','rejected','cancelled')),
 document_id uuid,created_by uuid not null references public.profiles(id) on delete restrict,
 reviewed_by uuid references public.profiles(id) on delete restrict,review_note text not null default '' check(length(review_note)<=2000),
 expires_at timestamptz,used_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,tenant_id),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(document_id,tenant_id) references public.legal_case_documents(id,tenant_id) on delete restrict
);
-- Token hashes never appear in authenticated table reads or public responses.
create table public.legal_document_request_tokens (
 request_id uuid primary key references public.legal_document_requests(id) on delete restrict,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),created_at timestamptz not null default now()
);

create table public.legal_instruments (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,
 instrument_type text not null check(instrument_type in ('proposal','contract','power_of_attorney')),
 title text not null check(length(btrim(title)) between 1 and 200),category text not null check(category in ('general','medical','fiscal')),
 created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),
 unique(id,tenant_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict
);
create table public.legal_instrument_versions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,instrument_id uuid not null,
 category text not null check(category in ('general','medical','fiscal')),version_number integer not null check(version_number>0),
 content text not null check(length(btrim(content)) between 1 and 100000),
 status text not null default 'draft' check(status in ('draft','in_review','approved','revoked')),
 created_by uuid not null references public.profiles(id) on delete restrict,reviewer_id uuid references public.profiles(id) on delete restrict,
 review_note text not null default '' check(length(review_note)<=2000),approved_at timestamptz,revoked_at timestamptz,superseded_at timestamptz,
 created_at timestamptz not null default now(),unique(id,tenant_id),unique(instrument_id,version_number),
 foreign key(instrument_id,tenant_id) references public.legal_instruments(id,tenant_id) on delete restrict,
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 check(status<>'approved' or (reviewer_id is not null and approved_at is not null)),
 check(status<>'revoked' or (reviewer_id is not null and revoked_at is not null))
);
comment on column public.legal_instrument_versions.superseded_at is 'Historical approval remains recorded; a superseded version cannot be used for a new act.';
create table public.legal_external_signature_records (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,version_id uuid not null,
 category text not null check(category in ('general','medical','fiscal')),document_id uuid not null,
 evidence_note text not null check(length(btrim(evidence_note)) between 1 and 2000),
 status text not null default 'externally_recorded' check(status='externally_recorded'),
 recorded_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),
 unique(version_id,document_id),
 foreign key(version_id,tenant_id) references public.legal_instrument_versions(id,tenant_id) on delete restrict,
 foreign key(document_id,tenant_id) references public.legal_case_documents(id,tenant_id) on delete restrict,
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict
);
comment on table public.legal_external_signature_records is 'Owner recorded external document/evidence. This is NOT provider signature verification.';

create table public.legal_task_templates (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete restrict,
 title text not null check(length(btrim(title)) between 1 and 200),notes text not null default '' check(length(notes)<=2000),
 default_due_days integer check(default_due_days between 0 and 3650),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,tenant_id)
);
create table public.legal_case_tasks (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,template_id uuid,
 title text not null check(length(btrim(title)) between 1 and 200),notes text not null default '' check(length(notes)<=2000),
 assignee_id uuid not null,substitute_id uuid,due_at timestamptz,
 status text not null default 'open' check(status in ('open','completed','cancelled')),
 cancellation_reason text not null default '' check(length(cancellation_reason)<=1000),
 created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(template_id,tenant_id) references public.legal_task_templates(id,tenant_id) on delete restrict,
 foreign key(assignee_id,tenant_id) references public.profiles(id,tenant_id) on delete restrict,
 foreign key(substitute_id,tenant_id) references public.profiles(id,tenant_id) on delete restrict,
 check(substitute_id is null or substitute_id<>assignee_id),check(status<>'cancelled' or length(btrim(cancellation_reason))>0)
);
create table public.legal_appointments (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 200),appointment_type text not null check(appointment_type in ('consultation','hearing','diligence','meeting')),
 starts_at timestamptz not null,ends_at timestamptz not null,location text not null default '' check(length(location)<=500),notes text not null default '' check(length(notes)<=2000),
 assignee_id uuid not null,substitute_id uuid,status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
 cancellation_reason text not null default '' check(length(cancellation_reason)<=1000),
 created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(assignee_id,tenant_id) references public.profiles(id,tenant_id) on delete restrict,
 foreign key(substitute_id,tenant_id) references public.profiles(id,tenant_id) on delete restrict,
 check(ends_at>starts_at),check(substitute_id is null or substitute_id<>assignee_id),check(status<>'cancelled' or length(btrim(cancellation_reason))>0)
);

alter table public.legal_case_events drop constraint legal_case_events_event_type_check;
alter table public.legal_case_events add constraint legal_case_events_event_type_check check(event_type in (
 'case_created','case_updated','member_granted','member_revoked','party_added','proceeding_added','manual','document_prepared','document_ready','document_abandoned','document_download','retention_changed',
 'operation_updated','interview_submitted','conflict_reviewed','document_requested','document_request_updated','instrument_created','instrument_version_created','instrument_reviewed','external_signature_recorded','task_updated','appointment_updated'));

create or replace function public._legal_assert_operation(p_case_id uuid,p_category text default 'general',p_owner boolean default false)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 -- Membership changes take the same lock. Recheck after waiting, not before.
 perform 1 from public.legal_cases where id=p_case_id for update;
 if not public.legal_can_access_case(p_case_id,true,p_owner) or not public.legal_can_access_category(p_case_id,p_category) then
  raise exception 'Legal operation denied' using errcode='42501'; end if;
 return public.legal_actual_tenant();
end;$$;

create or replace function public._legal_actor_can_edit(p_case_id uuid,p_actor_id uuid,p_category text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select p_category in ('general','medical','fiscal') and exists(select 1 from public.legal_cases c
 join public.profiles p on p.id=p_actor_id and p.tenant_id=c.tenant_id and p.status='active'
 join public.legal_workspace_features w on w.tenant_id=c.tenant_id and w.enabled
 where c.id=p_case_id and (c.owner_id=p.id or exists(select 1 from public.legal_case_members m where m.case_id=c.id and m.profile_id=p.id and m.can_edit
 and (p_category='general' or (p_category='medical' and m.can_view_medical) or (p_category='fiscal' and m.can_view_fiscal)))));
$$;

create or replace function public._legal_validate_questions(p_questions jsonb)
returns void language plpgsql set search_path=pg_catalog,public,pg_temp as $$
declare q jsonb; keys text[]:=array[]::text[];
begin
 if p_questions is null or jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions) not between 1 and 50 then
  raise exception 'Provide 1 to 50 interview questions' using errcode='22023'; end if;
 for q in select value from jsonb_array_elements(p_questions) loop
  if jsonb_typeof(q)<>'object' or coalesce(q->>'key','') !~ '^[a-zA-Z][a-zA-Z0-9_]{0,49}$' or coalesce(length(btrim(q->>'label')),0) not between 1 and 200
   or coalesce(q->>'type','') not in ('text','number','date','boolean') or (q?'required' and jsonb_typeof(q->'required')<>'boolean')
   or (q->>'key')=any(keys) then raise exception 'Invalid or duplicate interview question' using errcode='22023'; end if;
  keys:=array_append(keys,q->>'key');
 end loop;
end;$$;

create or replace function public._legal_validate_assignee(p_case_id uuid,p_profile_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if p_profile_id is null or not exists(select 1 from public.legal_cases c join public.profiles p on p.id=p_profile_id and p.tenant_id=c.tenant_id and p.status='active'
  where c.id=p_case_id and (c.owner_id=p.id or exists(select 1 from public.legal_case_members m where m.case_id=c.id and m.profile_id=p.id))) then
  raise exception 'Assignee must be an active participant of this case' using errcode='22023'; end if;
end;$$;

create or replace function public.legal_operations_context(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare s public.legal_operation_settings; op public.legal_case_operations;
begin
 if not public.legal_can_access_case(p_case_id) then raise exception 'Case access denied' using errcode='42501'; end if;
 select * into s from public.legal_operation_settings where tenant_id=public.legal_actual_tenant();
 select * into op from public.legal_case_operations where case_id=p_case_id;
 return jsonb_build_object('settings',case when s.tenant_id is not null then to_jsonb(s) else jsonb_build_object('services',array['Assessoria jurídica'],'pipeline_stages',array['Triagem','Análise','Proposta','Contratação','Em andamento','Encerrado'],'closure_reasons',array['Concluído','Desistência','Não contratado']) end,
  'operation',to_jsonb(op),'conflict_search_coverage','manual_review_only');
end;$$;

create or replace function public.legal_create_instrument(p_case_id uuid,p_instrument_type text,p_title text,p_category text,p_content text)
returns public.legal_instruments language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_instruments;t uuid:=public._legal_assert_operation(p_case_id,p_category);
begin
 insert into public.legal_instruments(tenant_id,case_id,instrument_type,title,category,created_by) values(t,p_case_id,p_instrument_type,btrim(p_title),p_category,auth.uid()) returning * into r;
 insert into public.legal_instrument_versions(tenant_id,case_id,instrument_id,category,version_number,content,created_by) values(t,p_case_id,r.id,p_category,1,p_content,auth.uid());
 perform public._legal_record_event(p_case_id,'instrument_created','Instrumento criado como rascunho.',jsonb_build_object('instrument_id',r.id));return r;
end;$$;

create or replace function public.legal_add_instrument_version(p_instrument_id uuid,p_content text)
returns public.legal_instrument_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare i public.legal_instruments;r public.legal_instrument_versions;
begin
 select * into i from public.legal_instruments where id=p_instrument_id for update;
 if not found then raise exception 'Instrument access denied' using errcode='42501'; end if;
 perform public._legal_assert_operation(i.case_id,i.category);
 update public.legal_instrument_versions set superseded_at=now() where instrument_id=i.id and superseded_at is null;
 insert into public.legal_instrument_versions(tenant_id,case_id,instrument_id,category,version_number,content,created_by)
 select i.tenant_id,i.case_id,i.id,i.category,coalesce(max(version_number),0)+1,p_content,auth.uid() from public.legal_instrument_versions where instrument_id=i.id returning * into r;
 perform public._legal_record_event(i.case_id,'instrument_version_created','Nova versão criada; exige nova revisão.',jsonb_build_object('instrument_id',i.id,'version_id',r.id));return r;
end;$$;

create or replace function public.legal_submit_instrument_review(p_version_id uuid)
returns public.legal_instrument_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_instrument_versions;
begin
 select * into r from public.legal_instrument_versions where id=p_version_id;
 if not found then raise exception 'Instrument access denied' using errcode='42501'; end if;
 perform 1 from public.legal_instruments where id=r.instrument_id for update;
 select * into r from public.legal_instrument_versions where id=p_version_id for update;
 perform public._legal_assert_operation(r.case_id,r.category);
 if r.status<>'draft' or r.superseded_at is not null then raise exception 'Only the current draft can be reviewed' using errcode='22023'; end if;
 update public.legal_instrument_versions set status='in_review' where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'instrument_reviewed','Versão encaminhada para revisão.',jsonb_build_object('version_id',r.id,'status',r.status));return r;
end;$$;

create or replace function public.legal_review_instrument(p_version_id uuid,p_decision text,p_note text default '')
returns public.legal_instrument_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_instrument_versions;
begin
 select * into r from public.legal_instrument_versions where id=p_version_id;
 if not found then raise exception 'Instrument access denied' using errcode='42501'; end if;
 perform 1 from public.legal_instruments where id=r.instrument_id for update;
 select * into r from public.legal_instrument_versions where id=p_version_id for update;
 perform public._legal_assert_operation(r.case_id,r.category,true);
 if p_decision not in ('approved','revoked') or r.status='revoked' or (p_decision='approved' and (r.status<>'in_review' or r.superseded_at is not null))
  or (p_decision='revoked' and length(btrim(coalesce(p_note,'')))=0) then raise exception 'Invalid instrument review transition' using errcode='22023'; end if;
 update public.legal_instrument_versions set status=p_decision,reviewer_id=auth.uid(),review_note=p_note,
  approved_at=case when p_decision='approved' then now() else approved_at end,revoked_at=case when p_decision='revoked' then now() else revoked_at end where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'instrument_reviewed','Decisão de revisão registrada.',jsonb_build_object('version_id',r.id,'status',r.status));return r;
end;$$;

create or replace function public.legal_record_external_signature(p_version_id uuid,p_document_id uuid,p_evidence_note text)
returns public.legal_external_signature_records language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v public.legal_instrument_versions;r public.legal_external_signature_records;
begin
 select * into v from public.legal_instrument_versions where id=p_version_id;
 if not found then raise exception 'Instrument access denied' using errcode='42501'; end if;
 perform 1 from public.legal_instruments where id=v.instrument_id for update;
 select * into v from public.legal_instrument_versions where id=p_version_id for update;
 perform public._legal_assert_operation(v.case_id,v.category,true);
 if v.status<>'approved' or v.superseded_at is not null then raise exception 'Current approved version required' using errcode='22023'; end if;
 if not exists(select 1 from public.legal_case_documents where id=p_document_id and case_id=v.case_id and category=v.category and status='ready') then
  raise exception 'A ready document in the same case/category is required' using errcode='22023'; end if;
 insert into public.legal_external_signature_records(tenant_id,case_id,version_id,category,document_id,evidence_note,recorded_by)
 values(v.tenant_id,v.case_id,v.id,v.category,p_document_id,btrim(p_evidence_note),auth.uid()) returning * into r;
 perform public._legal_record_event(v.case_id,'external_signature_recorded','Evidência externa registrada pelo responsável; sem verificação automática do provedor.',jsonb_build_object('record_id',r.id,'version_id',v.id));return r;
end;$$;

create or replace function public.legal_save_task_template(p_title text,p_notes text default '',p_default_due_days integer default null,p_template_id uuid default null)
returns public.legal_task_templates language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_task_templates;
begin
 if not public.legal_can_create() then raise exception 'Template edit denied' using errcode='42501'; end if;
 if p_template_id is null then insert into public.legal_task_templates(tenant_id,title,notes,default_due_days) values(public.legal_actual_tenant(),btrim(p_title),p_notes,p_default_due_days) returning * into r;
 else
  update public.legal_task_templates set title=btrim(p_title),notes=p_notes,default_due_days=p_default_due_days,updated_at=now() where id=p_template_id and tenant_id=public.legal_actual_tenant() returning * into r;
  if not found then raise exception 'Template access denied' using errcode='42501'; end if;
 end if;return r;
end;$$;

create or replace function public.legal_save_case_task(p_case_id uuid,p_payload jsonb,p_task_id uuid default null)
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

create or replace function public.legal_save_appointment(p_case_id uuid,p_payload jsonb,p_appointment_id uuid default null)
returns public.legal_appointments language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_appointments;tenant uuid:=public._legal_assert_operation(p_case_id);
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
 ('title','appointment_type','starts_at','ends_at','location','notes','assignee_id','substitute_id','status','cancellation_reason')) then raise exception 'Unsupported appointment fields' using errcode='22023'; end if;
 perform 1 from public.legal_cases where id=p_case_id for update;
 if p_appointment_id is not null then
  select * into r from public.legal_appointments where id=p_appointment_id and case_id=p_case_id for update;
  if not found then raise exception 'Appointment access denied' using errcode='42501'; end if;
 else
  r.id:=gen_random_uuid();r.tenant_id:=tenant;r.case_id:=p_case_id;r.appointment_type:='consultation';r.location:='';r.notes:='';r.status:='scheduled';r.cancellation_reason:='';r.created_by:=auth.uid();r.created_at:=now();
  select owner_id into r.assignee_id from public.legal_cases where id=p_case_id;
 end if;
 r:=jsonb_populate_record(r,p_payload);
 perform public._legal_validate_assignee(p_case_id,r.assignee_id);
 if r.substitute_id is not null then perform public._legal_validate_assignee(p_case_id,r.substitute_id);end if;
 r.updated_at:=now();
 insert into public.legal_appointments values(r.*) on conflict(id) do update set title=excluded.title,appointment_type=excluded.appointment_type,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
 location=excluded.location,notes=excluded.notes,assignee_id=excluded.assignee_id,substitute_id=excluded.substitute_id,status=excluded.status,cancellation_reason=excluded.cancellation_reason,updated_at=excluded.updated_at returning * into r;
 perform public._legal_record_event(p_case_id,'appointment_updated','Compromisso atualizado.',jsonb_build_object('appointment_id',r.id,'status',r.status,'assignee_id',r.assignee_id,'substitute_id',r.substitute_id));return r;
end;$$;



create or replace function public.legal_configure_operations(p_services text[],p_pipeline_stages text[],p_closure_reasons text[])
returns public.legal_operation_settings language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_operation_settings;
begin
 if not public.legal_feature_enabled() or not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active') then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if coalesce(cardinality(p_services),0) not between 1 and 100 or coalesce(cardinality(p_pipeline_stages),0) not between 1 and 30 or coalesce(cardinality(p_closure_reasons),0) not between 1 and 50
  or exists(select 1 from unnest(p_services||p_pipeline_stages||p_closure_reasons) v where v is null or length(btrim(v)) not between 1 and 100)
  or cardinality(p_services)<>(select count(distinct v) from unnest(p_services) v)
  or cardinality(p_pipeline_stages)<>(select count(distinct v) from unnest(p_pipeline_stages) v)
  or cardinality(p_closure_reasons)<>(select count(distinct v) from unnest(p_closure_reasons) v) then raise exception 'Invalid operation settings' using errcode='22023'; end if;
 insert into public.legal_operation_settings(tenant_id,services,pipeline_stages,closure_reasons) values(public.legal_actual_tenant(),p_services,p_pipeline_stages,p_closure_reasons)
 on conflict(tenant_id) do update set services=excluded.services,pipeline_stages=excluded.pipeline_stages,closure_reasons=excluded.closure_reasons,updated_at=now() returning * into r;
 return r;
end;$$;

create or replace function public.legal_create_interview_template(p_title text,p_category text,p_questions jsonb)
returns public.legal_interview_templates language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_interview_templates;
begin
 if not public.legal_can_create() then raise exception 'Template creation denied' using errcode='42501'; end if;
 perform public._legal_validate_questions(p_questions);
 insert into public.legal_interview_templates(tenant_id,title,category,created_by) values(public.legal_actual_tenant(),btrim(p_title),p_category,auth.uid()) returning * into r;
 insert into public.legal_interview_template_versions(tenant_id,template_id,version_number,questions,created_by) values(r.tenant_id,r.id,1,p_questions,auth.uid());return r;
end;$$;

create or replace function public.legal_add_interview_version(p_template_id uuid,p_questions jsonb)
returns public.legal_interview_template_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_interview_template_versions;t public.legal_interview_templates;
begin
 if not public.legal_can_create() then raise exception 'Template edit denied' using errcode='42501'; end if;
 select * into t from public.legal_interview_templates where id=p_template_id and tenant_id=public.legal_actual_tenant() for update;
 if not found then raise exception 'Template access denied' using errcode='42501'; end if;
 perform public._legal_validate_questions(p_questions);
 insert into public.legal_interview_template_versions(tenant_id,template_id,version_number,questions,created_by)
 select t.tenant_id,t.id,coalesce(max(version_number),0)+1,p_questions,auth.uid() from public.legal_interview_template_versions where template_id=t.id returning * into r;return r;
end;$$;

create or replace function public.legal_submit_interview(p_case_id uuid,p_template_version_id uuid,p_answers jsonb)
returns public.legal_interview_submissions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_interview_submissions;v public.legal_interview_template_versions;c text;q jsonb;a jsonb;keys text[];
begin
 select * into v from public.legal_interview_template_versions where id=p_template_version_id and tenant_id=public.legal_actual_tenant();
 if not found then raise exception 'Template access denied' using errcode='42501'; end if;
 select category into c from public.legal_interview_templates where id=v.template_id;
 perform public._legal_assert_operation(p_case_id,c);
 if p_answers is null or jsonb_typeof(p_answers)<>'object' or octet_length(p_answers::text)>100000 then raise exception 'Invalid interview answers' using errcode='22023'; end if;
 select array_agg(value->>'key') into keys from jsonb_array_elements(v.questions);
 if exists(select 1 from jsonb_object_keys(p_answers) k where not(k=any(keys))) then raise exception 'Unknown interview answer' using errcode='22023'; end if;
 for q in select value from jsonb_array_elements(v.questions) loop
  a:=p_answers->(q->>'key');
  if a is null or a='null'::jsonb or a='""'::jsonb then
   if coalesce((q->>'required')::boolean,false) then raise exception 'A required answer is missing' using errcode='22023'; end if;
   continue;
  end if;
  if ((q->>'type') in ('text','date') and jsonb_typeof(a)<>'string') or (q->>'type'='number' and jsonb_typeof(a)<>'number') or (q->>'type'='boolean' and jsonb_typeof(a)<>'boolean') then
   raise exception 'Answer type does not match question' using errcode='22023'; end if;
  if q->>'type'='date' then
   if (p_answers->>(q->>'key')) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid answer date' using errcode='22023'; end if;
   perform (p_answers->>(q->>'key'))::date;
  end if;
 end loop;
 insert into public.legal_interview_submissions(tenant_id,case_id,template_version_id,category,answers,submitted_by)
 values(v.tenant_id,p_case_id,v.id,c,p_answers,auth.uid()) returning * into r;
 perform public._legal_record_event(p_case_id,'interview_submitted','Entrevista registrada.',jsonb_build_object('submission_id',r.id,'template_version_id',v.id));return r;
end;$$;

create or replace function public.legal_record_conflict_review(p_case_id uuid,p_decision text,p_notes text)
returns public.legal_conflict_reviews language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_conflict_reviews;t uuid:=public._legal_assert_operation(p_case_id,'general',true);
begin
 insert into public.legal_conflict_reviews(tenant_id,case_id,decision,notes,reviewer_id) values(t,p_case_id,p_decision,btrim(p_notes),auth.uid()) returning * into r;
 perform public._legal_record_event(p_case_id,'conflict_reviewed','Revisão humana de conflito registrada.',jsonb_build_object('review_id',r.id,'decision',r.decision));return r;
end;$$;

create or replace function public.legal_create_document_request(p_case_id uuid,p_category text,p_title text,p_instructions text default '',p_due_at timestamptz default null)
returns public.legal_document_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;t uuid:=public._legal_assert_operation(p_case_id,p_category);
begin
 insert into public.legal_document_requests(tenant_id,case_id,category,title,instructions,due_at,created_by) values(t,p_case_id,p_category,btrim(p_title),p_instructions,p_due_at,auth.uid()) returning * into r;
 perform public._legal_record_event(p_case_id,'document_requested','Solicitação de documento criada.',jsonb_build_object('request_id',r.id));return r;
end;$$;

create or replace function public.legal_submit_document_request(p_request_id uuid,p_document_id uuid)
returns public.legal_document_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 select * into r from public.legal_document_requests where id=p_request_id for update;
 if not found then raise exception 'Document request access denied' using errcode='42501'; end if;
 perform public._legal_assert_operation(r.case_id,r.category);
 if r.status not in ('open','rejected') then raise exception 'Request cannot receive a document in this state' using errcode='22023'; end if;
 if not exists(select 1 from public.legal_case_documents where id=p_document_id and case_id=r.case_id and category=r.category and status='ready') then raise exception 'A ready document in the same case/category is required' using errcode='22023'; end if;
 update public.legal_document_requests set document_id=p_document_id,status='submitted',expires_at=null,used_at=now(),reviewed_by=null,review_note='',updated_at=now() where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'document_request_updated','Documento associado à solicitação.',jsonb_build_object('request_id',r.id,'document_id',p_document_id));return r;
end;$$;

create or replace function public.legal_review_document_request(p_request_id uuid,p_decision text,p_note text default '')
returns public.legal_document_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 select * into r from public.legal_document_requests where id=p_request_id for update;
 if not found then raise exception 'Request access denied' using errcode='42501'; end if;
 perform public._legal_assert_operation(r.case_id,r.category,true);
 if r.status<>'submitted' or p_decision not in ('approved','rejected') or (p_decision='rejected' and length(btrim(coalesce(p_note,'')))=0) then raise exception 'Invalid document review transition' using errcode='22023'; end if;
 update public.legal_document_requests set status=p_decision,reviewed_by=auth.uid(),review_note=p_note,updated_at=now() where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'document_request_updated','Documento revisado.',jsonb_build_object('request_id',r.id,'decision',p_decision));return r;
end;$$;

create or replace function public.legal_cancel_document_request(p_request_id uuid,p_reason text)
returns public.legal_document_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 select * into r from public.legal_document_requests where id=p_request_id for update;
 if not found then raise exception 'Request access denied' using errcode='42501'; end if;
 perform public._legal_assert_operation(r.case_id,r.category);
 if r.status='approved' or length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Cancellation requires a reason and a pending request' using errcode='22023'; end if;
 update public.legal_document_requests set status='cancelled',review_note=p_reason,expires_at=null,updated_at=now() where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'document_request_updated','Solicitação cancelada.',jsonb_build_object('request_id',r.id));return r;
end;$$;

create or replace function public.legal_issue_document_request_token(p_request_id uuid,p_token_hash text,p_expires_at timestamptz)
returns public.legal_document_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 select * into r from public.legal_document_requests where id=p_request_id for update;
 if not found then raise exception 'Request access denied' using errcode='42501'; end if;
 perform public._legal_assert_operation(r.case_id,r.category);
 if r.status not in ('open','rejected') or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '7 days' or coalesce(p_token_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid request link or expiry' using errcode='22023'; end if;
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
 if not found or r.status<>'open' or r.used_at is not null or r.expires_at is null or r.expires_at<=now() or not public._legal_actor_can_edit(r.case_id,r.created_by,r.category) then raise exception 'Invalid or expired document link' using errcode='42501'; end if;
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
 if r.status<>'open' or r.used_at is not null or r.expires_at is null or r.expires_at<=now() or not public._legal_actor_can_edit(r.case_id,r.created_by,r.category) then raise exception 'Invalid or expired document link' using errcode='42501'; end if;
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
 if not found or r.document_id is distinct from p_document_id or r.status not in ('uploading','submitted') or r.expires_at is null or r.expires_at<=now() then raise exception 'Upload request expired or cancelled' using errcode='42501'; end if;
 if (select token_hash from public.legal_document_request_tokens where request_id=r.id) is distinct from p_token_hash then raise exception 'Document link was rotated' using errcode='42501'; end if;
 perform public.legal_finalize_document(p_document_id,p_sha256);
 if r.status='submitted' then return r; end if;
 update public.legal_document_requests set status='submitted',updated_at=now() where id=r.id returning * into r;
 insert into public.legal_case_events(tenant_id,case_id,actor_id,event_type,description,metadata)
 values(r.tenant_id,r.case_id,r.created_by,'document_request_updated','Documento enviado pelo link de coleta.',jsonb_build_object('request_id',r.id,'document_id',p_document_id,'origin','public_request'));
 return r;
end;$$;

create or replace function public.legal_public_abandon_request_upload(p_token_hash text,p_document_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service operation only' using errcode='42501'; end if;
 select q.* into r from public.legal_document_requests q join public.legal_document_request_tokens t on t.request_id=q.id where t.token_hash=p_token_hash for update of q;
 if not found or r.document_id is distinct from p_document_id or r.status not in ('uploading','cancelled') then raise exception 'Upload cleanup denied' using errcode='42501'; end if;
 if (select token_hash from public.legal_document_request_tokens where request_id=r.id) is distinct from p_token_hash then raise exception 'Document link was rotated' using errcode='42501'; end if;
 perform public.legal_abandon_document(p_document_id);
 update public.legal_document_requests set status=case when status='cancelled' then 'cancelled' else 'open' end,expires_at=null,updated_at=now() where id=r.id;
 -- used_at remains populated: the responsible user must issue a fresh link.
end;$$;

create or replace function public.legal_set_case_operation(p_case_id uuid,p_service_name text,p_stage_name text,p_closure_reason text default '')
returns public.legal_case_operations language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_case_operations;s jsonb;t uuid:=public._legal_assert_operation(p_case_id);
begin
 s:=public.legal_operations_context(p_case_id)->'settings';
 if not (s->'services' ? p_service_name) or not (s->'pipeline_stages' ? p_stage_name) or (p_closure_reason<>'' and not (s->'closure_reasons' ? p_closure_reason)) then
  raise exception 'Service, stage or reason is not configured' using errcode='22023'; end if;
 insert into public.legal_case_operations(case_id,tenant_id,service_name,stage_name,closure_reason) values(p_case_id,t,p_service_name,p_stage_name,p_closure_reason)
 on conflict(case_id) do update set service_name=excluded.service_name,stage_name=excluded.stage_name,closure_reason=excluded.closure_reason,updated_at=now() returning * into r;
 perform public._legal_record_event(p_case_id,'operation_updated','Etapa de trabalho atualizada.');return r;
end;$$;

-- Explicit grants and RLS. All writes use the reviewed RPCs; public capability
-- tokens can only be looked up by the dedicated service-only functions.
do $$
declare t text;
begin
 foreach t in array array['legal_operation_settings','legal_case_operations','legal_interview_templates','legal_interview_template_versions','legal_interview_submissions',
 'legal_conflict_reviews','legal_document_requests','legal_document_request_tokens','legal_instruments','legal_instrument_versions','legal_external_signature_records','legal_task_templates','legal_case_tasks','legal_appointments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  if t<>'legal_document_request_tokens' then execute format('grant select on public.%I to authenticated,service_role',t);end if;
 end loop;
 foreach t in array array['legal_operation_settings','legal_interview_templates','legal_interview_template_versions','legal_task_templates'] loop
  execute format('create policy %I on public.%I for select to authenticated using(tenant_id=public.legal_actual_tenant() and public.legal_feature_enabled())',t||'_read',t);
 end loop;
 foreach t in array array['legal_case_operations','legal_conflict_reviews','legal_case_tasks','legal_appointments'] loop
  execute format('create policy %I on public.%I for select to authenticated using(public.legal_can_access_case(case_id))',t||'_read',t);
  execute format('create index %I on public.%I(tenant_id,case_id)',t||'_case_idx',t);
 end loop;
 foreach t in array array['legal_interview_submissions','legal_document_requests','legal_instruments','legal_instrument_versions','legal_external_signature_records'] loop
  execute format('create policy %I on public.%I for select to authenticated using(public.legal_can_access_category(case_id,category))',t||'_read',t);
  execute format('create index %I on public.%I(tenant_id,case_id)',t||'_case_idx',t);
 end loop;
end;$$;
create index legal_tasks_due_idx on public.legal_case_tasks(tenant_id,assignee_id,status,due_at);
create index legal_appointments_start_idx on public.legal_appointments(tenant_id,assignee_id,status,starts_at);

do $$
declare f record;
begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array['_legal_assert_operation','_legal_actor_can_edit','_legal_validate_questions','_legal_validate_assignee',
 'legal_operations_context','legal_configure_operations','legal_set_case_operation','legal_create_interview_template','legal_add_interview_version','legal_submit_interview','legal_record_conflict_review',
 'legal_create_document_request','legal_submit_document_request','legal_review_document_request','legal_cancel_document_request','legal_issue_document_request_token',
 'legal_public_document_request','legal_public_prepare_request_upload','legal_public_finalize_request_upload','legal_public_abandon_request_upload',
 'legal_create_instrument','legal_add_instrument_version','legal_submit_instrument_review','legal_review_instrument','legal_record_external_signature',
 'legal_save_task_template','legal_save_case_task','legal_save_appointment']) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname like 'legal_public_%' then execute format('grant execute on function %s to service_role',f.signature);
  elsif f.proname not like '\_legal\_%' escape '\' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;
select pg_notify('pgrst','reload schema');
