-- Performance de RLS ("Auth RLS Initialization Plan" — lint do Supabase).
--
-- Problema: as policies usam `public.is_same_tenant(tenant_id)`, que internamente
-- chama `current_tenant_id()` (um SELECT em profiles por auth.uid()). Como o
-- argumento `tenant_id` varia por linha, o Postgres reavalia a função — e o
-- subquery em profiles — PARA CADA LINHA. Em tabelas grandes (customers,
-- crm_negotiations, whatsapp_messages…) isso degrada muito a leitura.
--
-- Correção: usar `tenant_id = (select public.current_tenant_id())`. O `(select …)`
-- vira um InitPlan, avaliado UMA vez por query (não por linha). Mesma semântica de
-- visibilidade (tenant_id nulo continua não-visível).
--
-- Só recriamos policies que JÁ existem (mesma convenção de nome), para não alterar
-- a superfície de segurança. `auth.uid()` também é embrulhado em subquery.

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.profiles
  where id = (select auth.uid())
  limit 1
$$;

do $$
declare
  rec record;
  -- tabela -> ações cujas policies same_tenant existem hoje
  specs jsonb := jsonb_build_object(
    'customers',                 jsonb_build_array('select','insert','update','delete'),
    'crm_negotiations',          jsonb_build_array('select','insert','update','delete'),
    'crm_tasks',                 jsonb_build_array('select','insert','update','delete'),
    'crm_activities',            jsonb_build_array('select','insert'),
    'crm_negotiation_documents', jsonb_build_array('select','insert','update','delete'),
    'whatsapp_chats',            jsonb_build_array('select','insert','update'),
    'whatsapp_messages',         jsonb_build_array('select','insert','update'),
    'scheduling_appointments',   jsonb_build_array('select','insert','update','delete'),
    'scheduling_services',       jsonb_build_array('select','insert','update','delete'),
    'scheduling_exceptions',     jsonb_build_array('select','insert','update','delete')
  );
  tname text;
  action text;
  pol text;
  expr text := '(tenant_id = (select public.current_tenant_id()))';
begin
  for rec in select key, value from jsonb_each(specs) loop
    tname := rec.key;
    -- só mexe se a tabela existir
    if to_regclass(format('public.%I', tname)) is null then
      continue;
    end if;
    for action in select jsonb_array_elements_text(rec.value) loop
      pol := format('%s_same_tenant_%s', tname, action);
      execute format('drop policy if exists %I on public.%I;', pol, tname);
      if action = 'select' then
        execute format('create policy %I on public.%I for select using %s;', pol, tname, expr);
      elsif action = 'insert' then
        execute format('create policy %I on public.%I for insert with check %s;', pol, tname, expr);
      elsif action = 'update' then
        execute format('create policy %I on public.%I for update using %s with check %s;', pol, tname, expr, expr);
      elsif action = 'delete' then
        execute format('create policy %I on public.%I for delete using %s;', pol, tname, expr);
      end if;
    end loop;
  end loop;
end $$;
