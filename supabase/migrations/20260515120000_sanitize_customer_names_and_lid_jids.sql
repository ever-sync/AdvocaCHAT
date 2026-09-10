-- Saneia clientes contaminados por:
-- 1. JIDs `@lid` (Linked ID anonimo do WhatsApp Multi-device) cadastrados como telefone real.
-- 2. `customers.nome` que e apenas um telefone disfarcado (ex: "Tel.: 11 9999-9999",
--    "+55 (11) 9.9999-9999", "11999998888", emoji + numero).
--
-- A primeira parte marca esses registros como `ativo = false` e move o "telefone falso"
-- para `source_columns.lid_remote_jid` para auditoria, sem deletar dados.
-- A segunda parte normaliza o `nome` para o formato canonico
-- "WhatsApp (DDD) NNNNN-NNNN" baseado no proprio telefone.

begin;

-- ===== 1) Marcar clientes criados a partir de JID @lid =====
-- Heuristica: phone_digits com 14+ digitos (impossivel para BR/PT) ou
-- source_columns->>'remote_jid' contendo "@lid".

with lid_customers as (
  select id, phone_digits, source_columns
  from customers
  where (
    -- phone_digits com mais de 13 digitos = quase certo @lid mascarado
    (phone_digits is not null and char_length(phone_digits) > 13)
    or (source_columns is not null and source_columns->>'remote_jid' ilike '%@lid')
  )
)
update customers c
set
  ativo = false,
  status = 'inativo',
  source_columns = coalesce(c.source_columns, '{}'::jsonb)
    || jsonb_build_object(
      'lid_remote_jid', coalesce(c.source_columns->>'remote_jid', c.phone_jid),
      'sanitized_at', now()::text,
      'sanitized_reason', 'lid_jid_not_a_real_phone'
    )
from lid_customers l
where c.id = l.id;

-- Tambem fechar os chats correspondentes (status valido: 'open' | 'closed')
update whatsapp_chats wc
set status = 'closed'
from customers c
where c.id = wc.customer_id
  and c.source_columns->>'sanitized_reason' = 'lid_jid_not_a_real_phone'
  and wc.status <> 'closed';

-- ===== 2) Corrigir customers.nome que sao na verdade apenas telefone =====
-- Detecta nomes que:
--   - Tem >= 10 digitos
--   - NAO tem 2 letras seguidas (so digitos e separadores como `+ ( ) - . :  / espaco emoji`)
--
-- Substitui por "WhatsApp (DDD) NNNNN-NNNN" baseado em phone_digits.

create or replace function pg_temp.format_whatsapp_name(p_digits text)
returns text
language plpgsql
immutable as $$
declare
  national text;
  ddd text;
  prefix text;
  suffix text;
begin
  if p_digits is null or length(p_digits) < 10 then
    return 'Contato WhatsApp';
  end if;

  -- Remove DDI 55 se presente
  if left(p_digits, 2) = '55' and length(p_digits) > 11 then
    national := substring(p_digits from 3);
  else
    national := p_digits;
  end if;

  if length(national) = 11 then
    ddd := substring(national from 1 for 2);
    prefix := substring(national from 3 for 5);
    suffix := substring(national from 8 for 4);
  elsif length(national) = 10 then
    ddd := substring(national from 1 for 2);
    prefix := substring(national from 3 for 4);
    suffix := substring(national from 7 for 4);
  else
    return 'Contato WhatsApp';
  end if;

  return 'WhatsApp (' || ddd || ') ' || prefix || '-' || suffix;
end;
$$;

with bad_names as (
  select id, nome, phone_digits
  from customers
  where nome is not null
    and length(nome) > 0
    -- Tem digitos suficientes para ser um telefone
    and char_length(regexp_replace(nome, '[^0-9]', '', 'g')) >= 10
    -- E NAO tem 2 letras seguidas (Postgres POSIX class)
    and nome !~ '[[:alpha:]]{2,}'
    -- E temos um phone_digits real para reformatar
    and phone_digits is not null
    and char_length(phone_digits) between 10 and 13
)
update customers c
set
  nome = pg_temp.format_whatsapp_name(b.phone_digits),
  source_columns = coalesce(c.source_columns, '{}'::jsonb)
    || jsonb_build_object(
      'sanitized_previous_name', b.nome,
      'sanitized_at', now()::text,
      'sanitized_reason', coalesce(c.source_columns->>'sanitized_reason', 'name_was_phone')
    )
from bad_names b
where c.id = b.id;

-- Atualiza display_name dos chats correspondentes (caso estejam espelhando o nome ruim)
update whatsapp_chats wc
set display_name = c.nome
from customers c
where c.id = wc.customer_id
  and c.source_columns->>'sanitized_reason' in ('name_was_phone', 'lid_jid_not_a_real_phone')
  and wc.display_name is distinct from c.nome
  and (
    -- so atualiza se o display_name do chat tambem parecia telefone
    char_length(regexp_replace(coalesce(wc.display_name, ''), '[^0-9]', '', 'g')) >= 10
    and coalesce(wc.display_name, '') !~ '[[:alpha:]]{2,}'
  );

commit;
