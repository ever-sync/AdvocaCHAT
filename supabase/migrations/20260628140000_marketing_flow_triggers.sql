-- Fase 3 do plano completo: gatilhos e entrada no fluxo.
-- - evaluate_marketing_flow_criteria(): avaliador recursivo do criteria.group.
-- - enroll_marketing_flow_participants(): RPC que casa eventos com fluxos
--   ativos, valida criterios, cria participant + primeiro job + evento
--   flow_entered. Honra allowReentry (dedupe_key NULL = nao dedupa).
-- - DB triggers em crm_negotiations (insert / update of stage_id) e em
--   customers (update of source_columns) que chamam o enroll.
-- - submit_marketing_form() agora dispara enroll com type='form_submitted'.
--
-- Toda chamada de enroll a partir de trigger esta envelopada em begin/exception
-- para nao bloquear o insert/update da tabela original em caso de erro.

-- =====================================================================
-- 1) Avaliador de criterios
-- =====================================================================

-- Pega o valor de um path do tipo "cliente.nome" / "negociacao.titulo" /
-- "contexto.<key>" em um conjunto de jsonbs.
create or replace function public._mfc_field_value(
  p_path text,
  p_customer jsonb,
  p_negotiation jsonb,
  p_context jsonb
) returns jsonb
language plpgsql
immutable
as $$
declare
  v_parts text[];
  v_root jsonb;
  v_rest text[];
  i int;
  v jsonb;
begin
  v_parts := string_to_array(coalesce(p_path, ''), '.');
  if array_length(v_parts, 1) is null then return null; end if;
  case v_parts[1]
    when 'cliente' then v_root := p_customer;
    when 'negociacao' then v_root := p_negotiation;
    when 'contexto' then v_root := p_context;
    else return null;
  end case;
  v := v_root;
  if v is null then return null; end if;
  v_rest := v_parts[2:];
  i := 1;
  while i <= coalesce(array_length(v_rest, 1), 0) loop
    if v is null or jsonb_typeof(v) <> 'object' then return null; end if;
    v := v -> v_rest[i];
    i := i + 1;
  end loop;
  return v;
end;
$$;

-- Aplica um operador sobre lhs (do registro) e rhs (do criterio).
create or replace function public._mfc_apply_operator(
  p_operator text,
  p_lhs jsonb,
  p_rhs jsonb
) returns boolean
language plpgsql
immutable
as $$
declare
  v_lhs_text text;
  v_rhs_text text;
  v_lhs_num numeric;
  v_rhs_num numeric;
begin
  case p_operator
    when 'exists' then
      return p_lhs is not null and jsonb_typeof(p_lhs) <> 'null';
    when 'not_exists' then
      return p_lhs is null or jsonb_typeof(p_lhs) = 'null';
    when 'equals' then
      return p_lhs is not distinct from p_rhs;
    when 'not_equals' then
      return p_lhs is distinct from p_rhs;
    when 'contains' then
      v_lhs_text := coalesce(p_lhs ->> 0, p_lhs #>> '{}');
      v_rhs_text := coalesce(p_rhs ->> 0, p_rhs #>> '{}');
      if v_lhs_text is null or v_rhs_text is null then return false; end if;
      return position(lower(v_rhs_text) in lower(v_lhs_text)) > 0;
    when 'not_contains' then
      v_lhs_text := coalesce(p_lhs ->> 0, p_lhs #>> '{}');
      v_rhs_text := coalesce(p_rhs ->> 0, p_rhs #>> '{}');
      if v_lhs_text is null or v_rhs_text is null then return true; end if;
      return position(lower(v_rhs_text) in lower(v_lhs_text)) = 0;
    when 'greater_than' then
      begin
        v_lhs_num := (p_lhs #>> '{}')::numeric;
        v_rhs_num := (p_rhs #>> '{}')::numeric;
      exception when others then return false; end;
      return v_lhs_num > v_rhs_num;
    when 'less_than' then
      begin
        v_lhs_num := (p_lhs #>> '{}')::numeric;
        v_rhs_num := (p_rhs #>> '{}')::numeric;
      exception when others then return false; end;
      return v_lhs_num < v_rhs_num;
    when 'before' then
      begin
        return (p_lhs #>> '{}')::timestamptz < (p_rhs #>> '{}')::timestamptz;
      exception when others then return false; end;
    when 'after' then
      begin
        return (p_lhs #>> '{}')::timestamptz > (p_rhs #>> '{}')::timestamptz;
      exception when others then return false; end;
    when 'in' then
      if p_rhs is null or jsonb_typeof(p_rhs) <> 'array' then return false; end if;
      return (
        select coalesce(bool_or(p_lhs is not distinct from elem), false)
        from jsonb_array_elements(p_rhs) elem
      );
    when 'not_in' then
      if p_rhs is null or jsonb_typeof(p_rhs) <> 'array' then return true; end if;
      return not (
        select coalesce(bool_or(p_lhs is not distinct from elem), false)
        from jsonb_array_elements(p_rhs) elem
      );
    when 'between' then
      if p_rhs is null or jsonb_typeof(p_rhs) <> 'array' then return false; end if;
      begin
        return (p_lhs #>> '{}')::numeric
          between (p_rhs -> 0 #>> '{}')::numeric and (p_rhs -> 1 #>> '{}')::numeric;
      exception when others then return false; end;
    else
      -- operador desconhecido: nao bloqueia (failsafe to true).
      return true;
  end case;
end;
$$;

-- Avalia recursivamente o `criteria.group`. Returns true se nao houver
-- regras estruturadas (failsafe — todos passam quando sem criterios).
create or replace function public.evaluate_marketing_flow_criteria(
  p_criteria jsonb,
  p_customer jsonb,
  p_negotiation jsonb,
  p_context jsonb
) returns boolean
language plpgsql
immutable
as $$
declare
  v_group jsonb;
  v_combinator text;
  v_conditions jsonb;
  v_cond jsonb;
  v_result boolean;
  v_partial boolean;
begin
  if p_criteria is null then return true; end if;
  v_group := p_criteria -> 'group';
  if v_group is null or jsonb_typeof(v_group) <> 'object' then
    -- formato legado (conditions: string[]) — nao avaliavel; failsafe true.
    return true;
  end if;
  v_combinator := lower(coalesce(v_group ->> 'combinator', 'and'));
  v_conditions := v_group -> 'conditions';
  if v_conditions is null or jsonb_typeof(v_conditions) <> 'array' then
    return true;
  end if;
  v_result := (v_combinator = 'and');
  for v_cond in select value from jsonb_array_elements(v_conditions)
  loop
    if v_cond ? 'combinator' then
      -- subgrupo
      v_partial := public.evaluate_marketing_flow_criteria(
        jsonb_build_object('group', v_cond),
        p_customer, p_negotiation, p_context
      );
    else
      v_partial := public._mfc_apply_operator(
        v_cond ->> 'operator',
        public._mfc_field_value(v_cond ->> 'field', p_customer, p_negotiation, p_context),
        v_cond -> 'value'
      );
    end if;
    if v_combinator = 'and' then
      if not v_partial then return false; end if;
      v_result := true;
    else
      if v_partial then return true; end if;
      v_result := false;
    end if;
  end loop;
  return v_result;
end;
$$;

-- =====================================================================
-- 2) RPC enroll_marketing_flow_participants
--    Casa um evento com fluxos ativos do tenant, avalia criterios, cria
--    participant + primeiro job + evento flow_entered.
--    Retorna a quantidade de participants criados.
-- =====================================================================
create or replace function public.enroll_marketing_flow_participants(
  p_tenant_id uuid,
  p_trigger_type text,
  p_customer_id uuid,
  p_negotiation_id uuid default null,
  p_context jsonb default '{}'::jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow record;
  v_customer jsonb;
  v_negotiation jsonb;
  v_published jsonb;
  v_first_step jsonb;
  v_first_step_id text;
  v_allow_reentry boolean;
  v_dedupe_key text;
  v_participant_id uuid;
  v_count integer := 0;
begin
  if p_tenant_id is null or p_trigger_type is null then
    return 0;
  end if;

  if p_customer_id is not null then
    select to_jsonb(c.*) into v_customer
    from public.customers c
    where c.id = p_customer_id and c.tenant_id = p_tenant_id;
  end if;
  if p_negotiation_id is not null then
    select to_jsonb(n.*) into v_negotiation
    from public.crm_negotiations n
    where n.id = p_negotiation_id and n.tenant_id = p_tenant_id;
  end if;

  for v_flow in
    select id, criteria, published_definition, version
    from public.marketing_flows
    where tenant_id = p_tenant_id
      and status = 'ativo'
      and trigger ->> 'type' = p_trigger_type
      and published_definition is not null
  loop
    v_published := v_flow.published_definition;
    v_first_step := v_published -> 'steps' -> 0;
    if v_first_step is null then
      continue;
    end if;
    v_first_step_id := v_first_step ->> 'id';
    if v_first_step_id is null or length(v_first_step_id) = 0 then
      continue;
    end if;

    -- Avalia criterios estruturados; vazio = todos passam.
    if not public.evaluate_marketing_flow_criteria(
      v_flow.criteria, v_customer, v_negotiation, coalesce(p_context, '{}'::jsonb)
    ) then
      continue;
    end if;

    v_allow_reentry := coalesce(
      (v_published -> 'settings' ->> 'allowReentry')::boolean,
      false
    );
    if v_allow_reentry then
      v_dedupe_key := null;
    elsif p_negotiation_id is not null then
      v_dedupe_key := 'negotiation:' || p_negotiation_id::text;
    elsif p_customer_id is not null then
      v_dedupe_key := 'customer:' || p_customer_id::text;
    else
      v_dedupe_key := null;
    end if;

    -- Insert participant respeitando dedupe (NULL nao colide).
    begin
      insert into public.marketing_flow_participants (
        tenant_id, flow_id, customer_id, negotiation_id,
        status, current_step_id, next_run_at, dedupe_key, context
      ) values (
        p_tenant_id, v_flow.id, p_customer_id, p_negotiation_id,
        'active', v_first_step_id, timezone('utc', now()), v_dedupe_key,
        coalesce(p_context, '{}'::jsonb)
      )
      returning id into v_participant_id;
    exception when unique_violation then
      -- ja esta no fluxo
      continue;
    end;

    -- Primeiro job.
    insert into public.marketing_flow_jobs (
      tenant_id, flow_id, participant_id, step_id,
      status, run_at, attempts, max_attempts, idempotency_key
    ) values (
      p_tenant_id, v_flow.id, v_participant_id, v_first_step_id,
      'queued', timezone('utc', now()), 0, 5,
      v_participant_id::text || ':' || v_first_step_id || ':1'
    )
    on conflict (idempotency_key) do nothing;

    -- Evento flow_entered.
    insert into public.marketing_flow_events (
      tenant_id, flow_id, participant_id, event_type, step_id, metadata
    ) values (
      p_tenant_id, v_flow.id, v_participant_id, 'flow_entered', v_first_step_id,
      jsonb_build_object('trigger_type', p_trigger_type, 'context', coalesce(p_context, '{}'::jsonb))
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enroll_marketing_flow_participants(uuid, text, uuid, uuid, jsonb) from public;
grant execute on function public.enroll_marketing_flow_participants(uuid, text, uuid, uuid, jsonb) to service_role;

-- =====================================================================
-- 3) DB triggers: crm_negotiations
-- =====================================================================
create or replace function public._trg_marketing_flow_neg_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.enroll_marketing_flow_participants(
      new.tenant_id,
      'negotiation_created',
      new.customer_id,
      new.id,
      jsonb_build_object('funnel_id', new.funnel_id, 'stage_id', new.stage_id)
    );
  exception when others then
    raise warning 'marketing_flow enroll (negotiation_created) failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_marketing_flow_neg_inserted on public.crm_negotiations;
create trigger trg_marketing_flow_neg_inserted
after insert on public.crm_negotiations
for each row execute function public._trg_marketing_flow_neg_inserted();

create or replace function public._trg_marketing_flow_neg_stage_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage_id is distinct from old.stage_id then
    begin
      perform public.enroll_marketing_flow_participants(
        new.tenant_id,
        'negotiation_stage_changed',
        new.customer_id,
        new.id,
        jsonb_build_object(
          'funnel_id', new.funnel_id,
          'stage_id', new.stage_id,
          'previous_stage_id', old.stage_id
        )
      );
    exception when others then
      raise warning 'marketing_flow enroll (stage_changed) failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marketing_flow_neg_stage_changed on public.crm_negotiations;
create trigger trg_marketing_flow_neg_stage_changed
after update of stage_id on public.crm_negotiations
for each row execute function public._trg_marketing_flow_neg_stage_changed();

-- =====================================================================
-- 4) DB trigger: customers.source_columns -> tag_added
-- =====================================================================
create or replace function public._trg_marketing_flow_tag_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_tags text;
  v_new_tags text;
begin
  v_old_tags := coalesce(old.source_columns ->> 'wchat_customer_tags', '');
  v_new_tags := coalesce(new.source_columns ->> 'wchat_customer_tags', '');
  if v_new_tags <> v_old_tags then
    begin
      perform public.enroll_marketing_flow_participants(
        new.tenant_id,
        'tag_added',
        new.id,
        null,
        jsonb_build_object('old_tags', v_old_tags, 'new_tags', v_new_tags)
      );
    exception when others then
      raise warning 'marketing_flow enroll (tag_added) failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marketing_flow_tag_changed on public.customers;
create trigger trg_marketing_flow_tag_changed
after update of source_columns on public.customers
for each row execute function public._trg_marketing_flow_tag_changed();

-- =====================================================================
-- 5) Hook em submit_marketing_form para disparar form_submitted
-- =====================================================================
-- Recompila a function com a chamada de enroll no fim, antes do return.
-- A function existente foi criada em 20260621120000_marketing_forms_foundation.sql.
-- Aqui sobrescrevemos preservando 100% do comportamento e adicionando a chamada
-- ao fim, ignorando erros.
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
begin
  select f.* into v_form from public.marketing_forms f where f.id = p_form_id;
  if v_form.id is null or v_form.is_active is not true then
    raise exception 'Formulário não encontrado ou inativo';
  end if;
  v_tenant := v_form.tenant_id;

  v_name := nullif(trim(coalesce(p_data->>'name', p_data->>'nome', p_data->>'full_name', '')), '');
  v_email := lower(nullif(trim(coalesce(p_data->>'email', '')), ''));
  v_phone := nullif(trim(coalesce(p_data->>'phone', p_data->>'telefone', p_data->>'celular', p_data->>'whatsapp', '')), '');
  v_phone_norm := nullif(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), '');

  v_funnel := nullif(trim(coalesce(v_form.target_funnel_id, '')), '');
  v_stage := nullif(trim(coalesce(v_form.target_stage_id, '')), '');
  if v_funnel is null or v_stage is null then
    select t.funnel_id, t.stage_id into v_funnel, v_stage
    from public.tenant_default_funnel_stage(v_tenant) t;
  end if;

  if v_phone_norm is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.tenant_id = v_tenant
      and regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') = v_phone_norm
    order by c.updated_at desc
    limit 1;
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
    insert into public.customers (tenant_id, nome, telefone, email)
    values (
      v_tenant,
      coalesce(v_name, v_email, 'Lead'),
      coalesce(v_phone, ''),
      coalesce(v_email, '')
    )
    returning id into v_customer_id;
  else
    update public.customers c
    set
      nome = case when coalesce(nullif(trim(c.nome), ''), '') = '' then coalesce(v_name, c.nome) else c.nome end,
      telefone = case when coalesce(nullif(trim(c.telefone), ''), '') = '' then coalesce(v_phone, c.telefone) else c.telefone end,
      email = case when coalesce(nullif(trim(c.email), ''), '') = '' then coalesce(v_email, c.email) else c.email end
    where c.id = v_customer_id;
  end if;

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

  update public.marketing_forms
  set total_submissions = total_submissions + 1
  where id = p_form_id;

  -- Fase 3: dispara automacoes com gatilho form_submitted.
  begin
    perform public.enroll_marketing_flow_participants(
      v_tenant,
      'form_submitted',
      v_customer_id,
      v_neg_id,
      jsonb_build_object('form_id', p_form_id, 'form_slug', v_form.slug)
    );
  exception when others then
    raise warning 'marketing_flow enroll (form_submitted) failed: %', sqlerrm;
  end;

  return v_neg_id;
end;
$$;

grant execute on function public.submit_marketing_form(uuid, jsonb, jsonb) to service_role;
