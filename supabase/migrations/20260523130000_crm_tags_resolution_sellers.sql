-- Unified tags, chat resolution, sellers FK, stage history, activities, tenant settings

-- Chat resolution (operational, distinct from CRM vendido/perdido)
alter table public.whatsapp_chats
  add column if not exists resolution text not null default 'open'
    check (resolution in ('open', 'pending', 'resolved', 'waiting_customer'));

-- AI mode for n8n handoff
alter table public.whatsapp_chats
  add column if not exists ai_mode text not null default 'off'
    check (ai_mode in ('off', 'qualifying', 'full', 'handoff'));

-- Message actor (human / ai / system)
alter table public.whatsapp_messages
  add column if not exists actor_type text not null default 'human'
    check (actor_type in ('human', 'ai', 'system'));

-- Sellers on customers and sales
alter table public.customers
  add column if not exists seller_id uuid references public.trendii_sellers(id) on delete set null;

alter table public.sales
  add column if not exists seller_id uuid references public.trendii_sellers(id) on delete set null;

create index if not exists customers_seller_idx on public.customers (seller_id) where seller_id is not null;
create index if not exists sales_seller_idx on public.sales (seller_id) where seller_id is not null;

-- Ensure trendii_seller exists for sales/atendimento profiles
create or replace function public.ensure_trendii_seller_for_profile(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_seller_id uuid;
begin
  select id, tenant_id, nome, email, role, status
  into v_profile
  from public.profiles
  where id = p_profile_id;

  if v_profile.id is null then
    return null;
  end if;

  if v_profile.role not in ('atendimento', 'operacao', 'admin', 'financeiro') then
    return null;
  end if;

  select s.id into v_seller_id
  from public.trendii_sellers s
  where s.user_id = p_profile_id
    and s.tenant_id = v_profile.tenant_id
  limit 1;

  if v_seller_id is not null then
    return v_seller_id;
  end if;

  insert into public.trendii_sellers (tenant_id, user_id, name, email, role, active)
  values (
    v_profile.tenant_id,
    p_profile_id,
    v_profile.nome,
    v_profile.email,
    case when v_profile.role = 'admin' then 'admin' when v_profile.role = 'operacao' then 'gerente' else 'vendedor' end,
    v_profile.status = 'active'
  )
  returning id into v_seller_id;

  return v_seller_id;
end;
$$;

grant execute on function public.ensure_trendii_seller_for_profile(uuid) to authenticated, service_role;

-- Unified tags
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  scope text not null default 'all'
    check (scope in ('all', 'chat', 'customer', 'negotiation')),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists tags_tenant_lower_name_scope_idx
  on public.tags (tenant_id, lower(name), scope);

create table if not exists public.entity_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  entity_type text not null check (entity_type in ('chat', 'customer', 'negotiation')),
  entity_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tag_id, entity_type, entity_id)
);

create index if not exists entity_tags_entity_idx
  on public.entity_tags (tenant_id, entity_type, entity_id);

alter table public.tags enable row level security;
alter table public.entity_tags enable row level security;

create policy "tags_same_tenant_select" on public.tags for select using (public.is_same_tenant(tenant_id));
create policy "tags_same_tenant_insert" on public.tags for insert with check (public.is_same_tenant(tenant_id));
create policy "tags_same_tenant_update" on public.tags for update using (public.is_same_tenant(tenant_id)) with check (public.is_same_tenant(tenant_id));
create policy "tags_same_tenant_delete" on public.tags for delete using (public.is_same_tenant(tenant_id));

create policy "entity_tags_same_tenant_select" on public.entity_tags for select using (public.is_same_tenant(tenant_id));
create policy "entity_tags_same_tenant_insert" on public.entity_tags for insert with check (public.is_same_tenant(tenant_id));
create policy "entity_tags_same_tenant_delete" on public.entity_tags for delete using (public.is_same_tenant(tenant_id));

-- CRM stage history
create table if not exists public.crm_stage_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  negotiation_id uuid not null references public.crm_negotiations(id) on delete cascade,
  from_stage_id text,
  to_stage_id text not null,
  from_status text,
  to_status text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default timezone('utc', now())
);

create index if not exists crm_stage_history_negotiation_idx
  on public.crm_stage_history (negotiation_id, changed_at desc);

alter table public.crm_stage_history enable row level security;
create policy "crm_stage_history_same_tenant_select" on public.crm_stage_history for select using (public.is_same_tenant(tenant_id));
create policy "crm_stage_history_same_tenant_insert" on public.crm_stage_history for insert with check (public.is_same_tenant(tenant_id));

create or replace function public.log_crm_stage_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and (
    OLD.stage_id is distinct from NEW.stage_id
    or OLD.status is distinct from NEW.status
  ) then
    insert into public.crm_stage_history (
      tenant_id, negotiation_id, from_stage_id, to_stage_id, from_status, to_status, changed_by
    ) values (
      NEW.tenant_id,
      NEW.id,
      OLD.stage_id,
      NEW.stage_id,
      OLD.status,
      NEW.status,
      auth.uid()
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists crm_negotiations_stage_history on public.crm_negotiations;
create trigger crm_negotiations_stage_history
after update on public.crm_negotiations
for each row
execute function public.log_crm_stage_history();

-- CRM activities timeline
create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  negotiation_id uuid references public.crm_negotiations(id) on delete cascade,
  chat_id uuid references public.whatsapp_chats(id) on delete cascade,
  activity_type text not null,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists crm_activities_customer_idx on public.crm_activities (customer_id, created_at desc);
create index if not exists crm_activities_negotiation_idx on public.crm_activities (negotiation_id, created_at desc);

alter table public.crm_activities enable row level security;
create policy "crm_activities_same_tenant_select" on public.crm_activities for select using (public.is_same_tenant(tenant_id));
create policy "crm_activities_same_tenant_insert" on public.crm_activities for insert with check (public.is_same_tenant(tenant_id));

-- Tenant settings (sync assignee chat↔CRM)
create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  sync_assignee_chat_crm boolean not null default true,
  auto_lead_on_inbound boolean not null default true,
  auto_assign_on_lead boolean not null default false,
  default_ai_mode text not null default 'off'
    check (default_ai_mode in ('off', 'qualifying', 'full', 'handoff')),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.tenant_settings enable row level security;
create policy "tenant_settings_select" on public.tenant_settings for select using (public.is_same_tenant(tenant_id));
create policy "tenant_settings_insert" on public.tenant_settings for insert with check (public.is_same_tenant(tenant_id));
create policy "tenant_settings_update" on public.tenant_settings for update using (public.is_same_tenant(tenant_id)) with check (public.is_same_tenant(tenant_id));

-- Sync assignee chat → negotiation when enabled
create or replace function public.sync_assignee_chat_to_negotiation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sync boolean;
begin
  select coalesce(ts.sync_assignee_chat_crm, true) into v_sync
  from public.tenant_settings ts
  where ts.tenant_id = NEW.tenant_id;

  if not coalesce(v_sync, true) then
    return NEW;
  end if;

  if NEW.assignee_id is distinct from OLD.assignee_id and NEW.primary_negotiation_id is not null then
    update public.crm_negotiations
    set assignee_id = NEW.assignee_id
    where id = NEW.primary_negotiation_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists whatsapp_chats_sync_assignee_crm on public.whatsapp_chats;
create trigger whatsapp_chats_sync_assignee_crm
after update of assignee_id on public.whatsapp_chats
for each row
execute function public.sync_assignee_chat_to_negotiation();

-- RPC: set chat resolution
create or replace function public.set_chat_resolution(
  p_chat_id uuid,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if p_resolution not in ('open', 'pending', 'resolved', 'waiting_customer') then
    raise exception 'Resolução inválida';
  end if;

  select tenant_id into v_tenant from public.whatsapp_chats where id = p_chat_id;
  if v_tenant is null or not public.is_same_tenant(v_tenant) then
    raise exception 'Chat não encontrado';
  end if;

  update public.whatsapp_chats
  set
    resolution = p_resolution,
    status = case when p_resolution = 'resolved' then 'closed' else 'open' end
  where id = p_chat_id;

  if p_resolution = 'resolved' then
    insert into public.crm_activities (tenant_id, chat_id, customer_id, activity_type, title, created_by)
    select c.tenant_id, c.id, c.customer_id, 'chat_resolved', 'Conversa resolvida', auth.uid()
    from public.whatsapp_chats c
    where c.id = p_chat_id;
  end if;
end;
$$;

grant execute on function public.set_chat_resolution(uuid, text) to authenticated;

-- Mark negotiation sold from sale flow
create or replace function public.mark_negotiation_sold_from_chat(p_chat_id uuid, p_total numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg_id uuid;
  v_tenant uuid;
begin
  select tenant_id, primary_negotiation_id into v_tenant, v_neg_id
  from public.whatsapp_chats where id = p_chat_id;

  if v_neg_id is null and v_tenant is not null then
    v_neg_id := public.ensure_lead_from_chat(p_chat_id, false);
  end if;

  if v_neg_id is null then
    return;
  end if;

  update public.crm_negotiations
  set
    status = 'vendido',
    stage_id = 'venda',
    total_value = coalesce(p_total, total_value),
    last_interaction_at = timezone('utc', now())
  where id = v_neg_id;

  update public.whatsapp_chats
  set resolution = 'resolved', status = 'closed'
  where id = p_chat_id;
end;
$$;

grant execute on function public.mark_negotiation_sold_from_chat(uuid, numeric) to authenticated, service_role;
