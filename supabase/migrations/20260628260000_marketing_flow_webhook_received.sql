-- Fase extra: entrada externa para automacoes de marketing.
-- Um evento autenticado por API key pode matricular participantes no fluxo
-- com trigger_type = webhook_received, abrindo o WChat para integracoes
-- externas no estilo n8n/Make/ERP.

do $$
begin
  if to_regprocedure('public.marketing_flow_trigger_matches(jsonb,text,jsonb,jsonb,jsonb)') is not null
     and to_regprocedure('public.marketing_flow_trigger_matches_webhook_base(jsonb,text,jsonb,jsonb,jsonb)') is null then
    execute 'alter function public.marketing_flow_trigger_matches(jsonb,text,jsonb,jsonb,jsonb) rename to marketing_flow_trigger_matches_webhook_base';
  end if;
end
$$;

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
  v_type text := lower(coalesce(p_trigger_type, ''));
  v_config jsonb := coalesce(p_trigger -> 'config', '{}'::jsonb);
  v_event_name text := nullif(lower(trim(coalesce(p_context ->> 'event_name', p_context ->> 'eventName', p_context ->> 'event', ''))), '');
  v_source_system text := nullif(lower(trim(coalesce(p_context ->> 'source_system', p_context ->> 'sourceSystem', p_context ->> 'source', ''))), '');
  v_payload_text text := lower(coalesce((coalesce(p_context -> 'payload', '{}'::jsonb))::text, ''));
  v_event_name_targets text[];
  v_source_system_targets text[];
  v_customer_targets text[];
  v_negotiation_targets text[];
begin
  if v_type <> 'webhook_received' then
    if to_regprocedure('public.marketing_flow_trigger_matches_webhook_base(jsonb,text,jsonb,jsonb,jsonb)') is null then
      return false;
    end if;
    return coalesce(
      public.marketing_flow_trigger_matches_webhook_base(
        p_trigger, p_trigger_type, p_customer, p_negotiation, p_context
      ),
      false
    );
  end if;

  v_source_system_targets := public._mfc_jsonb_text_array(v_config -> 'sourceSystems');
  if cardinality(v_source_system_targets) > 0 and not public._mfc_array_has_any(array[v_source_system], v_source_system_targets) then
    return false;
  end if;

  v_event_name_targets := public._mfc_jsonb_text_array(v_config -> 'eventNames');
  if cardinality(v_event_name_targets) > 0 and not public._mfc_array_has_any(array[v_event_name], v_event_name_targets) then
    return false;
  end if;

  v_customer_targets := public._mfc_jsonb_text_array(v_config -> 'customerIds');
  if cardinality(v_customer_targets) > 0 and not public._mfc_array_has_any(
    array[
      nullif(lower(trim(coalesce(p_context ->> 'customer_id', p_context ->> 'customerId', p_customer ->> 'id', ''))), '')
    ],
    v_customer_targets
  ) then
    return false;
  end if;

  v_negotiation_targets := public._mfc_jsonb_text_array(v_config -> 'negotiationIds');
  if cardinality(v_negotiation_targets) > 0 and not public._mfc_array_has_any(
    array[
      nullif(lower(trim(coalesce(p_context ->> 'negotiation_id', p_context ->> 'negotiationId', p_negotiation ->> 'id', ''))), '')
    ],
    v_negotiation_targets
  ) then
    return false;
  end if;

  if nullif(trim(coalesce(v_config ->> 'payloadContains', '')), '') is not null then
    if position(lower(trim(v_config ->> 'payloadContains')) in v_payload_text) = 0 then
      return false;
    end if;
  end if;

  return true;
end;
$$;
