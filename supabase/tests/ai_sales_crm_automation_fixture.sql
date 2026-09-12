\set ON_ERROR_STOP on
\ir ai_sales_workflow_fixture.sql
alter table public.profiles add column created_at timestamptz default now();
alter table public.whatsapp_chats add column last_message_at timestamptz default now();
alter table public.whatsapp_messages add column media_url text, add column payload_json jsonb default '{}', add column created_at timestamptz default now();

create table public.tenant_crm_funnel_config(tenant_id uuid primary key,funels_placeholder text, funnels jsonb not null);
create table public.crm_negotiations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,title text not null,funnel_id text not null,stage_id text not null,
 status text not null default 'em_andamento',customer_id uuid,assignee_id uuid,qualification integer default 0,total_value numeric default 0,
 next_task_at timestamptz,closing_forecast timestamptz,last_contact_at timestamptz,last_interaction_at timestamptz,updated_at timestamptz default now(),unique(id,tenant_id));
create table public.crm_tasks(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,negotiation_id uuid,customer_id uuid,title text not null,due_at timestamptz,
 status text not null default 'aberta',notes text not null default '',unique(id));
create table public.legal_workspace_features(tenant_id uuid primary key,enabled boolean not null);
create table public.legal_cases(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,customer_id uuid,negotiation_id uuid,owner_id uuid not null,title text not null,
 area text,case_type text,status text default 'ativo',next_action text,next_action_due_at timestamptz,wait_reason text default '',unique(id,tenant_id),unique(tenant_id,negotiation_id));
create table public.legal_case_documents(
 id uuid primary key,tenant_id uuid not null,case_id uuid not null,category text,display_name text,file_name text,mime_type text,size_bytes bigint,
 storage_path text,status text default 'prepared',sha256 text,uploaded_by uuid,retention_hold boolean default true,created_at timestamptz default now(),ready_at timestamptz,unique(id,tenant_id));
create function public.legal_finalize_document(uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
create function public.legal_abandon_document(uuid) returns void language sql as $$select$$;
grant all on public.tenant_crm_funnel_config,public.crm_negotiations,public.crm_tasks,
 public.legal_workspace_features,public.legal_cases,public.legal_case_documents to service_role;
grant all on public.tenants,public.profiles,public.customers,public.whatsapp_instances,
 public.whatsapp_chats,public.whatsapp_messages,public.tenant_ai_config to service_role;
