-- Filtros rápidos do gatilho "Formulário enviado" com OPERADOR + E/OU.
--
-- Antes: o matcher so suportava um unico par fieldName/fieldValue com "contem".
-- Agora: uma lista `fieldConditions` = [{ field, operator, value }] avaliada com
-- `fieldMatchMode` = 'all' (E, todas) | 'any' (OU, qualquer). Operadores:
--   - equals : campo igual ao valor (case-insensitive)
--   - contains: campo contem o valor (substring)
--   - exists : campo preenchido (qualquer valor nao-vazio)
--
-- Seguranca: segue o padrao de wrapper ja usado no projeto (rename -> _base +
-- nova funcao que delega). A logica nova SO restringe quando ha fieldConditions
-- e SO para form_submitted — fluxos existentes passam pela base sem alteracao.

do $$
begin
  if to_regprocedure('public.marketing_flow_trigger_matches(jsonb,text,jsonb,jsonb,jsonb)') is not null
     and to_regprocedure('public.marketing_flow_trigger_matches_formcond_base(jsonb,text,jsonb,jsonb,jsonb)') is null then
    execute 'alter function public.marketing_flow_trigger_matches(jsonb,text,jsonb,jsonb,jsonb) rename to marketing_flow_trigger_matches_formcond_base';
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
  v_conds jsonb;
  v_mode text;
  v_cond jsonb;
  v_field text;
  v_op text;
  v_val text;
  v_actual text;
  v_ok boolean;
  v_all boolean;
  v_any boolean;
begin
  -- 1) Delega TODAS as checagens existentes para a base (cadeia de wrappers).
  if to_regprocedure('public.marketing_flow_trigger_matches_formcond_base(jsonb,text,jsonb,jsonb,jsonb)') is null then
    return false;
  end if;
  if not coalesce(
    public.marketing_flow_trigger_matches_formcond_base(
      p_trigger, p_trigger_type, p_customer, p_negotiation, p_context
    ),
    false
  ) then
    return false;
  end if;

  -- 2) Extra: condicoes de campo (E/OU) — apenas para form_submitted.
  if v_type = 'form_submitted' then
    v_conds := v_config -> 'fieldConditions';
    if jsonb_typeof(v_conds) = 'array' and jsonb_array_length(v_conds) > 0 then
      v_mode := lower(trim(coalesce(v_config ->> 'fieldMatchMode', 'all')));
      v_all := true;
      v_any := false;
      for v_cond in select value from jsonb_array_elements(v_conds) loop
        v_field := nullif(lower(trim(coalesce(v_cond ->> 'field', ''))), '');
        v_op := lower(trim(coalesce(v_cond ->> 'operator', 'contains')));
        v_val := coalesce(v_cond ->> 'value', '');
        v_actual := coalesce(p_context -> 'fields' ->> v_field, '');
        v_ok := false;
        if v_field is not null then
          if v_op = 'exists' then
            v_ok := trim(v_actual) <> '';
          elsif v_op = 'equals' then
            v_ok := lower(trim(v_actual)) = lower(trim(v_val));
          else
            -- contains (padrao); valor vazio nao restringe
            v_ok := trim(v_val) = '' or position(lower(v_val) in lower(v_actual)) > 0;
          end if;
        end if;
        if v_ok then
          v_any := true;
        else
          v_all := false;
        end if;
      end loop;

      if v_mode = 'any' then
        if not v_any then
          return false;
        end if;
      else
        if not v_all then
          return false;
        end if;
      end if;
    end if;
  end if;

  return true;
end;
$$;
