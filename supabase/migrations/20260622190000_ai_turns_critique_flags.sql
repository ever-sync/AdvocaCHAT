-- Self-critique / hallucination guard: cada send_whatsapp_message com
-- contexto de RAG é auditado por uma chamada barata (Haiku) que verifica
-- se as afirmações factuais da resposta estão sustentadas pelos chunks.
-- Resultados ficam aqui para audit + tuning do threshold.
--
-- Formato: array de [{ "blocked": bool, "issues": ["..."], "text": "..." }]
-- — uma entrada por send_whatsapp_message proposto no turno (pode bloquear
-- e o LLM tentar de novo na mesma iteração).

alter table public.ai_turns
  add column if not exists critique_flags jsonb not null default '[]'::jsonb;

comment on column public.ai_turns.critique_flags is
  'Resultados do self-critique sobre cada send_whatsapp_message proposto no turno; vazio = não auditado.';
