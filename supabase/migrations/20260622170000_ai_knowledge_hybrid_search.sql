-- Hybrid retrieval para RAG: vector (HNSW existente) + BM25 (tsvector PT-BR)
-- fundidos por Reciprocal Rank Fusion. Substitui o sinal único do cosine por
-- um score que pega tanto match exato de palavras (SKU, modelo, código)
-- quanto similaridade semântica (paráfrase, intent). O reranker da Voyage no
-- topo (na edge function) faz o ranking final.

-- 1. Coluna gerada com tsvector PT-BR + GIN index --------------------------
alter table public.ai_knowledge_chunks
  add column if not exists content_tsv tsvector
    generated always as (to_tsvector('portuguese', coalesce(content, ''))) stored;

create index if not exists ai_knowledge_chunks_tsv_idx
  on public.ai_knowledge_chunks using gin (content_tsv);

-- 2. RPC: vector + BM25, fundidos com Reciprocal Rank Fusion --------------
-- RRF: score = sum(1 / (k + rank_i)) por método, k=60 é o padrão da
-- literatura (Cormack et al.). Pega top N de cada lado e funde — o
-- corte de relevância semântica/lexical fica para o reranker no consumidor.
create or replace function public.match_ai_knowledge_hybrid(
  p_tenant_id uuid,
  p_query_text text,
  p_query_embedding vector(1024),
  p_match_count int default 12
)
returns table (
  id uuid,
  content text,
  vector_similarity double precision,
  text_rank double precision,
  rrf_score double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with
  candidate_pool as (
    select greatest(1, least(coalesce(p_match_count, 12), 40)) as k
  ),
  vector_hits as (
    select
      c.id,
      c.content,
      1 - (c.embedding <=> p_query_embedding) as similarity,
      row_number() over (order by c.embedding <=> p_query_embedding) as rank
    from public.ai_knowledge_chunks c
    where c.tenant_id = p_tenant_id
    order by c.embedding <=> p_query_embedding
    limit (select k from candidate_pool)
  ),
  text_query as (
    -- websearch_to_tsquery aceita sintaxe natural (aspas, OR), tolera ruído.
    select websearch_to_tsquery('portuguese', coalesce(p_query_text, '')) as q
  ),
  text_hits as (
    select
      c.id,
      c.content,
      ts_rank_cd(c.content_tsv, (select q from text_query)) as rank_score,
      row_number() over (
        order by ts_rank_cd(c.content_tsv, (select q from text_query)) desc
      ) as rank
    from public.ai_knowledge_chunks c, text_query
    where c.tenant_id = p_tenant_id
      and (select q from text_query) is not null
      and c.content_tsv @@ (select q from text_query)
    order by ts_rank_cd(c.content_tsv, (select q from text_query)) desc
    limit (select k from candidate_pool)
  ),
  fused as (
    select
      coalesce(v.id, t.id) as id,
      coalesce(v.content, t.content) as content,
      v.similarity as vector_similarity,
      t.rank_score as text_rank,
      coalesce(1.0 / (60 + v.rank), 0) + coalesce(1.0 / (60 + t.rank), 0) as rrf_score
    from vector_hits v
    full outer join text_hits t on t.id = v.id
  )
  select id, content, vector_similarity, text_rank, rrf_score
  from fused
  order by rrf_score desc
  limit (select k from candidate_pool);
$$;

grant execute on function public.match_ai_knowledge_hybrid(uuid, text, vector, integer)
  to authenticated, service_role;
