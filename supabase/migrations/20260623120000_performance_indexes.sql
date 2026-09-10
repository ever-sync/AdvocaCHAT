-- Indices de performance para tabelas quentes:
--   whatsapp_chats  -> listagem da Inbox (tenant_id, last_message_at desc nulls last)
--   whatsapp_messages -> RPC whatsapp_messages_page (chat_id, created_at desc, id desc)
--   FKs sem indice em tabelas grandes (instance_id, customer_id)
--   customers -> filtro por status dentro de tenant
--
-- Todos com IF NOT EXISTS para idempotencia. Sem CONCURRENTLY porque o supabase
-- CLI executa migrations dentro de transacao; se alguma tabela for muito grande
-- a ponto de bloqueio importar, rodar o CREATE INDEX CONCURRENTLY manualmente
-- e comentar essa migration.

-- ============================================================================
-- whatsapp_chats: listagem principal da Inbox
-- ============================================================================
-- listInboxChats() faz: WHERE tenant_id = ? ORDER BY last_message_at DESC NULLS LAST
create index if not exists whatsapp_chats_tenant_last_message_at_idx
  on public.whatsapp_chats (tenant_id, last_message_at desc nulls last);

-- FK helpers (Postgres nao cria automatico)
create index if not exists whatsapp_chats_customer_id_idx
  on public.whatsapp_chats (customer_id)
  where customer_id is not null;

create index if not exists whatsapp_chats_instance_id_idx
  on public.whatsapp_chats (instance_id);

-- ============================================================================
-- whatsapp_messages: thread de mensagens + listagens
-- ============================================================================
-- whatsapp_messages_page(p_chat_id, p_before_created_at, p_before_id):
--   WHERE chat_id = ? AND (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC
create index if not exists whatsapp_messages_chat_created_idx
  on public.whatsapp_messages (chat_id, created_at desc, id desc);

-- Listagens por tenant (auditoria/exportacoes/relatorios)
create index if not exists whatsapp_messages_tenant_created_idx
  on public.whatsapp_messages (tenant_id, created_at desc);

-- FK helper para joins e cascade
create index if not exists whatsapp_messages_instance_id_idx
  on public.whatsapp_messages (instance_id);

-- ============================================================================
-- customers: filtro por status
-- ============================================================================
create index if not exists customers_tenant_status_idx
  on public.customers (tenant_id, status);

-- ============================================================================
-- Atualiza estatisticas para o planner aproveitar os novos indices
-- ============================================================================
analyze public.whatsapp_chats;
analyze public.whatsapp_messages;
analyze public.customers;
