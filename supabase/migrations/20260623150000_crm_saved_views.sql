-- Vistas salvas do CRM por usuário/tenant. Cada vista guarda o jsonb dos
-- filtros (o mesmo formato dos search params da página). Scope:
--   - private: visível só ao criador
--   - shared:  visível a todo o tenant; editável por gestores ou pelo criador
--
-- Aplicação: o front lê `filters` e despacha pra URL/state (sem migração no banco).

create table if not exists public.crm_saved_views (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  scope      text not null default 'private' check (scope in ('private', 'shared')),
  filters    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists crm_saved_views_tenant_idx
  on public.crm_saved_views (tenant_id, scope, created_by);

create index if not exists crm_saved_views_owner_idx
  on public.crm_saved_views (created_by, created_at desc);

drop trigger if exists crm_saved_views_set_updated_at on public.crm_saved_views;
create trigger crm_saved_views_set_updated_at
before update on public.crm_saved_views
for each row execute function public.set_updated_at();

alter table public.crm_saved_views enable row level security;

-- Vê: vistas do próprio + vistas compartilhadas do tenant.
drop policy if exists "crm_saved_views_select" on public.crm_saved_views;
create policy "crm_saved_views_select"
on public.crm_saved_views for select
using (
  public.is_same_tenant(tenant_id)
  and (scope = 'shared' or created_by = auth.uid())
);

-- Cria: qualquer usuário do tenant cria vistas privadas; gestores podem criar
-- também vistas compartilhadas. Sempre como o usuário autenticado.
drop policy if exists "crm_saved_views_insert" on public.crm_saved_views;
create policy "crm_saved_views_insert"
on public.crm_saved_views for insert
with check (
  public.is_same_tenant(tenant_id)
  and created_by = auth.uid()
  and (
    scope = 'private'
    or public.current_user_role() in ('admin', 'operacao', 'financeiro')
  )
);

-- Edita: o dono edita as próprias; gestores editam as compartilhadas.
drop policy if exists "crm_saved_views_update" on public.crm_saved_views;
create policy "crm_saved_views_update"
on public.crm_saved_views for update
using (
  public.is_same_tenant(tenant_id)
  and (
    created_by = auth.uid()
    or (scope = 'shared' and public.current_user_role() in ('admin', 'operacao', 'financeiro'))
  )
)
with check (
  public.is_same_tenant(tenant_id)
  and (
    created_by = auth.uid()
    or (scope = 'shared' and public.current_user_role() in ('admin', 'operacao', 'financeiro'))
  )
);

-- Exclui: o dono exclui as próprias; gestores excluem as compartilhadas.
drop policy if exists "crm_saved_views_delete" on public.crm_saved_views;
create policy "crm_saved_views_delete"
on public.crm_saved_views for delete
using (
  public.is_same_tenant(tenant_id)
  and (
    created_by = auth.uid()
    or (scope = 'shared' and public.current_user_role() in ('admin', 'operacao', 'financeiro'))
  )
);

-- Realtime: novas vistas compartilhadas aparecem pros colegas sem reload.
do $$
declare
  already_in boolean;
begin
  execute 'alter table public.crm_saved_views replica identity full';

  select exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_saved_views'
  ) into already_in;

  if not already_in then
    execute 'alter publication supabase_realtime add table public.crm_saved_views';
  end if;
end
$$;
