-- Canonicaliza telefones de clientes e remove duplicados por WhatsApp/JID dentro do tenant.

with normalized as (
  select
    id,
    case when length(national_digits) >= 10 then '55' || national_digits else null end as canonical_digits
  from (
    select
      id,
      case
        when raw_digits = '' then ''
        when left(raw_digits, 2) = '55' and length(substr(raw_digits, 3)) > 11
          then right(substr(raw_digits, 3), 11)
        when left(raw_digits, 2) = '55' then substr(raw_digits, 3)
        when length(regexp_replace(raw_digits, '^0+', '')) > 11
          then right(regexp_replace(raw_digits, '^0+', ''), 11)
        else regexp_replace(raw_digits, '^0+', '')
      end as national_digits
    from (
      select
        id,
        regexp_replace(
          coalesce(nullif(phone_jid, ''), nullif(phone_e164, ''), nullif(celular, ''), nullif(telefone, ''), ''),
          '\D',
          '',
          'g'
        ) as raw_digits
      from public.customers
    ) source
  ) normalized_source
)
update public.customers customers
set
  phone_digits = normalized.canonical_digits,
  phone_e164 = case
    when normalized.canonical_digits is null then null
    else '+' || normalized.canonical_digits
  end,
  phone_jid = case
    when normalized.canonical_digits is null then null
    else normalized.canonical_digits || '@s.whatsapp.net'
  end
from normalized
where customers.id = normalized.id;

create temp table customer_phone_duplicates on commit drop as
with ranked as (
  select
    id as duplicate_id,
    first_value(id) over phone_partition as keep_id,
    row_number() over phone_partition as duplicate_rank
  from public.customers
  where tenant_id is not null
    and phone_jid is not null
    and phone_jid <> ''
  window phone_partition as (
    partition by tenant_id, phone_jid
    order by updated_at desc nulls last, created_at desc nulls last, id
  )
)
select duplicate_id, keep_id
from ranked
where duplicate_rank > 1;

update public.whatsapp_chats target
set customer_id = duplicates.keep_id
from customer_phone_duplicates duplicates
where target.customer_id = duplicates.duplicate_id;

update public.campaign_recipients target
set customer_id = duplicates.keep_id
from customer_phone_duplicates duplicates
where target.customer_id = duplicates.duplicate_id;

update public.tasks target
set customer_id = duplicates.keep_id
from customer_phone_duplicates duplicates
where target.customer_id = duplicates.duplicate_id;

update public.sales target
set customer_id = duplicates.keep_id
from customer_phone_duplicates duplicates
where target.customer_id = duplicates.duplicate_id;

update public.returns target
set customer_id = duplicates.keep_id
from customer_phone_duplicates duplicates
where target.customer_id = duplicates.duplicate_id;

update public.customer_credits target
set customer_id = duplicates.keep_id
from customer_phone_duplicates duplicates
where target.customer_id = duplicates.duplicate_id;

delete from public.customers customers
using customer_phone_duplicates duplicates
where customers.id = duplicates.duplicate_id;

create unique index if not exists customers_tenant_phone_jid_unique_idx
  on public.customers (tenant_id, phone_jid);
