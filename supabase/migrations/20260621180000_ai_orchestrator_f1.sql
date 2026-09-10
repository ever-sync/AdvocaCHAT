-- AI orchestrator — Fase 1 (F1)
-- Fila de turnos (ai_jobs), config por tenant (tenant_ai_config) e medição (ai_usage).
-- O switch de provider (off|n8n|native) vive em tenant_ai_config.provider; o webhook
-- (processMessagePayload → enqueueAiTurn) enfileira quando provider='native', e o worker
-- edge function `ai-orchestrator` drena a fila (loop de tool-use do Claude).

-- 1. Config de IA por tenant ------------------------------------------------
create table if not exists public.tenant_ai_config (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  provider text not null default 'off' check (provider in ('off', 'n8n', 'native')),
  model text not null default 'claude-sonnet-4-6',
  system_prompt text,
  debounce_seconds integer not null default 8 check (debounce_seconds between 0 and 120),
  max_output_tokens integer not null default 1024 check (max_output_tokens between 256 and 8192),
  monthly_token_limit bigint,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.tenant_ai_config enable row level security;

-- UI (página Agente IA, gated pela permissão 'ia') lê/grava pelo tenant; o worker usa
-- service role (admin client) e ignora RLS.
drop policy if exists "tenant_ai_config_select" on public.tenant_ai_config;
create policy "tenant_ai_config_select" on public.tenant_ai_config
for select using (public.is_same_tenant(tenant_id));

drop policy if exists "tenant_ai_config_insert" on public.tenant_ai_config;
create policy "tenant_ai_config_insert" on public.tenant_ai_config
for insert with check (public.is_same_tenant(tenant_id));

drop policy if exists "tenant_ai_config_update" on public.tenant_ai_config;
create policy "tenant_ai_config_update" on public.tenant_ai_config
for update using (public.is_same_tenant(tenant_id)) with check (public.is_same_tenant(tenant_id));

-- 2. Fila de turnos da IA ---------------------------------------------------
-- unique(chat_id): um job por chat. O enqueue faz UPSERT por chat → rajadas de
-- mensagens coalescem num único turno (debounce empurra run_after).
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  chat_id uuid not null references public.whatsapp_chats(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  run_after timestamptz not null default timezone('utc', now()),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (chat_id)
);

create index if not exists ai_jobs_due_idx on public.ai_jobs (status, run_after);

-- Sem policies: só o service role (admin client) acessa a fila.
alter table public.ai_jobs enable row level security;

-- 3. Medição de consumo de tokens ------------------------------------------
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  chat_id uuid references public.whatsapp_chats(id) on delete set null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_usage_tenant_time_idx on public.ai_usage (tenant_id, created_at);

alter table public.ai_usage enable row level security;

-- Aba "Atividade" lê o consumo do próprio tenant; inserts só via service role.
drop policy if exists "ai_usage_select" on public.ai_usage;
create policy "ai_usage_select" on public.ai_usage
for select using (public.is_same_tenant(tenant_id));

-- 4. Agendamento do drain (configurar UMA vez, manualmente) -----------------
-- Mesma convenção do campaign-dispatcher: pg_cron + pg_net chamando a edge function.
-- Rode no SQL editor do projeto, trocando <PROJECT_REF> e <CRON_SECRET>:
--
-- select cron.schedule(
--   'ai-orchestrator-drain',
--   '10 seconds',
--   $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/ai-orchestrator',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
--     body    := '{}'::jsonb
--   );
--   $$
-- );
