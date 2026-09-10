-- Tag de origem nos leads de formulário.
-- Quando uma submissão de formulário cria/atualiza a sidecar
-- crm_negotiation_marketing, marcamos o CLIENTE com uma tag de origem em
-- source_columns.wchat_customer_tags (o mesmo array JSON que a tela de Clientes
-- e o Inbox já leem/escrevem). A origem vem do utm_source:
--   facebook/meta/fb   -> "Formulário Facebook"
--   instagram/ig       -> "Formulário Instagram"
--   google/adwords     -> "Formulário Google"
--   (qualquer outro)   -> "Formulário"
--
-- Feito por trigger (e não dentro da RPC submit_marketing_form) para não
-- reescrever aquela função grande e manter esta regra isolada/idempotente.

create or replace function public.tag_customer_from_form_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_src text;
  v_tag text;
  v_raw text;
  v_tags jsonb;
begin
  -- Cliente vinculado à negociação desta submissão.
  select customer_id into v_customer_id
  from public.crm_negotiations
  where id = NEW.negotiation_id;
  if v_customer_id is null then
    return NEW;
  end if;

  -- Resolve a tag pela origem (utm_source, case-insensitive).
  v_src := lower(coalesce(NEW.utm_source, ''));
  -- Postgres ARE: \y = limite de palavra (\b é backspace). 'ig' isolado = Instagram.
  if v_src ~ '(facebook|meta|\yfb\y)' then
    v_tag := 'Formulário Facebook';
  elsif v_src ~ '(instagram|\yig\y)' then
    v_tag := 'Formulário Instagram';
  elsif v_src ~ '(google|adwords|gads)' then
    v_tag := 'Formulário Google';
  else
    v_tag := 'Formulário';
  end if;

  -- Lê as tags atuais (array JSON em source_columns.wchat_customer_tags).
  select source_columns->>'wchat_customer_tags' into v_raw
  from public.customers where id = v_customer_id;

  begin
    v_tags := coalesce(nullif(v_raw, '')::jsonb, '[]'::jsonb);
    if jsonb_typeof(v_tags) <> 'array' then
      v_tags := '[]'::jsonb;
    end if;
  exception when others then
    -- Formato legado (separado por vírgula/; /|): preserva como array.
    select coalesce(jsonb_agg(trim(t)), '[]'::jsonb)
    into v_tags
    from regexp_split_to_table(coalesce(v_raw, ''), '[,;|]') t
    where trim(t) <> '';
  end;

  -- Já tem a tag? não faz nada (idempotente).
  if exists (
    select 1 from jsonb_array_elements_text(v_tags) t where t = v_tag
  ) then
    return NEW;
  end if;

  v_tags := v_tags || to_jsonb(v_tag);

  update public.customers
  set source_columns = jsonb_set(
        coalesce(source_columns, '{}'::jsonb),
        '{wchat_customer_tags}',
        to_jsonb(v_tags::text), -- guarda como STRING serializada (formato do app)
        true
      )
  where id = v_customer_id;

  return NEW;
end;
$$;

drop trigger if exists crm_negotiation_marketing_tag_source
  on public.crm_negotiation_marketing;
create trigger crm_negotiation_marketing_tag_source
after insert on public.crm_negotiation_marketing
for each row execute function public.tag_customer_from_form_source();
