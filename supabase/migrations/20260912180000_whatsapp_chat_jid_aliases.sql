create table if not exists public.whatsapp_chat_jid_aliases (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  jid text not null,
  chat_id uuid not null references public.whatsapp_chats(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, instance_id, jid)
);

create index if not exists whatsapp_chat_jid_aliases_chat_idx
  on public.whatsapp_chat_jid_aliases (chat_id);

alter table public.whatsapp_chat_jid_aliases enable row level security;

drop policy if exists "Tenant members can view WhatsApp JID aliases"
  on public.whatsapp_chat_jid_aliases;
create policy "Tenant members can view WhatsApp JID aliases"
  on public.whatsapp_chat_jid_aliases
  for select
  using (
    tenant_id in (
      select profiles.tenant_id from public.profiles where profiles.id = auth.uid()
    )
  );

comment on table public.whatsapp_chat_jid_aliases is
  'Relaciona os identificadores LID e numero do WhatsApp ao mesmo chat canonico.';
