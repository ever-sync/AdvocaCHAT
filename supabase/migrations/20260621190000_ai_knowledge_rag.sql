-- AI orchestrator — Fase 3 (F3): RAG por tenant (pgvector).
-- Base de conhecimento por tenant: fontes (texto) → chunks com embedding (Voyage
-- voyage-3.5, 1024 dims). O orquestrador embeda a última mensagem e busca os trechos
-- mais relevantes via match_ai_knowledge, injetando no system prompt.

create extension if not exists vector;

-- 1. Fontes de conhecimento (uma "fonte" = um texto ingerido) -----------------
create table if not exists public.ai_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  kind text not null default 'text' check (kind in ('text')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_knowledge_sources_tenant_idx on public.ai_knowledge_sources (tenant_id);

alter table public.ai_knowledge_sources enable row level security;

drop policy if exists "ai_knowledge_sources_select" on public.ai_knowledge_sources;
create policy "ai_knowledge_sources_select" on public.ai_knowledge_sources
for select using (public.is_same_tenant(tenant_id));
drop policy if exists "ai_knowledge_sources_insert" on public.ai_knowledge_sources;
create policy "ai_knowledge_sources_insert" on public.ai_knowledge_sources
for insert with check (public.is_same_tenant(tenant_id));
drop policy if exists "ai_knowledge_sources_update" on public.ai_knowledge_sources;
create policy "ai_knowledge_sources_update" on public.ai_knowledge_sources
for update using (public.is_same_tenant(tenant_id)) with check (public.is_same_tenant(tenant_id));
drop policy if exists "ai_knowledge_sources_delete" on public.ai_knowledge_sources;
create policy "ai_knowledge_sources_delete" on public.ai_knowledge_sources
for delete using (public.is_same_tenant(tenant_id));

-- 2. Chunks com embedding ----------------------------------------------------
create table if not exists public.ai_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_id uuid references public.ai_knowledge_sources(id) on delete cascade,
  chunk_index int not null default 0,
  content text not null,
  embedding vector(1024) not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_knowledge_chunks_tenant_idx on public.ai_knowledge_chunks (tenant_id);
-- HNSW + distância de cosseno (embeddings da Voyage são comparados por cosseno).
create index if not exists ai_knowledge_chunks_embedding_idx
  on public.ai_knowledge_chunks using hnsw (embedding vector_cosine_ops);

alter table public.ai_knowledge_chunks enable row level security;

-- Leitura/remoção pelo tenant; inserts só via service role (ingestão precisa do embedding).
drop policy if exists "ai_knowledge_chunks_select" on public.ai_knowledge_chunks;
create policy "ai_knowledge_chunks_select" on public.ai_knowledge_chunks
for select using (public.is_same_tenant(tenant_id));
drop policy if exists "ai_knowledge_chunks_delete" on public.ai_knowledge_chunks;
create policy "ai_knowledge_chunks_delete" on public.ai_knowledge_chunks
for delete using (public.is_same_tenant(tenant_id));

-- 3. Busca por similaridade (filtrada por tenant) ----------------------------
create or replace function public.match_ai_knowledge(
  p_tenant_id uuid,
  p_query_embedding vector(1024),
  p_match_count int default 5
)
returns table (id uuid, content text, similarity double precision)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.ai_knowledge_chunks c
  where c.tenant_id = p_tenant_id
  order by c.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 5), 20));
$$;

grant execute on function public.match_ai_knowledge(uuid, vector, integer) to authenticated, service_role;
