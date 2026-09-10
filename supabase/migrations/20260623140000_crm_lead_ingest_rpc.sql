-- RPC pública para ingestão de leads externos (n8n, webhooks, integrações).
-- Lógica: dedup por telefone → email, completa campos vazios, reaproveita
-- negociação ativa ou cria uma nova no funil/etapa indicados (padrão do tenant).
--
-- Protegida por security definer; chamada exclusivamente pelo service_role
-- (Edge Function crm-lead-ingest) — nunca exposta a usuários autenticados.

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
  v_phone_norm  text   := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_funnel      text;
  v_stage       text;
  v_customer_id uuid;
  v_neg_id      uuid;
  v_new_cust    boolean := false;
  v_title       text;
begin
  -- Valida tenant
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'Tenant não encontrado';
  end if;

  -- Funil/etapa: usa o informado ou vai buscar o padrão do tenant
  v_funnel := nullif(trim(coalesce(p_funnel_id, '')), '');
  v_stage  := nullif(trim(coalesce(p_stage_id, '')), '');

  if v_funnel is null or v_stage is null then
    select t.funnel_id, t.stage_id
    into   v_funnel, v_stage
    from   public.tenant_default_funnel_stage(p_tenant_id) t;
  end if;

  -- Dedup customer: telefone (8 últimos dígitos) → email
  if v_phone_norm is not null then
    select c.id into v_customer_id
    from   public.customers c
    where  c.tenant_id = p_tenant_id
      and  regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')
           like '%' || right(v_phone_norm, 8)
    order by c.updated_at desc
    limit 1;
  end if;

  if v_customer_id is null and v_email is not null then
    select c.id into v_customer_id
    from   public.customers c
    where  c.tenant_id = p_tenant_id
      and  lower(nullif(trim(c.email), '')) = v_email
    order by c.updated_at desc
    limit 1;
  end if;

  -- Cria ou atualiza customer
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

  -- Título da negociação
  v_title := coalesce(
    nullif(trim(coalesce(p_title, '')), ''),
    case when p_fonte is not null
         then coalesce(v_nome, 'Lead') || ' — ' || p_fonte
         else coalesce(v_nome, v_email, v_phone, 'Lead externo')
    end
  );

  -- Reaproveita negociação ativa, senão cria nova
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

-- Apenas service_role pode chamar (Edge Functions com admin client)
revoke all on function public.upsert_crm_lead(uuid,text,text,text,text,text,text,text,jsonb) from public, authenticated;
grant execute on function public.upsert_crm_lead(uuid,text,text,text,text,text,text,text,jsonb) to service_role;
