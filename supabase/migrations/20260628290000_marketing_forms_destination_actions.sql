-- Marketing Forms: destinos e integrações após submissão.
-- Expande o trigger de submissão para:
-- - aplicar customerTags configuradas no form
-- - registrar uma activity no CRM quando habilitado
-- Mantém a lógica idempotente e sem alterar o schema.

create or replace function public.tag_customer_from_form_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_form record;
  v_src text;
  v_auto_tag text;
  v_settings_tags text[] := '{}'::text[];
  v_tag text;
  v_existing_raw text;
  v_existing_tags jsonb;
  v_merged_tags jsonb;
  v_activity_title text;
  v_activity_body text;
begin
  -- Cliente vinculado à negociação desta submissão.
  select customer_id into v_customer_id
  from public.crm_negotiations
  where id = NEW.negotiation_id;
  if v_customer_id is null then
    return NEW;
  end if;

  select f.*
  into v_form
  from public.marketing_forms f
  where f.id = NEW.form_id;

  -- Resolve a tag automática pela origem (utm_source, case-insensitive).
  v_src := lower(coalesce(NEW.utm_source, ''));
  if v_src ~ '(facebook|meta|\yfb\y)' then
    v_auto_tag := 'Formulário Facebook';
  elsif v_src ~ '(instagram|\yig\y)' then
    v_auto_tag := 'Formulário Instagram';
  elsif v_src ~ '(google|adwords|gads)' then
    v_auto_tag := 'Formulário Google';
  else
    v_auto_tag := 'Formulário';
  end if;

  -- Tags extras configuradas no form: settings.customerTags.
  if v_form.id is not null then
    select coalesce(array_agg(distinct trim(x)), '{}'::text[])
    into v_settings_tags
    from jsonb_array_elements_text(coalesce(v_form.settings -> 'customerTags', '[]'::jsonb)) as t(x)
    where trim(x) <> '';
  end if;

  -- Lê as tags atuais (array JSON em source_columns.wchat_customer_tags).
  select coalesce(source_columns->>'wchat_customer_tags', '')
  into v_existing_raw
  from public.customers
  where id = v_customer_id;

  begin
    v_existing_tags := coalesce(nullif(v_existing_raw, '')::jsonb, '[]'::jsonb);
    if jsonb_typeof(v_existing_tags) <> 'array' then
      v_existing_tags := '[]'::jsonb;
    end if;
  exception when others then
    select coalesce(jsonb_agg(trim(t)), '[]'::jsonb)
    into v_existing_tags
    from regexp_split_to_table(coalesce(v_existing_raw, ''), '[,;|]') t
    where trim(t) <> '';
  end;

  v_merged_tags := coalesce(v_existing_tags, '[]'::jsonb);

  if not exists (select 1 from jsonb_array_elements_text(v_merged_tags) t where t = v_auto_tag) then
    v_merged_tags := v_merged_tags || to_jsonb(v_auto_tag);
  end if;

  foreach v_tag in array v_settings_tags loop
    if not exists (select 1 from jsonb_array_elements_text(v_merged_tags) t where t = v_tag) then
      v_merged_tags := v_merged_tags || to_jsonb(v_tag);
    end if;
  end loop;

  update public.customers
  set source_columns = jsonb_set(
        coalesce(source_columns, '{}'::jsonb),
        '{wchat_customer_tags}',
        to_jsonb(v_merged_tags::text),
        true
      )
  where id = v_customer_id;

  -- Timeline do CRM: atividade opcional configurada no form.
  if coalesce((v_form.settings ->> 'createActivityOnSubmit')::boolean, false) then
    v_activity_title := nullif(trim(coalesce(v_form.settings ->> 'activityTitle', '')), '');
    v_activity_body := nullif(trim(coalesce(v_form.settings ->> 'activityBody', '')), '');

    insert into public.crm_activities (
      tenant_id,
      negotiation_id,
      customer_id,
      activity_type,
      title,
      body,
      metadata,
      created_by
    ) values (
      NEW.tenant_id,
      NEW.negotiation_id,
      v_customer_id,
      'marketing_form_submitted',
      coalesce(v_activity_title, 'Formulário enviado'),
      coalesce(v_activity_body, 'Lead enviado pelo formulário de marketing.'),
      jsonb_build_object(
        'form_id', NEW.form_id,
        'variant_id', NEW.variant_id,
        'score', NEW.score,
        'is_duplicate', NEW.is_duplicate,
        'customer_tags', v_settings_tags,
        'auto_tag', v_auto_tag
      ),
      auth.uid()
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists crm_negotiation_marketing_tag_source
  on public.crm_negotiation_marketing;
create trigger crm_negotiation_marketing_tag_source
after insert on public.crm_negotiation_marketing
for each row execute function public.tag_customer_from_form_source();
