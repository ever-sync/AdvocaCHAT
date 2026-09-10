-- Marketing → Automações: tabela de fluxos por tenant.
-- Substitui o mock SAMPLE_FLOWS de src/components/marketing/MarketingAutomations.tsx.
-- Estrutura mínima alinhada com a lista (nome/status/contadores/datas); o canvas
-- do editor é serializado em `definition` (jsonb), critérios de entrada em
-- `criteria` (jsonb) — ambos opacos pro backend nesta fase.
-- RLS: marketing role (is_same_tenant + has_role_permission(tenant,'marketing',...)).

create table if not exists public.marketing_flows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  status text not null default 'inativo' check (status in ('ativo', 'inativo')),
  definition jsonb not null default '{"steps": []}'::jsonb,
  criteria jsonb not null default '{}'::jsonb,
  leads_entry integer not null default 0,
  leads_active integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists marketing_flows_tenant_idx
  on public.marketing_flows (tenant_id);

create index if not exists marketing_flows_tenant_status_idx
  on public.marketing_flows (tenant_id, status);

create index if not exists marketing_flows_tenant_updated_idx
  on public.marketing_flows (tenant_id, updated_at desc);

drop trigger if exists marketing_flows_set_updated_at on public.marketing_flows;
create trigger marketing_flows_set_updated_at
before update on public.marketing_flows
for each row execute function public.set_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.marketing_flows enable row level security;

drop policy if exists "marketing_flows_select" on public.marketing_flows;
create policy "marketing_flows_select"
on public.marketing_flows for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'view')
);

drop policy if exists "marketing_flows_insert" on public.marketing_flows;
create policy "marketing_flows_insert"
on public.marketing_flows for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
);

drop policy if exists "marketing_flows_update" on public.marketing_flows;
create policy "marketing_flows_update"
on public.marketing_flows for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "marketing_flows_delete" on public.marketing_flows;
create policy "marketing_flows_delete"
on public.marketing_flows for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'delete')
);
