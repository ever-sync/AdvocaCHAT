-- Normaliza valores de campos personalizados de contato na gravação, para o
-- formulário público (que envia valores mascarados) bater com o cadastro:
--   telefone/cpf/cnpj/cep -> apenas dígitos
--   email                 -> minúsculo + trim
-- Idempotente para quem já grava normalizado (cadastro de contato).
create or replace function public.normalize_customer_custom_field_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if NEW.value_text is null then
    return NEW;
  end if;

  select kind into v_kind from public.customer_custom_fields where id = NEW.field_id;

  if v_kind in ('telefone', 'cpf', 'cnpj', 'cep') then
    NEW.value_text := nullif(regexp_replace(NEW.value_text, '\D', '', 'g'), '');
  elsif v_kind = 'email' then
    NEW.value_text := nullif(lower(trim(NEW.value_text)), '');
  end if;

  return NEW;
end;
$$;

drop trigger if exists customer_custom_field_values_normalize on public.customer_custom_field_values;
create trigger customer_custom_field_values_normalize
before insert or update on public.customer_custom_field_values
for each row execute function public.normalize_customer_custom_field_value();
