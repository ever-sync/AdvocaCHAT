-- Adaptive thinking: liga extended thinking do Claude (Sonnet/Opus) só em
-- turnos complexos (RAG com vários trechos, mensagem longa, palavras-chave
-- de raciocínio). Haiku não suporta — independe da flag.
--
-- Trade-off: thinking adiciona ~2-5s de latência e tokens de saída extras,
-- mas melhora muito perguntas multi-step ou que exigem comparação. Default
-- true; admin pode desligar pra priorizar latência.

alter table public.tenant_ai_config
  add column if not exists enable_thinking boolean not null default true;

comment on column public.tenant_ai_config.enable_thinking is
  'Quando true, o orquestrador liga extended thinking em turnos complexos (Sonnet/Opus apenas; Haiku é sempre sem thinking).';

-- Auditoria: budget de thinking aplicado no turno (0/null = não usado).
alter table public.ai_turns
  add column if not exists thinking_budget integer;

comment on column public.ai_turns.thinking_budget is
  'Tokens reservados para extended thinking neste turno; 0/null = não usado.';
