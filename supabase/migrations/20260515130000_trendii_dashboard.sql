create table if not exists public.trendii_sales_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trendii_sellers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sales_point_id uuid references public.trendii_sales_points(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text,
  role text not null default 'vendedor' check (role in ('vendedor', 'gerente', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trendii_daily_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seller_id uuid not null references public.trendii_sellers(id) on delete cascade,
  entry_date date not null,
  demand integer not null default 0 check (demand >= 0),
  sounding integer not null default 0 check (sounding >= 0),
  negotiation integer not null default 0 check (negotiation >= 0),
  sales_done integer not null default 0 check (sales_done >= 0),
  sales_lost integer not null default 0 check (sales_lost >= 0),
  products_count integer not null default 0 check (products_count >= 0),
  total_value numeric not null default 0 check (total_value >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, seller_id, entry_date)
);

create table if not exists public.trendii_lost_sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seller_id uuid not null references public.trendii_sellers(id) on delete cascade,
  entry_date date not null,
  reason text not null,
  product text,
  observation text,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trendii_monthly_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  total_goal numeric not null default 0 check (total_goal >= 0),
  working_days integer not null default 22 check (working_days > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, year, month)
);

create table if not exists public.trendii_seller_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seller_id uuid not null references public.trendii_sellers(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  week_number integer check (week_number between 1 and 6),
  goal_amount numeric not null default 0 check (goal_amount >= 0),
  working_days integer not null default 22 check (working_days > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, seller_id, year, month, week_number)
);

create table if not exists public.trendii_sales_point_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sales_point_id uuid not null references public.trendii_sales_points(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  week_number integer check (week_number between 1 and 6),
  goal_amount numeric not null default 0 check (goal_amount >= 0),
  working_days integer not null default 22 check (working_days > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, sales_point_id, year, month, week_number)
);

create table if not exists public.trendii_playbook_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  category text not null check (category in ('tecnica', 'abordagem', 'orientacao')),
  trigger_kpi text not null default 'geral',
  content text not null default '',
  pdf_key text,
  pdf_url text,
  pdf_name text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trendii_playbook_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  playbook_item_id uuid not null references public.trendii_playbook_items(id) on delete cascade,
  file_name text not null,
  file_key text not null,
  file_url text,
  mime_type text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trendii_coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seller_id uuid not null references public.trendii_sellers(id) on delete cascade,
  week_start date not null,
  kpi text not null,
  objective text not null default '',
  action_plan text not null default '',
  deadline date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists trendii_sales_points_tenant_name_idx
  on public.trendii_sales_points (tenant_id, lower(name));

create index if not exists trendii_sellers_tenant_sales_point_idx
  on public.trendii_sellers (tenant_id, sales_point_id);

create index if not exists trendii_daily_entries_tenant_date_idx
  on public.trendii_daily_entries (tenant_id, entry_date desc);

create index if not exists trendii_lost_sales_tenant_date_idx
  on public.trendii_lost_sales (tenant_id, entry_date desc);

create index if not exists trendii_playbook_tenant_trigger_idx
  on public.trendii_playbook_items (tenant_id, trigger_kpi, active);

drop trigger if exists trendii_sales_points_set_updated_at on public.trendii_sales_points;
create trigger trendii_sales_points_set_updated_at
before update on public.trendii_sales_points
for each row execute function public.set_updated_at();

drop trigger if exists trendii_sellers_set_updated_at on public.trendii_sellers;
create trigger trendii_sellers_set_updated_at
before update on public.trendii_sellers
for each row execute function public.set_updated_at();

drop trigger if exists trendii_daily_entries_set_updated_at on public.trendii_daily_entries;
create trigger trendii_daily_entries_set_updated_at
before update on public.trendii_daily_entries
for each row execute function public.set_updated_at();

drop trigger if exists trendii_lost_sales_set_updated_at on public.trendii_lost_sales;
create trigger trendii_lost_sales_set_updated_at
before update on public.trendii_lost_sales
for each row execute function public.set_updated_at();

drop trigger if exists trendii_monthly_goals_set_updated_at on public.trendii_monthly_goals;
create trigger trendii_monthly_goals_set_updated_at
before update on public.trendii_monthly_goals
for each row execute function public.set_updated_at();

drop trigger if exists trendii_seller_goals_set_updated_at on public.trendii_seller_goals;
create trigger trendii_seller_goals_set_updated_at
before update on public.trendii_seller_goals
for each row execute function public.set_updated_at();

drop trigger if exists trendii_sales_point_goals_set_updated_at on public.trendii_sales_point_goals;
create trigger trendii_sales_point_goals_set_updated_at
before update on public.trendii_sales_point_goals
for each row execute function public.set_updated_at();

drop trigger if exists trendii_playbook_items_set_updated_at on public.trendii_playbook_items;
create trigger trendii_playbook_items_set_updated_at
before update on public.trendii_playbook_items
for each row execute function public.set_updated_at();

drop trigger if exists trendii_coaching_sessions_set_updated_at on public.trendii_coaching_sessions;
create trigger trendii_coaching_sessions_set_updated_at
before update on public.trendii_coaching_sessions
for each row execute function public.set_updated_at();

alter table public.trendii_sales_points enable row level security;
alter table public.trendii_sellers enable row level security;
alter table public.trendii_daily_entries enable row level security;
alter table public.trendii_lost_sales enable row level security;
alter table public.trendii_monthly_goals enable row level security;
alter table public.trendii_seller_goals enable row level security;
alter table public.trendii_sales_point_goals enable row level security;
alter table public.trendii_playbook_items enable row level security;
alter table public.trendii_playbook_attachments enable row level security;
alter table public.trendii_coaching_sessions enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'trendii_sales_points',
    'trendii_sellers',
    'trendii_daily_entries',
    'trendii_lost_sales',
    'trendii_monthly_goals',
    'trendii_seller_goals',
    'trendii_sales_point_goals',
    'trendii_playbook_items',
    'trendii_playbook_attachments',
    'trendii_coaching_sessions'
  ]
  loop
    execute format('drop policy if exists "%1$s_same_tenant_select" on public.%1$I', table_name);
    execute format('create policy "%1$s_same_tenant_select" on public.%1$I for select using (public.is_same_tenant(tenant_id))', table_name);

    execute format('drop policy if exists "%1$s_same_tenant_insert" on public.%1$I', table_name);
    execute format('create policy "%1$s_same_tenant_insert" on public.%1$I for insert with check (public.is_same_tenant(tenant_id))', table_name);

    execute format('drop policy if exists "%1$s_same_tenant_update" on public.%1$I', table_name);
    execute format('create policy "%1$s_same_tenant_update" on public.%1$I for update using (public.is_same_tenant(tenant_id)) with check (public.is_same_tenant(tenant_id))', table_name);

    execute format('drop policy if exists "%1$s_same_tenant_delete" on public.%1$I', table_name);
    execute format('create policy "%1$s_same_tenant_delete" on public.%1$I for delete using (public.is_same_tenant(tenant_id))', table_name);
  end loop;
end $$;
