-- Transparência (LGPD): aviso de que o atendimento é por IA.
-- Enviado uma única vez por chat, na primeira atuação da IA.

alter table public.tenant_ai_config
  add column if not exists ai_disclosure_enabled boolean not null default true,
  add column if not exists ai_disclosure_message text;

alter table public.whatsapp_chats
  add column if not exists ai_disclosure_sent boolean not null default false;
