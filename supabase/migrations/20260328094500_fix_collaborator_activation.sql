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

  select tenant_id
    into existing_tenant_id
  from public.profiles
  where id = target_user_id;

  select tenant_id
    into invited_tenant_id
  from public.collaborator_invites
  where lower(email) = lower(target_email)
    and status in ('pending', 'accepted')
  order by created_at desc
  limit 1;

  next_tenant_id := coalesce(
    nullif(raw_meta->>'tenant_id', '')::uuid,
    invited_tenant_id,
    existing_tenant_id
  );

  if next_tenant_id is null then
    insert into public.tenants (nome)
    values (tenant_name)
    returning id into next_tenant_id;
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
    status
  )
  values (
    target_user_id,
    next_tenant_id,
    profile_name,
    target_email,
    profile_company,
    profile_plan,
    profile_role,
    'active'
  )
  on conflict (id) do update set
    tenant_id = coalesce(public.profiles.tenant_id, excluded.tenant_id),
    nome = coalesce(nullif(excluded.nome, ''), public.profiles.nome),
    email = excluded.email,
    empresa = coalesce(nullif(excluded.empresa, ''), public.profiles.empresa),
    plano = coalesce(nullif(excluded.plano, ''), public.profiles.plano),
    role = coalesce(nullif(excluded.role, ''), public.profiles.role),
    status = 'active';

  update public.collaborator_invites
  set auth_user_id = target_user_id
  where tenant_id = next_tenant_id
    and lower(email) = lower(target_email)
    and auth_user_id is null;
end;
$$;
