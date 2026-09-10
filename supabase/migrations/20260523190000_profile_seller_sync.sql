-- Auto-create trendii_seller when profile is created/activated for sales roles

create or replace function public.sync_trendii_seller_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'active' and NEW.role in ('atendimento', 'operacao', 'admin', 'financeiro') then
    begin
      perform public.ensure_trendii_seller_for_profile(NEW.id);
    exception
      when others then
        raise warning 'sync_trendii_seller_on_profile(%): %', NEW.id, sqlerrm;
    end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_sync_trendii_seller on public.profiles;
create trigger profiles_sync_trendii_seller
after insert or update of status, role on public.profiles
for each row
execute function public.sync_trendii_seller_on_profile();
