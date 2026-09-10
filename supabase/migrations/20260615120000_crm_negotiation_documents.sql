-- Documentos anexados a negociações CRM (leads). Arquivos em Storage bucket privado `crm-lead-documents`.

-- Necessário para FK composta (negotiation_id, tenant_id) → (id, tenant_id).
create unique index if not exists crm_negotiations_id_tenant_uid
  on public.crm_negotiations (id, tenant_id);

create table if not exists public.crm_negotiation_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  negotiation_id uuid not null,
  display_name text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0 check (file_size >= 0),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint crm_negotiation_documents_negotiation_tenant_fk
    foreign key (negotiation_id, tenant_id)
    references public.crm_negotiations (id, tenant_id)
    on delete cascade,
  constraint crm_negotiation_documents_display_name_trim check (char_length(trim(display_name)) > 0)
);

create index if not exists crm_negotiation_documents_tenant_idx
  on public.crm_negotiation_documents (tenant_id);

create index if not exists crm_negotiation_documents_negotiation_idx
  on public.crm_negotiation_documents (negotiation_id);

alter table public.crm_negotiation_documents enable row level security;

drop policy if exists "crm_negotiation_documents_same_tenant_select" on public.crm_negotiation_documents;
create policy "crm_negotiation_documents_same_tenant_select"
on public.crm_negotiation_documents
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiation_documents_same_tenant_insert" on public.crm_negotiation_documents;
create policy "crm_negotiation_documents_same_tenant_insert"
on public.crm_negotiation_documents
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiation_documents_same_tenant_delete" on public.crm_negotiation_documents;
create policy "crm_negotiation_documents_same_tenant_delete"
on public.crm_negotiation_documents
for delete
using (public.is_same_tenant(tenant_id));

-- Bucket privado: path `{tenant_id}/{negotiation_id}/{uuid}_{arquivo}`

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm-lead-documents', 'crm-lead-documents', false, 26214400, null)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "crm_lead_docs_select_tenant" on storage.objects;
create policy "crm_lead_docs_select_tenant"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'crm-lead-documents'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
);

drop policy if exists "crm_lead_docs_insert_tenant" on storage.objects;
create policy "crm_lead_docs_insert_tenant"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'crm-lead-documents'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
);

drop policy if exists "crm_lead_docs_update_tenant" on storage.objects;
create policy "crm_lead_docs_update_tenant"
on storage.objects
for update
to authenticated
using  (
  bucket_id = 'crm-lead-documents'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
)
with check (
  bucket_id = 'crm-lead-documents'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
);

drop policy if exists "crm_lead_docs_delete_tenant" on storage.objects;
create policy "crm_lead_docs_delete_tenant"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'crm-lead-documents'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
);
