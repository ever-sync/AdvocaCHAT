-- Tenants: lock down to own tenant row only (was readable/writable without RLS).
alter table public.tenants enable row level security;

drop policy if exists "tenants_select_own" on public.tenants;
create policy "tenants_select_own"
on public.tenants
for select
using (
  id in (select tenant_id from public.profiles where id = auth.uid())
);

-- Webhook events: only service_role should insert; clients may read own tenant for debugging.
drop policy if exists "whatsapp_webhook_events_same_tenant_insert" on public.whatsapp_webhook_events;

-- Idempotência de webhooks (edge functions usam service_role — bypass RLS).
create table if not exists public.webhook_delivery_dedupe (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  dedupe_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, instance_id, dedupe_key)
);

alter table public.webhook_delivery_dedupe enable row level security;
