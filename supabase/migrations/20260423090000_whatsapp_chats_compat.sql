-- Compatibilidade para ambientes legados onde `whatsapp_chats` pode ter sido
-- criado sem todas as colunas/trigger esperadas pelas versões atuais do app.

alter table if exists public.whatsapp_chats
  add column if not exists last_message_preview text,
  add column if not exists last_message_at timestamptz,
  add column if not exists unread_count integer not null default 0,
  add column if not exists status text not null default 'open',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'whatsapp_chats'
      and column_name = 'status'
  ) then
    begin
      alter table public.whatsapp_chats
        add constraint whatsapp_chats_status_check
        check (status in ('open', 'closed'));
    exception
      when duplicate_object then
        null;
    end;
  end if;
end $$;

drop trigger if exists whatsapp_chats_set_updated_at on public.whatsapp_chats;
create trigger whatsapp_chats_set_updated_at
before update on public.whatsapp_chats
for each row
execute function public.set_updated_at();
