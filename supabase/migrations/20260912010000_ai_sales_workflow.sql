-- Commercial orchestration only. This does not approve medical evidence or legal eligibility.
begin;

create table public.ai_sales_workflow_config (
  tenant_id uuid primary key references public.tenants(id),
  enabled boolean not null default false,
  sdr_name text not null default 'Davi' check (length(sdr_name) between 1 and 60),
  closer_name text not null default 'Clara' check (length(closer_name) between 1 and 60),
  sdr_instructions text not null default '' check (length(sdr_instructions) <= 12000),
  closer_instructions text not null default '' check (length(closer_instructions) <= 12000),
  contract_template text not null default '' check (length(contract_template) <= 50000),
  fee_terms text not null default '' check (length(fee_terms) <= 4000),
  template_approved boolean not null default false,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  check (not template_approved or (length(trim(contract_template)) > 0 and length(trim(fee_terms)) > 0))
);

create table public.ai_sales_workflow_sessions (
  chat_id uuid primary key references public.whatsapp_chats(id),
  tenant_id uuid not null references public.tenants(id),
  phase text not null default 'sdr' check (phase in ('sdr','closer','paused')),
  answers jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id,chat_id)
);

create table public.ai_sales_workflow_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  chat_id uuid not null,
  message_id uuid not null references public.whatsapp_messages(id),
  category text not null check (category in ('medical','benefit','income','other')),
  status text not null default 'received_unreviewed' check (status = 'received_unreviewed'),
  created_at timestamptz not null default now(),
  foreign key (tenant_id,chat_id) references public.ai_sales_workflow_sessions(tenant_id,chat_id),
  unique (chat_id,message_id)
);

create table public.ai_sales_contract_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  chat_id uuid not null,
  config_revision integer not null,
  content text not null,
  status text not null default 'prepared' check (status = 'prepared'),
  signature_status text not null default 'not_configured' check (signature_status = 'not_configured'),
  created_at timestamptz not null default now(),
  foreign key (tenant_id,chat_id) references public.ai_sales_workflow_sessions(tenant_id,chat_id)
);

create table public.ai_sales_workflow_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  chat_id uuid not null,
  request_key text not null check (length(request_key) between 1 and 200),
  action text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id,chat_id) references public.ai_sales_workflow_sessions(tenant_id,chat_id),
  unique (chat_id,request_key)
);
create index ai_sales_sessions_recent on public.ai_sales_workflow_sessions(tenant_id,updated_at desc);
create index ai_sales_drafts_chat on public.ai_sales_contract_drafts(chat_id,created_at desc);

create or replace function public.ai_sales_workflow_admin(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  select exists(select 1 from public.profiles where id=auth.uid() and tenant_id=p_tenant_id and status='active' and role='admin');
$$;

alter table public.ai_sales_workflow_config enable row level security;
alter table public.ai_sales_workflow_sessions enable row level security;
alter table public.ai_sales_workflow_documents enable row level security;
alter table public.ai_sales_contract_drafts enable row level security;
alter table public.ai_sales_workflow_events enable row level security;
create policy ai_sales_config_read on public.ai_sales_workflow_config for select to authenticated using (public.ai_sales_workflow_admin(tenant_id));
-- Session answers and document references are worker-only. The UI gets counts, never health content.
revoke all on public.ai_sales_workflow_config, public.ai_sales_workflow_sessions, public.ai_sales_workflow_documents, public.ai_sales_contract_drafts, public.ai_sales_workflow_events from anon,authenticated;
grant select on public.ai_sales_workflow_config to authenticated;
grant all on public.ai_sales_workflow_config, public.ai_sales_workflow_sessions, public.ai_sales_workflow_documents, public.ai_sales_contract_drafts, public.ai_sales_workflow_events to service_role;

create or replace function public.ai_sales_workflow_save(p_config jsonb,p_expected_revision integer)
returns public.ai_sales_workflow_config language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid; c public.ai_sales_workflow_config;
begin
  select tenant_id into t from public.profiles where id=auth.uid() and status='active' and role='admin';
  if t is null then raise exception 'Somente o administrador do escritório pode configurar os agentes.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(t::text,26000));
  select * into c from public.ai_sales_workflow_config where tenant_id=t for update;
  if coalesce(c.revision,0) <> p_expected_revision or p_expected_revision is null then raise exception 'A configuração mudou. Recarregue antes de salvar.' using errcode='40001'; end if;
  insert into public.ai_sales_workflow_config(tenant_id,enabled,sdr_name,closer_name,sdr_instructions,closer_instructions,contract_template,fee_terms,template_approved)
  values(t,coalesce((p_config->>'enabled')::boolean,false),trim(p_config->>'sdr_name'),trim(p_config->>'closer_name'),coalesce(p_config->>'sdr_instructions',''),coalesce(p_config->>'closer_instructions',''),coalesce(p_config->>'contract_template',''),coalesce(p_config->>'fee_terms',''),coalesce((p_config->>'template_approved')::boolean,false))
  on conflict(tenant_id) do update set enabled=excluded.enabled,sdr_name=excluded.sdr_name,closer_name=excluded.closer_name,sdr_instructions=excluded.sdr_instructions,closer_instructions=excluded.closer_instructions,contract_template=excluded.contract_template,fee_terms=excluded.fee_terms,template_approved=excluded.template_approved,revision=ai_sales_workflow_config.revision+1,updated_at=now()
  returning * into c;
  return c;
end; $$;

create or replace function public.ai_sales_workflow_action(p_tenant_id uuid,p_chat_id uuid,p_action text,p_input jsonb,p_expected_revision integer,p_request_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c public.ai_sales_workflow_config; s public.ai_sales_workflow_sessions; a jsonb; k text; v text; result jsonb; draft_id uuid; rendered text; customer_row public.customers; chat_row public.whatsapp_chats;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Worker access required' using errcode='42501'; end if;
  if p_request_key is null or length(p_request_key) not between 1 and 200 then raise exception 'Invalid request key'; end if;
  select * into c from public.ai_sales_workflow_config where tenant_id=p_tenant_id and enabled for share;
  if not found then raise exception 'Fluxo desativado'; end if;
  select * into chat_row from public.whatsapp_chats where id=p_chat_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Conversa indisponível' using errcode='42501'; end if;
  if chat_row.ai_mode not in ('full','qualifying') or chat_row.ai_mode is null then raise exception 'IA pausada nesta conversa'; end if;
  if not exists(select 1 from public.whatsapp_instances where id=chat_row.instance_id and tenant_id=p_tenant_id and ai_enabled)
     or not exists(select 1 from public.tenant_ai_config where tenant_id=p_tenant_id and provider='native') then raise exception 'Canal ou IA nativa desativados'; end if;
  select * into customer_row from public.customers where id=chat_row.customer_id and tenant_id=p_tenant_id;
  if customer_row.opt_out then raise exception 'Contato não autoriza mensagens'; end if;
  insert into public.ai_sales_workflow_sessions(chat_id,tenant_id) values(p_chat_id,p_tenant_id) on conflict do nothing;
  select * into s from public.ai_sales_workflow_sessions where chat_id=p_chat_id and tenant_id=p_tenant_id for update;
  select e.result into result from public.ai_sales_workflow_events e where e.chat_id=p_chat_id and e.request_key=p_request_key;
  if found then return result; end if;
  if s.revision <> p_expected_revision or p_expected_revision is null then raise exception 'Conversa mudou. Recarregue o estado.' using errcode='40001'; end if;
  if s.phase='paused' then
    if p_action='record_intake' and p_input='{"consent":"yes"}'::jsonb then s.phase:='sdr';
    else raise exception 'Fluxo pausado pelo contato'; end if;
  end if;
  if jsonb_typeof(p_input) <> 'object' or p_input is null then raise exception 'Invalid input'; end if;
  if p_action='record_intake' then
    if p_input='{}'::jsonb then raise exception 'Nenhuma resposta informada'; end if;
    a:=s.answers;
    for k,v in select key,value from jsonb_each_text(p_input) loop
      if k not in ('existing_client','benefit','pays_ir','health_reported','disease','has_documents','consent','contract_interest') or v is null or length(v)>300 then raise exception 'Invalid answer'; end if;
      if k='benefit' and v not in ('retirement','pension','military','other','unknown') then raise exception 'Invalid benefit'; end if;
      if k='pays_ir' and v not in ('yes','no','past','unknown') then raise exception 'Invalid tax answer'; end if;
      if k not in ('disease','benefit','pays_ir') and v not in ('yes','no','unknown') then raise exception 'Invalid answer value'; end if;
      a:=jsonb_set(a,array[k],to_jsonb(v));
    end loop;
    -- No automatic acceptance/refusal based on health. Completion only routes administrative work.
    if (p_input ? 'health_reported' or p_input ? 'disease') and coalesce(a->>'consent','')<>'yes' then raise exception 'Peça autorização antes de registrar saúde'; end if;
    if a->>'consent'='no' then s.phase:='paused';
    elsif a->>'consent'='yes' and a ?& array['existing_client','benefit','pays_ir','health_reported','has_documents']
      and (a->>'health_reported'<>'yes' or length(trim(coalesce(a->>'disease','')))>0) then s.phase:='closer'; end if;
    s.answers:=a;
  elsif p_action='register_document' then
    if s.phase<>'closer' or s.answers->>'consent' is distinct from 'yes' then raise exception 'Etapa documental não autorizada'; end if;
    if not exists(select 1 from public.whatsapp_messages where id=(p_input->>'message_id')::uuid and chat_id=p_chat_id and direction='inbound' and message_type in ('document','image')) then raise exception 'Arquivo não pertence à conversa'; end if;
    insert into public.ai_sales_workflow_documents(tenant_id,chat_id,message_id,category) values(p_tenant_id,p_chat_id,(p_input->>'message_id')::uuid,p_input->>'category') on conflict(chat_id,message_id) do nothing;
  elsif p_action='prepare_contract' then
    if s.phase<>'closer' or s.answers->>'consent' is distinct from 'yes' or s.answers->>'contract_interest' is distinct from 'yes' then raise exception 'O cliente precisa solicitar a preparação do contrato'; end if;
    if not c.template_approved then raise exception 'Modelo e honorários aguardam aprovação do escritório'; end if;
    if customer_row.id is null or length(trim(coalesce(customer_row.nome,'')))=0 then raise exception 'Nome do cliente pendente'; end if;
    rendered:=replace(c.contract_template,'{{honorarios}}',c.fee_terms);
    rendered:=replace(rendered,'{{nome}}',customer_row.nome);
    rendered:=replace(rendered,'{{email}}',coalesce(customer_row.email,''));
    rendered:=replace(rendered,'{{telefone}}',coalesce(customer_row.telefone,''));
    if rendered ~ '\{\{[^}]+\}\}' then raise exception 'O modelo contém campos não suportados ou incompletos'; end if;
    insert into public.ai_sales_contract_drafts(tenant_id,chat_id,config_revision,content) values(p_tenant_id,p_chat_id,c.revision,rendered) returning id into draft_id;
  else raise exception 'Unsupported action'; end if;
  update public.ai_sales_workflow_sessions set phase=s.phase,answers=s.answers,revision=revision+1,updated_at=now() where chat_id=p_chat_id returning * into s;
  result:=jsonb_build_object('phase',s.phase,'revision',s.revision,'answers',s.answers,'draft_id',draft_id,'signature_status','not_configured');
  insert into public.ai_sales_workflow_events(tenant_id,chat_id,request_key,action,result) values(p_tenant_id,p_chat_id,p_request_key,p_action,result);
  return result;
end; $$;

create or replace function public.ai_sales_workflow_overview()
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
    select s.chat_id,s.phase,s.updated_at,c.display_name,
      (select count(*) from public.ai_sales_workflow_documents d where d.chat_id=s.chat_id) as documents_received,
      (select d.id from public.ai_sales_contract_drafts d where d.chat_id=s.chat_id order by d.created_at desc limit 1) as draft_id
    from public.ai_sales_workflow_sessions s join public.whatsapp_chats c on c.id=s.chat_id and c.tenant_id=s.tenant_id
    where public.ai_sales_workflow_admin(s.tenant_id) order by s.updated_at desc limit 30
  ) r;
$$;

create or replace function public.ai_sales_contract_content(p_draft_id uuid)
returns text language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare body text;
begin
  select content into body from public.ai_sales_contract_drafts where id=p_draft_id and public.ai_sales_workflow_admin(tenant_id);
  if not found then raise exception 'Rascunho indisponível' using errcode='42501'; end if;
  return body;
end; $$;

revoke all on function public.ai_sales_workflow_admin(uuid),public.ai_sales_workflow_save(jsonb,integer),public.ai_sales_workflow_action(uuid,uuid,text,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.ai_sales_workflow_admin(uuid),public.ai_sales_workflow_save(jsonb,integer) to authenticated;
grant execute on function public.ai_sales_workflow_action(uuid,uuid,text,jsonb,integer,text) to service_role;
revoke all on function public.ai_sales_workflow_overview(),public.ai_sales_contract_content(uuid) from public,anon,authenticated;
grant execute on function public.ai_sales_workflow_overview(),public.ai_sales_contract_content(uuid) to authenticated;
commit;
