-- Remove o destino manual do CRM nos formulários.
-- A partir desta versão, o submit_marketing_form sempre usa o funil/etapa
-- padrão do tenant. O roteamento específico passa a depender de automações.

create or replace function public.submit_marketing_form(
  p_form_id uuid,
  p_data jsonb,
  p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $submit_marketing_form$
declare
  v_form record;
  v_tenant uuid;
  v_funnel text;
  v_stage text;
  v_name text;
  v_phone text;
  v_email text;
  v_phone_norm text;
  v_customer_id uuid;
  v_neg_id uuid;
  v_title text;
  v_existing_customer boolean := false;
  v_field jsonb;
  v_mapping jsonb;
  v_mkind text;
  v_fname text;
  v_flabel text;
  v_fvalue text;
  v_field_uuid uuid;
  v_ckind text;
  v_storage text;
  v_other jsonb := '{}'::jsonb;
begin
  select f.* into v_form
  from public.marketing_forms f
  where f.id = p_form_id;

  if v_form.id is null or v_form.is_active is not true then
    raise exception 'Formulário não encontrado ou inativo';
  end if;

  v_tenant := v_form.tenant_id;

  v_name := nullif(trim(coalesce(p_data->>'name', p_data->>'nome', p_data->>'full_name', '')), '');
  v_email := lower(nullif(trim(coalesce(p_data->>'email', '')), ''));
  v_phone := nullif(trim(coalesce(p_data->>'phone', p_data->>'telefone', p_data->>'celular', p_data->>'whatsapp', '')), '');
  v_phone_norm := public.normalize_customer_phone_digits(v_phone);

  select t.funnel_id, t.stage_id
  into v_funnel, v_stage
  from public.tenant_default_funnel_stage(v_tenant) t;

  if v_phone_norm is not null then
    v_customer_id := public.find_customer_id_by_phone(v_tenant, v_phone_norm);
  end if;

  if v_customer_id is null and v_email is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.tenant_id = v_tenant
      and lower(nullif(c.email, '')) = v_email
    order by c.updated_at desc
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (tenant_id, nome, telefone, email, source_columns)
    values (
      v_tenant,
      coalesce(v_name, v_email, 'Lead'),
      coalesce(v_phone, ''),
      coalesce(v_email, ''),
      jsonb_build_object('canal_origem', 'Formulário')
    )
    returning id into v_customer_id;
  else
    v_existing_customer := true;
    update public.customers c
    set
      nome = case when coalesce(nullif(trim(c.nome), ''), '') = '' then coalesce(v_name, c.nome) else c.nome end,
      telefone = case when coalesce(nullif(trim(c.telefone), ''), '') = '' then coalesce(v_phone, c.telefone) else c.telefone end,
      email = case when coalesce(nullif(trim(c.email), ''), '') = '' then coalesce(v_email, c.email) else c.email end,
      source_columns = case
        when coalesce(c.source_columns->>'canal_origem', '') = ''
        then jsonb_set(coalesce(c.source_columns, '{}'::jsonb), '{canal_origem}', '"Formulário"', true)
        else c.source_columns
      end
    where c.id = v_customer_id;
  end if;

  perform public.apply_customer_phone_from_raw(v_customer_id, coalesce(v_phone, v_phone_norm));

  v_title := coalesce(v_name, v_email, v_phone, 'Lead de formulário');

  select n.id into v_neg_id
  from public.crm_negotiations n
  where n.tenant_id = v_tenant
    and n.customer_id = v_customer_id
    and n.status = 'em_andamento'
  order by n.updated_at desc
  limit 1;

  if v_neg_id is null then
    insert into public.crm_negotiations (
      tenant_id, title, funnel_id, stage_id, status, customer_id,
      last_interaction_at, last_contact_at
    ) values (
      v_tenant, v_title, v_funnel, v_stage, 'em_andamento', v_customer_id,
      timezone('utc', now()), timezone('utc', now())
    )
    returning id into v_neg_id;
  else
    update public.crm_negotiations n
    set last_interaction_at = timezone('utc', now()),
        last_contact_at = timezone('utc', now())
    where n.id = v_neg_id;
  end if;

  insert into public.crm_negotiation_marketing (
    negotiation_id, tenant_id, form_id, variant_id, answers,
    score, score_factors,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer,
    attribution, ip_address, fingerprint, user_agent, time_to_complete_seconds, is_duplicate
  ) values (
    v_neg_id, v_tenant, p_form_id,
    nullif(p_meta->>'variant_id', '')::uuid,
    coalesce(p_data, '{}'::jsonb),
    coalesce((p_meta->>'score')::int, 0),
    coalesce(p_meta->'score_factors', '[]'::jsonb),
    nullif(p_meta->>'utm_source', ''), nullif(p_meta->>'utm_medium', ''),
    nullif(p_meta->>'utm_campaign', ''), nullif(p_meta->>'utm_term', ''),
    nullif(p_meta->>'utm_content', ''), nullif(p_meta->>'referrer', ''),
    coalesce(p_meta->'attribution', '{}'::jsonb),
    nullif(p_meta->>'ip_address', ''), nullif(p_meta->>'fingerprint', ''),
    nullif(p_meta->>'user_agent', ''),
    nullif(p_meta->>'time_to_complete_seconds', '')::int,
    coalesce((p_meta->>'is_duplicate')::boolean, false)
  )
  on conflict (negotiation_id) do update set
    answers = public.crm_negotiation_marketing.answers || excluded.answers,
    score = greatest(public.crm_negotiation_marketing.score, excluded.score),
    form_id = coalesce(public.crm_negotiation_marketing.form_id, excluded.form_id),
    updated_at = timezone('utc', now());

  if jsonb_typeof(v_form.fields) = 'array' then
    for v_field in select * from jsonb_array_elements(v_form.fields) loop
      v_fname := v_field->>'name';
      if v_fname is null then
        continue;
      end if;

      v_flabel := coalesce(nullif(trim(v_field->>'label'), ''), v_fname);
      v_mapping := v_field->'mapping';
      v_mkind := coalesce(v_mapping->>'kind', 'extra');
      v_fvalue := p_data->>v_fname;

      if v_fvalue is null and jsonb_typeof(p_data->v_fname) = 'array' then
        select string_agg(elem, ', ') into v_fvalue
        from jsonb_array_elements_text(p_data->v_fname) as elem;
      end if;
      if v_fvalue is null or trim(v_fvalue) = '' then
        continue;
      end if;

      begin
        if v_mkind = 'default'
          or v_fname in ('name', 'nome', 'full_name', 'email', 'phone', 'telefone', 'celular', 'whatsapp') then
          continue;
        elsif v_mkind = 'custom' then
          v_field_uuid := nullif(v_mapping->>'fieldId', '')::uuid;
          if v_field_uuid is null then
            continue;
          end if;

          select kind into v_ckind
          from public.customer_custom_fields
          where id = v_field_uuid and tenant_id = v_tenant;
          if v_ckind is null then
            continue;
          end if;

          v_storage := case
            when v_ckind = 'data' then 'date'
            when v_ckind in ('numero', 'inteiro', 'moeda', 'porcentagem') then 'numeric'
            else 'text'
          end;

          insert into public.customer_custom_field_values (customer_id, field_id, value_text, value_numeric, value_date)
          values (
            v_customer_id,
            v_field_uuid,
            case
              when v_storage = 'text' then
                case
                  when v_ckind = 'booleano' then
                    case when lower(v_fvalue) in ('1', 'sim', 'true', 'on', 'yes') then '1' else '0' end
                  else v_fvalue
                end
              else null
            end,
            case
              when v_storage = 'numeric' then
                nullif(regexp_replace(replace(replace(v_fvalue, '.', ''), ',', '.'), '[^0-9.\-]', '', 'g'), '')::numeric
              else null
            end,
            case when v_storage = 'date' then nullif(left(v_fvalue, 10), '')::date else null end
          )
          on conflict (customer_id, field_id) do update set
            value_text = excluded.value_text,
            value_numeric = excluded.value_numeric,
            value_date = excluded.value_date;
        else
          v_other := v_other || jsonb_build_object(v_flabel, v_fvalue);
        end if;
      exception when others then
        raise warning 'submit_marketing_form: campo "%" ignorado (form %): %', v_fname, p_form_id, sqlerrm;
      end;
    end loop;
  end if;

  if v_other <> '{}'::jsonb then
    update public.crm_negotiations
    set other_info = coalesce(other_info, '{}'::jsonb) || v_other
    where id = v_neg_id;
  end if;

  update public.marketing_forms
  set total_submissions = total_submissions + 1
  where id = p_form_id;

  begin
    perform public.enroll_marketing_flow_participants(
      v_tenant,
      'form_submitted',
      v_customer_id,
      v_neg_id,
      jsonb_build_object(
        'form_id', p_form_id,
        'form_slug', v_form.slug,
        'form_name', v_form.name,
        'lead_mode', case when v_existing_customer then 'existing' else 'new' end,
        'fields', coalesce(p_data, '{}'::jsonb),
        'meta', coalesce(p_meta, '{}'::jsonb)
      )
    );
  exception when others then
    raise warning 'marketing_flow enroll (form_submitted) failed: %', sqlerrm;
  end;

  return v_neg_id;
end;
$submit_marketing_form$;

update public.marketing_forms
set target_funnel_id = null,
    target_stage_id = null
where target_funnel_id is not null
   or target_stage_id is not null;

grant execute on function public.submit_marketing_form(uuid, jsonb, jsonb) to service_role;
