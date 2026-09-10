-- AI orchestrator — Fase 5 (F5): observabilidade.
-- Registra cada turno da IA para auditar/depurar (anti-alucinação): mensagem do cliente,
-- trechos da base recuperados (com score), resposta enviada, tools chamadas, tokens e latência.

create table if not exists public.ai_turns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  chat_id uuid references public.whatsapp_chats(id) on delete set null,
  model text not null,
  user_message text,
  retrieved jsonb not null default '[]'::jsonb,
  reply text,
  tools jsonb not null default '[]'::jsonb,
  stop_reason text,
  iterations integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  latency_ms integer,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_turns_tenant_time_idx on public.ai_turns (tenant_id, created_at desc);
create index if not exists ai_turns_chat_idx on public.ai_turns (chat_id, created_at desc);

alter table public.ai_turns enable row level security;

-- Aba "Atividade" lê os turnos do próprio tenant; inserts só via service role (orquestrador).
drop policy if exists "ai_turns_select" on public.ai_turns;
create policy "ai_turns_select" on public.ai_turns
for select using (public.is_same_tenant(tenant_id));
