-- Repoe estoque ao registrar devolucao com produto vinculado (1 unidade; mesmo modelo da venda atual).
create or replace function public.returns_restore_stock_on_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_updated int;
begin
  if NEW.product_id is null then
    return NEW;
  end if;

  update public.products p
  set qtd_estoque = p.qtd_estoque + 1
  where p.id = NEW.product_id
    and p.tenant_id = NEW.tenant_id;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'Produto nao encontrado ao repor estoque na devolucao.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists returns_restore_stock_on_insert_trg on public.returns;

create trigger returns_restore_stock_on_insert_trg
after insert on public.returns
for each row execute function public.returns_restore_stock_on_insert();
