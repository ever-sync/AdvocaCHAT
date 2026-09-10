-- Limpa nomes de contato contaminados com o nome da própria conta/canal.
--
-- Causa (corrigida em _shared/domain.ts): ao ingerir mensagens OUTBOUND (disparo),
-- o pushName usado como nome do contato era o da NOSSA conta (ex.: o nome do perfil
-- do WhatsApp Business, tipo "Recuperei Br"), e era gravado como nome do lead em
-- whatsapp_chats.display_name e em customers.nome.
--
-- Sinal seguro p/ detectar: o MESMO display_name aparecendo em >= 3 chats DISTINTOS
-- dentro da MESMA instância. Nome de lead não se repete assim; nome de conta sim.
-- Isso também limpa placeholders repetidos ("Cliente", "Sem nome"). Rótulos de
-- telefone ("WhatsApp (21) 99999-9999") são únicos por número e nunca são pegos.
--
-- Depois disso, com a correção em domain.ts (A2), quando o lead responder (inbound)
-- o nome real dele substitui automaticamente o rótulo de telefone.

drop table if exists _wa_contaminated;

-- 1) Captura os chats afetados ANTES de mutar (precisamos do customer_id e do nome ruim).
create temporary table _wa_contaminated as
select
  c.id           as chat_id,
  c.customer_id,
  c.display_name as bad_name,
  c.remote_phone_digits,
  c.remote_phone_e164
from public.whatsapp_chats c
join (
  select instance_id, display_name
  from public.whatsapp_chats
  where coalesce(btrim(display_name), '') <> ''
  group by instance_id, display_name
  having count(*) >= 3
) shared
  on shared.instance_id = c.instance_id
 and shared.display_name = c.display_name;

-- Função local (escopo de sessão) que monta o rótulo de telefone, espelhando
-- formatAutoCustomerName() do domain.ts.
create or replace function pg_temp.wa_phone_label(p_digits text, p_e164 text)
returns text language sql immutable as $$
  with d as (
    select regexp_replace(regexp_replace(coalesce(p_digits, ''), '\D', '', 'g'), '^55', '') as local
  )
  select case
    when length(d.local) = 11
      then 'WhatsApp (' || substr(d.local, 1, 2) || ') ' || substr(d.local, 3, 5) || '-' || substr(d.local, 8, 4)
    when length(d.local) = 10
      then 'WhatsApp (' || substr(d.local, 1, 2) || ') ' || substr(d.local, 3, 4) || '-' || substr(d.local, 7, 4)
    when coalesce(p_e164, '') <> ''
      then p_e164
    else 'Contato WhatsApp'
  end
  from d;
$$;

-- 2) Reseta o nome dos chats contaminados para o rótulo de telefone.
update public.whatsapp_chats c
set display_name = pg_temp.wa_phone_label(t.remote_phone_digits, t.remote_phone_e164)
from _wa_contaminated t
where c.id = t.chat_id;

-- 3) Reseta o nome dos CLIENTES auto-criados ligados a esses chats, apenas quando o
--    nome do cliente é exatamente o nome ruim. Nunca toca cliente cadastrado à mão
--    (source_columns.auto_created != true) nem quem já tem outro nome.
update public.customers cust
set nome = pg_temp.wa_phone_label(cust.phone_digits, cust.phone_e164)
from _wa_contaminated t
where cust.id = t.customer_id
  and cust.nome = t.bad_name
  and coalesce(cust.source_columns->>'auto_created', 'false') = 'true';

drop function if exists pg_temp.wa_phone_label(text, text);
drop table if exists _wa_contaminated;
