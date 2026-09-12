begin;

-- Deterministic operational bridge. LLM suggestions never write CRM state directly.
alter table public.ai_sales_workflow_config
  add column followups_enabled boolean not null default true,
  add column followup_first_hours integer not null default 24 check (followup_first_hours between 1 and 168),
  add column followup_second_hours integer not null default 72 check (followup_second_hours between 2 and 336);

create or replace function public.ai_sales_workflow_save(p_config jsonb,p_expected_revision integer)
returns public.ai_sales_workflow_config language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid;c public.ai_sales_workflow_config;first_hours integer;second_hours integer;
begin
 select tenant_id into t from public.profiles where id=auth.uid() and status='active' and role='admin';
 if t is null then raise exception 'Somente o administrador do escritório pode configurar os agentes.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text,26000));
 select * into c from public.ai_sales_workflow_config where tenant_id=t for update;
 if coalesce(c.revision,0)<>p_expected_revision or p_expected_revision is null then raise exception 'A configuração mudou. Recarregue antes de salvar.' using errcode='40001';end if;
 first_hours:=coalesce((p_config->>'followup_first_hours')::integer,24);
 second_hours:=coalesce((p_config->>'followup_second_hours')::integer,72);
 if second_hours<=first_hours then raise exception 'O segundo follow-up deve ocorrer depois do primeiro.' using errcode='22023';end if;
 insert into public.ai_sales_workflow_config(tenant_id,enabled,sdr_name,closer_name,sdr_instructions,closer_instructions,contract_template,fee_terms,template_approved,followups_enabled,followup_first_hours,followup_second_hours)
 values(t,coalesce((p_config->>'enabled')::boolean,false),trim(p_config->>'sdr_name'),trim(p_config->>'closer_name'),coalesce(p_config->>'sdr_instructions',''),coalesce(p_config->>'closer_instructions',''),coalesce(p_config->>'contract_template',''),coalesce(p_config->>'fee_terms',''),coalesce((p_config->>'template_approved')::boolean,false),coalesce((p_config->>'followups_enabled')::boolean,true),first_hours,second_hours)
 on conflict(tenant_id) do update set enabled=excluded.enabled,sdr_name=excluded.sdr_name,closer_name=excluded.closer_name,sdr_instructions=excluded.sdr_instructions,closer_instructions=excluded.closer_instructions,contract_template=excluded.contract_template,fee_terms=excluded.fee_terms,template_approved=excluded.template_approved,followups_enabled=excluded.followups_enabled,followup_first_hours=excluded.followup_first_hours,followup_second_hours=excluded.followup_second_hours,revision=ai_sales_workflow_config.revision+1,updated_at=now()
 returning * into c;
 return c;
end $$;

create table public.ai_sales_crm_links (
  chat_id uuid primary key,
  tenant_id uuid not null,
  negotiation_id uuid not null,
  last_stage_id text not null,
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,chat_id) references public.ai_sales_workflow_sessions(tenant_id,chat_id),
  foreign key (negotiation_id,tenant_id) references public.crm_negotiations(id,tenant_id),
  unique (tenant_id,negotiation_id)
);

create table public.ai_sales_task_links (
  chat_id uuid not null references public.ai_sales_workflow_sessions(chat_id),
  task_kind text not null,
  task_id uuid not null references public.crm_tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(chat_id,task_kind),
  unique(task_id)
);

create table public.ai_sales_followups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  chat_id uuid not null,
  negotiation_id uuid not null,
  sequence smallint not null check(sequence in (1,2)),
  stage_id text not null,
  message_text text not null check(length(message_text) between 1 and 500),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','processing','sent','cancelled','failed')),
  attempts smallint not null default 0 check(attempts between 0 and 5),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(tenant_id,chat_id) references public.ai_sales_workflow_sessions(tenant_id,chat_id),
  foreign key(negotiation_id,tenant_id) references public.crm_negotiations(id,tenant_id),
  unique(chat_id,stage_id,sequence)
);
create index ai_sales_followups_due on public.ai_sales_followups(status,scheduled_for);

create table public.ai_sales_document_intake_jobs (
  workflow_document_id uuid primary key references public.ai_sales_workflow_documents(id),
  tenant_id uuid not null,
  chat_id uuid not null,
  negotiation_id uuid,
  legal_case_id uuid,
  legal_document_id uuid,
  status text not null default 'pending' check(status in ('pending','processing','stored','failed','cancelled')),
  attempts smallint not null default 0 check(attempts between 0 and 5),
  run_after timestamptz not null default now(),
  last_error text,
  updated_at timestamptz not null default now(),
  foreign key(tenant_id,chat_id) references public.ai_sales_workflow_sessions(tenant_id,chat_id),
  foreign key(negotiation_id,tenant_id) references public.crm_negotiations(id,tenant_id),
  foreign key(legal_case_id,tenant_id) references public.legal_cases(id,tenant_id),
  foreign key(legal_document_id,tenant_id) references public.legal_case_documents(id,tenant_id)
);
create index ai_sales_document_jobs_due on public.ai_sales_document_intake_jobs(status,run_after);

create table public.ai_sales_crm_contracts (
  draft_id uuid primary key references public.ai_sales_contract_drafts(id),
  tenant_id uuid not null,
  chat_id uuid not null,
  negotiation_id uuid not null,
  attached_at timestamptz not null default now(),
  foreign key(tenant_id,chat_id) references public.ai_sales_workflow_sessions(tenant_id,chat_id),
  foreign key(negotiation_id,tenant_id) references public.crm_negotiations(id,tenant_id)
);

alter table public.ai_sales_crm_links enable row level security;
alter table public.ai_sales_task_links enable row level security;
alter table public.ai_sales_followups enable row level security;
alter table public.ai_sales_document_intake_jobs enable row level security;
alter table public.ai_sales_crm_contracts enable row level security;
revoke all on public.ai_sales_crm_links,public.ai_sales_task_links,public.ai_sales_followups,
  public.ai_sales_document_intake_jobs,public.ai_sales_crm_contracts from anon,authenticated;
grant all on public.ai_sales_crm_links,public.ai_sales_task_links,public.ai_sales_followups,
  public.ai_sales_document_intake_jobs,public.ai_sales_crm_contracts to service_role;

create or replace function public._ai_sales_stage_exists(p_tenant uuid,p_stage text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(
   select 1 from public.tenant_crm_funnel_config c,
     jsonb_array_elements(c.funnels) f,
     jsonb_array_elements(f->'stages') s
   where c.tenant_id=p_tenant and f->>'id'='isencao-ir' and s->>'id'=p_stage
 );
$$;

create or replace function public._ai_sales_task_spec(p_stage text,out kind text,out title text,out notes text,out delay_hours integer)
returns record language plpgsql immutable set search_path=pg_catalog as $$
begin
 kind:=p_stage;
 case p_stage
  when 'em-qualificacao' then title:='Concluir qualificação';notes:='Obter os dados ainda pendentes no atendimento.';delay_hours:=24;
  when 'documentacao-pendente' then title:='Receber documentação';notes:='Acompanhar os documentos solicitados ao cliente.';delay_hours:=24;
  when 'previdas-agendamento' then title:='Confirmar agendamento no Pré Vidas';notes:='Pedido registrado. A consulta só fica agendada com confirmação do parceiro.';delay_hours:=24;
  when 'previdas-consulta' then title:='Acompanhar consulta do Pré Vidas';notes:='Confirmar comparecimento sem presumir emissão de laudo.';delay_hours:=24;
  when 'previdas-reagendamento' then title:='Reagendar consulta do Pré Vidas';notes:='Obter e registrar uma nova confirmação do parceiro.';delay_hours:=24;
  when 'previdas-laudo' then title:='Acompanhar laudo do Pré Vidas';notes:='Aguardar o documento; emissão e resultado não são garantidos.';delay_hours:=48;
  when 'conferencia-documental' then title:='Conferir documentos recebidos';notes:='Recebimento e extração não representam aprovação médica ou jurídica.';delay_hours:=24;
  when 'proposta-apresentada' then title:='Acompanhar proposta';notes:='Confirmar interesse e condições autorizadas.';delay_hours:=24;
  when 'contrato-preparacao' then title:='Conferir contrato preparado';notes:='Rascunho vinculado ao CRM; assinatura eletrônica depende de integração.';delay_hours:=24;
  when 'aguardando-assinatura' then title:='Acompanhar assinatura';notes:='Concluir somente após recibo verificável do provedor.';delay_hours:=24;
  else kind:=null;title:=null;notes:=null;delay_hours:=null;
 end case;
end $$;

create or replace function public._ai_sales_desired_stage(p_chat uuid)
returns text language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare s public.ai_sales_workflow_sessions;p public.ai_previdas_cases;docs integer;drafts integer;
begin
 select * into s from public.ai_sales_workflow_sessions where chat_id=p_chat;
 if not found then return null; end if;
 if s.phase='paused' then return coalesce((select last_stage_id from public.ai_sales_crm_links where chat_id=p_chat),'novo-contato');end if;
 if s.phase='sdr' then return case when s.answers='{}'::jsonb then 'novo-contato' else 'em-qualificacao' end;end if;
 select * into p from public.ai_previdas_cases where chat_id=p_chat;
 if found and p.status not in ('declined','report_received') then
   return case p.status when 'needed' then 'documentacao-pendente' when 'requested' then 'previdas-agendamento'
     when 'scheduled' then 'previdas-consulta' when 'reschedule' then 'previdas-reagendamento'
     when 'awaiting_report' then 'previdas-laudo' else 'documentacao-pendente' end;
 end if;
 select count(*) into docs from public.ai_sales_workflow_documents where chat_id=p_chat;
 select count(*) into drafts from public.ai_sales_contract_drafts where chat_id=p_chat;
 if drafts>0 then return 'contrato-preparacao';end if;
 if s.answers->>'contract_interest'='yes' then return 'proposta-apresentada';end if;
 if docs>0 or p.status='report_received' then return 'conferencia-documental';end if;
 return 'documentacao-pendente';
end $$;

create or replace function public._ai_sales_sync_crm(p_chat uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare s public.ai_sales_workflow_sessions;ch public.whatsapp_chats;cust public.customers;link public.ai_sales_crm_links;
 stage text;spec record;task_uuid uuid;cfg public.ai_sales_workflow_config;
begin
 select * into s from public.ai_sales_workflow_sessions where chat_id=p_chat for update;
 if not found then return;end if;
 select * into cfg from public.ai_sales_workflow_config where tenant_id=s.tenant_id and enabled;
 if not found then return;end if;
 select * into ch from public.whatsapp_chats where id=p_chat and tenant_id=s.tenant_id;
 select * into cust from public.customers where id=ch.customer_id and tenant_id=s.tenant_id;
 if cust.id is null then return;end if;
 stage:=public._ai_sales_desired_stage(p_chat);
 if not public._ai_sales_stage_exists(s.tenant_id,stage) then return;end if;
 select * into link from public.ai_sales_crm_links where chat_id=p_chat for update;
 if not found then
   select n.id into link.negotiation_id from public.crm_negotiations n
    where n.tenant_id=s.tenant_id and n.customer_id=cust.id and n.funnel_id='isencao-ir'
      and n.status in ('em_andamento','nao_pausado','pausado') order by n.updated_at desc limit 1 for update;
   if link.negotiation_id is null then
     insert into public.crm_negotiations(tenant_id,title,funnel_id,stage_id,customer_id,last_contact_at,last_interaction_at)
       values(s.tenant_id,'Isenção de IR · '||coalesce(nullif(btrim(cust.nome),''),coalesce(ch.display_name,'Contato')),
         'isencao-ir',stage,cust.id,ch.last_message_at,ch.last_message_at) returning id into link.negotiation_id;
   end if;
   insert into public.ai_sales_crm_links(chat_id,tenant_id,negotiation_id,last_stage_id)
     values(p_chat,s.tenant_id,link.negotiation_id,stage) returning * into link;
 else
   update public.crm_negotiations set stage_id=stage,status='em_andamento',
     last_contact_at=greatest(last_contact_at,ch.last_message_at),last_interaction_at=greatest(last_interaction_at,ch.last_message_at)
     where id=link.negotiation_id and tenant_id=s.tenant_id;
   update public.ai_sales_crm_links set last_stage_id=stage,updated_at=now() where chat_id=p_chat;
 end if;

 update public.crm_tasks t set status='concluida' from public.ai_sales_task_links l
  where l.chat_id=p_chat and l.task_id=t.id and t.status='aberta' and l.task_kind<>stage;
 select * into spec from public._ai_sales_task_spec(stage);
 if spec.kind is not null and not exists(select 1 from public.ai_sales_task_links where chat_id=p_chat and task_kind=spec.kind) then
   insert into public.crm_tasks(tenant_id,negotiation_id,customer_id,title,due_at,notes)
    values(s.tenant_id,link.negotiation_id,cust.id,spec.title,now()+make_interval(hours=>spec.delay_hours),spec.notes)
    returning id into task_uuid;
   insert into public.ai_sales_task_links(chat_id,task_kind,task_id) values(p_chat,spec.kind,task_uuid);
 end if;

 update public.ai_sales_followups set status='cancelled',updated_at=now(),last_error='Etapa alterada ou novo evento recebido.'
  where chat_id=p_chat and status='scheduled' and stage_id<>stage;
 if cfg.followups_enabled and s.phase<>'paused' and stage not in ('contratado','perdido') then
   insert into public.ai_sales_followups(tenant_id,chat_id,negotiation_id,sequence,stage_id,message_text,scheduled_for)
   values
    (s.tenant_id,p_chat,link.negotiation_id,1,stage,'Oi! Podemos continuar de onde paramos? Se precisar, explico a próxima etapa.',now()+make_interval(hours=>cfg.followup_first_hours)),
    (s.tenant_id,p_chat,link.negotiation_id,2,stage,'Oi! Passando para saber se deseja continuar seu atendimento sobre a isenção de IR.',now()+make_interval(hours=>cfg.followup_second_hours))
   on conflict(chat_id,stage_id,sequence) do nothing;
 end if;
 update public.crm_negotiations set next_task_at=(select min(t.due_at) from public.crm_tasks t where t.negotiation_id=link.negotiation_id and t.status='aberta')
  where id=link.negotiation_id;
end $$;

create or replace function public._ai_sales_session_crm_trigger() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin perform public._ai_sales_sync_crm(new.chat_id);return new;end $$;
create trigger ai_sales_session_crm after insert or update of phase,answers on public.ai_sales_workflow_sessions
 for each row execute function public._ai_sales_session_crm_trigger();

create or replace function public._ai_sales_document_crm_trigger() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare negotiation uuid;
begin
 perform public._ai_sales_sync_crm(new.chat_id);
 select negotiation_id into negotiation from public.ai_sales_crm_links where chat_id=new.chat_id;
 insert into public.ai_sales_document_intake_jobs(workflow_document_id,tenant_id,chat_id,negotiation_id)
  values(new.id,new.tenant_id,new.chat_id,negotiation) on conflict do nothing;
 return new;
end $$;
create trigger ai_sales_document_crm after insert on public.ai_sales_workflow_documents
 for each row execute function public._ai_sales_document_crm_trigger();

create or replace function public._ai_sales_contract_crm_trigger() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare link public.ai_sales_crm_links;
begin
 perform public._ai_sales_sync_crm(new.chat_id);
 select * into link from public.ai_sales_crm_links where chat_id=new.chat_id;
 if found then insert into public.ai_sales_crm_contracts(draft_id,tenant_id,chat_id,negotiation_id)
  values(new.id,new.tenant_id,new.chat_id,link.negotiation_id) on conflict do nothing;end if;
 return new;
end $$;
create trigger ai_sales_contract_crm after insert on public.ai_sales_contract_drafts
 for each row execute function public._ai_sales_contract_crm_trigger();

create or replace function public._ai_sales_previdas_crm_trigger() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin perform public._ai_sales_sync_crm(new.chat_id);return new;end $$;
create trigger ai_sales_previdas_crm after insert or update of status on public.ai_previdas_cases
 for each row execute function public._ai_sales_previdas_crm_trigger();

create or replace function public._ai_sales_cancel_followups_on_inbound() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if new.direction='inbound' then
  update public.ai_sales_followups set status='cancelled',updated_at=now(),last_error='Cancelado por resposta inbound do cliente.'
   where chat_id=new.chat_id and status='scheduled';
 end if;
 return new;
end $$;
create trigger ai_sales_cancel_followups_on_inbound after insert on public.whatsapp_messages
 for each row execute function public._ai_sales_cancel_followups_on_inbound();

create or replace function public.ai_sales_claim_followups(p_limit integer default 20)
returns setof public.ai_sales_followups language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 return query update public.ai_sales_followups f set status='processing',attempts=attempts+1,updated_at=now()
 where f.id in(select x.id from public.ai_sales_followups x join public.ai_sales_workflow_sessions s on s.chat_id=x.chat_id
   join public.ai_sales_workflow_config c on c.tenant_id=x.tenant_id and c.enabled and c.followups_enabled
   join public.whatsapp_chats ch on ch.id=x.chat_id and ch.tenant_id=x.tenant_id
   join public.customers cu on cu.id=ch.customer_id and cu.tenant_id=x.tenant_id
   where x.status in ('scheduled','failed') and x.scheduled_for<=now() and x.attempts<5 and s.phase<>'paused'
    and coalesce(cu.opt_out,false)=false and ch.ai_mode in ('full','qualifying')
    and not exists(select 1 from public.whatsapp_messages m where m.chat_id=x.chat_id and m.direction='inbound' and m.created_at>x.created_at)
   order by x.scheduled_for for update of x skip locked limit greatest(1,least(p_limit,100)))
 returning f.*;
end $$;

create or replace function public.ai_sales_finish_followup(p_id uuid,p_sent boolean,p_error text default null)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 update public.ai_sales_followups set status=case when p_sent then 'sent' when attempts>=5 then 'failed' else 'scheduled' end,
  sent_at=case when p_sent then now() else sent_at end,last_error=left(p_error,1000),
  scheduled_for=case when not p_sent then now()+make_interval(mins=>least(300,15*(attempts+1))) else scheduled_for end,updated_at=now()
 where id=p_id and status='processing';
end $$;

create or replace function public.ai_sales_claim_document_jobs(p_limit integer default 10)
returns table(workflow_document_id uuid,tenant_id uuid,chat_id uuid,negotiation_id uuid,category text,message_id uuid,media_url text,payload_json jsonb)
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 return query with claimed as(
  update public.ai_sales_document_intake_jobs j set status='processing',attempts=attempts+1,updated_at=now()
   where j.workflow_document_id in(select x.workflow_document_id from public.ai_sales_document_intake_jobs x where x.status in ('pending','failed') and x.run_after<=now() and x.attempts<5 order by x.run_after for update skip locked limit greatest(1,least(p_limit,50)))
   returning j.*)
 select c.workflow_document_id,c.tenant_id,c.chat_id,c.negotiation_id,d.category,d.message_id,m.media_url,m.payload_json
 from claimed c join public.ai_sales_workflow_documents d on d.id=c.workflow_document_id join public.whatsapp_messages m on m.id=d.message_id;
end $$;

create or replace function public.ai_sales_prepare_legal_document(p_workflow_document_id uuid,p_file_name text,p_mime_type text,p_size bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.ai_sales_document_intake_jobs;doc public.ai_sales_workflow_documents;cas public.legal_cases;owner uuid;legal_doc public.legal_case_documents;cat text;newid uuid:=gen_random_uuid();
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 select * into j from public.ai_sales_document_intake_jobs where workflow_document_id=p_workflow_document_id and status='processing' for update;
 if not found then raise exception 'Document job unavailable';end if;
 if not exists(select 1 from public.legal_workspace_features where tenant_id=j.tenant_id and enabled) then raise exception 'Espaço jurídico ainda não habilitado';end if;
 select * into doc from public.ai_sales_workflow_documents where id=p_workflow_document_id;
 select id into owner from public.profiles where tenant_id=j.tenant_id and role='admin' and status='active' order by created_at limit 1;
 if owner is null then raise exception 'Administrador ativo indisponível';end if;
 select * into cas from public.legal_cases where tenant_id=j.tenant_id and negotiation_id=j.negotiation_id for update;
 if not found then
  insert into public.legal_cases(tenant_id,customer_id,negotiation_id,owner_id,title,area,case_type,next_action,next_action_due_at)
   select j.tenant_id,n.customer_id,j.negotiation_id,owner,n.title,'Tributário','consultivo','Conferir documentação recebida',now()+interval '1 day'
   from public.crm_negotiations n where n.id=j.negotiation_id and n.tenant_id=j.tenant_id returning * into cas;
 end if;
 if cas.id is null then raise exception 'Negociação vinculada indisponível';end if;
 cat:=case doc.category when 'medical' then 'medical' when 'income' then 'fiscal' when 'benefit' then 'fiscal' else 'general' end;
 if p_mime_type not in ('application/pdf','image/jpeg','image/png','text/plain') or p_size<=0 or p_size>10485760 then raise exception 'Documento inválido ou maior que 10 MiB';end if;
 insert into public.legal_case_documents(id,tenant_id,case_id,category,display_name,file_name,mime_type,size_bytes,storage_path,uploaded_by)
 values(newid,j.tenant_id,cas.id,cat,'Documento recebido pelo WhatsApp',left(p_file_name,200),p_mime_type,p_size,
   j.tenant_id::text||'/'||cas.id::text||'/'||newid::text,owner) returning * into legal_doc;
 update public.ai_sales_document_intake_jobs set legal_case_id=cas.id,legal_document_id=legal_doc.id,updated_at=now() where workflow_document_id=p_workflow_document_id;
 return jsonb_build_object('document_id',legal_doc.id,'case_id',cas.id,'storage_path',legal_doc.storage_path);
end $$;

create or replace function public.ai_sales_finish_document_job(p_workflow_document_id uuid,p_stored boolean,p_error text default null)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 update public.ai_sales_document_intake_jobs set status=case when p_stored then 'stored' when attempts>=5 then 'failed' else 'pending' end,
  last_error=left(p_error,1000),run_after=case when not p_stored then now()+make_interval(mins=>least(300,15*(attempts+1))) else run_after end,updated_at=now()
 where workflow_document_id=p_workflow_document_id and status='processing';
end $$;

create or replace function public.ai_sales_workflow_overview()
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
  select s.chat_id,s.phase,s.updated_at,c.display_name,l.negotiation_id,l.last_stage_id as crm_stage_id,
   (select count(*) from public.ai_sales_workflow_documents d where d.chat_id=s.chat_id) as documents_received,
   (select count(*) from public.ai_sales_document_intake_jobs j where j.chat_id=s.chat_id and j.status='stored') as documents_stored,
   (select count(*) from public.ai_sales_document_intake_jobs j where j.chat_id=s.chat_id and j.status='failed') as document_failures,
   (select d.id from public.ai_sales_contract_drafts d where d.chat_id=s.chat_id order by d.created_at desc limit 1) as draft_id,
   (select min(t.due_at) from public.crm_tasks t where t.negotiation_id=l.negotiation_id and t.status='aberta') as next_task_at,
   (select min(f.scheduled_for) from public.ai_sales_followups f where f.chat_id=s.chat_id and f.status='scheduled') as next_followup_at,
   (select count(*) from public.ai_sales_followups f where f.chat_id=s.chat_id and f.status='failed') as followup_failures
  from public.ai_sales_workflow_sessions s
  join public.whatsapp_chats c on c.id=s.chat_id and c.tenant_id=s.tenant_id
  left join public.ai_sales_crm_links l on l.chat_id=s.chat_id and l.tenant_id=s.tenant_id
  where public.ai_sales_workflow_admin(s.tenant_id) order by s.updated_at desc limit 100
 ) r;
$$;

revoke all on function public.ai_sales_claim_followups(integer),public.ai_sales_finish_followup(uuid,boolean,text),
 public.ai_sales_claim_document_jobs(integer),public.ai_sales_prepare_legal_document(uuid,text,text,bigint),
 public.ai_sales_finish_document_job(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.ai_sales_claim_followups(integer),public.ai_sales_finish_followup(uuid,boolean,text),
 public.ai_sales_claim_document_jobs(integer),public.ai_sales_prepare_legal_document(uuid,text,text,bigint),
 public.ai_sales_finish_document_job(uuid,boolean,text) to service_role;
revoke all on function public._ai_sales_stage_exists(uuid,text),public._ai_sales_task_spec(text),
 public._ai_sales_desired_stage(uuid),public._ai_sales_sync_crm(uuid),public._ai_sales_session_crm_trigger(),
 public._ai_sales_document_crm_trigger(),public._ai_sales_contract_crm_trigger(),
 public._ai_sales_previdas_crm_trigger(),public._ai_sales_cancel_followups_on_inbound() from public,anon,authenticated;
revoke all on function public.ai_sales_workflow_overview() from public,anon,authenticated;
grant execute on function public.ai_sales_workflow_overview() to authenticated;

-- Existing conversations are deliberately not backfilled: no historical card is moved.
commit;
