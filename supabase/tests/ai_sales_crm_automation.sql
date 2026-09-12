\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
create function pg_temp.reject(statement text,label text) returns void language plpgsql as $$begin begin execute statement;exception when others then return;end;raise exception 'FAIL accepted: %',label;end$$;
insert into tenants values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into profiles(id,tenant_id,role,status) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','admin','active'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','admin','active');
insert into customers values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Pessoa de teste','test@example.invalid','5500000000000',false);
insert into whatsapp_instances values('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',true);
insert into whatsapp_chats(id,tenant_id,instance_id,customer_id,ai_mode,display_name) values('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','full','Pessoa de teste');
insert into whatsapp_messages(id,chat_id,direction,message_type,media_url,payload_json) values('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','inbound','document','https://example.invalid/file.pdf','{"mimeType":"application/pdf"}');
insert into tenant_ai_config values('00000000-0000-0000-0000-000000000001','native');
insert into tenant_crm_funnel_config(tenant_id,funels_placeholder,funnels) values('00000000-0000-0000-0000-000000000001','',
 '[{"id":"isencao-ir","stages":[{"id":"novo-contato"},{"id":"em-qualificacao"},{"id":"documentacao-pendente"},{"id":"previdas-agendamento"},{"id":"previdas-consulta"},{"id":"previdas-reagendamento"},{"id":"previdas-laudo"},{"id":"conferencia-documental"},{"id":"proposta-apresentada"},{"id":"contrato-preparacao"},{"id":"aguardando-assinatura"},{"id":"contratado"},{"id":"perdido"}]}]');
insert into legal_workspace_features values('00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true);
select public.ai_sales_workflow_save('{"enabled":true,"sdr_name":"Davi","closer_name":"Clara"}',0);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.ai_sales_workflow_action('00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','record_intake','{"consent":"yes","existing_client":"no","benefit":"retirement","pays_ir":"yes","health_reported":"yes","disease":"Doença declarada","has_documents":"no"}',0,'intake');
select pg_temp.assert((select count(*)=1 from crm_negotiations),'one conversation creates one card');
select pg_temp.assert((select stage_id='documentacao-pendente' from crm_negotiations),'missing report stays pending');
select pg_temp.assert((select count(*)=1 from crm_tasks where status='aberta'),'current stage has one open task');
select pg_temp.assert((select count(*)=2 from ai_sales_followups where status='scheduled'),'two bounded followups scheduled');
select public.ai_sales_workflow_action('00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','record_previdas','{"status":"requested","authorized":true,"revision":0,"next_action_at":"2026-12-02T10:00:00Z"}',1,'previdas');
select pg_temp.assert((select stage_id='previdas-agendamento' from crm_negotiations),'authorized referral moves card');
select pg_temp.assert((select count(*)=1 from crm_tasks where status='aberta' and title like '%Pré Vidas%'),'stage change completes old task and creates next');
select public.ai_sales_workflow_action('00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','register_document','{"message_id":"50000000-0000-0000-0000-000000000001","category":"medical"}',2,'doc');
select pg_temp.assert((select count(*)=1 from ai_sales_document_intake_jobs where status='pending'),'received document enters secure intake queue');
select pg_temp.assert((select count(*)=1 from crm_negotiations),'retries and events do not duplicate card');
insert into whatsapp_messages(id,chat_id,direction,message_type) values('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','inbound','text');
select pg_temp.assert((select count(*)=0 from ai_sales_followups where status='scheduled'),'inbound cancels pending followups');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true),set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.reject($q$select * from ai_sales_claim_followups(1)$q$,'authenticated user cannot claim followups');
select pg_temp.assert(public.ai_sales_workflow_overview()='[]'::jsonb,'other tenant cannot see operation');
select pg_temp.reject($q$select * from ai_sales_followups$q$,'operational tables are not directly readable');
reset role;
select 'All AI sales CRM automation assertions passed';
rollback;
