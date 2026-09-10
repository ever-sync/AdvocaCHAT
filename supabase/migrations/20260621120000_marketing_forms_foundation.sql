-- Marketing Forms — Fundação (Fase 1 da migração do app TrackingForm para o WChat).
-- Escopo: Marketing → Converter → Formulários.
--  - marketing_forms: definição dos formulários (campos/tema/config em jsonb), por tenant.
--  - crm_negotiation_marketing: metadados de marketing 1:1 com a negociação do CRM
--    (score, UTM, atribuição, respostas do form) — substrato das fases de e-mail/ads/analytics.
--  - submit_marketing_form(): ponte pública — casa/cria customer + abre crm_negotiations.
-- RLS: is_same_tenant() + has_role_permission(tenant,'marketing',...). admin/operacao têm
--      acesso total por default_role_permission; financeiro/atendimento não têm marketing.

-- =====================================================================
-- 1) Formulários
-- =====================================================================
create table if not exists public.marketing_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text,
  description text,
  fields jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  allowed_domains text[] not null default '{}',
  is_active boolean not null default true,
  -- destino do lead no CRM (null => funil/etapa padrão do tenant)
  target_funnel_id text,
  target_stage_id text,
  email_template_id uuid, -- FK adicionada na fase de e-mail
  submit_redirect_url text,
  submit_message text not null default 'Obrigado! Recebemos suas informações.',
  total_views integer not null default 0,
  total_submissions integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, slug)
);

create index if not exists marketing_forms_tenant_idx on public.marketing_forms (tenant_id);
create index if not exists marketing_forms_active_idx on public.marketing_forms (tenant_id, is_active);

drop trigger if exists marketing_forms_set_updated_at on public.marketing_forms;
create trigger marketing_forms_set_updated_at
before update on public.marketing_forms
for each row execute function public.set_updated_at();

-- =====================================================================
-- 2) Metadados de marketing por negociação (1:1)
-- =====================================================================
create table if not exists public.crm_negotiation_marketing (
  negotiation_id uuid primary key references public.crm_negotiations(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  form_id uuid references public.marketing_forms(id) on delete set null,
  variant_id uuid,
  answers jsonb not null default '{}'::jsonb,
  score integer not null default 0,
  score_factors jsonb not null default '[]'::jsonb,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  referrer text,
  attribution jsonb not null default '{}'::jsonb,
  ip_address text,
  fingerprint text,
  user_agent text,
  time_to_complete_seconds integer,
  is_duplicate boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists crm_negotiation_marketing_tenant_idx on public.crm_negotiation_marketing (tenant_id);
create index if not exists crm_negotiation_marketing_form_idx on public.crm_negotiation_marketing (form_id);

drop trigger if exists crm_negotiation_marketing_set_updated_at on public.crm_negotiation_marketing;
create trigger crm_negotiation_marketing_set_updated_at
before update on public.crm_negotiation_marketing
for each row execute function public.set_updated_at();

-- Índice funcional p/ casar customer por telefone normalizado (só dígitos)
create index if not exists customers_tenant_phone_digits_idx
  on public.customers (tenant_id, (regexp_replace(coalesce(telefone, ''), '\D', '', 'g')));

create index if not exists customers_tenant_email_lower_idx
  on public.customers (tenant_id, (lower(nullif(email, ''))));

-- =====================================================================
-- 3) Ponte de submissão: casa/cria customer + abre crm_negotiations
--    Chamada pela edge function pública (service_role).
-- =====================================================================
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

  -- identidade do lead a partir das respostas
  v_name := nullif(trim(coalesce(p_data->>'name', p_data->>'nome', p_data->>'full_name', '')), '');
  v_email := lower(nullif(trim(coalesce(p_data->>'email', '')), ''));
  v_phone := nullif(trim(coalesce(p_data->>'phone', p_data->>'telefone', p_data->>'celular', p_data->>'whatsapp', '')), '');
  v_phone_norm := nullif(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), '');

  -- destino: funil/etapa do form ou padrão do tenant
  v_funnel := nullif(trim(coalesce(v_form.target_funnel_id, '')), '');
  v_stage := nullif(trim(coalesce(v_form.target_stage_id, '')), '');
  if v_funnel is null or v_stage is null then
    select t.funnel_id, t.stage_id into v_funnel, v_stage
    from public.tenant_default_funnel_stage(v_tenant) t;
  end if;

  -- casa customer existente: telefone (normalizado), senão email
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
    -- completa apenas campos em branco do customer existente (sem sobrescrever)
    update public.customers c
    set
      nome = case when coalesce(nullif(trim(c.nome), ''), '') = '' then coalesce(v_name, c.nome) else c.nome end,
      telefone = case when coalesce(nullif(trim(c.telefone), ''), '') = '' then coalesce(v_phone, c.telefone) else c.telefone end,
      email = case when coalesce(nullif(trim(c.email), ''), '') = '' then coalesce(v_email, c.email) else c.email end
    where c.id = v_customer_id;
  end if;

  v_title := coalesce(v_name, v_email, v_phone, 'Lead de formulário');

  -- reaproveita negociação ativa do customer, senão cria nova
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

  -- metadados de marketing (1:1 com a negociação)
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

  return v_neg_id;
end;
$$;

grant execute on function public.submit_marketing_form(uuid, jsonb, jsonb) to service_role;

-- Incremento atômico de views (chamado pelo widget público via service_role)
create or replace function public.increment_marketing_form_views(p_form_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.marketing_forms set total_views = total_views + 1 where id = p_form_id;
$$;

grant execute on function public.increment_marketing_form_views(uuid) to service_role;

-- =====================================================================
-- 4) RLS — marketing_forms
-- =====================================================================
alter table public.marketing_forms enable row level security;

drop policy if exists "marketing_forms_select" on public.marketing_forms;
create policy "marketing_forms_select"
on public.marketing_forms for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'view')
);

drop policy if exists "marketing_forms_insert" on public.marketing_forms;
create policy "marketing_forms_insert"
on public.marketing_forms for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
);

drop policy if exists "marketing_forms_update" on public.marketing_forms;
create policy "marketing_forms_update"
on public.marketing_forms for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "marketing_forms_delete" on public.marketing_forms;
create policy "marketing_forms_delete"
on public.marketing_forms for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'delete')
);

-- =====================================================================
-- 5) RLS — crm_negotiation_marketing (leitura também p/ quem vê CRM)
-- =====================================================================
alter table public.crm_negotiation_marketing enable row level security;

drop policy if exists "crm_negotiation_marketing_select" on public.crm_negotiation_marketing;
create policy "crm_negotiation_marketing_select"
on public.crm_negotiation_marketing for select
using (
  public.is_same_tenant(tenant_id)
  and (
    public.has_role_permission(tenant_id, 'marketing', 'view')
    or public.has_role_permission(tenant_id, 'crm', 'view')
  )
);

drop policy if exists "crm_negotiation_marketing_insert" on public.crm_negotiation_marketing;
create policy "crm_negotiation_marketing_insert"
on public.crm_negotiation_marketing for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
);

drop policy if exists "crm_negotiation_marketing_update" on public.crm_negotiation_marketing;
create policy "crm_negotiation_marketing_update"
on public.crm_negotiation_marketing for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiation_marketing_delete" on public.crm_negotiation_marketing;
create policy "crm_negotiation_marketing_delete"
on public.crm_negotiation_marketing for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'delete')
);

-- =====================================================================
-- 6) Storage: bucket público p/ assets dos formulários (logos/imagens)
--    Path: `{tenant_id}/{uuid}_{arquivo}`
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing-forms', 'marketing-forms', true, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "marketing_forms_storage_read" on storage.objects;
create policy "marketing_forms_storage_read"
on storage.objects for select
using (bucket_id = 'marketing-forms');

drop policy if exists "marketing_forms_storage_insert" on storage.objects;
create policy "marketing_forms_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'marketing-forms'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
);

drop policy if exists "marketing_forms_storage_update" on storage.objects;
create policy "marketing_forms_storage_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'marketing-forms'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
)
with check (
  bucket_id = 'marketing-forms'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
);

drop policy if exists "marketing_forms_storage_delete" on storage.objects;
create policy "marketing_forms_storage_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'marketing-forms'
  and split_part(name, '/', 1) = (
    select tenant_id::text from public.profiles where id = auth.uid()
  )
);
