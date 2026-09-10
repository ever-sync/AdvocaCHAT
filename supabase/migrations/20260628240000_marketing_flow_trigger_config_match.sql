-- Fase 6 do plano de automacoes de marketing:
-- - Enriquecer o payload dos gatilhos para suportar filtros do registry.
-- - Avaliar `trigger.config` no banco antes de matricular o lead no fluxo.
-- - Manter o comportamento atual quando o config estiver vazio ou em modo "any".
--
-- O objetivo e fazer o runtime respeitar o que a UI do editor expõe:
-- instanceIds, senderType, messageType, keywords, assigneeIds, formIds,
-- tagIds, pipelineIds, stageIds, ownerIds, minValue, leadMode etc.

-- ---------------------------------------------------------------------
-- Helpers de normalizacao
-- ---------------------------------------------------------------------

create or replace function public._mfc_jsonb_text_array(p_value jsonb)
returns text[]
language plpgsql
immutable
as $$
declare
  v_raw text;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return array[]::text[];
  end if;

  if jsonb_typeof(p_value) = 'array' then
    return coalesce(
      array(
        select lower(trim(value))
        from jsonb_array_elements_text(p_value) as v(value)
        where trim(value) <> ''
      ),
      array[]::text[]
    );
  end if;

  v_raw := nullif(trim(coalesce(p_value #>> '{}', '')), '');
  if v_raw is null then
    return array[]::text[];
  end if;

  if left(v_raw, 1) = '[' then
    begin
      return coalesce(
        array(
          select lower(trim(value))
          from jsonb_array_elements_text(v_raw::jsonb) as v(value)
          where trim(value) <> ''
        ),
        array[]::text[]
      );
    exception when others then
      -- cai para o split simples abaixo
    end;
  end if;

  return coalesce(
    array(
      select lower(trim(part))
      from regexp_split_to_table(v_raw, '\s*,\s*') as part
      where trim(part) <> ''
    ),
    array[]::text[]
  );
end;
$$;

create or replace function public._mfc_array_has_any(
  p_candidates text[],
  p_targets text[]
) returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from unnest(coalesce(p_candidates, array[]::text[])) as c(value)
    where lower(c.value) = any(coalesce(p_targets, array[]::text[]))
  );
$$;

create or replace function public._mfc_array_has_all(
  p_candidates text[],
  p_targets text[]
) returns boolean
language sql
immutable
as $$
  select coalesce(
    (
      select bool_and(lower(t.value) = any(coalesce(p_candidates, array[]::text[])))
      from unnest(coalesce(p_targets, array[]::text[])) as t(value)
    ),
    true
  );
$$;

create or replace function public._mfc_jsonb_scalar_text(p_value jsonb)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(p_value #>> '{}', ''))), '');
$$;

create or replace function public._mfc_jsonb_scalar_numeric(
  p_value jsonb
) returns numeric
language plpgsql
immutable
as $$
begin
  if p_value is null or p_value = 'null'::jsonb then
    return null;
  end if;

  begin
    return nullif(trim(coalesce(p_value #>> '{}', '')), '')::numeric;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function public._mfc_jsonb_scalar_boolean(
  p_value jsonb,
  p_default boolean default false
) returns boolean
language plpgsql
immutable
as $$
declare
  v_raw text;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return p_default;
  end if;

  v_raw := lower(trim(coalesce(p_value #>> '{}', '')));
  if v_raw in ('true', 't', '1', 'sim', 'yes') then
    return true;
  end if;
  if v_raw in ('false', 'f', '0', 'nao', 'não', 'no') then
    return false;
  end if;
  return p_default;
end;
$$;

create or replace function public._mfc_parse_tags(
  p_raw text
) returns text[]
language plpgsql
immutable
as $$
declare
  v_raw text := nullif(trim(coalesce(p_raw, '')), '');
begin
  if v_raw is null then
    return array[]::text[];
  end if;

  if left(v_raw, 1) = '[' then
    begin
      return coalesce(
        array(
          select lower(trim(value))
          from jsonb_array_elements_text(v_raw::jsonb) as v(value)
          where trim(value) <> ''
        ),
        array[]::text[]
      );
    exception when others then
      -- cai para o split simples
    end;
  end if;

  return coalesce(
    array(
      select lower(trim(part))
      from regexp_split_to_table(v_raw, '\s*,\s*') as part
      where trim(part) <> ''
    ),
    array[]::text[]
  );
end;
$$;

create or replace function public._mfc_current_customer_tags(
  p_customer jsonb
) returns text[]
language sql
immutable
as $$
  select public._mfc_parse_tags(coalesce(p_customer -> 'source_columns' ->> 'wchat_customer_tags', ''));
$$;

create or replace function public._mfc_flow_trigger_reason_normalized(
  p_reason text
) returns text
language sql
immutable
as $$
  select case lower(coalesce(trim(p_reason), ''))
    when 'claim' then 'manual'
    when 'manual' then 'manual'
    when 'auto_round_robin' then 'pool'
    when 'auto_round_robin_system' then 'system'
    when 'auto' then 'automation'
    when 'automation' then 'automation'
    when 'system' then 'system'
    else nullif(lower(trim(coalesce(p_reason, ''))), '')
  end;
$$;

create or replace function public._mfc_text_matches_any(
  p_value text,
  p_targets text[]
) returns boolean
language sql
immutable
as $$
  select
    nullif(lower(trim(coalesce(p_value, ''))), '') is not null
    and lower(trim(coalesce(p_value, ''))) = any(coalesce(p_targets, array[]::text[]));
$$;

-- ---------------------------------------------------------------------
-- Avaliador do trigger config
-- ---------------------------------------------------------------------

create or replace function public.marketing_flow_trigger_matches(
  p_trigger jsonb,
  p_trigger_type text,
  p_customer jsonb,
  p_negotiation jsonb,
  p_context jsonb
) returns boolean
language plpgsql
stable
as $$
declare
  v_type text;
  v_config jsonb;
  v_instance_targets text[];
  v_sender_targets text[];
  v_message_type_targets text[];
  v_ai_state_targets text[];
  v_assignment_mode_targets text[];
  v_form_targets text[];
  v_tag_targets text[];
  v_customer_tag_targets text[];
  v_event_name_targets text[];
  v_source_system_targets text[];
  v_pipeline_targets text[];
  v_stage_targets text[];
  v_from_stage_targets text[];
  v_to_stage_targets text[];
  v_owner_targets text[];
  v_lead_mode_targets text[];
  v_keyword_targets text[];
  v_keyword_match_mode text;
  v_body text;
  v_current_tags text[];
  v_neg_value numeric;
  v_chat_ai_mode text;
  v_assignee_id text;
  v_instance_id text;
  v_instance_name text;
  v_direction text;
  v_form_id text;
  v_form_slug text;
  v_form_name text;
  v_field_name text;
  v_field_value text;
  v_chat_id text;
  v_reason text;
  v_paused_by text;
  v_resumed_by text;
  v_current_stage text;
  v_previous_stage text;
  v_current_pipeline text;
  v_neg_id text;
  v_event_name text;
  v_source_system text;
  v_payload_text text;
begin
  v_type := lower(coalesce((p_trigger ->> 'type'), ''));
  if v_type = '' or v_type <> lower(coalesce(p_trigger_type, '')) then
    return false;
  end if;

  if p_trigger is null or jsonb_typeof(p_trigger) <> 'object' then
    return true;
  end if;

  v_config := coalesce(p_trigger -> 'config', '{}'::jsonb);

  v_instance_id := nullif(lower(trim(coalesce(p_context ->> 'instance_id', ''))), '');
  v_instance_name := nullif(lower(trim(coalesce(p_context ->> 'instance_name', ''))), '');
  v_assignee_id := nullif(lower(trim(coalesce(p_context ->> 'assignee_id', ''))), '');
  v_direction := nullif(lower(trim(coalesce(p_context ->> 'direction', ''))), '');
  v_chat_ai_mode := nullif(lower(trim(coalesce(p_context ->> 'chat_ai_mode', p_context ->> 'ai_mode', ''))), '');
  v_body := coalesce(p_context ->> 'body_text', '');
  v_field_name := nullif(lower(trim(coalesce(p_context ->> 'field_name', ''))), '');
  v_field_value := coalesce(p_context ->> 'field_value', '');
  v_form_id := nullif(lower(trim(coalesce(p_context ->> 'form_id', ''))), '');
  v_form_slug := nullif(lower(trim(coalesce(p_context ->> 'form_slug', ''))), '');
  v_form_name := nullif(lower(trim(coalesce(p_context ->> 'form_name', ''))), '');
  v_chat_id := nullif(lower(trim(coalesce(p_context ->> 'chat_id', ''))), '');
  v_reason := nullif(lower(trim(coalesce(p_context ->> 'assignment_mode', p_context ->> 'trigger_reason', ''))), '');
  v_paused_by := nullif(lower(trim(coalesce(p_context ->> 'paused_by', ''))), '');
  v_resumed_by := nullif(lower(trim(coalesce(p_context ->> 'resumed_by', ''))), '');
  v_current_stage := nullif(lower(trim(coalesce(p_negotiation ->> 'stage_id', p_context ->> 'stage_id', ''))), '');
  v_previous_stage := nullif(lower(trim(coalesce(p_context ->> 'previous_stage_id', ''))), '');
  v_current_pipeline := nullif(lower(trim(coalesce(p_negotiation ->> 'funnel_id', p_context ->> 'funnel_id', ''))), '');
  v_neg_id := nullif(lower(trim(coalesce(p_negotiation ->> 'id', p_context ->> 'negotiation_id', ''))), '');
  v_event_name := nullif(lower(trim(coalesce(p_context ->> 'event_name', p_context ->> 'eventName', p_context ->> 'event', ''))), '');
  v_source_system := nullif(lower(trim(coalesce(p_context ->> 'source_system', p_context ->> 'sourceSystem', p_context ->> 'source', ''))), '');
  v_payload_text := lower(coalesce((coalesce(p_context -> 'payload', '{}'::jsonb))::text, ''));

  case v_type
    when 'manual' then
      return true;

    when 'whatsapp_message_received' then
      v_instance_targets := public._mfc_jsonb_text_array(v_config -> 'instanceIds');
      if cardinality(v_instance_targets) > 0 and not public._mfc_array_has_any(array[v_instance_id, v_instance_name], v_instance_targets) then
        return false;
      end if;

      v_sender_targets := public._mfc_jsonb_text_array(v_config -> 'senderType');
      if cardinality(v_sender_targets) > 0 and not ('any' = any(v_sender_targets)) and not public._mfc_array_has_any(
        array[
          case when v_direction = 'inbound' then 'customer'
               when v_direction = 'outbound' then 'agent'
               else coalesce(nullif(lower(trim(coalesce(p_context ->> 'sender_type', ''))), ''), 'customer')
          end
        ],
        v_sender_targets
      ) then
        return false;
      end if;

      v_message_type_targets := public._mfc_jsonb_text_array(v_config -> 'messageType');
      if cardinality(v_message_type_targets) > 0 and not ('any' = any(v_message_type_targets)) and not public._mfc_array_has_any(
        array[nullif(lower(trim(coalesce(p_context ->> 'message_type', ''))), '')],
        v_message_type_targets
      ) then
        return false;
      end if;

      v_ai_state_targets := public._mfc_jsonb_text_array(v_config -> 'aiState');
      if cardinality(v_ai_state_targets) > 0 and not ('any' = any(v_ai_state_targets)) and not public._mfc_array_has_any(
        array[coalesce(v_chat_ai_mode, '')],
        v_ai_state_targets
      ) then
        return false;
      end if;

      if public._mfc_jsonb_scalar_boolean(v_config -> 'onlyUnassigned', false) then
        if nullif(trim(coalesce(p_context ->> 'assignee_id', '')), '') is not null then
          return false;
        end if;
      end if;

      v_keyword_targets := public._mfc_jsonb_text_array(v_config -> 'keywords');
      if cardinality(v_keyword_targets) > 0 then
      v_keyword_match_mode := coalesce(lower(trim(coalesce(v_config ->> 'keywordMatchMode', 'any'))), 'any');
        if v_keyword_match_mode = 'exact' then
          if not public._mfc_array_has_any(array[lower(trim(v_body))], v_keyword_targets) then
            return false;
          end if;
        elsif v_keyword_match_mode = 'all' then
          if not public._mfc_array_has_all(array[lower(trim(v_body))], v_keyword_targets) then
            return false;
          end if;
        else
          if not exists (
            select 1
            from unnest(v_keyword_targets) as kw(value)
            where kw.value <> '' and position(kw.value in lower(v_body)) > 0
          ) then
            return false;
          end if;
        end if;
      end if;

      return true;

    when 'chat_assigned' then
      v_instance_targets := public._mfc_jsonb_text_array(v_config -> 'instanceIds');
      if cardinality(v_instance_targets) > 0 and not public._mfc_array_has_any(array[v_instance_id, v_instance_name], v_instance_targets) then
        return false;
      end if;

      v_owner_targets := public._mfc_jsonb_text_array(v_config -> 'assigneeIds');
      if cardinality(v_owner_targets) > 0 and not public._mfc_array_has_any(array[v_assignee_id], v_owner_targets) then
        return false;
      end if;

      v_assignment_mode_targets := public._mfc_jsonb_text_array(v_config -> 'assignmentMode');
      if cardinality(v_assignment_mode_targets) > 0 and not ('any' = any(v_assignment_mode_targets)) then
        if v_reason is null then
          return false;
        end if;
        if not public._mfc_array_has_any(array[public._mfc_flow_trigger_reason_normalized(v_reason)], v_assignment_mode_targets) then
          return false;
        end if;
      end if;
      return true;

    when 'ai_paused' then
      v_instance_targets := public._mfc_jsonb_text_array(v_config -> 'instanceIds');
      if cardinality(v_instance_targets) > 0 and not public._mfc_array_has_any(array[v_instance_id, v_instance_name], v_instance_targets) then
        return false;
      end if;

      v_paused_by := coalesce(v_paused_by, case when nullif(trim(coalesce(p_context ->> 'assignee_id', '')), '') is not null then 'agent' else 'system' end);
      v_sender_targets := public._mfc_jsonb_text_array(v_config -> 'pausedBy');
      if cardinality(v_sender_targets) > 0 and not ('any' = any(v_sender_targets)) and not public._mfc_array_has_any(
        array[
          v_paused_by,
          case when v_paused_by = 'system' then 'automation' else null end
        ],
        v_sender_targets
      ) then
        return false;
      end if;
      return true;

    when 'ai_resumed' then
      v_instance_targets := public._mfc_jsonb_text_array(v_config -> 'instanceIds');
      if cardinality(v_instance_targets) > 0 and not public._mfc_array_has_any(array[v_instance_id, v_instance_name], v_instance_targets) then
        return false;
      end if;

      v_resumed_by := coalesce(v_resumed_by, case when nullif(trim(coalesce(p_context ->> 'assignee_id', '')), '') is not null then 'agent' else 'system' end);
      v_sender_targets := public._mfc_jsonb_text_array(v_config -> 'resumedBy');
      if cardinality(v_sender_targets) > 0 and not ('any' = any(v_sender_targets)) and not public._mfc_array_has_any(
        array[
          v_resumed_by,
          case when v_resumed_by = 'system' then 'automation' else null end
        ],
        v_sender_targets
      ) then
        return false;
      end if;
      return true;

    when 'form_submitted' then
      v_form_targets := public._mfc_jsonb_text_array(v_config -> 'formIds');
      if cardinality(v_form_targets) > 0 and not public._mfc_array_has_any(array[v_form_id, v_form_slug, v_form_name], v_form_targets) then
        return false;
      end if;

      v_lead_mode_targets := public._mfc_jsonb_text_array(v_config -> 'leadMode');
      if cardinality(v_lead_mode_targets) > 0 and not ('any' = any(v_lead_mode_targets)) and not public._mfc_array_has_any(
        array[nullif(lower(trim(coalesce(p_context ->> 'lead_mode', ''))), '')],
        v_lead_mode_targets
      ) then
        return false;
      end if;

      v_field_name := nullif(lower(trim(coalesce(v_config ->> 'fieldName', ''))), '');
      v_field_value := coalesce(v_config ->> 'fieldValue', '');
      if v_field_name is not null and trim(v_field_value) <> '' then
        if nullif(trim(coalesce(p_context -> 'fields' ->> v_field_name, '')), '') is null then
          return false;
        end if;
        if position(lower(v_field_value) in lower(coalesce(p_context -> 'fields' ->> v_field_name, ''))) = 0 then
          return false;
        end if;
      end if;
      return true;

    when 'tag_added' then
      v_tag_targets := public._mfc_jsonb_text_array(v_config -> 'tagIds');
      v_current_tags := public._mfc_current_customer_tags(p_customer);
      if cardinality(v_tag_targets) > 0 then
        if lower(trim(coalesce(v_config ->> 'tagMatchMode', 'any'))) = 'all' then
          if not public._mfc_array_has_all(v_current_tags, v_tag_targets) then
            return false;
          end if;
        elsif not public._mfc_array_has_any(v_current_tags, v_tag_targets) then
          return false;
        end if;
      end if;

      v_customer_tag_targets := public._mfc_jsonb_text_array(v_config -> 'customerHasTags');
      if cardinality(v_customer_tag_targets) > 0 and not public._mfc_array_has_any(v_current_tags, v_customer_tag_targets) then
        return false;
      end if;

      return true;

    when 'negotiation_created' then
      v_pipeline_targets := public._mfc_jsonb_text_array(v_config -> 'pipelineIds');
      if cardinality(v_pipeline_targets) > 0 and not public._mfc_array_has_any(array[v_current_pipeline], v_pipeline_targets) then
        return false;
      end if;

      v_stage_targets := public._mfc_jsonb_text_array(v_config -> 'stageIds');
      if cardinality(v_stage_targets) > 0 and not public._mfc_array_has_any(array[v_current_stage], v_stage_targets) then
        return false;
      end if;

      v_owner_targets := public._mfc_jsonb_text_array(v_config -> 'ownerIds');
      if cardinality(v_owner_targets) > 0 and not public._mfc_array_has_any(array[nullif(lower(trim(coalesce(p_negotiation ->> 'assignee_id', p_context ->> 'assignee_id', ''))), '')], v_owner_targets) then
        return false;
      end if;

      v_neg_value := coalesce(
        public._mfc_jsonb_scalar_numeric(p_negotiation -> 'total_value'),
        public._mfc_jsonb_scalar_numeric(p_context -> 'total_value'),
        0
      );
      if public._mfc_jsonb_scalar_numeric(v_config -> 'minValue') is not null
        and v_neg_value < public._mfc_jsonb_scalar_numeric(v_config -> 'minValue') then
        return false;
      end if;

      return true;

    when 'negotiation_stage_changed' then
      v_pipeline_targets := public._mfc_jsonb_text_array(v_config -> 'pipelineIds');
      if cardinality(v_pipeline_targets) > 0 and not public._mfc_array_has_any(array[v_current_pipeline], v_pipeline_targets) then
        return false;
      end if;

      v_from_stage_targets := public._mfc_jsonb_text_array(v_config -> 'fromStageIds');
      if cardinality(v_from_stage_targets) > 0 and not public._mfc_array_has_any(array[v_previous_stage], v_from_stage_targets) then
        return false;
      end if;

      v_to_stage_targets := public._mfc_jsonb_text_array(v_config -> 'toStageIds');
      if cardinality(v_to_stage_targets) > 0 and not public._mfc_array_has_any(array[v_current_stage], v_to_stage_targets) then
        return false;
      end if;

      v_owner_targets := public._mfc_jsonb_text_array(v_config -> 'ownerIds');
      if cardinality(v_owner_targets) > 0 and not public._mfc_array_has_any(array[nullif(lower(trim(coalesce(p_negotiation ->> 'assignee_id', p_context ->> 'assignee_id', ''))), '')], v_owner_targets) then
        return false;
      end if;

      if public._mfc_jsonb_scalar_boolean(v_config -> 'onlyWithoutFutureTask', false) then
        if v_neg_id is null then
          return false;
        end if;
        if exists (
          select 1
          from public.crm_tasks t
          where t.negotiation_id = v_neg_id::uuid
            and t.status = 'aberta'
            and t.due_at is not null
            and t.due_at > timezone('utc', now())
        ) then
          return false;
        end if;
      end if;

      return true;

    when 'webhook_received' then
      v_source_system_targets := public._mfc_jsonb_text_array(v_config -> 'sourceSystems');
      if cardinality(v_source_system_targets) > 0 and not public._mfc_array_has_any(array[v_source_system], v_source_system_targets) then
        return false;
      end if;

      v_event_name_targets := public._mfc_jsonb_text_array(v_config -> 'eventNames');
      if cardinality(v_event_name_targets) > 0 and not public._mfc_array_has_any(array[v_event_name], v_event_name_targets) then
        return false;
      end if;

      v_customer_tag_targets := public._mfc_jsonb_text_array(v_config -> 'customerIds');
      if cardinality(v_customer_tag_targets) > 0 and not public._mfc_array_has_any(
        array[
          nullif(lower(trim(coalesce(p_context ->> 'customer_id', p_context ->> 'customerId', p_customer ->> 'id', ''))), '')
        ],
        v_customer_tag_targets
      ) then
        return false;
      end if;

      v_tag_targets := public._mfc_jsonb_text_array(v_config -> 'negotiationIds');
      if cardinality(v_tag_targets) > 0 and not public._mfc_array_has_any(
        array[
          nullif(lower(trim(coalesce(p_context ->> 'negotiation_id', p_context ->> 'negotiationId', p_negotiation ->> 'id', ''))), '')
        ],
        v_tag_targets
      ) then
        return false;
      end if;

      if nullif(trim(coalesce(v_config ->> 'payloadContains', '')), '') is not null then
        if position(lower(trim(v_config ->> 'payloadContains')) in v_payload_text) = 0 then
          return false;
        end if;
      end if;

      return true;

    else
      return true;
  end case;
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger de WhatsApp inbound com contexto enriquecido
-- ---------------------------------------------------------------------

create or replace function public._trg_marketing_flow_whatsapp_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat record;
  v_instance_name text;
begin
  if new.direction is distinct from 'inbound' then
    return new;
  end if;

  select
    wc.tenant_id,
    wc.customer_id,
    wc.primary_negotiation_id,
    wc.assignee_id,
    wc.ai_mode,
    wc.instance_id,
    wc.display_name
  into v_chat
  from public.whatsapp_chats wc
  where wc.id = new.chat_id;

  if v_chat.tenant_id is null then
    return new;
  end if;

  select wi.display_name
    into v_instance_name
  from public.whatsapp_instances wi
  where wi.id = v_chat.instance_id;

  begin
    perform public.enroll_marketing_flow_participants(
      v_chat.tenant_id,
      'whatsapp_message_received',
      v_chat.customer_id,
      v_chat.primary_negotiation_id,
      jsonb_build_object(
        'chat_id', new.chat_id,
        'chat_display_name', v_chat.display_name,
        'message_id', new.id,
        'message_type', new.message_type,
        'direction', new.direction,
        'status', new.status,
        'body_text', coalesce(new.body_text, ''),
        'media_url', new.media_url,
        'assignee_id', v_chat.assignee_id,
        'chat_ai_mode', v_chat.ai_mode,
        'instance_id', v_chat.instance_id,
        'instance_name', coalesce(v_instance_name, ''),
        'customer_tags', '',
        'sender_type', 'customer'
      )
    );
  exception when others then
    raise warning 'marketing_flow enroll (whatsapp_message_received) failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_marketing_flow_whatsapp_inbound on public.whatsapp_messages;
create trigger trg_marketing_flow_whatsapp_inbound
after insert on public.whatsapp_messages
for each row
when (new.direction = 'inbound')
execute function public._trg_marketing_flow_whatsapp_inbound();

-- ---------------------------------------------------------------------
-- Trigger chat_assigned com contexto enriquecido
-- ---------------------------------------------------------------------

create or replace function public._trg_marketing_flow_chat_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
  v_instance_name text;
begin
  select reason
    into v_reason
  from public.chat_transfers ct
  where ct.chat_id = new.id
  order by ct.transferred_at desc
  limit 1;

  select wi.display_name
    into v_instance_name
  from public.whatsapp_instances wi
  where wi.id = new.instance_id;

  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
    begin
      perform public.enroll_marketing_flow_participants(
        new.tenant_id,
        'chat_assigned',
        new.customer_id,
        new.primary_negotiation_id,
        jsonb_build_object(
          'chat_id', new.id,
          'instance_id', new.instance_id,
          'instance_name', coalesce(v_instance_name, ''),
          'assignee_id', new.assignee_id,
          'previous_assignee_id', old.assignee_id,
          'ai_mode', new.ai_mode,
          'status', new.status,
          'assignment_mode', public._mfc_flow_trigger_reason_normalized(v_reason)
        )
      );
    exception when others then
      raise warning 'marketing_flow enroll (chat_assigned) failed: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_marketing_flow_chat_assigned on public.whatsapp_chats;
create trigger trg_marketing_flow_chat_assigned
after update of assignee_id on public.whatsapp_chats
for each row
execute function public._trg_marketing_flow_chat_assigned();

-- ---------------------------------------------------------------------
-- Trigger AI mode com contexto enriquecido
-- ---------------------------------------------------------------------

create or replace function public._trg_marketing_flow_ai_mode_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instance_name text;
  v_paused_by text;
  v_resumed_by text;
begin
  select wi.display_name
    into v_instance_name
  from public.whatsapp_instances wi
  where wi.id = new.instance_id;

  v_paused_by := case when new.assignee_id is not null then 'agent' else 'system' end;
  v_resumed_by := case when new.assignee_id is not null then 'agent' else 'system' end;

  if new.ai_mode is distinct from old.ai_mode then
    if new.ai_mode in ('off', 'handoff') and old.ai_mode not in ('off', 'handoff') then
      begin
        perform public.enroll_marketing_flow_participants(
          new.tenant_id,
          'ai_paused',
          new.customer_id,
          new.primary_negotiation_id,
          jsonb_build_object(
            'chat_id', new.id,
            'instance_id', new.instance_id,
            'instance_name', coalesce(v_instance_name, ''),
            'previous_ai_mode', old.ai_mode,
            'ai_mode', new.ai_mode,
            'assignee_id', new.assignee_id,
            'status', new.status,
            'paused_by', v_paused_by
          )
        );
      exception when others then
        raise warning 'marketing_flow enroll (ai_paused) failed: %', sqlerrm;
      end;
    elsif new.ai_mode in ('qualifying', 'full') and old.ai_mode in ('off', 'handoff') then
      begin
        perform public.enroll_marketing_flow_participants(
          new.tenant_id,
          'ai_resumed',
          new.customer_id,
          new.primary_negotiation_id,
          jsonb_build_object(
            'chat_id', new.id,
            'instance_id', new.instance_id,
            'instance_name', coalesce(v_instance_name, ''),
            'previous_ai_mode', old.ai_mode,
            'ai_mode', new.ai_mode,
            'assignee_id', new.assignee_id,
            'status', new.status,
            'resumed_by', v_resumed_by
          )
        );
      exception when others then
        raise warning 'marketing_flow enroll (ai_resumed) failed: %', sqlerrm;
      end;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_marketing_flow_ai_mode_changed on public.whatsapp_chats;
create trigger trg_marketing_flow_ai_mode_changed
after update of ai_mode on public.whatsapp_chats
for each row
execute function public._trg_marketing_flow_ai_mode_changed();

-- ---------------------------------------------------------------------
-- submit_marketing_form com contexto de filtros
-- ---------------------------------------------------------------------

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
    v_existing_customer := true;
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

-- ---------------------------------------------------------------------
-- Enroll com avaliacao do trigger config
-- ---------------------------------------------------------------------

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
    select id, criteria, published_definition, version, trigger
    from public.marketing_flows
    where tenant_id = p_tenant_id
      and status = 'ativo'
      and trigger ->> 'type' = p_trigger_type
      and published_definition is not null
  loop
    if not public.marketing_flow_trigger_matches(
      v_flow.trigger,
      p_trigger_type,
      v_customer,
      v_negotiation,
      coalesce(p_context, '{}'::jsonb)
    ) then
      continue;
    end if;

    v_published := v_flow.published_definition;
    v_first_step := v_published -> 'steps' -> 0;
    if v_first_step is null then
      continue;
    end if;
    v_first_step_id := v_first_step ->> 'id';
    if v_first_step_id is null or length(v_first_step_id) = 0 then
      continue;
    end if;

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
      continue;
    end;

    insert into public.marketing_flow_jobs (
      tenant_id, flow_id, participant_id, step_id,
      status, run_at, attempts, max_attempts, idempotency_key
    ) values (
      p_tenant_id, v_flow.id, v_participant_id, v_first_step_id,
      'queued', timezone('utc', now()), 0, 5,
      v_participant_id::text || ':' || v_first_step_id || ':1'
    )
    on conflict (idempotency_key) do nothing;

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
