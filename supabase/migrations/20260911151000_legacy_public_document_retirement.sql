-- Retire the old public anamnese/quote submission paths. Browser anon-key HMAC
-- never authorized document writes. Keep rows/files and authenticated tenant ACLs.
begin;

drop policy if exists "crm_negotiation_documents_public_insert" on public.crm_negotiation_documents;
drop policy if exists "crm_document_templates_public_select" on public.crm_document_templates;
drop policy if exists "crm_lead_docs_insert_public" on storage.objects;

revoke all privileges on public.crm_negotiation_documents from public, anon;
revoke all privileges on public.crm_document_templates from public, anon;

-- Guard against other permissive policies or later accidental anon grants.
drop policy if exists legacy_crm_documents_deny_anon on public.crm_negotiation_documents;
create policy legacy_crm_documents_deny_anon on public.crm_negotiation_documents
  as restrictive for all to anon using (false) with check (false);

drop policy if exists legacy_crm_templates_deny_anon on public.crm_document_templates;
create policy legacy_crm_templates_deny_anon on public.crm_document_templates
  as restrictive for all to anon using (false) with check (false);

drop policy if exists legacy_crm_storage_deny_anon on storage.objects;
create policy legacy_crm_storage_deny_anon on storage.objects
  as restrictive for all to anon
  using (bucket_id <> 'crm-lead-documents')
  with check (bucket_id <> 'crm-lead-documents');

-- Previously generated signed URLs expire normally; no new public bucket URLs.
update storage.buckets set public = false where id = 'crm-lead-documents' and public = true;

notify pgrst, 'reload schema';
commit;
