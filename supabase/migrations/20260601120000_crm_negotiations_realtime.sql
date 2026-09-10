-- Realtime: mudanças em crm_negotiations (pool, assignee) para notificações na UI.

alter table public.crm_negotiations replica identity full;

do $$
declare
  has_table boolean;
begin
  select exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_negotiations'
  ) into has_table;

  if not has_table then
    alter publication supabase_realtime add table public.crm_negotiations;
  end if;
end
$$;
