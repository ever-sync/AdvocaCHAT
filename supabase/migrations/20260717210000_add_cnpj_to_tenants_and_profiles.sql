-- Migration: Add cnpj column to tenants and profiles, and update ensure_user_profile

-- 1. Add columns if not exists
alter table public.tenants add column if not exists cnpj text;
alter table public.profiles add column if not exists cnpj text;

-- 2. Update ensure_user_profile function to handle cnpj
create or replace function public.ensure_user_profile(
  target_user_id uuid,
  target_email text,
  raw_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_tenant_id uuid;
  invited_tenant_id uuid;
  next_tenant_id uuid;
  fallback_name text;
  tenant_name text;
  profile_name text;
  profile_company text;
  profile_plan text;
  profile_role text;
  profile_cnpj text;
begin
  fallback_name := coalesce(nullif(split_part(target_email, '@', 1), ''), 'Novo usuario');
  tenant_name := coalesce(
    nullif(raw_meta->>'empresa', ''),
    nullif(raw_meta->>'company', ''),
    fallback_name
  );
  profile_name := coalesce(
    nullif(raw_meta->>'nome', ''),
    nullif(raw_meta->>'name', ''),
    fallback_name
  );
  profile_company := coalesce(
    nullif(raw_meta->>'empresa', ''),
    nullif(raw_meta->>'company', ''),
    tenant_name
  );
  profile_plan := coalesce(nullif(raw_meta->>'plano', ''), 'starter');
  profile_cnpj := nullif(raw_meta->>'cnpj', '');

  select tenant_id
    into existing_tenant_id
  from public.profiles
  where id = target_user_id;

  select tenant_id
    into invited_tenant_id
  from public.collaborator_invites
  where lower(email) = lower(target_email)
    and status in ('pending', 'accepted', 'revoked')
  order by created_at desc
  limit 1;

  next_tenant_id := coalesce(
    nullif(raw_meta->>'tenant_id', '')::uuid,
    invited_tenant_id,
    existing_tenant_id
  );

  if next_tenant_id is null then
    insert into public.tenants (nome, cnpj)
    values (tenant_name, profile_cnpj)
    returning id into next_tenant_id;
  else
    -- Update tenant cnpj if it was null
    update public.tenants
    set cnpj = coalesce(public.tenants.cnpj, profile_cnpj)
    where id = next_tenant_id;
  end if;

  profile_role := coalesce(
    nullif(raw_meta->>'role', ''),
    (
      select role
      from public.collaborator_invites
      where tenant_id = next_tenant_id
        and lower(email) = lower(target_email)
      order by created_at desc
      limit 1
    ),
    case
      when existing_tenant_id is null and invited_tenant_id is null then 'admin'
      else 'operacao'
    end
  );

  insert into public.profiles (
    id,
    tenant_id,
    nome,
    email,
    empresa,
    plano,
    role,
    status,
    cnpj
  )
  values (
    target_user_id,
    next_tenant_id,
    profile_name,
    target_email,
    profile_company,
    profile_plan,
    profile_role,
    'active',
    profile_cnpj
  )
  on conflict (id) do update set
    tenant_id = coalesce(public.profiles.tenant_id, excluded.tenant_id),
    nome = coalesce(nullif(excluded.nome, ''), public.profiles.nome),
    email = excluded.email,
    empresa = coalesce(nullif(excluded.empresa, ''), public.profiles.empresa),
    plano = coalesce(nullif(excluded.plano, ''), public.profiles.plano),
    role = coalesce(nullif(excluded.role, ''), public.profiles.role),
    cnpj = coalesce(public.profiles.cnpj, excluded.cnpj);
end;
$$;

select pg_notify('pgrst', 'reload schema');
