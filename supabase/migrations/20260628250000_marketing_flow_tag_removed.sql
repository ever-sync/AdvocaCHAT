-- Fase extra: gatilho de remoção de etiqueta.
-- Mantem compatibilidade com o evaluator atual e adiciona:
-- - trigger type tag_removed
-- - diff de tags no trigger de customers.source_columns
-- - wrapper para tag_added/tag_removed sem precisar reescrever a logica
--   inteira do evaluator original.

do $$
begin
  if to_regprocedure('public.marketing_flow_trigger_matches(jsonb,text,jsonb,jsonb,jsonb)') is not null
     and to_regprocedure('public.marketing_flow_trigger_matches_base(jsonb,text,jsonb,jsonb,jsonb)') is null then
    execute 'alter function public.marketing_flow_trigger_matches(jsonb,text,jsonb,jsonb,jsonb) rename to marketing_flow_trigger_matches_base';
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
  v_tag_targets text[];
  v_customer_tag_targets text[];
  v_current_tags text[];
  v_old_tags text[];
  v_added_tags text[];
  v_removed_tags text[];
  v_active_tags text[];
begin
  if v_type not in ('tag_added', 'tag_removed') then
    if to_regprocedure('public.marketing_flow_trigger_matches_base(jsonb,text,jsonb,jsonb,jsonb)') is null then
      return false;
    end if;
    return coalesce(
      public.marketing_flow_trigger_matches_base(
        p_trigger, p_trigger_type, p_customer, p_negotiation, p_context
      ),
      false
    );
  end if;

  v_current_tags := public._mfc_current_customer_tags(p_customer);
  v_old_tags := public._mfc_jsonb_text_array(p_context -> 'old_tags');
  v_added_tags := public._mfc_jsonb_text_array(p_context -> 'added_tags');
  v_removed_tags := public._mfc_jsonb_text_array(p_context -> 'removed_tags');

  if v_type = 'tag_added' then
    v_active_tags := case when cardinality(v_added_tags) > 0 then v_added_tags else v_current_tags end;
    v_tag_targets := public._mfc_jsonb_text_array(v_config -> 'tagIds');
    if cardinality(v_tag_targets) > 0 then
      if lower(trim(coalesce(v_config ->> 'tagMatchMode', 'any'))) = 'all' then
        if not public._mfc_array_has_all(v_active_tags, v_tag_targets) then
          return false;
        end if;
      elsif not public._mfc_array_has_any(v_active_tags, v_tag_targets) then
        return false;
      end if;
    end if;

    v_customer_tag_targets := public._mfc_jsonb_text_array(v_config -> 'customerHasTags');
    if cardinality(v_customer_tag_targets) > 0 and not public._mfc_array_has_any(v_current_tags, v_customer_tag_targets) then
      return false;
    end if;

    return true;
  end if;

  v_active_tags := case when cardinality(v_removed_tags) > 0 then v_removed_tags else v_old_tags end;
  v_tag_targets := public._mfc_jsonb_text_array(v_config -> 'tagIds');
  if cardinality(v_tag_targets) > 0 then
    if lower(trim(coalesce(v_config ->> 'tagMatchMode', 'any'))) = 'all' then
      if not public._mfc_array_has_all(v_active_tags, v_tag_targets) then
        return false;
      end if;
    elsif not public._mfc_array_has_any(v_active_tags, v_tag_targets) then
      return false;
    end if;
  end if;

  v_customer_tag_targets := public._mfc_jsonb_text_array(v_config -> 'customerHadTags');
  if cardinality(v_customer_tag_targets) > 0 and not public._mfc_array_has_any(v_old_tags, v_customer_tag_targets) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public._trg_marketing_flow_tag_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_tags text[];
  v_new_tags text[];
  v_added_tags text[];
  v_removed_tags text[];
begin
  v_old_tags := public._mfc_parse_tags(coalesce(old.source_columns ->> 'wchat_customer_tags', ''));
  v_new_tags := public._mfc_parse_tags(coalesce(new.source_columns ->> 'wchat_customer_tags', ''));

  if v_new_tags is distinct from v_old_tags then
    v_added_tags := coalesce(
      array(
        select unnest(v_new_tags)
        except
        select unnest(v_old_tags)
      ),
      array[]::text[]
    );
    v_removed_tags := coalesce(
      array(
        select unnest(v_old_tags)
        except
        select unnest(v_new_tags)
      ),
      array[]::text[]
    );

    if cardinality(v_added_tags) > 0 then
      begin
        perform public.enroll_marketing_flow_participants(
          new.tenant_id,
          'tag_added',
          new.id,
          null,
          jsonb_build_object(
            'old_tags', v_old_tags,
            'new_tags', v_new_tags,
            'added_tags', v_added_tags,
            'removed_tags', v_removed_tags
          )
        );
      exception when others then
        raise warning 'marketing_flow enroll (tag_added) failed: %', sqlerrm;
      end;
    end if;

    if cardinality(v_removed_tags) > 0 then
      begin
        perform public.enroll_marketing_flow_participants(
          new.tenant_id,
          'tag_removed',
          new.id,
          null,
          jsonb_build_object(
            'old_tags', v_old_tags,
            'new_tags', v_new_tags,
            'added_tags', v_added_tags,
            'removed_tags', v_removed_tags
          )
        );
      exception when others then
        raise warning 'marketing_flow enroll (tag_removed) failed: %', sqlerrm;
      end;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_marketing_flow_tag_changed on public.customers;
create trigger trg_marketing_flow_tag_changed
after update of source_columns on public.customers
for each row execute function public._trg_marketing_flow_tag_changed();
