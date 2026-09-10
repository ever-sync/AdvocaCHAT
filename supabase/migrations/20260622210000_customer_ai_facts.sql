-- Memória de longo prazo por cliente: fatos curtos e duráveis que a IA
-- aprende ao longo das conversas ("prefere ser contatado pela manhã",
-- "tem 3 filhos", "não gosta de áudios longos"). Diferente de
-- customer_custom_fields (campos estruturados que o tenant define), aqui
-- é livre, free-form, e a IA decide o que vale lembrar.
--
-- Injetados no system prompt em cada turno para personalizar a resposta;
-- ficam visíveis e editáveis pelo time no CustomerProfileSheet.

create table if not exists public.customer_ai_facts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  fact        text not null check (length(trim(fact)) > 0 and length(fact) <= 280),
  source      text not null default 'ai' check (source in ('ai', 'human')),
  chat_id     uuid references public.whatsapp_chats(id) on delete set null,
  created_at  timestamptz not null default timezone('utc', now()),
  unique (customer_id, fact)
);

create index if not exists customer_ai_facts_customer_idx
  on public.customer_ai_facts (customer_id, created_at desc);
create index if not exists customer_ai_facts_tenant_idx
  on public.customer_ai_facts (tenant_id);

alter table public.customer_ai_facts enable row level security;

-- Leitura: qualquer membro do tenant.
drop policy if exists "customer_ai_facts_select" on public.customer_ai_facts;
create policy "customer_ai_facts_select"
on public.customer_ai_facts for select
using (public.is_same_tenant(tenant_id));

-- Insert: humanos com permissão de editar clientes; o orquestrador insere
-- via service role (bypass RLS) quando a IA aprende um fato.
drop policy if exists "customer_ai_facts_insert" on public.customer_ai_facts;
create policy "customer_ai_facts_insert"
on public.customer_ai_facts for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao', 'financeiro')
);

-- Delete: admin/operacao (curam a memória pra retirar fato errado/obsoleto).
drop policy if exists "customer_ai_facts_delete" on public.customer_ai_facts;
create policy "customer_ai_facts_delete"
on public.customer_ai_facts for delete
using (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao')
);

comment on table public.customer_ai_facts is
  'Fatos de longo prazo sobre o cliente que a IA aprende e usa para personalizar respostas; até 280 chars cada.';
