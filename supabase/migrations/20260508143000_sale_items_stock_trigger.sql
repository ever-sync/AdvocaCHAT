-- Baixa de estoque ao inserir linha de venda (sale_items com product_id).
create or replace function public.sale_items_apply_stock_on_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_current numeric;
begin
  if NEW.product_id is null then
    return NEW;
  end if;

  select p.qtd_estoque into v_current
  from public.products p
  where p.id = NEW.product_id
    and p.tenant_id = NEW.tenant_id
  for update;

  if v_current is null then
    raise exception 'Produto nao encontrado ao baixar estoque.';
  end if;

  if v_current < NEW.quantity then
    raise exception 'Estoque insuficiente (disponivel: %, solicitado: %).', v_current, NEW.quantity;
  end if;

  update public.products
  set qtd_estoque = qtd_estoque - NEW.quantity
  where id = NEW.product_id
    and tenant_id = NEW.tenant_id;

  return NEW;
end;
$$;

drop trigger if exists sale_items_apply_stock_on_insert_trg on public.sale_items;

create trigger sale_items_apply_stock_on_insert_trg
before insert on public.sale_items
for each row execute function public.sale_items_apply_stock_on_insert();
