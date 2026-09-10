-- Realtime: stream INSERT/UPDATE de whatsapp_messages e whatsapp_chats para a UI
-- da inbox, eliminando o delay de 0-8s do polling do React Query no chat ativo.
--
-- O filtro continua respeitando RLS por tenant (politicas ja existentes em
-- 20260328113000_fix_recursive_rls_policies.sql).
--
-- replica identity full e necessario para que eventos UPDATE tragam o registro
-- completo (incluindo as colunas que nao mudaram), de forma que o cliente possa
-- mapear payload.new -> WhatsappMessage sem refazer fetch.

alter table public.whatsapp_messages replica identity full;
alter table public.whatsapp_chats replica identity full;

do $$
declare
  pub_exists boolean;
begin
  select exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) into pub_exists;

  if not pub_exists then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
declare
  has_messages boolean;
  has_chats boolean;
begin
  select exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_messages'
  ) into has_messages;

  if not has_messages then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;

  select exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_chats'
  ) into has_chats;

  if not has_chats then
    alter publication supabase_realtime add table public.whatsapp_chats;
  end if;
end
$$;
