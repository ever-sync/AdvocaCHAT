-- Realtime: estende a publication supabase_realtime para que mudanças em
-- atividades, tarefas, documentos, customers, custom fields e config de funil
-- também cheguem ao cliente em tempo real (alimenta useCrmRealtimeSync).

do $$
declare
  t text;
  tables text[] := array[
    'crm_activities',
    'crm_tasks',
    'crm_negotiation_documents',
    'customers',
    'customer_custom_fields',
    'customer_custom_field_values',
    'tenant_crm_funnel_config'
  ];
  already_in boolean;
begin
  foreach t in array tables loop
    execute format('alter table public.%I replica identity full', t);

    select exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) into already_in;

    if not already_in then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
