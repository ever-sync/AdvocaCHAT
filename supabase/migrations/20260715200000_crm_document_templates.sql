-- Criar tabela de modelos de documentos e formulários customizados
create table if not exists public.crm_document_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category text not null, -- 'anamnese', 'orcamento', 'contrato'
  name text not null,
  content text not null default '',
  fields jsonb not null default '[]'::jsonb, -- array de campos dinâmicos para anamneses
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Habilitar RLS
alter table public.crm_document_templates enable row level security;

-- Políticas de acesso para usuários autenticados do Tenant
drop policy if exists "crm_document_templates_tenant_select" on public.crm_document_templates;
create policy "crm_document_templates_tenant_select"
on public.crm_document_templates
for select
to authenticated
using (public.is_same_tenant(tenant_id));

drop policy if exists "crm_document_templates_tenant_insert" on public.crm_document_templates;
create policy "crm_document_templates_tenant_insert"
on public.crm_document_templates
for insert
to authenticated
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_document_templates_tenant_update" on public.crm_document_templates;
create policy "crm_document_templates_tenant_update"
on public.crm_document_templates
for update
to authenticated
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_document_templates_tenant_delete" on public.crm_document_templates;
create policy "crm_document_templates_tenant_delete"
on public.crm_document_templates
for delete
to authenticated
using (public.is_same_tenant(tenant_id));

-- Política para permitir que clientes anônimos busquem a estrutura do template para preenchimento
drop policy if exists "crm_document_templates_public_select" on public.crm_document_templates;
create policy "crm_document_templates_public_select"
on public.crm_document_templates
for select
to public
using (true);
