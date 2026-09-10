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
  next_tenant_id uuid;
  fallback_name text;
  tenant_name text;
  profile_name text;
  profile_company text;
  profile_plan text;
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

  if existing_tenant_id is null then
    insert into public.tenants (nome)
    values (tenant_name)
    returning id into next_tenant_id;
  else
    next_tenant_id := existing_tenant_id;
  end if;

  insert into public.profiles (
    id,
    tenant_id,
    nome,
    email,
    empresa,
    plano
  )
  values (
    target_user_id,
    next_tenant_id,
    profile_name,
    target_email,
    profile_company,
    profile_plan
  )
  on conflict (id) do update set
    tenant_id = coalesce(public.profiles.tenant_id, excluded.tenant_id),
    nome = coalesce(nullif(excluded.nome, ''), public.profiles.nome),
    email = excluded.email,
    empresa = coalesce(nullif(excluded.empresa, ''), public.profiles.empresa),
    plano = coalesce(nullif(excluded.plano, ''), public.profiles.plano);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_user_profile(new.id, new.email, new.raw_user_meta_data);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

do $$
declare
  auth_user record;
begin
  for auth_user in
    select id, email, raw_user_meta_data
    from auth.users
  loop
    perform public.ensure_user_profile(
      auth_user.id,
      auth_user.email,
      coalesce(auth_user.raw_user_meta_data, '{}'::jsonb)
    );
  end loop;
end;
$$;
