-- Bucket público para URLs acessíveis pelo provedor WhatsApp (UAZAPI) ao enviar mídia.
-- Caminho obrigatório: `{tenant_id}/{uuid}_{nomeSeguro}`

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-media', 'whatsapp-media', true, 52428800, null)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "whatsapp_media_insert_tenant" on storage.objects;
create policy "whatsapp_media_insert_tenant"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'whatsapp-media'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
);

drop policy if exists "whatsapp_media_update_tenant" on storage.objects;
create policy "whatsapp_media_update_tenant"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'whatsapp-media'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
)
with check (
  bucket_id = 'whatsapp-media'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
);

drop policy if exists "whatsapp_media_delete_tenant" on storage.objects;
create policy "whatsapp_media_delete_tenant"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'whatsapp-media'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
);
