-- Validação de regressão SQL (Fase 5.4 do plano multi-atendentes).
-- Uso: supabase db query --linked -f supabase/tests/rls_multi_attendant_validation.sql

-- Funções esperadas
select 'functions' as section, proname as name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'can_atendimento_act_on_chat',
    'can_modify_crm_negotiation',
    'can_access_crm_negotiation',
    'can_view_whatsapp_chat',
    'has_role_permission',
    'default_role_permission'
  )
order by proname;

-- Policies críticas
select 'policies' as section, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'whatsapp_chats',
    'whatsapp_messages',
    'crm_negotiations',
    'crm_tasks',
    'chat_notes',
    'chat_transfers',
    'whatsapp_chat_tags'
  )
order by tablename, policyname;

-- RLS habilitado
select 'rls' as section, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'whatsapp_chats',
    'whatsapp_messages',
    'crm_negotiations',
    'crm_tasks',
    'chat_notes',
    'chat_transfers',
    'crm_activities',
    'crm_stage_history',
    'crm_negotiation_documents'
  )
order by c.relname;

-- Ausências inesperadas (resultado vazio = OK)
select 'missing_policies' as section, missing.tablename, missing.policyname
from (
  values
    ('whatsapp_chats', 'whatsapp_chats_same_tenant_select'),
    ('whatsapp_chats', 'whatsapp_chats_same_tenant_update'),
    ('whatsapp_messages', 'whatsapp_messages_same_tenant_select'),
    ('crm_negotiations', 'crm_negotiations_same_tenant_select'),
    ('chat_notes', 'chat_notes_select'),
    ('chat_transfers', 'chat_transfers_same_tenant_select')
) as missing(tablename, policyname)
where not exists (
  select 1
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = missing.tablename
    and p.policyname = missing.policyname
);
