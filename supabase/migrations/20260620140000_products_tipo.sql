-- Produto vs Serviço: serviço não controla estoque (preço pode ficar em aberto).
-- Produto continua exigindo estoque/preço e baixando estoque na venda.

alter table public.products
  add column if not exists tipo text not null default 'produto'
    check (tipo in ('produto', 'servico'));

comment on column public.products.tipo is
  'produto: controla estoque e baixa na venda. servico: não controla estoque, preço opcional.';

-- Baixa de estoque na venda: pular itens cujo produto é serviço.
create or replace function public.sale_items_apply_stock_on_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_current numeric;
  v_tipo text;
begin
  if NEW.product_id is null then
    return NEW;
  end if;

  select p.qtd_estoque, p.tipo into v_current, v_tipo
  from public.products p
  where p.id = NEW.product_id
    and p.tenant_id = NEW.tenant_id
  for update;

  if v_current is null then
    raise exception 'Produto nao encontrado ao baixar estoque.';
  end if;

  -- Serviço: sem controle de estoque.
  if v_tipo = 'servico' then
    return NEW;
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
