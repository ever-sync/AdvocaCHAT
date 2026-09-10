-- Migration: Alter default LLM provider to OpenAI and model to gpt-4o-mini

-- 1. Alter defaults
alter table public.tenant_ai_config
  alter column llm_provider set default 'openai',
  alter column model set default 'gpt-4o-mini';

-- 2. Migrate existing tenants
update public.tenant_ai_config
set
  llm_provider = 'openai',
  model = 'gpt-4o-mini'
where llm_provider = 'anthropic';
