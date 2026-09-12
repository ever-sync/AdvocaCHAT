begin;

create table public.ai_document_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  chat_id uuid not null,
  workflow_document_id uuid not null references public.ai_sales_workflow_documents(id),
  legal_document_id uuid not null,
  text_version_id uuid not null,
  category text not null check(category in ('medical','fiscal','general')),
  status text not null default 'pending' check(status in ('pending','processing','succeeded','needs_review','failed','cancelled')),
  attempts smallint not null default 0 check(attempts between 0 and 5),
  run_after timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(text_version_id),
  foreign key(tenant_id,chat_id) references public.ai_sales_workflow_sessions(tenant_id,chat_id),
  foreign key(legal_document_id,tenant_id) references public.legal_case_documents(id,tenant_id)
);

-- The case id is duplicated so every cross-tenant relation remains composite.
alter table public.ai_document_analysis_jobs add column case_id uuid not null;
alter table public.ai_document_analysis_jobs add foreign key(text_version_id,case_id,tenant_id)
  references public.legal_document_text_versions(id,case_id,tenant_id);

create table public.ai_document_analyses (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.ai_document_analysis_jobs(id),
  tenant_id uuid not null,
  chat_id uuid not null,
  case_id uuid not null,
  legal_document_id uuid not null,
  text_version_id uuid not null,
  analyzer_name text not null default 'Theo',
  analyzer_version text not null,
  document_type text not null,
  readable boolean not null,
  holder_status text not null check(holder_status in ('confirmed','divergent','unknown')),
  facts jsonb not null default '[]' check(jsonb_typeof(facts)='array'),
  inconsistencies jsonb not null default '[]' check(jsonb_typeof(inconsistencies)='array'),
  missing_items jsonb not null default '[]' check(jsonb_typeof(missing_items)='array'),
  confidence numeric(4,3) not null check(confidence between 0 and 1),
  recommended_action text not null check(recommended_action in ('ready_for_review','request_better_copy','request_medical_document','request_income_statement','request_benefit_document','resolve_identity','manual_review')),
  review_status text not null default 'unreviewed' check(review_status in ('unreviewed','approved','returned')),
  model text not null,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,chat_id) references public.ai_sales_workflow_sessions(tenant_id,chat_id),
  foreign key(legal_document_id,tenant_id) references public.legal_case_documents(id,tenant_id),
  foreign key(text_version_id,case_id,tenant_id) references public.legal_document_text_versions(id,case_id,tenant_id)
);

create index ai_document_analysis_due on public.ai_document_analysis_jobs(status,run_after);
create index ai_document_analyses_chat on public.ai_document_analyses(tenant_id,chat_id,created_at desc);
alter table public.ai_document_analysis_jobs enable row level security;
alter table public.ai_document_analyses enable row level security;
revoke all on public.ai_document_analysis_jobs,public.ai_document_analyses from anon,authenticated;
grant all on public.ai_document_analysis_jobs,public.ai_document_analyses to service_role;

create or replace function public.ai_sales_enqueue_document_ocr(p_workflow_document_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.ai_sales_document_intake_jobs;d public.legal_case_documents;s public.legal_assistance_settings;o uuid;job_id uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 select * into j from public.ai_sales_document_intake_jobs where workflow_document_id=p_workflow_document_id for update;
 select * into d from public.legal_case_documents where id=j.legal_document_id and tenant_id=j.tenant_id and status='ready';
 if d.id is null then raise exception 'Ready document required';end if;
 if d.mime_type not in ('application/pdf','image/png') then return null;end if;
 if exists(select 1 from public.legal_ocr_jobs where document_id=d.id and state in ('queued','running','succeeded','partial')) then
  return (select id from public.legal_ocr_jobs where document_id=d.id order by created_at desc limit 1);
 end if;
 select * into s from public.legal_assistance_settings where tenant_id=d.tenant_id and ocr_enabled for update;
 if s.tenant_id is null then raise exception 'OCR do escritório não está habilitado';end if;
 select id into o from public.profiles where tenant_id=d.tenant_id and role='admin' and status='active' order by created_at limit 1;
 if o is null then raise exception 'Administrador ativo indisponível';end if;
 if (select coalesce(sum(quota_pages),0) from public.legal_ocr_jobs where tenant_id=d.tenant_id and quota_month=date_trunc('month',current_date)::date)+s.ocr_max_pages>s.ocr_monthly_page_limit then raise exception 'OCR monthly page reservation exceeded';end if;
 insert into public.legal_ocr_jobs(tenant_id,case_id,category,document_id,source_sha256,idempotency_key,state,max_pages,quota_pages,quota_month,base_version_id,created_by)
 values(d.tenant_id,d.case_id,d.category,d.id,d.sha256,gen_random_uuid(),'queued',s.ocr_max_pages,s.ocr_max_pages,date_trunc('month',current_date)::date,null,o) returning id into job_id;
 return job_id;
end $$;

create or replace function public._ai_document_queue_after_ocr() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare w public.ai_sales_document_intake_jobs;cat text;
begin
 select * into w from public.ai_sales_document_intake_jobs where legal_document_id=new.document_id;
 if not found then return new;end if;
 cat:=case new.category when 'medical' then 'medical' when 'fiscal' then 'fiscal' else 'general' end;
 insert into public.ai_document_analysis_jobs(tenant_id,chat_id,workflow_document_id,legal_document_id,text_version_id,case_id,category)
 values(new.tenant_id,w.chat_id,w.workflow_document_id,new.document_id,new.id,new.case_id,cat) on conflict(text_version_id) do nothing;
 return new;
end $$;
create trigger ai_document_queue_after_ocr after insert on public.legal_document_text_versions
 for each row execute function public._ai_document_queue_after_ocr();

create or replace function public.ai_document_claim(p_limit integer default 5)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 with picked as(
  select id from public.ai_document_analysis_jobs where (status in ('pending','failed') and run_after<=now() and attempts<5) or (status='processing' and lease_until<now()) order by run_after,id for update skip locked limit greatest(1,least(p_limit,10))
 ), claimed as(
  update public.ai_document_analysis_jobs j set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now() from picked where j.id=picked.id returning j.*
 ) select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('pages',(select jsonb_agg(jsonb_build_object('page',p.page_number,'text',left(coalesce(p.text,''),30000),'status',p.page_status) order by p.page_number) from public.legal_document_text_pages p where p.version_id=c.text_version_id))),'[]'::jsonb) into r from claimed c;
 return r;
end $$;

create or replace function public.ai_document_finish(p_job_id uuid,p_lease_token uuid,p_model text,p_analyzer_version text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.ai_document_analysis_jobs;f jsonb;page_text text;analysis public.ai_document_analyses;final_status text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 select * into j from public.ai_document_analysis_jobs where id=p_job_id and status='processing' and lease_token=p_lease_token and lease_until>now() for update;
 if not found then raise exception 'Current analysis lease required';end if;
 if jsonb_typeof(p_result->'facts')<>'array' or jsonb_typeof(p_result->'inconsistencies')<>'array' or jsonb_typeof(p_result->'missing_items')<>'array' then raise exception 'Structured arrays required';end if;
 for f in select value from jsonb_array_elements(p_result->'facts') loop
  if length(trim(coalesce(f->>'field',''))) not between 1 and 80 or length(trim(coalesce(f->>'value',''))) not between 1 and 1000 or length(f->>'quote') not between 1 and 500 or (f->>'page')::integer<1 then raise exception 'Invalid cited fact';end if;
  select text into page_text from public.legal_document_text_pages where version_id=j.text_version_id and page_number=(f->>'page')::integer;
  if page_text is null or position(f->>'quote' in page_text)=0 then raise exception 'Fact quote does not match OCR source';end if;
 end loop;
 final_status:=case when (p_result->>'readable')::boolean and p_result->>'recommended_action'='ready_for_review' then 'succeeded' else 'needs_review' end;
 insert into public.ai_document_analyses(job_id,tenant_id,chat_id,case_id,legal_document_id,text_version_id,analyzer_version,document_type,readable,holder_status,facts,inconsistencies,missing_items,confidence,recommended_action,model)
 values(j.id,j.tenant_id,j.chat_id,j.case_id,j.legal_document_id,j.text_version_id,left(p_analyzer_version,80),left(p_result->>'document_type',80),(p_result->>'readable')::boolean,p_result->>'holder_status',p_result->'facts',p_result->'inconsistencies',p_result->'missing_items',(p_result->>'confidence')::numeric,p_result->>'recommended_action',left(p_model,120)) returning * into analysis;
 update public.ai_document_analysis_jobs set status=final_status,lease_token=null,lease_until=null,last_error=null,updated_at=now() where id=j.id;
 update public.crm_tasks set notes='Theo concluiu a extração documental. Resultado: '||(p_result->>'recommended_action')||'. Confira as evidências antes de aprovar.' where id=(select task_id from public.ai_sales_task_links where chat_id=j.chat_id and task_kind='conferencia-documental') and status='aberta';
 return to_jsonb(analysis);
end $$;

create or replace function public.ai_document_fail(p_job_id uuid,p_lease_token uuid,p_error text)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 update public.ai_document_analysis_jobs set status=case when attempts>=5 then 'failed' else 'pending' end,run_after=now()+make_interval(mins=>least(60,5*attempts)),lease_token=null,lease_until=null,last_error=left(p_error,500),updated_at=now() where id=p_job_id and status='processing' and lease_token=p_lease_token;
end $$;

revoke all on function public.ai_sales_enqueue_document_ocr(uuid),public._ai_document_queue_after_ocr(),public.ai_document_claim(integer),public.ai_document_finish(uuid,uuid,text,text,jsonb),public.ai_document_fail(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ai_sales_enqueue_document_ocr(uuid),public.ai_document_claim(integer),public.ai_document_finish(uuid,uuid,text,text,jsonb),public.ai_document_fail(uuid,uuid,text) to service_role;

create or replace function public.ai_sales_workflow_overview()
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
  select s.chat_id,s.phase,s.updated_at,c.display_name,l.negotiation_id,l.last_stage_id as crm_stage_id,
   (select count(*) from public.ai_sales_workflow_documents d where d.chat_id=s.chat_id) as documents_received,
   (select count(*) from public.ai_sales_document_intake_jobs j where j.chat_id=s.chat_id and j.status='stored') as documents_stored,
   (select count(*) from public.ai_sales_document_intake_jobs j where j.chat_id=s.chat_id and j.status='failed') as document_failures,
   (select count(*) from public.ai_document_analysis_jobs j where j.chat_id=s.chat_id and j.status in ('pending','processing')) as theo_pending,
   (select count(*) from public.ai_document_analyses a where a.chat_id=s.chat_id) as theo_completed,
   (select a.recommended_action from public.ai_document_analyses a where a.chat_id=s.chat_id order by a.created_at desc limit 1) as theo_recommended_action,
   (select d.id from public.ai_sales_contract_drafts d where d.chat_id=s.chat_id order by d.created_at desc limit 1) as draft_id,
   (select min(t.due_at) from public.crm_tasks t where t.negotiation_id=l.negotiation_id and t.status='aberta') as next_task_at,
   (select min(f.scheduled_for) from public.ai_sales_followups f where f.chat_id=s.chat_id and f.status='scheduled') as next_followup_at,
   (select count(*) from public.ai_sales_followups f where f.chat_id=s.chat_id and f.status='failed') as followup_failures
  from public.ai_sales_workflow_sessions s join public.whatsapp_chats c on c.id=s.chat_id and c.tenant_id=s.tenant_id
  left join public.ai_sales_crm_links l on l.chat_id=s.chat_id and l.tenant_id=s.tenant_id
  where public.ai_sales_workflow_admin(s.tenant_id) order by s.updated_at desc limit 100
 ) r;
$$;

commit;
