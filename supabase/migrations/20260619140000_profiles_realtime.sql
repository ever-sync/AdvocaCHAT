-- Realtime: estende a publication supabase_realtime para que mudanças em
-- public.profiles cheguem ao cliente em tempo real (alimenta useAuth para
-- refletir mudancas de role/status/nome do usuario logado sem precisar refresh).

do $$
declare
  already_in boolean;
begin
  execute 'alter table public.profiles replica identity full';

  select exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) into already_in;

  if not already_in then
    alter publication supabase_realtime add table public.profiles;
  end if;
end
$$;
