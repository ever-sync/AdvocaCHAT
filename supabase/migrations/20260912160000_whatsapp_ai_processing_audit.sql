begin;

alter table public.whatsapp_messages
  add column if not exists ai_processing_status text,
  add column if not exists ai_processing_reason text,
  add column if not exists ai_processing_at timestamptz;

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_ai_processing_status_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_ai_processing_status_check
  check (ai_processing_status is null or ai_processing_status in ('queued','forwarded','ignored','processed','failed'));

create index if not exists whatsapp_messages_ai_processing_attention
  on public.whatsapp_messages(tenant_id,created_at desc)
  where direction='inbound' and ai_processing_status in ('ignored','failed');

comment on column public.whatsapp_messages.ai_processing_status is
  'Resultado do roteamento da mensagem recebida para IA.';
comment on column public.whatsapp_messages.ai_processing_reason is
  'Motivo legível e estável para enfileirar, encaminhar ou ignorar a mensagem.';

commit;
