-- Fase 5: inteligência de captura.
--  - Enriquecimento de IP/dispositivo no lead (colunas no sidecar, preenchidas async).
--  - Variantes A/B (marketing_form_variants) + contadores atômicos.
-- Scoring e flag de duplicado chegam via p_meta no submit_marketing_form (sem mudança de schema).

-- =====================================================================
-- 1) Enriquecimento no sidecar (preenchido pela edge function via service_role)
-- =====================================================================
alter table public.crm_negotiation_marketing
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text,
  add column if not exists country_code text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists timezone text,
  add column if not exists isp text,
  add column if not exists org text,
  add column if not exists is_vpn boolean not null default false,
  add column if not exists is_proxy boolean not null default false,
  add column if not exists is_hosting boolean not null default false,
  add column if not exists browser text,
  add column if not exists browser_version text,
  add column if not exists os text,
  add column if not exists device_type text,
  add column if not exists is_mobile boolean not null default false,
  add column if not exists enriched_at timestamptz;

-- =====================================================================
-- 2) Variantes A/B
-- =====================================================================
create table if not exists public.marketing_form_variants (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.marketing_forms(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  fields jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  weight integer not null default 50 check (weight >= 0 and weight <= 100),
  total_views integer not null default 0,
  total_submissions integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists marketing_form_variants_form_idx on public.marketing_form_variants (form_id);
create index if not exists marketing_form_variants_tenant_idx on public.marketing_form_variants (tenant_id);

drop trigger if exists marketing_form_variants_set_updated_at on public.marketing_form_variants;
create trigger marketing_form_variants_set_updated_at
before update on public.marketing_form_variants
for each row execute function public.set_updated_at();

-- Contadores atômicos (edge function pública via service_role)
create or replace function public.increment_marketing_variant_views(p_variant_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.marketing_form_variants set total_views = total_views + 1 where id = p_variant_id;
$$;

create or replace function public.increment_marketing_variant_submissions(p_variant_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.marketing_form_variants set total_submissions = total_submissions + 1 where id = p_variant_id;
$$;

grant execute on function public.increment_marketing_variant_views(uuid) to service_role;
grant execute on function public.increment_marketing_variant_submissions(uuid) to service_role;

-- =====================================================================
-- 3) RLS — marketing_form_variants
-- =====================================================================
alter table public.marketing_form_variants enable row level security;

drop policy if exists "marketing_form_variants_select" on public.marketing_form_variants;
create policy "marketing_form_variants_select"
on public.marketing_form_variants for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'view')
);

drop policy if exists "marketing_form_variants_insert" on public.marketing_form_variants;
create policy "marketing_form_variants_insert"
on public.marketing_form_variants for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
);

drop policy if exists "marketing_form_variants_update" on public.marketing_form_variants;
create policy "marketing_form_variants_update"
on public.marketing_form_variants for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'edit')
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "marketing_form_variants_delete" on public.marketing_form_variants;
create policy "marketing_form_variants_delete"
on public.marketing_form_variants for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'marketing', 'delete')
);
