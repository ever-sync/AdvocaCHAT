create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  chat_id uuid references public.whatsapp_chats(id) on delete set null,
  sold_by text not null,
  sold_at timestamptz not null default timezone('utc', now()),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists sales_tenant_customer_sold_at_idx
  on public.sales (tenant_id, customer_id, sold_at desc);

create index if not exists sales_tenant_chat_sold_at_idx
  on public.sales (tenant_id, chat_id, sold_at desc);

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at
before update on public.sales
for each row execute function public.set_updated_at();

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(12,3) not null default 1,
  list_price numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  used_custom_price boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists sale_items_tenant_sale_idx
  on public.sale_items (tenant_id, sale_id);

create index if not exists sale_items_tenant_product_idx
  on public.sale_items (tenant_id, product_id);

drop trigger if exists sale_items_set_updated_at on public.sale_items;
create trigger sale_items_set_updated_at
before update on public.sale_items
for each row execute function public.set_updated_at();

create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  chat_id uuid references public.whatsapp_chats(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  source text not null check (source in ('existing_sale', 'other_sale')),
  resolution text not null check (resolution in ('troca', 'credito')),
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  amount numeric(12,2) not null check (amount > 0),
  used_custom_price boolean not null default false,
  reference_label text,
  returned_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists returns_tenant_customer_returned_at_idx
  on public.returns (tenant_id, customer_id, returned_at desc);

create index if not exists returns_tenant_sale_idx
  on public.returns (tenant_id, sale_id);

drop trigger if exists returns_set_updated_at on public.returns;
create trigger returns_set_updated_at
before update on public.returns
for each row execute function public.set_updated_at();

create table if not exists public.customer_credits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  return_id uuid references public.returns(id) on delete set null,
  type text not null check (type in ('credit_from_return', 'debit_usage')),
  amount numeric(12,2) not null check (amount > 0),
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_credits_tenant_customer_created_at_idx
  on public.customer_credits (tenant_id, customer_id, created_at desc);

create index if not exists customer_credits_tenant_return_idx
  on public.customer_credits (tenant_id, return_id);

drop trigger if exists customer_credits_set_updated_at on public.customer_credits;
create trigger customer_credits_set_updated_at
before update on public.customer_credits
for each row execute function public.set_updated_at();

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.returns enable row level security;
alter table public.customer_credits enable row level security;

drop policy if exists "sales_same_tenant_select" on public.sales;
create policy "sales_same_tenant_select"
on public.sales
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "sales_same_tenant_insert" on public.sales;
create policy "sales_same_tenant_insert"
on public.sales
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "sales_same_tenant_update" on public.sales;
create policy "sales_same_tenant_update"
on public.sales
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "sale_items_same_tenant_select" on public.sale_items;
create policy "sale_items_same_tenant_select"
on public.sale_items
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "sale_items_same_tenant_insert" on public.sale_items;
create policy "sale_items_same_tenant_insert"
on public.sale_items
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "sale_items_same_tenant_update" on public.sale_items;
create policy "sale_items_same_tenant_update"
on public.sale_items
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "returns_same_tenant_select" on public.returns;
create policy "returns_same_tenant_select"
on public.returns
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "returns_same_tenant_insert" on public.returns;
create policy "returns_same_tenant_insert"
on public.returns
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "returns_same_tenant_update" on public.returns;
create policy "returns_same_tenant_update"
on public.returns
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

drop policy if exists "customer_credits_same_tenant_select" on public.customer_credits;
create policy "customer_credits_same_tenant_select"
on public.customer_credits
for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "customer_credits_same_tenant_insert" on public.customer_credits;
create policy "customer_credits_same_tenant_insert"
on public.customer_credits
for insert
with check (public.is_same_tenant(tenant_id));

drop policy if exists "customer_credits_same_tenant_update" on public.customer_credits;
create policy "customer_credits_same_tenant_update"
on public.customer_credits
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

create or replace function public.register_sale_flow(
  p_chat_id uuid,
  p_customer_id uuid,
  p_flow_type text,
  p_sold_by text default null,
  p_sale_product_id uuid default null,
  p_sale_other_price boolean default false,
  p_sale_custom_price numeric default null,
  p_return_source text default null,
  p_return_existing_sale_id uuid default null,
  p_return_product_id uuid default null,
  p_return_other_price boolean default false,
  p_return_custom_price numeric default null,
  p_return_resolution text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_user_id uuid := auth.uid();
  v_sale_id uuid;
  v_return_id uuid;
  v_credit_id uuid;
  v_amount numeric(12,2);
  v_product_id uuid;
  v_product_name text;
  v_product_list_price numeric(12,2);
  v_source text;
begin
  if v_tenant_id is null then
    raise exception 'Tenant nao encontrado para o usuario autenticado.';
  end if;

  if p_flow_type not in ('venda', 'devolucao') then
    raise exception 'Tipo invalido. Use venda ou devolucao.';
  end if;

  if p_flow_type = 'venda' then
    if p_sold_by is null or btrim(p_sold_by) = '' then
      raise exception 'Usuario responsavel pela venda e obrigatorio.';
    end if;

    if p_sale_product_id is null then
      raise exception 'Produto da venda e obrigatorio.';
    end if;

    select id, nome, preco_venda
      into v_product_id, v_product_name, v_product_list_price
    from public.products
    where id = p_sale_product_id
      and tenant_id = v_tenant_id
    limit 1;

    if v_product_id is null then
      raise exception 'Produto nao encontrado para este tenant.';
    end if;

    v_amount := case
      when coalesce(p_sale_other_price, false) then p_sale_custom_price
      else v_product_list_price
    end;

    if v_amount is null or v_amount <= 0 then
      raise exception 'Valor da venda invalido.';
    end if;

    insert into public.sales (
      tenant_id,
      customer_id,
      chat_id,
      sold_by,
      sold_at,
      created_by
    )
    values (
      v_tenant_id,
      p_customer_id,
      p_chat_id,
      p_sold_by,
      timezone('utc', now()),
      v_user_id
    )
    returning id into v_sale_id;

    insert into public.sale_items (
      tenant_id,
      sale_id,
      product_id,
      product_name,
      quantity,
      list_price,
      unit_price,
      used_custom_price
    )
    values (
      v_tenant_id,
      v_sale_id,
      v_product_id,
      v_product_name,
      1,
      v_product_list_price,
      v_amount,
      coalesce(p_sale_other_price, false)
    );

    return jsonb_build_object(
      'flow_type', 'venda',
      'sale_id', v_sale_id,
      'amount', v_amount
    );
  end if;

  if p_return_resolution not in ('troca', 'credito') then
    raise exception 'Destino da devolucao invalido. Use troca ou credito.';
  end if;

  if p_return_source = 'existente' then
    if p_return_existing_sale_id is null then
      raise exception 'Venda existente obrigatoria para devolucao.';
    end if;

    select s.id, si.product_id, si.product_name, si.unit_price
      into v_sale_id, v_product_id, v_product_name, v_product_list_price
    from public.sales s
    left join public.sale_items si on si.sale_id = s.id and si.tenant_id = s.tenant_id
    where s.id = p_return_existing_sale_id
      and s.tenant_id = v_tenant_id
    order by si.created_at asc
    limit 1;

    if v_sale_id is null then
      raise exception 'Venda existente nao encontrada.';
    end if;

    if p_customer_id is null then
      select s.customer_id into p_customer_id
      from public.sales s
      where s.id = v_sale_id;
    end if;

    v_source := 'existing_sale';
  elsif p_return_source = 'outra' then
    if p_return_product_id is null then
      raise exception 'Produto e obrigatorio para devolucao de outra venda.';
    end if;

    select id, nome, preco_venda
      into v_product_id, v_product_name, v_product_list_price
    from public.products
    where id = p_return_product_id
      and tenant_id = v_tenant_id
    limit 1;

    if v_product_id is null then
      raise exception 'Produto nao encontrado para este tenant.';
    end if;

    v_source := 'other_sale';
  else
    raise exception 'Origem da devolucao invalida. Use existente ou outra.';
  end if;

  v_amount := case
    when coalesce(p_return_other_price, false) then p_return_custom_price
    else v_product_list_price
  end;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Valor da devolucao invalido.';
  end if;

  insert into public.returns (
    tenant_id,
    customer_id,
    chat_id,
    sale_id,
    source,
    resolution,
    product_id,
    product_name,
    amount,
    used_custom_price,
    returned_at,
    created_by
  )
  values (
    v_tenant_id,
    p_customer_id,
    p_chat_id,
    v_sale_id,
    v_source,
    p_return_resolution,
    v_product_id,
    v_product_name,
    v_amount,
    coalesce(p_return_other_price, false),
    timezone('utc', now()),
    v_user_id
  )
  returning id into v_return_id;

  if p_return_resolution = 'credito' then
    if p_customer_id is null then
      raise exception 'Nao e possivel gerar credito sem cliente vinculado.';
    end if;

    insert into public.customer_credits (
      tenant_id,
      customer_id,
      return_id,
      type,
      amount,
      description,
      created_by
    )
    values (
      v_tenant_id,
      p_customer_id,
      v_return_id,
      'credit_from_return',
      v_amount,
      'Credito gerado por devolucao',
      v_user_id
    )
    returning id into v_credit_id;
  end if;

  return jsonb_build_object(
    'flow_type', 'devolucao',
    'return_id', v_return_id,
    'sale_id', v_sale_id,
    'credit_id', v_credit_id,
    'amount', v_amount,
    'resolution', p_return_resolution
  );
end;
$$;
