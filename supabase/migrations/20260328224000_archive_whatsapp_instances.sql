alter table public.whatsapp_instances
  add column if not exists archived_at timestamptz;

create index if not exists whatsapp_instances_tenant_archived_idx
on public.whatsapp_instances (tenant_id, archived_at);
