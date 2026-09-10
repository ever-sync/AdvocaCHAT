-- Resolve etapa de venda configurada por funil (JSON `isSaleStage`); fallback slug `venda`.

create or replace function public.crm_funnel_sale_stage_id(
  p_tenant_id uuid,
  p_funnel_id text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_funnels jsonb;
  v_funnel jsonb;
  v_stage jsonb;
  v_id text;
begin
  if p_tenant_id is null or p_funnel_id is null or btrim(p_funnel_id) = '' then
    return null;
  end if;

  select t.funnels into v_funnels
  from public.tenant_crm_funnel_config t
  where t.tenant_id = p_tenant_id;

  if v_funnels is null or jsonb_typeof(v_funnels) <> 'array' then
    return null;
  end if;

  for v_funnel in select value from jsonb_array_elements(v_funnels) as t(value)
  loop
    if v_funnel->>'id' = p_funnel_id then
      for v_stage in select value from jsonb_array_elements(coalesce(v_funnel->'stages', '[]'::jsonb)) as st(value)
      loop
        if (v_stage @> '{"isSaleStage": true}'::jsonb)
           or lower(trim(both from coalesce(v_stage->>'isSaleStage', ''))) in ('true', '1', 't', 'yes')
        then
          v_id := nullif(btrim(coalesce(v_stage->>'id', '')), '');
          if v_id is not null then
            return v_id;
          end if;
        end if;
      end loop;
      return null;
    end if;
  end loop;

  return null;
end;
$$;

grant execute on function public.crm_funnel_sale_stage_id(uuid, text) to authenticated, service_role;

create or replace function public.mark_negotiation_sold_from_chat(p_chat_id uuid, p_total numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg_id uuid;
  v_tenant uuid;
  v_funnel_id text;
  v_sale_stage text;
begin
  select tenant_id, primary_negotiation_id into v_tenant, v_neg_id
  from public.whatsapp_chats where id = p_chat_id;

  if v_neg_id is null and v_tenant is not null then
    v_neg_id := public.ensure_lead_from_chat(p_chat_id, false);
  end if;

  if v_neg_id is null then
    return;
  end if;

  select funnel_id into v_funnel_id
  from public.crm_negotiations
  where id = v_neg_id;

  v_sale_stage := public.crm_funnel_sale_stage_id(v_tenant, v_funnel_id);
  if v_sale_stage is null or v_sale_stage = '' then
    v_sale_stage := 'venda';
  end if;

  update public.crm_negotiations
  set
    status = 'vendido',
    stage_id = v_sale_stage,
    total_value = coalesce(p_total, total_value),
    last_interaction_at = timezone('utc', now())
  where id = v_neg_id;

  update public.whatsapp_chats
  set resolution = 'resolved', status = 'closed'
  where id = p_chat_id;
end;
$$;
