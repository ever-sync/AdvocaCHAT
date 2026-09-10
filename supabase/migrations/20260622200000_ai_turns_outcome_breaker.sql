-- Circuit breaker para IA: classifica o resultado de cada turno em outcome.
-- Quando a janela recente acumula falhas (≥3 em 5), o orquestrador trips
-- o chat pra 'handoff' silenciosamente e grava uma linha 'circuit_tripped'
-- como prova auditável na timeline.
--
-- Outcomes:
--   delivered        → IA enviou ao menos uma mensagem ao cliente
--   blocked_critique → self-critique bloqueou todos os sends propostos
--   no_reply         → loop terminou sem mensagem (timeout ou modelo desistiu)
--   tool_error       → todas as tools falharam, sem mensagem entregue
--   circuit_tripped  → breaker disparou; chat foi para handoff

alter table public.ai_turns
  add column if not exists outcome text;

alter table public.ai_turns
  drop constraint if exists ai_turns_outcome_chk;

alter table public.ai_turns
  add constraint ai_turns_outcome_chk
  check (outcome is null or outcome in ('delivered', 'blocked_critique', 'no_reply', 'tool_error', 'circuit_tripped'));

create index if not exists ai_turns_chat_recent_outcome_idx
  on public.ai_turns (chat_id, created_at desc);

comment on column public.ai_turns.outcome is
  'Classificação do turno para o circuit breaker; null = legado (anterior à migration).';
