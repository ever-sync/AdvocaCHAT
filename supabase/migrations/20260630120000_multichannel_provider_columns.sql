-- Canal Instagram F1: generaliza as tabelas whatsapp_* para multi-canal.
-- provider identifica o backend da instância (UAZAPI hoje, Meta/Instagram em breve);
-- channel_type marca cada chat/mensagem para o Inbox diferenciar canais.
-- Defaults preservam todo o comportamento atual (tudo segue WhatsApp/UAZAPI).

alter table public.whatsapp_instances
  add column if not exists provider text not null default 'uazapi',
  add column if not exists meta_page_id text,
  add column if not exists meta_ig_user_id text;

alter table public.whatsapp_instances
  drop constraint if exists whatsapp_instances_provider_check;

alter table public.whatsapp_instances
  add constraint whatsapp_instances_provider_check
  check (provider in ('uazapi', 'meta_instagram'));

comment on column public.whatsapp_instances.provider is
  'Backend do canal: uazapi (WhatsApp) ou meta_instagram (Instagram Direct via Graph API).';
comment on column public.whatsapp_instances.meta_page_id is
  'ID da Página do Facebook vinculada (apenas provider=meta_instagram).';
comment on column public.whatsapp_instances.meta_ig_user_id is
  'IG User ID da conta profissional conectada (apenas provider=meta_instagram).';

alter table public.whatsapp_chats
  add column if not exists channel_type text not null default 'whatsapp';

alter table public.whatsapp_chats
  drop constraint if exists whatsapp_chats_channel_type_check;

alter table public.whatsapp_chats
  add constraint whatsapp_chats_channel_type_check
  check (channel_type in ('whatsapp', 'instagram'));

comment on column public.whatsapp_chats.channel_type is
  'Canal da conversa. Em instagram, remote_jid guarda o IGSID do contato (sem telefone).';

alter table public.whatsapp_messages
  add column if not exists channel_type text not null default 'whatsapp';

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_channel_type_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_channel_type_check
  check (channel_type in ('whatsapp', 'instagram'));

-- Filtro por canal no Inbox (lista de chats por tenant ordenada por atividade).
create index if not exists idx_whatsapp_chats_tenant_channel
  on public.whatsapp_chats (tenant_id, channel_type, last_message_at desc);
