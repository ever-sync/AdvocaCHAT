-- Recupera telefone correto a partir do nome quando ele segue o padrao
-- "WhatsApp (DD) NNNN-NNNN" ou "WhatsApp (DD) NNNNN-NNNN".
--
-- Contexto: importacoes antigas com "lixo" colado no telefone (extensao,
-- ID interno) faziam o normalizador truncar pelos ULTIMOS digitos, gerando
-- DDDs invalidos como "01" no campo telefone. O nome, porem, foi gerado
-- antes da contaminacao, com os digitos corretos. Esta migracao usa o nome
-- como fonte de verdade quando o telefone atual aparenta estar quebrado.

begin;

with extracted as (
  select
    id,
    nome,
    phone_digits as old_phone_digits,
    regexp_match(nome, '^WhatsApp \(([0-9]{2})\) ([0-9]{4,5})-([0-9]{4})$') as parts
  from public.customers
  where nome ~ '^WhatsApp \([0-9]{2}\) [0-9]{4,5}-[0-9]{4}$'
),
candidate as (
  select
    id,
    nome,
    old_phone_digits,
    '55' || (parts[1] || parts[2] || parts[3]) as canonical_digits
  from extracted
  where parts is not null
    and char_length(parts[1] || parts[2] || parts[3]) between 10 and 11
),
final as (
  /* Evita violar a unique constraint customers_tenant_phone_jid_unique_idx:
   * se ja existe OUTRO cliente no mesmo tenant com este phone_jid, pulamos
   * o update e deixamos para conciliacao manual. */
  select c.*
  from candidate c
  join public.customers cust on cust.id = c.id
  where not exists (
    select 1
    from public.customers other
    where other.id <> c.id
      and other.tenant_id = cust.tenant_id
      and other.phone_jid = c.canonical_digits || '@s.whatsapp.net'
  )
)
update public.customers customers
set
  telefone = '+' || final.canonical_digits,
  celular = case
    when customers.celular is null or customers.celular = '' then customers.celular
    else '+' || final.canonical_digits
  end,
  phone_digits = final.canonical_digits,
  phone_e164 = '+' || final.canonical_digits,
  phone_jid = final.canonical_digits || '@s.whatsapp.net',
  source_columns = coalesce(customers.source_columns, '{}'::jsonb)
    || jsonb_build_object(
      'recovered_phone_from_name_at', now()::text,
      'recovered_phone_from_name_old_digits', coalesce(final.old_phone_digits, '')
    )
from final
where customers.id = final.id
  and (
    customers.phone_digits is null
    or customers.phone_digits = ''
    or customers.phone_digits <> final.canonical_digits
  );

commit;
