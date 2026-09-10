-- Dedup formulário → WhatsApp: leads do form gravavam só `telefone`, sem
-- `phone_digits`. O inbox WhatsApp busca por `phone_digits` / `phone_jid`,
-- não encontrava o cliente do form e criava outro + nova negociação.

-- Normaliza telefone BR para o mesmo formato usado pelo inbox (55 + DDD + número).
create or replace function public.normalize_customer_phone_digits(p_raw text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select nullif(regexp_replace(coalesce(p_raw, ''), '\D', '', 'g'), '') as d
  )
  select case
    when d is null then null
    when left(d, 2) = '55' and char_length(substr(d, 3)) > 11
      then '55' || right(substr(d, 3), 11)
    when left(d, 2) = '55' then d
    when char_length(regexp_replace(d, '^0+', '')) > 11
      then '55' || right(regexp_replace(d, '^0+', ''), 11)
    else '55' || regexp_replace(d, '^0+', '')
  end
  from cleaned;
$$;

-- Preenche colunas canônicas de telefone (idempotente).
create or replace function public.apply_customer_phone_from_raw(
  p_customer_id uuid,
  p_raw_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text;
begin
  v_digits := public.normalize_customer_phone_digits(p_raw_phone);
  if v_digits is null then
    return;
  end if;

  update public.customers c
  set
    telefone = case
      when coalesce(nullif(trim(c.telefone), ''), '') = '' then '+' || v_digits
      else c.telefone
    end,
    celular = case
      when coalesce(nullif(trim(c.celular), ''), '') = '' then '+' || v_digits
      else c.celular
    end,
    phone_digits = case
      when exists (
        select 1
        from public.customers other
        where other.id <> c.id
          and other.tenant_id = c.tenant_id
          and other.phone_jid = v_digits || '@s.whatsapp.net'
      ) then c.phone_digits
      else v_digits
    end,
    phone_e164 = case
      when exists (
        select 1
        from public.customers other
        where other.id <> c.id
          and other.tenant_id = c.tenant_id
          and other.phone_jid = v_digits || '@s.whatsapp.net'
      ) then c.phone_e164
      else '+' || v_digits
    end,
    phone_jid = case
      when exists (
        select 1
        from public.customers other
        where other.id <> c.id
          and other.tenant_id = c.tenant_id
          and other.phone_jid = v_digits || '@s.whatsapp.net'
      ) then c.phone_jid
      else v_digits || '@s.whatsapp.net'
    end
  where c.id = p_customer_id;
end;
$$;

-- Busca cliente por qualquer representação do telefone (form, CRM, WhatsApp).
create or replace function public.find_customer_id_by_phone(
  p_tenant_id uuid,
  p_phone_digits text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_digits text;
  v_suffix text;
  v_found uuid;
begin
  v_digits := public.normalize_customer_phone_digits(p_phone_digits);
  if v_digits is null then
    return null;
  end if;

  v_suffix := right(v_digits, 8);

  select c.id into v_found
  from public.customers c
  where c.tenant_id = p_tenant_id
    and (
      c.phone_digits = v_digits
      or c.phone_digits = regexp_replace(v_digits, '^55', '')
      or regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') = v_digits
      or regexp_replace(coalesce(c.celular, ''), '\D', '', 'g') = v_digits
      or (
        char_length(v_suffix) >= 8
        and (
          right(coalesce(c.phone_digits, ''), 8) = v_suffix
          or right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 8) = v_suffix
          or right(regexp_replace(coalesce(c.celular, ''), '\D', '', 'g'), 8) = v_suffix
        )
      )
    )
  order by
    case
      when c.phone_digits = v_digits then 0
      when regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') = v_digits then 1
      else 2
    end,
    c.updated_at desc
  limit 1;

  return v_found;
end;
$$;

-- Dois registros de cliente com o mesmo telefone (legado)?
create or replace function public.customers_share_phone(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with phones as (
    select
      c.id,
      public.normalize_customer_phone_digits(
        coalesce(
          nullif(c.phone_digits, ''),
          nullif(c.telefone, ''),
          nullif(c.celular, '')
        )
      ) as digits
    from public.customers c
    where c.id in (p_a, p_b)
  )
  select coalesce(
    (select digits from phones where id = p_a limit 1),
    ''
  ) <> ''
  and (select digits from phones where id = p_a limit 1)
    = (select digits from phones where id = p_b limit 1);
$$;

grant execute on function public.normalize_customer_phone_digits(text) to service_role;
grant execute on function public.apply_customer_phone_from_raw(uuid, text) to service_role;
grant execute on function public.find_customer_id_by_phone(uuid, text) to service_role, authenticated;
grant execute on function public.customers_share_phone(uuid, uuid) to service_role, authenticated;

-- Backfill: clientes do form sem phone_digits (pula se outro cliente já tem o JID)
with candidate as (
  select
    c.id,
    c.tenant_id,
    public.normalize_customer_phone_digits(coalesce(c.telefone, c.celular)) as digits
  from public.customers c
  where (c.phone_digits is null or btrim(c.phone_digits) = '')
    and public.normalize_customer_phone_digits(coalesce(c.telefone, c.celular)) is not null
),
safe as (
  select cand.*
  from candidate cand
  where not exists (
    select 1
    from public.customers other
    where other.id <> cand.id
      and other.tenant_id = cand.tenant_id
      and other.phone_jid = cand.digits || '@s.whatsapp.net'
  )
)
update public.customers c
set
  phone_digits = safe.digits,
  phone_e164 = '+' || safe.digits,
  phone_jid = safe.digits || '@s.whatsapp.net'
from safe
where c.id = safe.id;

-- Concilia duplicatas legadas: form (só telefone) + WhatsApp (phone_jid)
create temp table _crm_form_wa_dupes on commit drop as
select
  keeper.id as keep_id,
  dupe.id as dupe_id
from public.customers keeper
inner join public.customers dupe
  on dupe.tenant_id = keeper.tenant_id
  and dupe.id <> keeper.id
where coalesce(btrim(keeper.phone_jid), '') <> ''
  and coalesce(btrim(dupe.phone_jid), '') = ''
  and public.customers_share_phone(keeper.id, dupe.id);

update public.whatsapp_chats target
set customer_id = d.keep_id
from _crm_form_wa_dupes d
where target.customer_id = d.dupe_id;

update public.crm_negotiations target
set customer_id = d.keep_id
from _crm_form_wa_dupes d
where target.customer_id = d.dupe_id
  and not exists (
    select 1
    from public.crm_negotiations existing
    where existing.customer_id = d.keep_id
      and existing.status = 'em_andamento'
      and target.status = 'em_andamento'
      and existing.id <> target.id
  );

update public.crm_negotiations target
set
  status = 'perdido',
  lost_reason = coalesce(nullif(btrim(target.lost_reason), ''), 'Duplicata conciliada')
from _crm_form_wa_dupes d
where target.customer_id = d.dupe_id
  and target.status = 'em_andamento'
  and exists (
    select 1
    from public.crm_negotiations existing
    where existing.customer_id = d.keep_id
      and existing.status = 'em_andamento'
      and existing.id <> target.id
  );

update public.crm_negotiations target
set customer_id = d.keep_id
from _crm_form_wa_dupes d
where target.customer_id = d.dupe_id;

update public.campaign_recipients target
set customer_id = d.keep_id
from _crm_form_wa_dupes d
where target.customer_id = d.dupe_id;

update public.crm_tasks target
set customer_id = d.keep_id
from _crm_form_wa_dupes d
where target.customer_id = d.dupe_id;

delete from public.customers c
using _crm_form_wa_dupes d
where c.id = d.dupe_id;

-- ---------------------------------------------------------------------------
-- ensure_lead_from_chat: reaproveita negociação do mesmo telefone
-- ---------------------------------------------------------------------------
create or replace function public.ensure_lead_from_chat(
  p_chat_id uuid,
  p_auto_assign boolean default false,
  p_force_new boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat record;
  v_neg_id uuid;
  v_neg_assignee uuid;
  v_neg_customer_id uuid;
  v_funnel_id text;
  v_stage_id text;
  v_title text;
begin
  select
    c.id,
    c.tenant_id,
    c.customer_id,
    c.display_name,
    c.assignee_id,
    c.primary_negotiation_id,
    cu.nome as customer_nome
  into v_chat
  from public.whatsapp_chats c
  left join public.customers cu on cu.id = c.customer_id
  where c.id = p_chat_id;

  if v_chat.id is null then
    raise exception 'Chat não encontrado';
  end if;

  if v_chat.customer_id is null then
    raise exception 'Chat sem cliente vinculado';
  end if;

  if not public.can_atendimento_act_on_chat(v_chat.assignee_id) then
    raise exception 'Assuma a conversa antes de vincular ao CRM';
  end if;

  if not p_force_new then
    if v_chat.primary_negotiation_id is not null then
      select n.id, n.assignee_id into v_neg_id, v_neg_assignee
      from public.crm_negotiations n
      where n.id = v_chat.primary_negotiation_id
        and n.status = 'em_andamento';
      if v_neg_id is not null then
        if not public.can_modify_crm_negotiation(v_neg_assignee) then
          raise exception 'Assuma o negócio antes de continuar';
        end if;
        return v_neg_id;
      end if;
    end if;

    select n.id, n.assignee_id into v_neg_id, v_neg_assignee
    from public.crm_negotiations n
    where n.tenant_id = v_chat.tenant_id
      and n.customer_id = v_chat.customer_id
      and n.status = 'em_andamento'
    order by n.updated_at desc
    limit 1;

    if v_neg_id is not null and not public.can_modify_crm_negotiation(v_neg_assignee) then
      raise exception 'Assuma o negócio antes de continuar';
    end if;

    -- Mesmo telefone, outro customer_id (ex.: form sem phone_digits + WA auto-create)
    if v_neg_id is null then
      select n.id, n.assignee_id, n.customer_id
      into v_neg_id, v_neg_assignee, v_neg_customer_id
      from public.crm_negotiations n
      inner join public.customers c on c.id = n.customer_id
      where n.tenant_id = v_chat.tenant_id
        and n.status = 'em_andamento'
        and public.customers_share_phone(c.id, v_chat.customer_id)
      order by n.updated_at desc
      limit 1;

      if v_neg_id is not null and not public.can_modify_crm_negotiation(v_neg_assignee) then
        raise exception 'Assuma o negócio antes de continuar';
      end if;

      if v_neg_id is not null
        and v_neg_customer_id is not null
        and v_neg_customer_id is distinct from v_chat.customer_id then
        update public.whatsapp_chats
        set customer_id = v_neg_customer_id
        where id = p_chat_id;
        v_chat.customer_id := v_neg_customer_id;
      end if;
    end if;
  else
    v_neg_id := null;
  end if;

  if v_neg_id is null then
    select t.funnel_id, t.stage_id into v_funnel_id, v_stage_id
    from public.tenant_default_funnel_stage(v_chat.tenant_id) t;

    v_title := coalesce(
      nullif(trim(v_chat.customer_nome), ''),
      nullif(trim(v_chat.display_name), ''),
      'Lead WhatsApp'
    );

    insert into public.crm_negotiations (
      tenant_id,
      title,
      funnel_id,
      stage_id,
      status,
      customer_id,
      source_chat_id,
      assignee_id,
      last_interaction_at,
      last_contact_at
    ) values (
      v_chat.tenant_id,
      v_title,
      v_funnel_id,
      v_stage_id,
      'em_andamento',
      v_chat.customer_id,
      p_chat_id,
      v_chat.assignee_id,
      timezone('utc', now()),
      timezone('utc', now())
    )
    returning id into v_neg_id;
  else
    update public.crm_negotiations n
    set
      source_chat_id = coalesce(n.source_chat_id, p_chat_id),
      assignee_id = coalesce(n.assignee_id, v_chat.assignee_id),
      last_interaction_at = timezone('utc', now())
    where n.id = v_neg_id;
  end if;

  update public.whatsapp_chats
  set primary_negotiation_id = v_neg_id
  where id = p_chat_id;

  if p_auto_assign and v_chat.assignee_id is null then
    perform public.auto_assign_chat_system(p_chat_id);
  end if;

  return v_neg_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- upsert_crm_lead: dedup + phone_digits
-- ---------------------------------------------------------------------------
create or replace function public.upsert_crm_lead(
  p_tenant_id    uuid,
  p_nome         text    default null,
  p_telefone     text    default null,
  p_email        text    default null,
  p_funnel_id    text    default null,
  p_stage_id     text    default null,
  p_title        text    default null,
  p_fonte        text    default null,
  p_custom_fields jsonb  default '{}'::jsonb
)
returns table(
  customer_id     uuid,
  negotiation_id  uuid,
  is_new_customer boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome        text   := nullif(trim(coalesce(p_nome, '')), '');
  v_email       text   := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_phone       text   := nullif(trim(coalesce(p_telefone, '')), '');
  v_phone_norm  text   := public.normalize_customer_phone_digits(p_telefone);
  v_funnel      text;
  v_stage       text;
  v_customer_id uuid;
  v_neg_id      uuid;
  v_new_cust    boolean := false;
  v_title       text;
begin
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'Tenant não encontrado';
  end if;

  v_funnel := nullif(trim(coalesce(p_funnel_id, '')), '');
  v_stage  := nullif(trim(coalesce(p_stage_id, '')), '');

  if v_funnel is null or v_stage is null then
    select t.funnel_id, t.stage_id
    into   v_funnel, v_stage
    from   public.tenant_default_funnel_stage(p_tenant_id) t;
  end if;

  if v_phone_norm is not null then
    v_customer_id := public.find_customer_id_by_phone(p_tenant_id, v_phone_norm);
  end if;

  if v_customer_id is null and v_email is not null then
    select c.id into v_customer_id
    from   public.customers c
    where  c.tenant_id = p_tenant_id
      and  lower(nullif(trim(c.email), '')) = v_email
    order by c.updated_at desc
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (tenant_id, nome, telefone, email)
    values (
      p_tenant_id,
      coalesce(v_nome, v_email, v_phone, 'Lead'),
      coalesce(v_phone, ''),
      coalesce(v_email, '')
    )
    returning id into v_customer_id;
    v_new_cust := true;
  else
    update public.customers c
    set
      nome     = case when coalesce(nullif(trim(c.nome),    ''), '') = '' then coalesce(v_nome,  c.nome)    else c.nome    end,
      telefone = case when coalesce(nullif(trim(c.telefone),''), '') = '' then coalesce(v_phone, c.telefone) else c.telefone end,
      email    = case when coalesce(nullif(trim(c.email),   ''), '') = '' then coalesce(v_email, c.email)   else c.email   end
    where c.id = v_customer_id;
  end if;

  perform public.apply_customer_phone_from_raw(v_customer_id, coalesce(v_phone, v_phone_norm));

  v_title := coalesce(
    nullif(trim(coalesce(p_title, '')), ''),
    case when p_fonte is not null
         then coalesce(v_nome, 'Lead') || ' — ' || p_fonte
         else coalesce(v_nome, v_email, v_phone, 'Lead externo')
    end
  );

  select n.id into v_neg_id
  from   public.crm_negotiations n
  where  n.tenant_id   = p_tenant_id
    and  n.customer_id = v_customer_id
    and  n.status      = 'em_andamento'
  order by n.updated_at desc
  limit 1;

  if v_neg_id is null then
    insert into public.crm_negotiations (
      tenant_id, title, funnel_id, stage_id, status, customer_id,
      last_interaction_at, last_contact_at
    ) values (
      p_tenant_id, v_title, v_funnel, v_stage, 'em_andamento', v_customer_id,
      timezone('utc', now()), timezone('utc', now())
    )
    returning id into v_neg_id;
  else
    update public.crm_negotiations n
    set last_interaction_at = timezone('utc', now()),
        last_contact_at     = timezone('utc', now())
    where n.id = v_neg_id;
  end if;

  customer_id    := v_customer_id;
  negotiation_id := v_neg_id;
  is_new_customer := v_new_cust;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_marketing_form: dedup por phone_digits + preencher colunas canônicas
-- ---------------------------------------------------------------------------
create or replace function public.submit_marketing_form(
  p_form_id uuid,
  p_data jsonb,
  p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  select f.* into v_form from public.marketing_forms f where f.id = p_form_id;
  if v_form.id is null or v_form.is_active is not true then
    raise exception 'Formulário não encontrado ou inativo';
  end if;
  v_tenant := v_form.tenant_id;

  v_name := nullif(trim(coalesce(p_data->>'name', p_data->>'nome', p_data->>'full_name', '')), '');
  v_email := lower(nullif(trim(coalesce(p_data->>'email', '')), ''));
  v_phone := nullif(trim(coalesce(p_data->>'phone', p_data->>'telefone', p_data->>'celular', p_data->>'whatsapp', '')), '');
  v_phone_norm := public.normalize_customer_phone_digits(v_phone);

  v_funnel := nullif(trim(coalesce(v_form.target_funnel_id, '')), '');
  v_stage := nullif(trim(coalesce(v_form.target_stage_id, '')), '');
  if v_funnel is null or v_stage is null then
    select t.funnel_id, t.stage_id into v_funnel, v_stage
    from public.tenant_default_funnel_stage(v_tenant) t;
  end if;

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
$$;

grant execute on function public.submit_marketing_form(uuid, jsonb, jsonb) to service_role;
