-- Evita que erro na sincronizacao do trendii seller derrube update de perfil/collaborador.

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
