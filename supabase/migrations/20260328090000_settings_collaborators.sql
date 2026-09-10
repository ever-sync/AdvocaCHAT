alter table public.profiles
  add column if not exists role text not null default 'admin'
    check (role in ('admin', 'operacao', 'financeiro', 'atendimento')),
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive')),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create table if not exists public.collaborator_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  nome text not null default '',
  role text not null default 'operacao'
    check (role in ('admin', 'operacao', 'financeiro', 'atendimento')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references public.profiles(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint collaborator_invites_tenant_email_key unique (tenant_id, email)
);

drop trigger if exists collaborator_invites_set_updated_at on public.collaborator_invites;
create trigger collaborator_invites_set_updated_at
before update on public.collaborator_invites
for each row
execute function public.set_updated_at();

alter table public.collaborator_invites enable row level security;

drop policy if exists "profiles_same_tenant_select" on public.profiles;
create policy "profiles_same_tenant_select"
on public.profiles
for select
using (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists "collaborator_invites_same_tenant_select" on public.collaborator_invites;
create policy "collaborator_invites_same_tenant_select"
on public.collaborator_invites
for select
using (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists "collaborator_invites_same_tenant_insert" on public.collaborator_invites;
create policy "collaborator_invites_same_tenant_insert"
on public.collaborator_invites
for insert
with check (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists "collaborator_invites_same_tenant_update" on public.collaborator_invites;
create policy "collaborator_invites_same_tenant_update"
on public.collaborator_invites
for update
using (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
)
with check (
  tenant_id in (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

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
    and status = 'pending'
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
  set
    status = 'accepted',
    auth_user_id = target_user_id,
    accepted_at = timezone('utc', now())
  where tenant_id = next_tenant_id
    and lower(email) = lower(target_email)
    and status = 'pending';
end;
$$;

update public.profiles
set
  role = coalesce(nullif(role, ''), 'admin'),
  status = coalesce(nullif(status, ''), 'active');
