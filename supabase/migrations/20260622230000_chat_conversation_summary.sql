-- Conversation summarization para chats longos: resumo rolante das mensagens
-- antigas (Haiku) injetado como bloco no system prompt. Mantém contexto em
-- chats com 50+ mensagens sem inflar o prompt (limite de 20 msgs verbatim).
--
-- summary_up_to_msg_id é o ID da mensagem mais recente incluída no resumo;
-- o orquestrador só regenera quando o histórico avança N msgs além desse
-- ponto (evita custo a cada turno).

alter table public.whatsapp_chats
  add column if not exists ai_conversation_summary text,
  add column if not exists ai_summary_up_to_msg_id uuid references public.whatsapp_messages(id) on delete set null,
  add column if not exists ai_summary_updated_at timestamptz;

comment on column public.whatsapp_chats.ai_conversation_summary is
  'Resumo rolante das mensagens antigas (anteriores às últimas 20). Injetado no system prompt da IA.';
comment on column public.whatsapp_chats.ai_summary_up_to_msg_id is
  'ID da mensagem mais recente incluída no resumo; usado pra decidir quando regenerar.';
