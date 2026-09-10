-- AI orchestrator — Fase 7 (F7): multi-LLM.
-- Provedor de LLM por tenant (Anthropic ou OpenAI). O `model` continua sendo o id do
-- modelo dentro do provedor escolhido. Embeddings/RAG seguem na Voyage independentemente.

alter table public.tenant_ai_config
  add column if not exists llm_provider text not null default 'anthropic';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_ai_config_llm_provider_chk'
  ) then
    alter table public.tenant_ai_config
      add constraint tenant_ai_config_llm_provider_chk
      check (llm_provider in ('anthropic', 'openai'));
  end if;
end $$;
