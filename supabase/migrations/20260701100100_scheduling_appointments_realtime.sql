-- Realtime: a grade da recepcionista atualiza ao vivo quando a página pública,
-- o pull do Google ou outro atendente cria/move/cancela um agendamento.
do $$
declare already_in boolean;
begin
  execute 'alter table public.scheduling_appointments replica identity full';
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scheduling_appointments'
  ) into already_in;
  if not already_in then
    execute 'alter publication supabase_realtime add table public.scheduling_appointments';
  end if;
end $$;
