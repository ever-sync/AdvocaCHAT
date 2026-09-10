-- Tier 3 — Frente 1: Auditoria.
-- Trilha imutável de "quem mudou o quê" (antes/depois) por tenant.
-- Captura via triggers genéricos nas tabelas sensíveis + RPC para eventos de app (login/export).
-- Leitura restrita a admin do tenant; escrita só via triggers/RPC (security definer) e service_role.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid,                 -- auth.uid() do autor (null = sistema/edge)
  actor_name text,               -- snapshot do nome (sobrevive à exclusão do usuário)
  actor_role text,               -- snapshot do papel no momento da ação
  action text not null,          -- create | update | delete | login | export | permission_change | ...
  entity_type text not null,     -- crm_negotiation | customer | product | profile | tenant_settings | ...
  entity_id text,                -- id da entidade (texto p/ aceitar uuid e chaves diversas)
  summary text,                  -- descrição curta legível (opcional)
  changes jsonb not null default '{}'::jsonb,  -- { campo: { from, to }, ... }
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);
create index if not exists audit_logs_tenant_entity_idx on public.audit_logs (tenant_id, entity_type, entity_id);
create index if not exists audit_logs_tenant_actor_idx on public.audit_logs (tenant_id, actor_id, created_at desc);
create index if not exists audit_logs_tenant_action_idx on public.audit_logs (tenant_id, action, created_at desc);

alter table public.audit_logs enable row level security;

-- Leitura: somente admin do tenant. (Não usa has_role_permission de propósito: o fallback
-- default_role_permission concede tudo a operacao p/ chaves desconhecidas, o que vazaria a trilha.)
drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select"
on public.audit_logs for select
using (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() = 'admin'
);
-- Sem policy de insert/update/delete p/ usuários => negado. service_role ignora RLS.

-- ---------------------------------------------------------------------------
-- Diff genérico: retorna { campo: { from, to } } apenas dos campos alterados.
-- ---------------------------------------------------------------------------
create or replace function public.audit_diff(p_old jsonb, p_new jsonb, p_ignore text[])
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := '{}'::jsonb;
  k text;
  old_v jsonb;
  new_v jsonb;
begin
  if p_new is null then
    return '{}'::jsonb;
  end if;
  for k in select jsonb_object_keys(p_new) loop
    if p_ignore is not null and k = any (p_ignore) then
      continue;
    end if;
    old_v := case when p_old is null then null else p_old -> k end;
    new_v := p_new -> k;
    if old_v is distinct from new_v then
      result := result || jsonb_build_object(k, jsonb_build_object('from', old_v, 'to', new_v));
    end if;
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger genérico. Uso: create trigger ... execute function tg_audit_row('entity_type', 'col1,col2,...').
-- O 2º argumento (opcional) é a lista de colunas ignoradas no diff (além das padrão).
-- ---------------------------------------------------------------------------
create or replace function public.tg_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity text := TG_ARGV[0];
  v_extra_ignore text[] := case when TG_NARGS > 1 then string_to_array(TG_ARGV[1], ',') else array[]::text[] end;
  v_ignore text[] := array['updated_at', 'created_at'] || v_extra_ignore;
  v_tenant uuid;
  v_action text;
  v_entity_id text;
  v_changes jsonb;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  v_old jsonb;
  v_new jsonb;
begin
  if TG_OP = 'INSERT' then
    v_action := 'create';
    v_new := to_jsonb(NEW);
    v_old := null;
  elsif TG_OP = 'UPDATE' then
    v_action := 'update';
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);
  else
    v_action := 'delete';
    v_new := null;
    v_old := to_jsonb(OLD);
  end if;

  v_tenant := coalesce(v_new ->> 'tenant_id', v_old ->> 'tenant_id')::uuid;
  if v_tenant is null then
    return coalesce(NEW, OLD);
  end if;

  v_entity_id := coalesce(v_new ->> 'id', v_old ->> 'id');

  if TG_OP = 'UPDATE' then
    v_changes := public.audit_diff(v_old, v_new, v_ignore);
    -- nada relevante mudou (ex.: só updated_at/recompute) => não registra ruído
    if v_changes = '{}'::jsonb then
      return NEW;
    end if;
  else
    v_changes := '{}'::jsonb;
  end if;

  if v_actor is not null then
    select nome, role into v_actor_name, v_actor_role
    from public.profiles where id = v_actor limit 1;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, changes
  ) values (
    v_tenant, v_actor, coalesce(v_actor_name, 'Sistema'), v_actor_role,
    v_action, v_entity, v_entity_id, v_changes
  );

  return coalesce(NEW, OLD);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC p/ eventos de app (login, export, e ações sem tabela própria).
-- Força actor = auth.uid() e tenant = current_tenant_id() (não dá p/ forjar).
-- ---------------------------------------------------------------------------
create or replace function public.record_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_summary text default null,
  p_changes jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_actor_role text := public.current_user_role();
  v_id uuid;
begin
  if v_tenant is null then
    raise exception 'sem tenant para registrar auditoria';
  end if;
  if v_actor is not null then
    select nome into v_actor_name from public.profiles where id = v_actor limit 1;
  end if;
  insert into public.audit_logs (
    tenant_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, changes, metadata
  ) values (
    v_tenant, v_actor, coalesce(v_actor_name, 'Sistema'), v_actor_role,
    p_action, p_entity_type, p_entity_id, p_summary,
    coalesce(p_changes, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.record_audit_event(text, text, text, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Retenção (opcional; agendar pg_cron manualmente como nas demais rotinas).
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_audit_logs(p_keep_days integer default 365)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.audit_logs
  where created_at < timezone('utc', now()) - make_interval(days => greatest(p_keep_days, 30));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Liga os triggers nas tabelas sensíveis (alto valor, baixo ruído).
-- ---------------------------------------------------------------------------
drop trigger if exists audit_crm_negotiations on public.crm_negotiations;
create trigger audit_crm_negotiations
after insert or update or delete on public.crm_negotiations
for each row execute function public.tg_audit_row('crm_negotiation', 'last_activity_at');

drop trigger if exists audit_customers on public.customers;
create trigger audit_customers
after insert or update or delete on public.customers
for each row execute function public.tg_audit_row('customer', 'search_vector,last_interaction_at');

drop trigger if exists audit_products on public.products;
create trigger audit_products
after insert or update or delete on public.products
for each row execute function public.tg_audit_row('product');

-- profiles: foco em mudança de papel/dados; ignora churn de disponibilidade do atendente.
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
after insert or update or delete on public.profiles
for each row execute function public.tg_audit_row('profile', 'availability,last_seen_at');

-- tenant_settings: permissões, integrações, horário/SLA, etc.
drop trigger if exists audit_tenant_settings on public.tenant_settings;
create trigger audit_tenant_settings
after update on public.tenant_settings
for each row execute function public.tg_audit_row('tenant_settings');
