-- F1 prerequisite: a case ACL cannot trust a profile that its owner can promote
-- or move to an arbitrary tenant. Preserve cosmetic updates and real tenant-admin
-- collaborator management; service-role provisioning remains available.

create or replace function public.guard_profile_trust_boundary()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  actor public.profiles%rowtype;
begin
  -- SECURITY INVOKER is intentional: a JWT caller must not inherit this
  -- function owner's privileges. The auth bootstrap and trusted admin RPCs
  -- execute as their own database owner after their separate authorization.
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if current_user <> 'authenticated' or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sessao invalida para alterar perfil.';
  end if;

  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status <> 'active' then
    raise exception using errcode = '42501', message = 'Perfil inativo ou inexistente.';
  end if;

  -- Deny changes to identity, tenant, billing and future privilege columns by
  -- default. Unchanged status=active from AtivarAcesso remains compatible.
  if (to_jsonb(new) - array['nome','empresa','call_phone','cnpj','availability',
      'availability_updated_at','updated_at','role','status','team_id'])
     is distinct from
     (to_jsonb(old) - array['nome','empresa','call_phone','cnpj','availability',
      'availability_updated_at','updated_at','role','status','team_id']) then
    raise exception using errcode = '42501', message = 'Identidade, empresa vinculada e plano exigem administracao segura.';
  end if;

  if old.id <> actor.id
     or new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.team_id is distinct from old.team_id then
    if actor.role <> 'admin' or actor.tenant_id is null
       or actor.tenant_id is distinct from old.tenant_id then
      raise exception using errcode = '42501', message = 'Somente administrador ativo da empresa pode alterar acessos.';
    end if;
  end if;

  if new.team_id is distinct from old.team_id and new.team_id is not null
     and not exists (select 1 from public.teams t where t.id = new.team_id and t.tenant_id = old.tenant_id) then
    raise exception using errcode = '42501', message = 'Equipe de outra empresa.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_trust_boundary() from public, anon, authenticated;
drop trigger if exists profiles_guard_trust_boundary on public.profiles;
create trigger profiles_guard_trust_boundary
before update on public.profiles
for each row execute function public.guard_profile_trust_boundary();

-- Invitations are provisioned by invite-collaborator with service_role. Browser
-- administrators retain the existing revoke/delete flow, but cannot manufacture
-- or rewrite a pending invitation's email, tenant, inviter or granted role.
revoke insert, update on public.collaborator_invites from public, anon, authenticated;
grant update (status) on public.collaborator_invites to authenticated;
grant select, insert, update, delete on public.collaborator_invites to service_role;

drop policy if exists "collaborator_invites_same_tenant_insert" on public.collaborator_invites;
drop policy if exists "collaborator_invites_same_tenant_update" on public.collaborator_invites;
drop policy if exists "collaborator_invites_active_admin_revoke" on public.collaborator_invites;
create policy "collaborator_invites_active_admin_revoke"
on public.collaborator_invites for update to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid()
    and p.tenant_id = collaborator_invites.tenant_id and p.role = 'admin' and p.status = 'active')
)
with check (
  status = 'revoked'
  and exists (select 1 from public.profiles p where p.id = auth.uid()
    and p.tenant_id = collaborator_invites.tenant_id and p.role = 'admin' and p.status = 'active')
);

create or replace function public.ensure_user_profile(
  target_user_id uuid,
  target_email text,
  raw_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  auth_email text;
  existing_profile public.profiles%rowtype;
  valid_invite public.collaborator_invites%rowtype;
  next_tenant_id uuid;
  profile_name text;
  profile_company text;
  profile_cnpj text;
begin
  -- The authoritative email comes from Auth, never from request metadata.
  select u.email into auth_email from auth.users u where u.id = target_user_id;
  if auth_email is null or lower(auth_email) is distinct from lower(target_email) then
    raise exception using errcode = '22023', message = 'Usuario ou email de cadastro invalido.';
  end if;

  profile_name := coalesce(nullif(btrim(raw_meta->>'nome'), ''), nullif(btrim(raw_meta->>'name'), ''), split_part(auth_email, '@', 1));
  profile_company := coalesce(nullif(btrim(raw_meta->>'empresa'), ''), nullif(btrim(raw_meta->>'company'), ''), profile_name);
  profile_cnpj := nullif(btrim(raw_meta->>'cnpj'), '');

  select * into existing_profile from public.profiles where id = target_user_id for update;
  if existing_profile.id is not null then
    -- Repeated bootstrap/auth metadata updates cannot promote, reactivate, move
    -- an existing account or reset its subscription. Admin service flows own it.
    update public.profiles set
      email = auth_email,
      nome = coalesce(nullif(btrim(raw_meta->>'nome'), ''), nullif(btrim(raw_meta->>'name'), ''), nome),
      empresa = coalesce(nullif(btrim(raw_meta->>'empresa'), ''), nullif(btrim(raw_meta->>'company'), ''), empresa),
      cnpj = coalesce(cnpj, profile_cnpj)
    where id = target_user_id;
    return;
  end if;

  select ci.* into valid_invite
  from public.collaborator_invites ci
  join public.profiles inviter on inviter.id = ci.invited_by
    and inviter.tenant_id = ci.tenant_id and inviter.role = 'admin' and inviter.status = 'active'
  where lower(ci.email) = lower(auth_email)
    and ci.status = 'pending'
    and (ci.auth_user_id is null or ci.auth_user_id = target_user_id)
  order by ci.created_at desc, ci.id
  limit 1
  for update of ci;

  if valid_invite.id is not null then
    next_tenant_id := valid_invite.tenant_id;
  else
    -- A standalone sign-up owns only its newly created workspace. Ignore all
    -- user-controlled tenant_id, role, status and plano keys, even if malformed.
    insert into public.tenants (nome, cnpj) values (profile_company, profile_cnpj)
    returning id into next_tenant_id;
  end if;

  insert into public.profiles (id, tenant_id, nome, email, empresa, plano, role, status, cnpj)
  values (target_user_id, next_tenant_id, profile_name, auth_email, profile_company,
    'sistema', case when valid_invite.id is null then 'admin' else valid_invite.role end,
    'active', profile_cnpj);

  if valid_invite.id is not null then
    update public.collaborator_invites set auth_user_id = target_user_id
    where id = valid_invite.id and status = 'pending';
  end if;
end;
$$;

revoke all on function public.ensure_user_profile(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.ensure_user_profile(uuid, text, jsonb) to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_confirmed() from public, anon, authenticated;

-- Rename the historical _target_user_id parameter to the actual frontend RPC
-- contract, and verify all identity inputs. No trigger depends on this helper.
drop function public.clear_collaborator_invite_after_accept(uuid, text, uuid);
create function public.clear_collaborator_invite_after_accept(
  target_user_id uuid,
  target_email text,
  target_tenant_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or target_user_id is distinct from auth.uid()
     or not exists (
       select 1 from auth.users u join public.profiles p on p.id = u.id
       where u.id = auth.uid() and u.email_confirmed_at is not null
         and lower(u.email) = lower(target_email)
         and p.tenant_id = target_tenant_id and p.status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'Convite nao pertence a esta sessao ativa.';
  end if;

  delete from public.collaborator_invites ci
  where ci.tenant_id = target_tenant_id and lower(ci.email) = lower(target_email)
    and ci.auth_user_id = target_user_id and ci.status in ('pending', 'accepted');
end;
$$;

revoke all on function public.clear_collaborator_invite_after_accept(uuid, text, uuid) from public, anon;
grant execute on function public.clear_collaborator_invite_after_accept(uuid, text, uuid) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
