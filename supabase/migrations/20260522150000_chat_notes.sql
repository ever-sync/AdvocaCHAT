-- Notas internas por chat: visíveis apenas para a equipe, nunca enviadas ao cliente.
-- Ficam interleaved no thread com estilo visual distinto (âmbar).

create table if not exists public.chat_notes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  chat_id    uuid not null references public.whatsapp_chats(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body_text  text not null check (length(trim(body_text)) > 0),
  edited_at  timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists chat_notes_chat_idx
  on public.chat_notes (chat_id, created_at desc);

create index if not exists chat_notes_tenant_idx
  on public.chat_notes (tenant_id, chat_id);

alter table public.chat_notes enable row level security;

-- Qualquer membro do tenant que pode ver o chat pode ver suas notas
create policy "chat_notes_select"
on public.chat_notes for select
using (public.is_same_tenant(tenant_id));

-- Qualquer membro autenticado do tenant pode criar notas
create policy "chat_notes_insert"
on public.chat_notes for insert
with check (
  public.is_same_tenant(tenant_id)
  and author_id = auth.uid()
);

-- Autor pode editar sua própria nota; admin/op pode editar qualquer
create policy "chat_notes_update"
on public.chat_notes for update
using (
  public.is_same_tenant(tenant_id)
  and (
    author_id = auth.uid()
    or public.current_user_role() in ('admin', 'operacao')
  )
);

-- Autor pode deletar sua própria nota; admin/op pode deletar qualquer
create policy "chat_notes_delete"
on public.chat_notes for delete
using (
  public.is_same_tenant(tenant_id)
  and (
    author_id = auth.uid()
    or public.current_user_role() in ('admin', 'operacao')
  )
);

-- Realtime: notas aparecem instantaneamente no thread do atendente
alter table public.chat_notes replica identity full;

do $$
declare has_notes boolean;
begin
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_notes'
  ) into has_notes;

  if not has_notes then
    alter publication supabase_realtime add table public.chat_notes;
  end if;
end $$;
