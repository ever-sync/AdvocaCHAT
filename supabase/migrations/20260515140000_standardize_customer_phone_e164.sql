-- Padroniza telefones de clientes no formato E.164 usado pela tela: +55DDDNXXXXXXXX.

with phone_sources as (
  select
    id,
    regexp_replace(
      coalesce(nullif(phone_jid, ''), nullif(phone_e164, ''), nullif(telefone, ''), ''),
      '\D',
      '',
      'g'
    ) as raw_phone_digits,
    regexp_replace(coalesce(celular, ''), '\D', '', 'g') as raw_mobile_digits
  from public.customers
),
normalized as (
  select
    id,
    case
      when char_length(phone_national_digits) between 10 and 11 then '55' || phone_national_digits
      else null
    end as canonical_phone_digits,
    case
      when char_length(mobile_national_digits) between 10 and 11 then '55' || mobile_national_digits
      else null
    end as canonical_mobile_digits
  from (
    select
      id,
      case
        when raw_phone_digits = '' then ''
        when left(raw_phone_digits, 2) = '55' and char_length(substr(raw_phone_digits, 3)) > 11
          then right(substr(raw_phone_digits, 3), 11)
        when left(raw_phone_digits, 2) = '55'
          then substr(raw_phone_digits, 3)
        when char_length(regexp_replace(raw_phone_digits, '^0+', '')) > 11
          then right(regexp_replace(raw_phone_digits, '^0+', ''), 11)
        else regexp_replace(raw_phone_digits, '^0+', '')
      end as phone_national_digits,
      case
        when raw_mobile_digits = '' then ''
        when left(raw_mobile_digits, 2) = '55' and char_length(substr(raw_mobile_digits, 3)) > 11
          then right(substr(raw_mobile_digits, 3), 11)
        when left(raw_mobile_digits, 2) = '55'
          then substr(raw_mobile_digits, 3)
        when char_length(regexp_replace(raw_mobile_digits, '^0+', '')) > 11
          then right(regexp_replace(raw_mobile_digits, '^0+', ''), 11)
        else regexp_replace(raw_mobile_digits, '^0+', '')
      end as mobile_national_digits
    from phone_sources
  ) digits
)
update public.customers customers
set
  telefone = case
    when normalized.canonical_phone_digits is null then customers.telefone
    else '+' || normalized.canonical_phone_digits
  end,
  celular = case
    when normalized.canonical_mobile_digits is null then customers.celular
    else '+' || normalized.canonical_mobile_digits
  end,
  phone_digits = normalized.canonical_phone_digits,
  phone_e164 = case
    when normalized.canonical_phone_digits is null then null
    else '+' || normalized.canonical_phone_digits
  end,
  phone_jid = case
    when normalized.canonical_phone_digits is null then null
    else normalized.canonical_phone_digits || '@s.whatsapp.net'
  end
from normalized
where customers.id = normalized.id
  and normalized.canonical_phone_digits is not null;
