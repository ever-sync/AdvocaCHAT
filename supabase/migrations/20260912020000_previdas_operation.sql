begin;
create table public.ai_previdas_cases (
 chat_id uuid primary key,
 tenant_id uuid not null,
 status text not null default 'needed' check(status in ('needed','requested','scheduled','reschedule','awaiting_report','report_received','declined')),
 availability text not null default '' check(length(availability)<=300),
 appointment_at timestamptz,
 modality text check(modality in ('online','presencial')),
 confirmation_ref text,
 report_document_id uuid references public.ai_sales_workflow_documents(id),
 next_action_at timestamptz,
 revision integer not null default 0,
 updated_at timestamptz not null default now(),
 foreign key(tenant_id,chat_id) references public.ai_sales_workflow_sessions(tenant_id,chat_id)
);
create table public.ai_previdas_events (
 id uuid primary key default gen_random_uuid(),
 chat_id uuid not null references public.ai_previdas_cases(chat_id),
 actor_id uuid references public.profiles(id),
 source text not null check(source in ('agent','operator')),
 status text not null,
 details jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.ai_previdas_cases enable row level security;
alter table public.ai_previdas_events enable row level security;
revoke all on public.ai_previdas_cases,public.ai_previdas_events from anon,authenticated;
grant all on public.ai_previdas_cases,public.ai_previdas_events to service_role;

create function public.ai_previdas_seed() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if new.phase='closer' and new.answers->>'consent'='yes' and new.answers->>'has_documents'='no' then
   insert into public.ai_previdas_cases(chat_id,tenant_id) values(new.chat_id,new.tenant_id) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger ai_previdas_seed after insert or update on public.ai_sales_workflow_sessions for each row execute function public.ai_previdas_seed();
-- No historical records are moved or backfilled implicitly.
create function public.ai_previdas_update(p_chat_id uuid,p_input jsonb,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.ai_previdas_cases; s public.ai_sales_workflow_sessions; target text:=p_input->>'status'; worker boolean:=auth.role()='service_role';
begin
 select * into s from public.ai_sales_workflow_sessions where chat_id=p_chat_id for update;
 if not found or (not coalesce(worker,false) and not public.ai_sales_workflow_admin(s.tenant_id)) then raise exception 'Atendimento indisponível' using errcode='42501'; end if;
 if s.phase<>'closer' or s.answers->>'consent' is distinct from 'yes' then raise exception 'Atendimento sem autorização ativa'; end if;
 insert into public.ai_previdas_cases(chat_id,tenant_id) values(p_chat_id,s.tenant_id) on conflict do nothing;
 select * into r from public.ai_previdas_cases where chat_id=p_chat_id for update;
 if p_expected_revision is distinct from r.revision then raise exception 'O acompanhamento mudou. Recarregue.' using errcode='40001'; end if;
 if worker and target not in ('requested','reschedule','declined') then raise exception 'O agente não pode confirmar eventos externos'; end if;
 if not coalesce(worker,false) and target not in ('scheduled','reschedule','awaiting_report','report_received') then raise exception 'Evento operacional inválido'; end if;
 if target is null then raise exception 'Informe o evento'; end if;
 if target='requested' then
   if r.status not in ('needed','declined') or p_input->>'authorized' is distinct from 'true' then raise exception 'Confirme interesse e autorização para encaminhamento ao Pré Vidas'; end if;
 elsif target='scheduled' then
   if r.status not in ('requested','reschedule') or nullif(trim(p_input->>'confirmation_ref'),'') is null
     or nullif(p_input->>'appointment_at','') is null or coalesce(p_input->>'modality','') not in ('online','presencial') then raise exception 'Informe referência da confirmação, data e modalidade'; end if;
 elsif target='reschedule' then
   if r.status not in ('requested','scheduled','awaiting_report') then raise exception 'Não há consulta para reagendar'; end if;
 elsif target='awaiting_report' then
   if r.status<>'scheduled' or nullif(trim(p_input->>'confirmation_ref'),'') is null then raise exception 'Informe confirmação de realização da consulta'; end if;
 elsif target='report_received' then
   if r.status not in ('needed','requested','scheduled','reschedule','awaiting_report','declined') then raise exception 'Laudo já recebido'; end if;
   if not exists(select 1 from public.ai_sales_workflow_documents where id=(p_input->>'report_document_id')::uuid and chat_id=p_chat_id and tenant_id=s.tenant_id and category='medical') then raise exception 'Selecione um documento médico recebido neste atendimento'; end if;
 elsif target='declined' then
   if r.status not in ('needed','requested','reschedule') then raise exception 'Cancelamento de consulta confirmada exige contato com o parceiro'; end if;
 else raise exception 'Evento inválido'; end if;
 if target not in ('report_received','declined') and nullif(p_input->>'next_action_at','') is null then raise exception 'Defina o prazo da próxima ação'; end if;
 update public.ai_previdas_cases set status=target,
 availability=coalesce(p_input->>'availability',availability),
 appointment_at=case when target='scheduled' then (p_input->>'appointment_at')::timestamptz when target='reschedule' then null else appointment_at end,
 modality=case when target='scheduled' then p_input->>'modality' else modality end,
 confirmation_ref=case when target in ('scheduled','awaiting_report') then left(p_input->>'confirmation_ref',300) when target='reschedule' then null else confirmation_ref end,
 report_document_id=case when target='report_received' then (p_input->>'report_document_id')::uuid else report_document_id end,
 next_action_at=case when target in ('declined','report_received') then null else (p_input->>'next_action_at')::timestamptz end,
 revision=revision+1,updated_at=now() where chat_id=p_chat_id returning * into r;
 insert into public.ai_previdas_events(chat_id,actor_id,source,status,details) values(p_chat_id,case when worker then null else auth.uid() end,case when worker then 'agent' else 'operator' end,target,to_jsonb(r));
 return to_jsonb(r);
end $$;
revoke all on function public.ai_previdas_update(uuid,jsonb,integer),public.ai_previdas_seed() from public,anon,authenticated;
grant execute on function public.ai_previdas_update(uuid,jsonb,integer) to authenticated;
-- Workers use the sales action entry point, which checks tenant/channel/opt-out and idempotency.
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
  elsif p_action='record_previdas' then
    perform public.ai_previdas_update(p_chat_id,p_input,(p_input->>'revision')::integer);
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
  result:=result || jsonb_build_object('previdas',(select to_jsonb(p) from public.ai_previdas_cases p where p.chat_id=p_chat_id));
  insert into public.ai_sales_workflow_events(tenant_id,chat_id,request_key,action,result) values(p_tenant_id,p_chat_id,p_request_key,p_action,result);
  return result;
end; $$;


create function public.ai_previdas_overview(p_customer_id uuid default null)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (
 select p.*,c.display_name,
 (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'received_at',d.created_at)),'[]'::jsonb) from public.ai_sales_workflow_documents d where d.chat_id=p.chat_id and d.category='medical') as documents,
 (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) from (select source,status,created_at from public.ai_previdas_events where chat_id=p.chat_id order by created_at desc limit 10) e) as events
 from public.ai_previdas_cases p join public.whatsapp_chats c on c.id=p.chat_id and c.tenant_id=p.tenant_id
 where public.ai_sales_workflow_admin(p.tenant_id) and (p_customer_id is null or c.customer_id=p_customer_id)
 order by p.updated_at desc limit 100
) q;
$$;
revoke all on function public.ai_previdas_overview(uuid) from public,anon,authenticated;
grant execute on function public.ai_previdas_overview(uuid) to authenticated;
commit;
