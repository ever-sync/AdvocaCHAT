-- Minimal isolated PostgreSQL harness; never run against an application database.
\set ON_ERROR_STOP on
do $$ begin if current_database()<>'ai_sales_workflow_test' then raise exception 'Requires disposable ai_sales_workflow_test database'; end if; end $$;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
grant usage on schema auth,public to anon,authenticated,service_role;
create table public.tenants(id uuid primary key);
create table public.profiles(id uuid primary key,tenant_id uuid,role text,status text);
create table public.customers(id uuid primary key,tenant_id uuid,nome text,email text,telefone text,opt_out boolean default false);
create table public.whatsapp_instances(id uuid primary key,tenant_id uuid,ai_enabled boolean);
create table public.whatsapp_chats(id uuid primary key,tenant_id uuid,instance_id uuid,customer_id uuid,ai_mode text,display_name text);
create table public.whatsapp_messages(id uuid primary key,chat_id uuid,direction text,message_type text);
create table public.tenant_ai_config(tenant_id uuid primary key,provider text);
