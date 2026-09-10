-- Produtos do lead/negociação (pré-venda): atendente monta a lista de itens.
-- O total_value da negociação passa a refletir a soma (quantidade × preço) destes itens.
-- No "Marcar venda", o popup é pré-preenchido com estes produtos (só confirmar/ajustar).

create table if not exists public.crm_negotiation_products (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  negotiation_id  uuid not null references public.crm_negotiations(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  product_name    text not null,
  quantity        numeric(12,3) not null default 1 check (quantity > 0),
  list_price      numeric(12,2) not null default 0,
  unit_price      numeric(12,2) not null default 0 check (unit_price >= 0),
  used_custom_price boolean not null default false,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now())
);

create index if not exists crm_negotiation_products_negotiation_idx
  on public.crm_negotiation_products (negotiation_id, created_at);

create index if not exists crm_negotiation_products_tenant_idx
  on public.crm_negotiation_products (tenant_id, negotiation_id);

drop trigger if exists crm_negotiation_products_set_updated_at on public.crm_negotiation_products;
create trigger crm_negotiation_products_set_updated_at
before update on public.crm_negotiation_products
for each row execute function public.set_updated_at();

alter table public.crm_negotiation_products enable row level security;

drop policy if exists "crm_neg_products_select" on public.crm_negotiation_products;
create policy "crm_neg_products_select"
on public.crm_negotiation_products for select
using (public.is_same_tenant(tenant_id));

drop policy if exists "crm_neg_products_insert" on public.crm_negotiation_products;
create policy "crm_neg_products_insert"
on public.crm_negotiation_products for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.can_modify_crm_negotiation(
    (select n.assignee_id from public.crm_negotiations n where n.id = negotiation_id)
  )
);

drop policy if exists "crm_neg_products_update" on public.crm_negotiation_products;
create policy "crm_neg_products_update"
on public.crm_negotiation_products for update
using (
  public.is_same_tenant(tenant_id)
  and public.can_modify_crm_negotiation(
    (select n.assignee_id from public.crm_negotiations n where n.id = negotiation_id)
  )
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_neg_products_delete" on public.crm_negotiation_products;
create policy "crm_neg_products_delete"
on public.crm_negotiation_products for delete
using (
  public.is_same_tenant(tenant_id)
  and public.can_modify_crm_negotiation(
    (select n.assignee_id from public.crm_negotiations n where n.id = negotiation_id)
  )
);

-- Recalcula crm_negotiations.total_value = soma(quantidade × preço) dos produtos da negociação.
create or replace function public.recompute_negotiation_total_from_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negotiation_id uuid;
  v_total numeric(12,2);
begin
  v_negotiation_id := coalesce(NEW.negotiation_id, OLD.negotiation_id);

  select coalesce(sum(p.quantity * p.unit_price), 0)
  into v_total
  from public.crm_negotiation_products p
  where p.negotiation_id = v_negotiation_id;

  update public.crm_negotiations
  set total_value = v_total
  where id = v_negotiation_id;

  return null;
end;
$$;

drop trigger if exists crm_negotiation_products_sync_total on public.crm_negotiation_products;
create trigger crm_negotiation_products_sync_total
after insert or update or delete on public.crm_negotiation_products
for each row execute function public.recompute_negotiation_total_from_products();

-- Realtime: itens aparecem/atualizam no perfil do chat e no CRM sem refetch.
alter table public.crm_negotiation_products replica identity full;

do $$
declare has_tbl boolean;
begin
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_negotiation_products'
  ) into has_tbl;

  if not has_tbl then
    alter publication supabase_realtime add table public.crm_negotiation_products;
  end if;
end $$;
