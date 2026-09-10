-- Indices trigram para acelerar a busca da inbox.
--
-- Hoje `listInboxChats` (src/lib/api/whatsapp.ts) faz:
--   .or('display_name.ilike.%TXT%,remote_phone_digits.ilike.%TXT%,customers.nome.ilike.%TXT%')
-- sem indice, cada caractere digitado faz Postgres rodar 3 sequential scans.
--
-- pg_trgm + GIN deixa esses ilike substr competitivos: o planner usa o indice
-- quando ha pelo menos 3 caracteres na busca (default `pg_trgm.similarity_threshold`).
--
-- Observacao operacional: `create index` (sem CONCURRENTLY) bloqueia escritas
-- durante a criacao. Como migrations Supabase rodam em transacao e o volume
-- atual das tabelas e moderado, optamos pelo modo regular. Em bases grandes,
-- considerar reaplicar com `create index concurrently` em migration sem txn.

create extension if not exists pg_trgm;

create index if not exists whatsapp_chats_display_name_trgm_idx
  on public.whatsapp_chats using gin (display_name gin_trgm_ops);

create index if not exists whatsapp_chats_remote_phone_digits_trgm_idx
  on public.whatsapp_chats using gin (remote_phone_digits gin_trgm_ops);

create index if not exists customers_nome_trgm_idx
  on public.customers using gin (nome gin_trgm_ops);
