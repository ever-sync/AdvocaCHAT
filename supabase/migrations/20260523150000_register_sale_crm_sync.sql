-- Sync CRM on new sale + seller_id from sold_by profile

create or replace function public.sync_sale_to_crm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(14,2);
  v_seller_id uuid;
begin
  if NEW.chat_id is not null then
    select coalesce(sum(si.quantity * si.unit_price), 0) into v_amount
    from public.sale_items si
    where si.sale_id = NEW.id;

    perform public.mark_negotiation_sold_from_chat(NEW.chat_id, v_amount);
  end if;

  if NEW.sold_by is not null and btrim(NEW.sold_by) <> '' and NEW.seller_id is null then
    begin
      v_seller_id := public.ensure_trendii_seller_for_profile(NEW.sold_by::uuid);
      if v_seller_id is not null then
        update public.sales set seller_id = v_seller_id where id = NEW.id;
      end if;
    exception when others then
      null;
    end;
  end if;

  return NEW;
end;
$$;

drop trigger if exists sales_sync_crm on public.sales;
create trigger sales_sync_crm
after insert on public.sales
for each row
execute function public.sync_sale_to_crm();
