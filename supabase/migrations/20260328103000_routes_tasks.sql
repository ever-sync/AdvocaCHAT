create table if not exists public.delivery_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null,
  regiao text not null default '',
  horario_corte text not null default '14:00',
  dias text[] not null default '{}'::text[],
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  observacoes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, nome)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  route_id uuid references public.delivery_routes(id) on delete set null,
  cliente_nome text not null,
  vendedor text not null default '',
  tipo text not null check (tipo in ('cliente_inativo', 'inadimplente', 'sem_resposta')),
  prazo date not null default current_date,
  status text not null default 'aberta' check (status in ('aberta', 'em_andamento', 'concluida')),
  descricao text not null default '',
  origem text not null default 'manual',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists delivery_routes_tenant_idx on public.delivery_routes (tenant_id);
create index if not exists delivery_routes_status_idx on public.delivery_routes (tenant_id, status);
create index if not exists tasks_tenant_idx on public.tasks (tenant_id);
create index if not exists tasks_status_idx on public.tasks (tenant_id, status);
create index if not exists tasks_tipo_idx on public.tasks (tenant_id, tipo);
create index if not exists tasks_customer_idx on public.tasks (customer_id);

drop trigger if exists delivery_routes_set_updated_at on public.delivery_routes;
create trigger delivery_routes_set_updated_at
before update on public.delivery_routes
for each row
execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

alter table public.delivery_routes enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "delivery_routes_same_tenant_select" on public.delivery_routes;
create policy "delivery_routes_same_tenant_select"
on public.delivery_routes
for select
using (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists "delivery_routes_same_tenant_insert" on public.delivery_routes;
create policy "delivery_routes_same_tenant_insert"
on public.delivery_routes
for insert
with check (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists "delivery_routes_same_tenant_update" on public.delivery_routes;
create policy "delivery_routes_same_tenant_update"
on public.delivery_routes
for update
using (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
)
with check (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists "tasks_same_tenant_select" on public.tasks;
create policy "tasks_same_tenant_select"
on public.tasks
for select
using (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists "tasks_same_tenant_insert" on public.tasks;
create policy "tasks_same_tenant_insert"
on public.tasks
for insert
with check (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists "tasks_same_tenant_update" on public.tasks;
create policy "tasks_same_tenant_update"
on public.tasks
for update
using (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
)
with check (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

insert into public.delivery_routes (
  tenant_id,
  nome,
  regiao,
  horario_corte,
  dias,
  status,
  observacoes
)
select distinct
  c.tenant_id,
  c.rota,
  c.rota,
  '14:00',
  array['seg', 'qua', 'sex']::text[],
  'ativo',
  'Rota criada automaticamente a partir dos clientes importados.'
from public.customers c
where coalesce(trim(c.rota), '') <> ''
  and c.tenant_id is not null
  and not exists (
    select 1
    from public.delivery_routes r
    where r.tenant_id = c.tenant_id
      and r.nome = c.rota
  );

insert into public.tasks (
  tenant_id,
  customer_id,
  route_id,
  cliente_nome,
  vendedor,
  tipo,
  prazo,
  status,
  descricao,
  origem
)
select
  c.tenant_id,
  c.id,
  r.id,
  c.nome,
  coalesce(nullif(c.vendedor, ''), 'Operacao'),
  case
    when c.status = 'bloqueado' then 'inadimplente'
    else 'cliente_inativo'
  end,
  case
    when c.status = 'bloqueado' then current_date + 1
    else current_date + 2
  end,
  'aberta',
  case
    when c.status = 'bloqueado' then 'Cliente bloqueado. Validar historico financeiro e renegociacao.'
    else 'Cliente sem movimentacao recente. Avaliar reativacao comercial.'
  end,
  'backfill'
from public.customers c
left join public.delivery_routes r
  on r.tenant_id = c.tenant_id
 and r.nome = c.rota
where c.tenant_id is not null
  and c.status in ('inativo', 'bloqueado')
  and not exists (
    select 1
    from public.tasks t
    where t.tenant_id = c.tenant_id
      and t.customer_id = c.id
      and t.tipo = case
        when c.status = 'bloqueado' then 'inadimplente'
        else 'cliente_inativo'
      end
  );
