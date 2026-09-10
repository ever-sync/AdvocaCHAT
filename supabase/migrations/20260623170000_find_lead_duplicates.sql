-- Deduplicação de leads: dado telefone/email/CPF, retorna customers do mesmo
-- tenant que casam + as negociações abertas vinculadas. Usado pelo dialog de
-- "Criar negociação" pra avisar o usuário antes de duplicar contato/negócio.
--
-- Critérios:
--   - phone: comparado por `phone_digits` (já normalizado). Mínimo 8 dígitos
--     pra evitar falso-positivo em telefones residenciais sem DDD.
--   - email: lower(trim()) exato.
--   - cpf: comparado sem máscara (regex remove tudo que não for dígito).
-- Status "aberto" = em_andamento / pausado / nao_pausado (mesma definição do
-- forecast e do report de parados).

create or replace function public.find_lead_duplicates(
  p_phone_digits text,
  p_email text,
  p_cpf text,
  p_exclude_customer_id uuid default null
)
returns table(
  customer_id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_cpf text,
  match_reason text,
  open_negotiation_id uuid,
  open_negotiation_title text,
  open_negotiation_status text,
  open_negotiation_funnel_id text,
  open_negotiation_stage_id text,
  open_negotiation_total_value numeric,
  open_assignee_id uuid,
  open_assignee_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with phone_match as (
    select c.id, c.nome, c.telefone, c.email, c.cpf, 'phone'::text as match_reason
    from public.customers c
    where c.tenant_id = public.current_tenant_id()
      and (p_exclude_customer_id is null or c.id <> p_exclude_customer_id)
      and p_phone_digits is not null
      and length(regexp_replace(p_phone_digits, '\D', '', 'g')) >= 8
      and c.phone_digits = regexp_replace(p_phone_digits, '\D', '', 'g')
  ),
  email_match as (
    select c.id, c.nome, c.telefone, c.email, c.cpf, 'email'::text as match_reason
    from public.customers c
    where c.tenant_id = public.current_tenant_id()
      and (p_exclude_customer_id is null or c.id <> p_exclude_customer_id)
      and p_email is not null
      and length(trim(p_email)) > 0
      and lower(c.email) = lower(trim(p_email))
  ),
  cpf_match as (
    select c.id, c.nome, c.telefone, c.email, c.cpf, 'cpf'::text as match_reason
    from public.customers c
    where c.tenant_id = public.current_tenant_id()
      and (p_exclude_customer_id is null or c.id <> p_exclude_customer_id)
      and p_cpf is not null
      and regexp_replace(p_cpf, '\D', '', 'g') <> ''
      and length(regexp_replace(p_cpf, '\D', '', 'g')) >= 11
      and regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g')
            = regexp_replace(p_cpf, '\D', '', 'g')
  ),
  matches as (
    -- Dedup por customer_id mantendo o reason "mais específico" (cpf > email > phone).
    select distinct on (id)
      m.id, m.nome, m.telefone, m.email, m.cpf, m.match_reason
    from (
      select * from cpf_match
      union all select * from email_match
      union all select * from phone_match
    ) m
    order by m.id, case m.match_reason
      when 'cpf' then 1
      when 'email' then 2
      when 'phone' then 3
      else 4
    end
  )
  select
    m.id as customer_id,
    m.nome as customer_name,
    m.telefone as customer_phone,
    m.email as customer_email,
    m.cpf as customer_cpf,
    m.match_reason,
    n.id as open_negotiation_id,
    n.title as open_negotiation_title,
    n.status::text as open_negotiation_status,
    n.funnel_id as open_negotiation_funnel_id,
    n.stage_id as open_negotiation_stage_id,
    n.total_value as open_negotiation_total_value,
    n.assignee_id as open_assignee_id,
    p.nome as open_assignee_name
  from matches m
  left join public.crm_negotiations n
    on n.customer_id = m.id
    and n.tenant_id = public.current_tenant_id()
    and n.status in ('em_andamento', 'pausado', 'nao_pausado')
  left join public.profiles p on p.id = n.assignee_id
  order by
    case m.match_reason
      when 'cpf' then 1
      when 'email' then 2
      when 'phone' then 3
      else 4
    end,
    m.nome,
    n.created_at desc nulls last;
$$;

grant execute on function public.find_lead_duplicates(text, text, text, uuid) to authenticated;
