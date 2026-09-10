-- Permite que usuários anônimos (públicos) enviem fichas de anamnese
-- Criando política de inserção pública na tabela crm_negotiation_documents
drop policy if exists "crm_negotiation_documents_public_insert" on public.crm_negotiation_documents;
create policy "crm_negotiation_documents_public_insert"
on public.crm_negotiation_documents
for insert
to public
with check (true);

-- Criando política de inserção pública no bucket crm-lead-documents
drop policy if exists "crm_lead_docs_insert_public" on storage.objects;
create policy "crm_lead_docs_insert_public"
on storage.objects
for insert
to public
with check (
  bucket_id = 'crm-lead-documents'
);
