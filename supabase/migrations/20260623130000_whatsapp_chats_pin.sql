-- Adiciona suporte a fixar conversa (pin) no inbox.
-- A coluna é por conversa (não por usuário): administradores e atendentes com
-- permissão de edição de inbox podem fixar/desafixar.

ALTER TABLE public.whatsapp_chats
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- Índice para listagens que ordenam pinned first (opcional, já que a tabela
-- tem índices existentes, mas ajuda se o filtro for comum).
CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_is_pinned
  ON public.whatsapp_chats (tenant_id, is_pinned)
  WHERE is_pinned = true;
