-- Tier 3 — Frente 4: Times planos + gerente vê os dados do time.
-- Cada usuário pertence a um time (profiles.team_id). Um time tem um gerente (manager_id).
-- O gerente PASSA A ENXERGAR (read-only) os chats/mensagens/negociações dos membros do time.
-- Implementado com POLICIES ADITIVAS (permissivas = OR) p/ não tocar nas policies já endurecidas.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  manager_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists teams_tenant_idx on public.teams (tenant_id);
create index if not exists teams_manager_idx on public.teams (manager_id);

alter table public.profiles add column if not exists team_id uuid references public.teams(id) on delete set null;
create index if not exists profiles_team_idx on public.profiles (team_id);

alter table public.teams enable row level security;

-- Todos do tenant veem a lista de times (necessário p/ UI/atribuição). Escrita = colaboradores/edit.
drop policy if exists "teams_select" on public.teams;
create policy "teams_select" on public.teams for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "teams_insert" on public.teams;
create policy "teams_insert" on public.teams for insert
with check (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'colaboradores', 'edit'));

drop policy if exists "teams_update" on public.teams;
create policy "teams_update" on public.teams for update
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'colaboradores', 'edit'))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "teams_delete" on public.teams;
create policy "teams_delete" on public.teams for delete
using (public.is_same_tenant(tenant_id) and public.has_role_permission(tenant_id, 'colaboradores', 'edit'));

drop trigger if exists set_updated_at on public.teams;
create trigger set_updated_at before update on public.teams
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- O usuário atual gerencia o dono (assignee) informado?
-- (assignee pertence a um time cujo manager_id = auth.uid()). SECURITY DEFINER:
-- lê profiles/teams sem recursão de RLS. Retorna false p/ null.
-- ---------------------------------------------------------------------------
create or replace function public.manages_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles m
    join public.teams t on t.id = m.team_id
    where m.id = p_user
      and t.manager_id = auth.uid()
  );
$$;

grant execute on function public.manages_user(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Policies ADITIVAS de leitura p/ o gerente do time.
-- ---------------------------------------------------------------------------
drop policy if exists "whatsapp_chats_team_manager_select" on public.whatsapp_chats;
create policy "whatsapp_chats_team_manager_select"
on public.whatsapp_chats for select
using (public.is_same_tenant(tenant_id) and public.manages_user(assignee_id));

drop policy if exists "whatsapp_messages_team_manager_select" on public.whatsapp_messages;
create policy "whatsapp_messages_team_manager_select"
on public.whatsapp_messages for select
using (
  exists (
    select 1 from public.whatsapp_chats c
    where c.id = whatsapp_messages.chat_id
      and public.is_same_tenant(c.tenant_id)
      and public.manages_user(c.assignee_id)
  )
);

drop policy if exists "whatsapp_chat_tags_team_manager_select" on public.whatsapp_chat_tags;
create policy "whatsapp_chat_tags_team_manager_select"
on public.whatsapp_chat_tags for select
using (
  exists (
    select 1 from public.whatsapp_chats c
    where c.id = chat_id
      and public.is_same_tenant(c.tenant_id)
      and public.manages_user(c.assignee_id)
  )
);

drop policy if exists "crm_negotiations_team_manager_select" on public.crm_negotiations;
create policy "crm_negotiations_team_manager_select"
on public.crm_negotiations for select
using (public.is_same_tenant(tenant_id) and public.manages_user(assignee_id));
