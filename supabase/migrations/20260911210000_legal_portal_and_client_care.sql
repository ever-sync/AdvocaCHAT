-- F5: individual external identities, reviewed projections, durable communication
-- and annual follow-up. No delivery, identity proof or legal power is inferred.
-- External JWT role resolves no application schema. Edge verifies Auth.getUser;
-- service-only RPCs independently revalidate the actor and every current grant.
do $$declare r record;begin
 if not exists(select 1 from pg_roles where rolname='legal_portal') then create role legal_portal nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;end if;
 if exists(select 1 from pg_roles where rolname='authenticator') then grant legal_portal to authenticator;end if;
 -- Preserve inherited PUBLIC USAGE for existing runtime roles before removing it.
 for r in select rolname from pg_roles where rolname<>'legal_portal' and rolname !~ '^pg_' loop
  if has_schema_privilege(r.rolname,'public','USAGE') then execute format('grant usage on schema public to %I',r.rolname);end if;
  if has_schema_privilege(r.rolname,'storage','USAGE') then execute format('grant usage on schema storage to %I',r.rolname);end if;
 end loop;
 revoke all on schema public,storage from public,legal_portal;
end;$$;

create table public.legal_portal_identities (
 id uuid primary key references auth.users(id) on delete restrict,email text not null,
 state text not null default 'pending' check(state in ('pending','active','suspended')),
 activation_method text,activated_at timestamptz,created_at timestamptz not null default now()
);
create table public.legal_portal_representation_grants (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,representation_id uuid not null,
 scopes text[] not null,review_note text not null check(length(btrim(review_note)) between 1 and 4000),
 approved_by uuid not null references public.profiles(id),approved_at timestamptz not null default now(),
 unique(representation_id),foreign key(representation_id,case_id,tenant_id) references public.legal_representations(id,case_id,tenant_id) on delete restrict
);
create table public.legal_portal_invites (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,party_id uuid not null,
 email text not null check(email=lower(btrim(email)) and email ~ '^[^ @]+@[^ @]+\.[^ @]+$' and length(email)<=254),
 access_kind text not null check(access_kind in ('client','representative','accountant')),scopes text[] not null,
 allow_medical boolean not null default false,allow_fiscal boolean not null default false,representation_id uuid,
 public_title text not null check(length(btrim(public_title)) between 1 and 150),purpose text not null check(length(btrim(purpose)) between 1 and 2000),
 expires_at timestamptz not null check(isfinite(expires_at)),state text not null default 'draft' check(state in ('draft','approved','rejected','issued','accepted','revoked')),
 revision integer not null default 1,identity_id uuid references public.legal_portal_identities(id),
 identity_note text,contact_method text check(contact_method in ('documented_review','verified_channel')),evidence_document_id uuid,
 reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(id,case_id,tenant_id),foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id),
 foreign key(party_id,case_id,tenant_id) references public.legal_case_parties(id,case_id,tenant_id),
 foreign key(representation_id,case_id,tenant_id) references public.legal_representations(id,case_id,tenant_id),
 foreign key(evidence_document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id)
);
create table public.legal_portal_provisioning (
 id uuid primary key default gen_random_uuid(),invite_id uuid not null references public.legal_portal_invites(id),
 auth_user_id uuid not null unique,email text not null,idempotency_key uuid not null unique,
 status text not null default 'reserved' check(status in ('reserved','created','failed')),expires_at timestamptz not null default now()+interval '30 minutes',created_at timestamptz not null default now()
);
create table public.legal_portal_invite_tokens (
 invite_id uuid primary key references public.legal_portal_invites(id),token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),revision integer not null,created_at timestamptz not null default now()
);
create table public.legal_portal_memberships (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,party_id uuid not null,
 identity_id uuid not null references public.legal_portal_identities(id),invite_id uuid not null unique,
 access_kind text not null check(access_kind in ('client','representative','accountant')),scopes text[] not null,
 allow_medical boolean not null default false,allow_fiscal boolean not null default false,representation_id uuid,
 public_title text not null,verified_email text not null,expires_at timestamptz not null check(isfinite(expires_at)),
 state text not null default 'pending' check(state in ('pending','active','revoked')),revision integer not null default 1,
 reviewed_by uuid not null references public.profiles(id),reviewed_at timestamptz not null,accepted_at timestamptz,revoked_at timestamptz,revocation_reason text,
 created_at timestamptz not null default now(),unique(id,case_id,tenant_id),
 foreign key(invite_id,case_id,tenant_id) references public.legal_portal_invites(id,case_id,tenant_id),
 foreign key(party_id,case_id,tenant_id) references public.legal_case_parties(id,case_id,tenant_id),
 foreign key(representation_id,case_id,tenant_id) references public.legal_representations(id,case_id,tenant_id)
);
create table public.legal_portal_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,membership_id uuid,
 event_type text not null,actor_id uuid not null references auth.users(id),metadata jsonb not null default '{}',created_at timestamptz not null default clock_timestamp(),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id),foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id)
);
create table public.legal_portal_publications (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,membership_id uuid not null,
 category text not null check(category in ('general','medical','fiscal')),publication_kind text not null check(publication_kind in ('summary','update','agenda')),
 title text not null check(length(btrim(title)) between 1 and 200),body text not null check(length(btrim(body)) between 1 and 12000),
 source_document_ids uuid[] not null default '{}',source_appointment_id uuid,starts_at timestamptz,ends_at timestamptz,previous_version_id uuid,
 state text not null default 'draft' check(state in ('draft','approved','revoked','superseded')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 reviewed_by uuid references public.profiles(id),review_note text,reviewed_at timestamptz,unique(id,case_id,tenant_id),
 foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id),
 foreign key(previous_version_id,case_id,tenant_id) references public.legal_portal_publications(id,case_id,tenant_id),
 check(starts_at is null or isfinite(starts_at)),check(ends_at is null or (isfinite(ends_at) and ends_at>starts_at))
);
create table public.legal_portal_document_releases (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,membership_id uuid not null,document_id uuid not null,
 category text not null check(category in ('general','medical','fiscal')),document_hash text not null,purpose text not null check(length(btrim(purpose)) between 1 and 2000),
 expires_at timestamptz not null check(isfinite(expires_at)),state text not null default 'draft' check(state in ('draft','approved','revoked')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),reviewed_by uuid references public.profiles(id),review_note text,reviewed_at timestamptz,
 unique(id,case_id,tenant_id),foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id),
 foreign key(document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id)
);
create table public.legal_portal_export_versions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,membership_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 200),release_ids uuid[] not null check(cardinality(release_ids) between 1 and 100),
 manifest jsonb not null default '[]',state text not null default 'draft' check(state in ('draft','approved','revoked')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),reviewed_by uuid references public.profiles(id),review_note text,reviewed_at timestamptz,
 foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id)
);
create table public.legal_portal_requests (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,membership_id uuid not null,
 request_id uuid not null unique references public.legal_document_requests(id),category text not null check(category in ('general','medical','fiscal')),
 title text not null,instructions text not null,due_at timestamptz,expires_at timestamptz not null,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(id,case_id,tenant_id),foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id)
);
create table public.legal_portal_uploads (
 document_id uuid primary key,tenant_id uuid not null,case_id uuid not null,portal_request_id uuid not null,identity_id uuid not null references public.legal_portal_identities(id),
 membership_id uuid not null,created_at timestamptz not null default now(),
 foreign key(document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id),
 foreign key(portal_request_id,case_id,tenant_id) references public.legal_portal_requests(id,case_id,tenant_id),foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id)
);
create table public.legal_portal_messages (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,membership_id uuid not null,
 category text not null check(category in ('general','medical','fiscal')),body text not null check(length(btrim(body)) between 1 and 6000),identity_id uuid not null references public.legal_portal_identities(id),
 idempotency_key uuid not null,created_at timestamptz not null default now(),unique(identity_id,idempotency_key),
 foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id)
);
create table public.legal_portal_acknowledgements (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,membership_id uuid not null,publication_id uuid not null,
 identity_id uuid not null references public.legal_portal_identities(id),acknowledged_at timestamptz not null default clock_timestamp(),unique(membership_id,publication_id),
 foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id),foreign key(publication_id,case_id,tenant_id) references public.legal_portal_publications(id,case_id,tenant_id)
);

create or replace function public._legal_portal_scopes(p_scopes text[],p_kind text,p_medical boolean,p_fiscal boolean) returns void language plpgsql immutable as $$
begin
 if p_scopes is null or cardinality(p_scopes) not between 1 and 8 or not(p_scopes <@ array['case_summary:read','agenda:read','messages:read','messages:write','requests:upload','documents:read','statements:read','fiscal_exports:read']) or array_position(p_scopes,null) is not null then raise exception 'Invalid portal scopes' using errcode='22023';end if;
 if p_kind='accountant' and (p_medical or not p_fiscal or not(p_scopes <@ array['requests:upload','documents:read','fiscal_exports:read'])) then raise exception 'Accountant may receive only reviewed fiscal collection and exports' using errcode='22023';end if;
end;$$;
create or replace function public._legal_portal_service() returns void language plpgsql stable as $$begin if auth.role() is distinct from 'service_role' then raise exception 'Service operation only' using errcode='42501';end if;end;$$;
create or replace function public._legal_portal_staff(p_actor_id uuid,p_case_id uuid) returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid;begin
 perform 1 from public.legal_cases where id=p_case_id for update;
 select c.tenant_id into t from public.legal_cases c join public.profiles p on p.id=p_actor_id and p.id=c.owner_id and p.tenant_id=c.tenant_id and p.status='active' join public.legal_workspace_features w on w.tenant_id=c.tenant_id and w.enabled where c.id=p_case_id;
 if t is null then raise exception 'Active case owner required' using errcode='42501';end if;return t;
end;$$;
create or replace function public._legal_portal_event(p_case_id uuid,p_membership_id uuid,p_actor_id uuid,p_type text,p_metadata jsonb default '{}') returns void language sql security definer set search_path=pg_catalog,public,pg_temp as $$
 insert into public.legal_portal_events(tenant_id,case_id,membership_id,actor_id,event_type,metadata) select tenant_id,id,p_membership_id,p_actor_id,p_type,p_metadata from public.legal_cases where id=p_case_id;
$$;
create or replace function public._legal_portal_category(p_member public.legal_portal_memberships,p_category text) returns boolean language sql immutable as $$
 select case p_category when 'general' then p_member.access_kind<>'accountant' when 'medical' then p_member.allow_medical and p_member.access_kind<>'accountant' when 'fiscal' then p_member.allow_fiscal else false end;
$$;
create or replace function public._legal_portal_assert_member(p_actor_id uuid,p_membership_id uuid,p_scope text default null,p_category text default 'general')
returns public.legal_portal_memberships language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.legal_portal_memberships;begin
 select * into m from public.legal_portal_memberships where id=p_membership_id;
 if not found then raise exception 'Portal access unavailable' using errcode='42501';end if;
 perform 1 from public.legal_cases where id=m.case_id for update;
 select * into m from public.legal_portal_memberships where id=p_membership_id;
 if m.identity_id<>p_actor_id or m.state<>'active' or m.expires_at<=clock_timestamp() or not public._legal_portal_category(m,p_category) or (p_scope is not null and not(p_scope=any(m.scopes)))
 or not exists(select 1 from public.legal_portal_identities i join auth.users u on u.id=i.id where i.id=p_actor_id and i.state='active' and u.role='legal_portal' and u.raw_app_meta_data->>'legal_portal'='true' and lower(u.email)=m.verified_email and lower(i.email)=m.verified_email and u.email_confirmed_at is not null and not exists(select 1 from public.profiles p where p.id=i.id))
 or not exists(select 1 from public.legal_workspace_features w join public.legal_cases c on c.tenant_id=w.tenant_id join public.profiles p on p.id=c.owner_id and p.tenant_id=c.tenant_id and p.status='active' where c.id=m.case_id and w.enabled)
 then raise exception 'Portal access unavailable' using errcode='42501';end if;
 if m.access_kind='representative' and (public._ir_representation_state(m.representation_id)<>'active' or not exists(select 1 from public.legal_portal_representation_grants g where g.representation_id=m.representation_id and g.case_id=m.case_id and m.scopes <@ g.scopes)) then raise exception 'Current reviewed portal powers required' using errcode='42501';end if;
 return m;
end;$$;

create or replace function public._legal_staff_ensure_user_profile(
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
create or replace function public.ensure_user_profile(target_user_id uuid,target_email text,raw_meta jsonb default '{}') returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare u auth.users;r public.legal_portal_provisioning;begin
 select * into u from auth.users where id=target_user_id;
 if not found or lower(u.email) is distinct from lower(target_email) then raise exception 'Invalid Auth user/email' using errcode='22023';end if;
 select * into r from public.legal_portal_provisioning where auth_user_id=target_user_id;
 if found then
  if lower(u.email)<>r.email then raise exception 'External provisioning email mismatch' using errcode='42501';end if;
  return;
 end if;
 if exists(select 1 from public.legal_portal_identities where id=target_user_id) or u.role='legal_portal' or u.raw_app_meta_data->>'legal_portal'='true' then return;end if;
 perform public._legal_staff_ensure_user_profile(target_user_id,target_email,raw_meta);
end;$$;
create or replace function public.guard_legal_portal_auth() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_provisioning;begin
 select * into r from public.legal_portal_provisioning where auth_user_id=new.id;
 if tg_op='INSERT' and r.id is not null then
  if lower(new.email) is distinct from r.email or r.status<>'reserved' or r.expires_at<=clock_timestamp() then raise exception 'Invalid external identity reservation' using errcode='42501';end if;
  new.role:='legal_portal';new.raw_app_meta_data:=coalesce(new.raw_app_meta_data,'{}')||'{"legal_portal":true}'::jsonb;return new;
 end if;
 if r.id is not null or exists(select 1 from public.legal_portal_identities where id=new.id) then
  if exists(select 1 from public.profiles where id=new.id) or new.role is distinct from 'legal_portal' then raise exception 'External account cannot become internal' using errcode='42501';end if;
  new.raw_app_meta_data:=coalesce(new.raw_app_meta_data,'{}')||'{"legal_portal":true}'::jsonb;return new;
 end if;
 if new.role='legal_portal' or new.raw_app_meta_data->>'legal_portal'='true' then raise exception 'External identity requires trusted reservation' using errcode='42501';end if;
 return new;
end;$$;
create trigger auth_users_guard_legal_portal before insert or update on auth.users for each row execute function public.guard_legal_portal_auth();

create or replace function public.legal_portal_can_manage(p_case_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select public.legal_can_access_case(p_case_id,true) and exists(select 1 from public.legal_cases where id=p_case_id and owner_id=auth.uid());
$$;
create or replace function public.legal_grant_portal_representation(p_representation_id uuid,p_scopes text[],p_note text) returns public.legal_portal_representation_grants language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_representations;g public.legal_portal_representation_grants;begin
 select * into r from public.legal_representations where id=p_representation_id;
 perform public._legal_assert_operation(r.case_id,r.category,true);select * into r from public.legal_representations where id=p_representation_id;
 perform public._legal_portal_scopes(p_scopes,'representative',true,true);
 if public._ir_representation_state(r.id)<>'active' then raise exception 'Active reviewed representation required' using errcode='22023';end if;
 insert into public.legal_portal_representation_grants(tenant_id,case_id,representation_id,scopes,review_note,approved_by) values(r.tenant_id,r.case_id,r.id,p_scopes,p_note,auth.uid()) on conflict(representation_id) do update set scopes=excluded.scopes,review_note=excluded.review_note,approved_by=excluded.approved_by,approved_at=clock_timestamp() returning * into g;
 perform public._legal_portal_event(r.case_id,null,auth.uid(),'representation_scopes_reviewed',jsonb_build_object('representation_id',r.id,'scopes',p_scopes));return g;
end;$$;
create or replace function public.legal_create_portal_invite(p_case_id uuid,p_payload jsonb) returns public.legal_portal_invites language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_invites;t uuid:=public._legal_assert_operation(p_case_id,'general',true);begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('party_id','email','access_kind','scopes','allow_medical','allow_fiscal','representation_id','public_title','expires_at','purpose')) then raise exception 'Unsupported invitation fields' using errcode='22023';end if;
 r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.state:='draft';r.revision:=1;r.allow_medical:=false;r.allow_fiscal:=false;r.created_by:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);r.email:=lower(btrim(r.email));
 perform public._legal_portal_scopes(r.scopes,r.access_kind,r.allow_medical,r.allow_fiscal);
 if r.expires_at<=clock_timestamp() or r.expires_at>clock_timestamp()+interval '1 year' then raise exception 'Invitation needs a future validity up to one year' using errcode='22023';end if;
 if r.access_kind='representative' and not exists(select 1 from public.legal_representations where id=r.representation_id and case_id=p_case_id and representative_party_id=r.party_id) then raise exception 'Representative must match reviewed party and mandate' using errcode='22023';end if;
 if r.access_kind<>'representative' and r.representation_id is not null then raise exception 'Representation is specific to representative access' using errcode='22023';end if;
 insert into public.legal_portal_invites values(r.*) returning * into r;
 perform public._legal_portal_event(p_case_id,null,auth.uid(),'invite_drafted',jsonb_build_object('invite_id',r.id));return r;
end;$$;
create or replace function public.legal_review_portal_invite(p_invite_id uuid,p_decision text,p_identity_note text,p_contact_method text,p_evidence_document_id uuid) returns public.legal_portal_invites language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_invites;d public.legal_case_documents;begin
 select * into r from public.legal_portal_invites where id=p_invite_id;perform public._legal_assert_operation(r.case_id,'general',true);select * into r from public.legal_portal_invites where id=p_invite_id for update;
 if r.state<>'draft' or coalesce(p_decision,'') not in ('approved','rejected') or length(btrim(coalesce(p_identity_note,''))) not between 1 and 4000 or coalesce(p_contact_method,'') not in ('documented_review','verified_channel') then raise exception 'Explicit individual identity/contact review required' using errcode='22023';end if;
 d:=public._ir4_ready_document(r.case_id,p_evidence_document_id);
 if d.category<>'general' then raise exception 'Identity/contact evidence must be general; never copy medical material into grant metadata' using errcode='22023';end if;
 if r.access_kind='representative' and (public._ir_representation_state(r.representation_id)<>'active' or not exists(select 1 from public.legal_portal_representation_grants g where g.representation_id=r.representation_id and r.scopes <@ g.scopes)) then raise exception 'Separate current portal powers required' using errcode='22023';end if;
 update public.legal_portal_invites set state=p_decision,identity_note=p_identity_note,contact_method=p_contact_method,evidence_document_id=p_evidence_document_id,reviewed_by=auth.uid(),reviewed_at=clock_timestamp() where id=r.id returning * into r;
 perform public._legal_portal_event(r.case_id,null,auth.uid(),'invite_reviewed',jsonb_build_object('invite_id',r.id,'decision',p_decision,'scopes',r.scopes));return r;
end;$$;
create or replace function public.legal_revoke_portal_access(p_invite_id uuid default null,p_membership_id uuid default null,p_reason text default '') returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c uuid;i uuid;begin
 if (p_invite_id is null)=(p_membership_id is null) or length(btrim(p_reason)) not between 1 and 2000 then raise exception 'Choose exactly one grant and explain revocation' using errcode='22023';end if;
 if p_invite_id is not null then select case_id,id into c,i from public.legal_portal_invites where id=p_invite_id;else select case_id,invite_id into c,i from public.legal_portal_memberships where id=p_membership_id;end if;
 perform public._legal_assert_operation(c,'general',true);
 update public.legal_portal_invites set state='revoked',revision=revision+1 where id=i;
 delete from public.legal_portal_invite_tokens where invite_id=i;
 update public.legal_portal_memberships set state='revoked',revision=revision+1,revoked_at=clock_timestamp(),revocation_reason=p_reason where invite_id=i;
 perform public._legal_portal_event(c,p_membership_id,auth.uid(),'access_revoked',jsonb_build_object('invite_id',i));
end;$$;

create or replace function public.legal_portal_service_reserve(p_staff_id uuid,p_invite_id uuid,p_auth_user_id uuid,p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare i public.legal_portal_invites;r public.legal_portal_provisioning;u auth.users;begin
 perform public._legal_portal_service();select * into i from public.legal_portal_invites where id=p_invite_id;perform public._legal_portal_staff(p_staff_id,i.case_id);select * into i from public.legal_portal_invites where id=p_invite_id for update;
 if i.state not in ('approved','issued') or i.expires_at<=clock_timestamp() then raise exception 'Reviewed valid invitation required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('legal_portal_email:'||i.email,0));
 select * into r from public.legal_portal_provisioning where idempotency_key=p_idempotency_key;
 if found then if r.invite_id<>i.id then raise exception 'Provisioning key payload mismatch' using errcode='22023';end if;return to_jsonb(r)-array['invite_id','idempotency_key','expires_at','created_at'];end if;
 select * into u from auth.users where lower(email)=i.email;
 if found then
  if u.role<>'legal_portal' or not exists(select 1 from public.legal_portal_identities where id=u.id) or exists(select 1 from public.profiles where id=u.id) then raise exception 'Existing internal account cannot be converted; identity review needed' using errcode='22023';end if;
  update public.legal_portal_invites set identity_id=u.id where id=i.id;
  return jsonb_build_object('id',null,'auth_user_id',u.id,'email',i.email,'status','created');
 end if;
 if exists(select 1 from auth.users where id=p_auth_user_id) or p_auth_user_id is null then raise exception 'Reserved UUID unavailable' using errcode='22023';end if;
 insert into public.legal_portal_provisioning(invite_id,auth_user_id,email,idempotency_key) values(i.id,p_auth_user_id,i.email,p_idempotency_key) returning * into r;
 return to_jsonb(r)-array['invite_id','idempotency_key','expires_at','created_at'];
end;$$;
create or replace function public.legal_portal_service_complete_provision(p_staff_id uuid,p_provisioning_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_provisioning;i public.legal_portal_invites;u auth.users;begin
 perform public._legal_portal_service();select * into r from public.legal_portal_provisioning where id=p_provisioning_id;select * into i from public.legal_portal_invites where id=r.invite_id;perform public._legal_portal_staff(p_staff_id,i.case_id);
 select * into u from auth.users where id=r.auth_user_id;
 if not found or u.role<>'legal_portal' or u.raw_app_meta_data->>'legal_portal' is distinct from 'true' or lower(u.email)<>r.email or exists(select 1 from public.profiles where id=u.id) then raise exception 'External Auth provisioning not verified' using errcode='22023';end if;
 insert into public.legal_portal_identities(id,email) values(u.id,r.email) on conflict(id) do nothing;
 update public.legal_portal_provisioning set status='created' where id=r.id;update public.legal_portal_invites set identity_id=u.id where id=i.id;
 return jsonb_build_object('identity_id',u.id,'auth_user_id',u.id,'email',r.email,'status',(select state from public.legal_portal_identities where id=u.id));
end;$$;
create or replace function public.legal_portal_service_issue(p_staff_id uuid,p_invite_id uuid,p_token_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare i public.legal_portal_invites;begin
 perform public._legal_portal_service();select * into i from public.legal_portal_invites where id=p_invite_id;perform public._legal_portal_staff(p_staff_id,i.case_id);select * into i from public.legal_portal_invites where id=p_invite_id for update;
 if i.state not in ('approved','issued') or i.expires_at<=clock_timestamp() or not exists(select 1 from public.legal_portal_identities x join auth.users u on u.id=x.id where x.id=i.identity_id and x.state<>'suspended' and lower(u.email)=i.email and u.role='legal_portal' and u.raw_app_meta_data->>'legal_portal'='true') then raise exception 'Provisioned reviewed invitation required' using errcode='22023';end if;
 update public.legal_portal_invites set state='issued',revision=revision+1 where id=i.id returning * into i;
 insert into public.legal_portal_invite_tokens(invite_id,token_hash,revision) values(i.id,p_token_hash,i.revision) on conflict(invite_id) do update set token_hash=excluded.token_hash,revision=excluded.revision,created_at=clock_timestamp();
 perform public._legal_portal_event(i.case_id,null,p_staff_id,'invite_link_issued',jsonb_build_object('invite_id',i.id,'revision',i.revision));
 -- Staff receive only the invitation capability; recipient Auth credentials are never issued here.
 return jsonb_build_object('invite_id',i.id,'expires_at',i.expires_at,'revision',i.revision);
end;$$;
create or replace function public.legal_portal_service_inspect(p_token_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 perform public._legal_portal_service();return jsonb_build_object('available',exists(select 1 from public.legal_portal_invite_tokens t join public.legal_portal_invites i on i.id=t.invite_id where t.token_hash=p_token_hash and t.revision=i.revision and i.state='issued' and i.expires_at>clock_timestamp()));
end;$$;
create or replace function public.legal_portal_service_accept(p_actor_id uuid,p_token_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare i public.legal_portal_invites;m public.legal_portal_memberships;begin
 perform public._legal_portal_service();select q.* into i from public.legal_portal_invites q join public.legal_portal_invite_tokens t on t.invite_id=q.id where t.token_hash=p_token_hash;
 if not found then raise exception 'Invitation unavailable' using errcode='42501';end if;
 perform 1 from public.legal_cases where id=i.case_id for update;select * into i from public.legal_portal_invites where id=i.id;
 if (select token_hash from public.legal_portal_invite_tokens where invite_id=i.id) is distinct from p_token_hash or i.identity_id<>p_actor_id or i.state not in ('issued','accepted') or i.expires_at<=clock_timestamp() or i.reviewed_at is null or i.evidence_document_id is null
 or not exists(select 1 from auth.users u join public.legal_portal_identities x on x.id=u.id where u.id=p_actor_id and u.role='legal_portal' and u.raw_app_meta_data->>'legal_portal'='true' and lower(u.email)=i.email and u.email_confirmed_at is not null and x.state<>'suspended') then raise exception 'Invitation unavailable' using errcode='42501';end if;
 insert into public.legal_portal_memberships(tenant_id,case_id,party_id,identity_id,invite_id,access_kind,scopes,allow_medical,allow_fiscal,representation_id,public_title,verified_email,expires_at,state,reviewed_by,reviewed_at,accepted_at)
 values(i.tenant_id,i.case_id,i.party_id,p_actor_id,i.id,i.access_kind,i.scopes,i.allow_medical,i.allow_fiscal,i.representation_id,i.public_title,i.email,i.expires_at,'active',i.reviewed_by,i.reviewed_at,clock_timestamp()) on conflict(invite_id) do nothing;
 select * into m from public.legal_portal_memberships where invite_id=i.id;
 update public.legal_portal_identities set state='active',activation_method='recipient_auth',activated_at=coalesce(activated_at,clock_timestamp()) where id=p_actor_id and state='pending';
 perform public._legal_portal_assert_member(p_actor_id,m.id,null,case when m.access_kind='accountant' then 'fiscal' else 'general' end);
 update public.legal_portal_invites set state='accepted' where id=i.id;
 perform public._legal_portal_event(i.case_id,m.id,p_actor_id,'invitation_accepted',jsonb_build_object('activation_method','recipient_auth','identity_review_separate',true));return jsonb_build_object('membership_id',m.id,'status',m.state);
end;$$;

create or replace function public.legal_create_portal_publication(p_case_id uuid,p_payload jsonb) returns public.legal_portal_publications language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_publications;m public.legal_portal_memberships;d public.legal_case_documents;v uuid;t uuid;begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('membership_id','category','publication_kind','title','body','source_document_ids','source_appointment_id','starts_at','ends_at','previous_version_id')) then raise exception 'Unsupported publication fields' using errcode='22023';end if;
 t:=public._legal_assert_operation(p_case_id,p_payload->>'category');r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.state:='draft';r.source_document_ids:='{}';r.created_by:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);
 select * into m from public.legal_portal_memberships where id=r.membership_id and case_id=p_case_id;
 perform public._legal_portal_assert_member(m.identity_id,m.id,case when r.publication_kind='agenda' then 'agenda:read' else 'case_summary:read' end,r.category);
 if cardinality(r.source_document_ids)>100 then raise exception 'Too many publication sources' using errcode='22023';end if;
 foreach v in array r.source_document_ids loop d:=public._ir4_ready_document(p_case_id,v);if d.category<>r.category then raise exception 'Publication must retain source category' using errcode='22023';end if;end loop;
 if r.source_appointment_id is not null and not exists(select 1 from public.legal_appointments where id=r.source_appointment_id and case_id=p_case_id) then raise exception 'Appointment must belong to this case' using errcode='22023';end if;
 if r.publication_kind='agenda' and (r.starts_at is null or r.ends_at is null) then raise exception 'Published agenda requires explicit times' using errcode='22023';end if;
 if r.previous_version_id is not null and not exists(select 1 from public.legal_portal_publications where id=r.previous_version_id and membership_id=r.membership_id and category=r.category and publication_kind=r.publication_kind) then raise exception 'Publication version must preserve recipient and category' using errcode='22023';end if;
 insert into public.legal_portal_publications values(r.*) returning * into r;return r;
end;$$;
create or replace function public.legal_review_portal_publication(p_publication_id uuid,p_decision text,p_note text) returns public.legal_portal_publications language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_publications;m public.legal_portal_memberships;begin
 select * into r from public.legal_portal_publications where id=p_publication_id;perform public._legal_assert_operation(r.case_id,r.category,true);select * into r from public.legal_portal_publications where id=p_publication_id for update;
 if coalesce(p_decision,'') not in ('approved','revoked') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 or (p_decision='approved' and r.state<>'draft') then raise exception 'Publication requires an immutable draft and review' using errcode='22023';end if;
 if p_decision='approved' then
  select * into m from public.legal_portal_memberships where id=r.membership_id;perform public._legal_portal_assert_member(m.identity_id,m.id,case when r.publication_kind='agenda' then 'agenda:read' else 'case_summary:read' end,r.category);
  if r.previous_version_id is not null then update public.legal_portal_publications set state='superseded' where id=r.previous_version_id;end if;
 end if;
 update public.legal_portal_publications set state=p_decision,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=p_note where id=r.id returning * into r;
 perform public._legal_portal_event(r.case_id,r.membership_id,auth.uid(),'publication_reviewed',jsonb_build_object('publication_id',r.id,'decision',p_decision));return r;
end;$$;
create or replace function public.legal_release_portal_document(p_document_id uuid,p_membership_id uuid,p_purpose text,p_expires_at timestamptz) returns public.legal_portal_document_releases language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare d public.legal_case_documents;m public.legal_portal_memberships;r public.legal_portal_document_releases;begin
 select * into d from public.legal_case_documents where id=p_document_id;perform public._legal_assert_operation(d.case_id,d.category);d:=public._ir4_ready_document(d.case_id,d.id);
 select * into m from public.legal_portal_memberships where id=p_membership_id and case_id=d.case_id;perform public._legal_portal_assert_member(m.identity_id,m.id,'documents:read',d.category);
 if p_expires_at<=clock_timestamp() or p_expires_at>m.expires_at then raise exception 'Release validity must fit recipient grant' using errcode='22023';end if;
 insert into public.legal_portal_document_releases(tenant_id,case_id,membership_id,document_id,category,document_hash,purpose,expires_at,created_by) values(d.tenant_id,d.case_id,m.id,d.id,d.category,d.sha256,p_purpose,p_expires_at,auth.uid()) returning * into r;return r;
end;$$;
create or replace function public.legal_review_portal_document_release(p_release_id uuid,p_decision text,p_note text) returns public.legal_portal_document_releases language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_document_releases;m public.legal_portal_memberships;begin
 select * into r from public.legal_portal_document_releases where id=p_release_id;perform public._legal_assert_operation(r.case_id,r.category,true);select * into r from public.legal_portal_document_releases where id=p_release_id for update;
 if coalesce(p_decision,'') not in ('approved','revoked') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 or (p_decision='approved' and r.state<>'draft') then raise exception 'Explicit release review required' using errcode='22023';end if;
 if p_decision='approved' then select * into m from public.legal_portal_memberships where id=r.membership_id;perform public._legal_portal_assert_member(m.identity_id,m.id,'documents:read',r.category);
 if r.expires_at<=clock_timestamp() or not exists(select 1 from public.legal_case_documents where id=r.document_id and status='ready' and sha256=r.document_hash and category=r.category) then raise exception 'Release document or validity changed' using errcode='22023';end if;end if;
 update public.legal_portal_document_releases set state=p_decision,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=p_note where id=r.id returning * into r;
 perform public._legal_portal_event(r.case_id,r.membership_id,auth.uid(),'document_release_reviewed',jsonb_build_object('release_id',r.id,'decision',p_decision));return r;
end;$$;
create or replace function public._legal_portal_download(p_actor_id uuid,p_membership_id uuid,p_release_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_document_releases;d public.legal_case_documents;m public.legal_portal_memberships;begin
 select * into r from public.legal_portal_document_releases where id=p_release_id and membership_id=p_membership_id;
 if not found then raise exception 'Document release unavailable' using errcode='42501';end if;
 m:=public._legal_portal_assert_member(p_actor_id,p_membership_id,'documents:read',r.category);select * into r from public.legal_portal_document_releases where id=p_release_id;
 select * into d from public.legal_case_documents where id=r.document_id;
 if r.state<>'approved' or r.expires_at<=clock_timestamp() or d.status<>'ready' or d.sha256 is distinct from r.document_hash or d.case_id<>m.case_id or d.category<>r.category then raise exception 'Document release unavailable' using errcode='42501';end if;
 return jsonb_build_object('document_id',d.id,'storage_path',d.storage_path,'file_name',d.file_name,'mime_type',d.mime_type,'size_bytes',d.size_bytes,'sha256',d.sha256);
end;$$;
create or replace function public.legal_portal_service_authorize_download(p_actor_id uuid,p_membership_id uuid,p_release_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;c uuid;begin perform public._legal_portal_service();result:=public._legal_portal_download(p_actor_id,p_membership_id,p_release_id);select case_id into c from public.legal_portal_memberships where id=p_membership_id;perform public._legal_portal_event(c,p_membership_id,p_actor_id,'download_authorized',jsonb_build_object('release_id',p_release_id));return result;end;$$;
create or replace function public.legal_create_portal_export(p_membership_id uuid,p_title text,p_release_ids uuid[]) returns public.legal_portal_export_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.legal_portal_memberships;r public.legal_portal_export_versions;v uuid;begin
 select * into m from public.legal_portal_memberships where id=p_membership_id;perform public._legal_assert_operation(m.case_id,'fiscal');perform public._legal_portal_assert_member(m.identity_id,m.id,'fiscal_exports:read','fiscal');
 foreach v in array p_release_ids loop if not exists(select 1 from public.legal_portal_document_releases where id=v and membership_id=m.id and category='fiscal') then raise exception 'Export accepts only explicitly released fiscal documents for this recipient' using errcode='22023';end if;perform public._legal_portal_download(m.identity_id,m.id,v);end loop;
 insert into public.legal_portal_export_versions(tenant_id,case_id,membership_id,title,release_ids,created_by) values(m.tenant_id,m.case_id,m.id,p_title,p_release_ids,auth.uid()) returning * into r;return r;
end;$$;
create or replace function public.legal_review_portal_export(p_export_id uuid,p_decision text,p_note text) returns public.legal_portal_export_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_export_versions;m public.legal_portal_memberships;v uuid;j jsonb;v_manifest jsonb:='[]';begin
 select * into r from public.legal_portal_export_versions where id=p_export_id;perform public._legal_assert_operation(r.case_id,'fiscal',true);select * into r from public.legal_portal_export_versions where id=p_export_id for update;
 if coalesce(p_decision,'') not in ('approved','revoked') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 or (p_decision='approved' and r.state<>'draft') then raise exception 'Explicit export review required' using errcode='22023';end if;
 if p_decision='approved' then select * into m from public.legal_portal_memberships where id=r.membership_id;perform public._legal_portal_assert_member(m.identity_id,m.id,'fiscal_exports:read','fiscal');
 foreach v in array r.release_ids loop j:=public._legal_portal_download(m.identity_id,m.id,v)-'storage_path';v_manifest:=v_manifest||jsonb_build_array(j||jsonb_build_object('release_id',v));end loop;else v_manifest:=r.manifest;end if;
 update public.legal_portal_export_versions set state=p_decision,manifest=v_manifest,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=p_note where id=r.id returning * into r;return r;
end;$$;
create or replace function public.legal_portal_service_request_export(p_actor_id uuid,p_membership_id uuid,p_export_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.legal_portal_memberships;r public.legal_portal_export_versions;v uuid;begin
 perform public._legal_portal_service();m:=public._legal_portal_assert_member(p_actor_id,p_membership_id,'fiscal_exports:read','fiscal');select * into r from public.legal_portal_export_versions where id=p_export_id and membership_id=m.id and state='approved';
 if not found then raise exception 'Approved export unavailable' using errcode='42501';end if;
 foreach v in array r.release_ids loop perform public._legal_portal_download(p_actor_id,m.id,v);end loop;
 perform public._legal_portal_event(m.case_id,m.id,p_actor_id,'export_authorized',jsonb_build_object('export_id',r.id));return jsonb_build_object('id',r.id,'title',r.title,'items',r.manifest);
end;$$;
create or replace function public.legal_create_portal_request(p_membership_id uuid,p_payload jsonb) returns public.legal_portal_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.legal_portal_memberships;r public.legal_portal_requests;q public.legal_document_requests;begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('category','title','instructions','due_at','expires_at')) then raise exception 'Unsupported portal request fields' using errcode='22023';end if;
 select * into m from public.legal_portal_memberships where id=p_membership_id;perform public._legal_assert_operation(m.case_id,p_payload->>'category',true);perform public._legal_portal_assert_member(m.identity_id,m.id,'requests:upload',p_payload->>'category');
 r.id:=gen_random_uuid();r.tenant_id:=m.tenant_id;r.case_id:=m.case_id;r.membership_id:=m.id;r.instructions:='';r.created_by:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload);
 if r.expires_at is null or not isfinite(r.expires_at) or r.expires_at<=clock_timestamp() or r.expires_at>m.expires_at then raise exception 'Request must expire within recipient validity' using errcode='22023';end if;
 q:=public.legal_create_document_request(m.case_id,r.category,r.title,r.instructions,r.due_at);r.request_id:=q.id;
 update public.legal_document_requests set expires_at=r.expires_at where id=q.id;
 insert into public.legal_portal_requests values(r.*) returning * into r;return r;
end;$$;
create or replace function public.legal_portal_service_prepare_upload(p_actor_id uuid,p_request_id uuid,p_file_name text,p_mime_type text,p_size_bytes bigint) returns public.legal_case_documents language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_requests;q public.legal_document_requests;m public.legal_portal_memberships;d public.legal_case_documents;i uuid:=gen_random_uuid();begin
 perform public._legal_portal_service();select * into r from public.legal_portal_requests where id=p_request_id;
 select * into q from public.legal_document_requests where id=r.request_id for update;
 m:=public._legal_portal_assert_member(p_actor_id,r.membership_id,'requests:upload',r.category);select * into q from public.legal_document_requests where id=r.request_id;
 if q.status<>'open' or q.used_at is not null or r.expires_at<=clock_timestamp() or q.expires_at<=clock_timestamp() or not public._legal_actor_can_edit(r.case_id,r.created_by,r.category) then raise exception 'Portal request unavailable' using errcode='42501';end if;
 if p_size_bytes is null or p_size_bytes not between 1 and 10485760 or (select coalesce(sum(size_bytes),0) from public.legal_case_documents where case_id=r.case_id and status in ('prepared','ready'))+p_size_bytes>209715200 then raise exception 'Document quota exceeded' using errcode='22023';end if;
 if p_mime_type not in ('application/pdf','image/jpeg','image/png','text/plain','text/csv') then raise exception 'Unsupported document MIME' using errcode='22023';end if;
 insert into public.legal_case_documents(id,tenant_id,case_id,category,display_name,file_name,mime_type,size_bytes,storage_path,uploaded_by) values(i,r.tenant_id,r.case_id,r.category,r.title,p_file_name,p_mime_type,p_size_bytes,r.tenant_id||'/'||r.case_id||'/'||i,r.created_by) returning * into d;
 insert into public.legal_portal_uploads(document_id,tenant_id,case_id,portal_request_id,identity_id,membership_id) values(i,r.tenant_id,r.case_id,r.id,p_actor_id,m.id);
 update public.legal_document_requests set status='uploading',document_id=i,used_at=clock_timestamp(),updated_at=clock_timestamp() where id=q.id;
 delete from public.legal_document_request_tokens where request_id=q.id;
 perform public._legal_portal_event(r.case_id,m.id,p_actor_id,'external_upload_prepared',jsonb_build_object('document_id',i,'request_id',r.id));return d;
end;$$;
create or replace function public.legal_portal_service_finalize_upload(p_actor_id uuid,p_request_id uuid,p_document_id uuid,p_sha256 text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_requests;q public.legal_document_requests;d public.legal_case_documents;begin
 perform public._legal_portal_service();select * into r from public.legal_portal_requests where id=p_request_id;select * into q from public.legal_document_requests where id=r.request_id for update;
 if q.document_id is distinct from p_document_id or q.status<>'uploading' or not exists(select 1 from public.legal_portal_uploads where document_id=p_document_id and portal_request_id=r.id and identity_id=p_actor_id) then raise exception 'Portal upload unavailable' using errcode='42501';end if;
 -- Match F2 request -> document -> case order. Revalidate after waiting.
 perform 1 from public.legal_case_documents where id=p_document_id for update;
 perform public._legal_portal_assert_member(p_actor_id,r.membership_id,'requests:upload',r.category);
 if r.expires_at<=clock_timestamp() or q.expires_at<=clock_timestamp() then raise exception 'Portal request expired' using errcode='42501';end if;
 d:=public.legal_finalize_document(p_document_id,p_sha256);
 update public.legal_document_requests set status='submitted',updated_at=clock_timestamp() where id=q.id;
 perform public._legal_portal_event(r.case_id,r.membership_id,p_actor_id,'external_upload_received',jsonb_build_object('document_id',d.id,'request_id',r.id,'origin','authenticated_portal'));return jsonb_build_object('id',d.id,'status',d.status);
end;$$;
create or replace function public.legal_portal_service_abandon_upload(p_actor_id uuid,p_request_id uuid,p_document_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_portal_requests;d public.legal_case_documents;begin
 perform public._legal_portal_service();select * into r from public.legal_portal_requests where id=p_request_id;perform 1 from public.legal_document_requests where id=r.request_id for update;
 if not exists(select 1 from public.legal_portal_uploads where document_id=p_document_id and portal_request_id=r.id and identity_id=p_actor_id) then raise exception 'Upload provenance mismatch' using errcode='42501';end if;
 -- Cleanup is allowed after revocation, but only the service for the exact actor.
 select * into d from public.legal_case_documents where id=p_document_id for update;
 if d.status not in ('prepared','abandoned') then raise exception 'A received document cannot be removed by upload cleanup' using errcode='22023';end if;
 update public.legal_case_documents set status='abandoned' where id=d.id;
 update public.legal_document_requests set status='cancelled',updated_at=clock_timestamp() where id=r.request_id and document_id=p_document_id and status='uploading';
 perform public._legal_portal_event(r.case_id,r.membership_id,p_actor_id,'external_upload_abandoned',jsonb_build_object('document_id',p_document_id));return jsonb_build_object('cleanup_allowed',true,'storage_path',d.storage_path);
end;$$;

create table public.legal_communication_connections (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),provider text not null check(provider in ('resend','uazapi')),account_id text not null,channel text not null check(channel in ('email','whatsapp')),enabled boolean not null default false,configured_by uuid not null references public.profiles(id),configured_at timestamptz not null default now(),unique(provider,account_id),unique(tenant_id,channel),unique(id,tenant_id)
);
create unique index if not exists legal_events_id_case_tenant_uid on public.legal_case_events(id,case_id,tenant_id);
create table public.legal_communication_versions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,membership_id uuid not null,
 category text not null check(category in ('general','medical','fiscal')),channel text not null check(channel in ('portal','email','whatsapp')),
 title text not null check(length(btrim(title)) between 1 and 200),body text not null check(length(btrim(body)) between 1 and 6000),recipient text not null,
 contact_evidence_id uuid,origin_event_id uuid,previous_version_id uuid,expires_at timestamptz not null check(isfinite(expires_at)),state text not null default 'draft' check(state in ('draft','approved','cancelled','superseded')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),reviewed_by uuid references public.profiles(id),review_note text,reviewed_at timestamptz,
 unique(id,case_id,tenant_id),foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id),foreign key(contact_evidence_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id),foreign key(origin_event_id,case_id,tenant_id) references public.legal_case_events(id,case_id,tenant_id),foreign key(previous_version_id,case_id,tenant_id) references public.legal_communication_versions(id,case_id,tenant_id)
);
create table public.legal_communication_jobs (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,communication_id uuid not null unique,connection_id uuid,
 idempotency_key uuid not null unique,state text not null default 'queued' check(state in ('queued','sending','provider_accepted','delivered','read','failed','unknown','cancelled')),
 attempts integer not null default 0,lease_token uuid,lease_until timestamptz,provider_message_id text,error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(connection_id,provider_message_id),foreign key(communication_id,case_id,tenant_id) references public.legal_communication_versions(id,case_id,tenant_id),foreign key(connection_id,tenant_id) references public.legal_communication_connections(id,tenant_id)
);
create table public.legal_communication_receipts (
 id uuid primary key default gen_random_uuid(),job_id uuid references public.legal_communication_jobs(id),provider text not null,account_id text not null,event_id text not null,message_id text not null,
 status text not null check(status in ('delivered','read','failed')),occurred_at timestamptz not null check(isfinite(occurred_at)),payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),matched boolean not null,received_at timestamptz not null default clock_timestamp(),unique(provider,account_id,event_id)
);
create or replace function public.legal_create_communication(p_case_id uuid,p_payload jsonb) returns public.legal_communication_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_communication_versions;m public.legal_portal_memberships;d public.legal_case_documents;t uuid;begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('membership_id','category','channel','title','body','expires_at','previous_version_id','recipient_phone','contact_evidence_id','origin_event_id')) then raise exception 'Unsupported communication fields' using errcode='22023';end if;
 t:=public._legal_assert_operation(p_case_id,p_payload->>'category');r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.state:='draft';r.created_by:=auth.uid();r.created_at:=now();r:=jsonb_populate_record(r,p_payload-'recipient_phone');
 select * into m from public.legal_portal_memberships where id=r.membership_id and case_id=p_case_id;perform public._legal_portal_assert_member(m.identity_id,m.id,'messages:read',r.category);
 if r.expires_at<=clock_timestamp() or r.expires_at>m.expires_at then raise exception 'Communication validity must fit current grant' using errcode='22023';end if;
 r.recipient:=case when r.channel='whatsapp' then p_payload->>'recipient_phone' else m.verified_email end;
 if r.channel='whatsapp' then
  d:=public._ir4_ready_document(p_case_id,r.contact_evidence_id);if d.category<>'general' or coalesce(r.recipient,'') !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Phone requires E164 and separately reviewed general contact evidence' using errcode='22023';end if;
 end if;
 if r.channel<>'portal' then r.title:='Nova atualização no portal';r.body:='Há uma atualização disponível no portal do seu atendimento. Acesse sua conta para consultar.';end if;
 if r.previous_version_id is not null and not exists(select 1 from public.legal_communication_versions where id=r.previous_version_id and membership_id=m.id and category=r.category) then raise exception 'Revised message must preserve recipient/category' using errcode='22023';end if;
 insert into public.legal_communication_versions values(r.*) returning * into r;return r;
end;$$;
create or replace function public.legal_review_communication(p_version_id uuid,p_decision text,p_note text) returns public.legal_communication_versions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_communication_versions;m public.legal_portal_memberships;begin
 select * into r from public.legal_communication_versions where id=p_version_id;perform public._legal_assert_operation(r.case_id,r.category,true);select * into r from public.legal_communication_versions where id=p_version_id for update;
 if coalesce(p_decision,'') not in ('approved','cancelled') or length(btrim(coalesce(p_note,''))) not between 1 and 4000 or (p_decision='approved' and r.state<>'draft') then raise exception 'Explicit immutable communication review required' using errcode='22023';end if;
 if p_decision='approved' then select * into m from public.legal_portal_memberships where id=r.membership_id;perform public._legal_portal_assert_member(m.identity_id,m.id,'messages:read',r.category);
  if r.expires_at<=clock_timestamp() or (r.channel='email' and r.recipient<>m.verified_email) then raise exception 'Communication contact or validity changed' using errcode='22023';end if;
  if r.previous_version_id is not null then update public.legal_communication_versions set state='superseded' where id=r.previous_version_id;update public.legal_communication_jobs set state='cancelled',updated_at=clock_timestamp() where communication_id=r.previous_version_id and state='queued';end if;
 else update public.legal_communication_jobs set state='cancelled',updated_at=clock_timestamp() where communication_id=r.id and state='queued';end if;
 update public.legal_communication_versions set state=p_decision,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=p_note where id=r.id returning * into r;
 perform public._legal_portal_event(r.case_id,r.membership_id,auth.uid(),'communication_reviewed',jsonb_build_object('communication_id',r.id,'decision',p_decision));return r;
end;$$;
create or replace function public.legal_queue_communication(p_version_id uuid,p_idempotency_key uuid) returns public.legal_communication_jobs language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_communication_versions;m public.legal_portal_memberships;j public.legal_communication_jobs;c uuid;begin
 select * into r from public.legal_communication_versions where id=p_version_id;perform public._legal_assert_operation(r.case_id,r.category,true);select * into r from public.legal_communication_versions where id=p_version_id;
 select * into m from public.legal_portal_memberships where id=r.membership_id;perform public._legal_portal_assert_member(m.identity_id,m.id,'messages:read',r.category);
 if r.state<>'approved' or r.expires_at<=clock_timestamp() then raise exception 'Current approved communication required' using errcode='22023';end if;
 select * into j from public.legal_communication_jobs where communication_id=r.id or idempotency_key=p_idempotency_key;
 if found then if j.communication_id<>r.id then raise exception 'Communication key mismatch' using errcode='22023';end if;return j;end if;
 if r.channel<>'portal' then select id into c from public.legal_communication_connections where tenant_id=r.tenant_id and channel=r.channel and enabled;if c is null then raise exception 'Communication provider not configured for this office' using errcode='22023';end if;end if;
 insert into public.legal_communication_jobs(tenant_id,case_id,communication_id,connection_id,idempotency_key,state) values(r.tenant_id,r.case_id,r.id,c,p_idempotency_key,case when r.channel='portal' then 'delivered' else 'queued' end) returning * into j;return j;
end;$$;
create or replace function public.legal_communication_service_configure(p_staff_id uuid,p_provider text,p_account_id text,p_channel text,p_enabled boolean,p_expected_tenant_id uuid default null) returns public.legal_communication_connections language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid;r public.legal_communication_connections;begin
 perform public._legal_portal_service();select tenant_id into t from public.profiles where id=p_staff_id and status='active' and role='admin';
 if t is null or p_expected_tenant_id is distinct from t or length(btrim(coalesce(p_account_id,''))) not between 1 and 200 or (p_provider,p_channel) not in (('resend','email'),('uazapi','whatsapp')) then raise exception 'Office administrator and verified channel account required' using errcode='42501';end if;
 insert into public.legal_communication_connections(tenant_id,provider,account_id,channel,enabled,configured_by) values(t,p_provider,p_account_id,p_channel,p_enabled,p_staff_id) on conflict(tenant_id,channel) do update set enabled=excluded.enabled,configured_by=excluded.configured_by,configured_at=clock_timestamp() where legal_communication_connections.provider=excluded.provider and legal_communication_connections.account_id=excluded.account_id returning * into r;
 if r.id is null then raise exception 'Changing provider account requires independent reconciliation' using errcode='22023';end if;return r;
end;$$;
create or replace function public.legal_communication_service_claim(p_provider text,p_account_id text,p_limit integer default 10,p_expected_tenant_id uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.legal_communication_jobs;c public.legal_communication_connections;r public.legal_communication_versions;m public.legal_portal_memberships;result jsonb:='[]';begin
 perform public._legal_portal_service();select * into c from public.legal_communication_connections where provider=p_provider and account_id=p_account_id and enabled;
 if not found or c.tenant_id is distinct from p_expected_tenant_id then return result;end if;
 -- A lost lease is ambiguous; never blindly repeat a potentially accepted send.
 for j in select * from public.legal_communication_jobs where connection_id=c.id and (state='queued' or (state='sending' and lease_until<=clock_timestamp())) order by created_at,id limit greatest(1,least(p_limit,50)) loop
  perform 1 from public.legal_cases where id=j.case_id for update;
  select * into j from public.legal_communication_jobs where id=j.id and (state='queued' or (state='sending' and lease_until<=clock_timestamp())) for update skip locked;
  if not found then continue;end if;
  if j.state='sending' then update public.legal_communication_jobs set state='unknown',error_code='lease_expired',updated_at=clock_timestamp() where id=j.id;continue;end if;
  select * into c from public.legal_communication_connections where id=j.connection_id and enabled and tenant_id=p_expected_tenant_id;
  if not found then return result;end if;
  select * into r from public.legal_communication_versions where id=j.communication_id;select * into m from public.legal_portal_memberships where id=r.membership_id;
  begin
   perform public._legal_portal_assert_member(m.identity_id,m.id,'messages:read',r.category);select * into r from public.legal_communication_versions where id=j.communication_id;
   if r.state<>'approved' or r.expires_at<=clock_timestamp() or not public._legal_actor_can_edit(r.case_id,r.reviewed_by,r.category) or (r.channel='email' and r.recipient<>m.verified_email) then raise exception 'Grant or approval expired' using errcode='42501';end if;
  exception when sqlstate '42501' then update public.legal_communication_jobs set state='cancelled',error_code='authorization_revoked',updated_at=clock_timestamp() where id=j.id;continue;end;
  update public.legal_communication_jobs set state='sending',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() where id=j.id returning * into j;
  result:=result||jsonb_build_array(jsonb_build_object('job_id',j.id,'lease_token',j.lease_token,'communication_id',r.id,'channel',r.channel,'recipient',r.recipient,'subject',r.title,'body',r.body,'idempotency_key',j.idempotency_key));
 end loop;return result;
end;$$;
create or replace function public.legal_communication_service_complete(p_job_id uuid,p_lease_token uuid,p_status text,p_provider_message_id text default null,p_error_code text default null) returns public.legal_communication_jobs language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.legal_communication_jobs;c public.legal_communication_connections;begin
 perform public._legal_portal_service();select * into j from public.legal_communication_jobs where id=p_job_id;select * into c from public.legal_communication_connections where id=j.connection_id;
 if p_provider_message_id is not null then perform pg_advisory_xact_lock(hashtextextended('legal_comm_message:'||c.provider||':'||c.account_id||':'||p_provider_message_id,0));end if;
 select * into j from public.legal_communication_jobs where id=p_job_id for update;
 if not found or j.lease_token is distinct from p_lease_token or coalesce(p_status,'') not in ('provider_accepted','failed','unknown') or (p_status='provider_accepted' and length(btrim(coalesce(p_provider_message_id,'')))=0) then raise exception 'Invalid communication lease/result' using errcode='22023';end if;
 if j.state in ('delivered','read','provider_accepted') then return j;end if;
 if j.state not in ('sending','unknown') then raise exception 'Communication attempt already finalized' using errcode='22023';end if;
 update public.legal_communication_jobs set state=p_status,provider_message_id=p_provider_message_id,error_code=left(p_error_code,200),lease_until=null,updated_at=clock_timestamp() where id=j.id returning * into j;
 if p_status='provider_accepted' then
  update public.legal_communication_receipts set job_id=j.id,matched=true where provider=c.provider and account_id=c.account_id and message_id=p_provider_message_id and job_id is null;
  update public.legal_communication_jobs set state=case when exists(select 1 from public.legal_communication_receipts where job_id=j.id and status='read') then 'read' when exists(select 1 from public.legal_communication_receipts where job_id=j.id and status='delivered') then 'delivered' when exists(select 1 from public.legal_communication_receipts where job_id=j.id and status='failed') then 'failed' else state end where id=j.id returning * into j;
 end if;return j;
end;$$;
create or replace function public.legal_communication_service_receipt(p_provider text,p_account_id text,p_event_id text,p_message_id text,p_status text,p_occurred_at timestamptz,p_payload_hash text,p_expected_tenant_id uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.legal_communication_jobs;r public.legal_communication_receipts;begin
 perform public._legal_portal_service();
 if p_expected_tenant_id is null or not exists(select 1 from public.legal_communication_connections where provider=p_provider and account_id=p_account_id and tenant_id=p_expected_tenant_id) then raise exception 'Provider account/office mismatch' using errcode='42501';end if;
 if coalesce(p_status,'') not in ('delivered','read','failed') or p_occurred_at>clock_timestamp()+interval '5 minutes' then raise exception 'Invalid authenticated provider event' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('legal_comm_receipt:'||p_provider||':'||p_account_id||':'||p_event_id,0));
 perform pg_advisory_xact_lock(hashtextextended('legal_comm_message:'||p_provider||':'||p_account_id||':'||p_message_id,0));
 select * into r from public.legal_communication_receipts where provider=p_provider and account_id=p_account_id and event_id=p_event_id;
 if found then if r.payload_hash is distinct from p_payload_hash then raise exception 'Provider event identity reused with different payload' using errcode='22023';end if;return jsonb_build_object('id',r.id,'status',r.status,'matched',r.matched);end if;
 select q.* into j from public.legal_communication_jobs q join public.legal_communication_connections c on c.id=q.connection_id where c.provider=p_provider and c.account_id=p_account_id and q.provider_message_id=p_message_id for update of q;
 insert into public.legal_communication_receipts(job_id,provider,account_id,event_id,message_id,status,occurred_at,payload_hash,matched) values(j.id,p_provider,p_account_id,p_event_id,p_message_id,p_status,p_occurred_at,p_payload_hash,j.id is not null) returning * into r;
 if j.id is not null then
  update public.legal_communication_jobs set state=case when exists(select 1 from public.legal_communication_receipts where job_id=j.id and status='read') then 'read' when exists(select 1 from public.legal_communication_receipts where job_id=j.id and status='delivered') then 'delivered' else 'failed' end,updated_at=clock_timestamp() where id=j.id;
 end if;return jsonb_build_object('id',r.id,'status',r.status,'matched',r.matched);
end;$$;

create table public.legal_followup_rules (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,source_id uuid,
 title text not null check(length(btrim(title)) between 1 and 200),purpose text not null check(length(btrim(purpose)) between 1 and 2000),
 assignee_id uuid not null,substitute_id uuid,cadence text not null check(cadence in ('annual','once')),next_occurrence date not null check(isfinite(next_occurrence)),
 valid_until date check(valid_until is null or isfinite(valid_until)),timezone text not null default 'America/Sao_Paulo' check(timezone='America/Sao_Paulo'),state text not null default 'active' check(state in ('active','paused')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,case_id,tenant_id),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id),foreign key(source_id,case_id,tenant_id) references public.ir_income_sources(id,case_id,tenant_id),foreign key(assignee_id,tenant_id) references public.profiles(id,tenant_id),foreign key(substitute_id,tenant_id) references public.profiles(id,tenant_id)
);
create table public.legal_followup_occurrences (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,rule_id uuid not null,occurrence_on date not null,task_id uuid not null,
 created_at timestamptz not null default now(),unique(rule_id,occurrence_on),foreign key(rule_id,case_id,tenant_id) references public.legal_followup_rules(id,case_id,tenant_id),foreign key(task_id,case_id,tenant_id) references public.legal_case_tasks(id,case_id,tenant_id)
);
create or replace function public._legal_portal_valid_assignee(p_case_id uuid,p_profile_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.legal_cases c join public.profiles p on p.id=p_profile_id and p.tenant_id=c.tenant_id and p.status='active' where c.id=p_case_id and (c.owner_id=p.id or exists(select 1 from public.legal_case_members m where m.case_id=c.id and m.profile_id=p.id)));
$$;
create or replace function public.legal_save_followup_rule(p_case_id uuid,p_payload jsonb,p_rule_id uuid default null) returns public.legal_followup_rules language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_followup_rules;t uuid:=public._legal_assert_operation(p_case_id,'fiscal');begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('title','purpose','source_id','assignee_id','substitute_id','next_occurrence','cadence','state','valid_until')) then raise exception 'Unsupported follow-up fields' using errcode='22023';end if;
 if p_rule_id is not null then select * into r from public.legal_followup_rules where id=p_rule_id and case_id=p_case_id for update;if not found then raise exception 'Follow-up unavailable' using errcode='42501';end if;
 else r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.state:='active';r.timezone:='America/Sao_Paulo';r.created_by:=auth.uid();r.created_at:=now();end if;
 r:=jsonb_populate_record(r,p_payload);r.updated_at:=clock_timestamp();r.next_occurrence:=public._ir4_date(coalesce(p_payload->>'next_occurrence',r.next_occurrence::text));
 if p_payload ? 'valid_until' then r.valid_until:=case when p_payload->>'valid_until' is null then null else public._ir4_date(p_payload->>'valid_until') end;end if;
 if not public._legal_portal_valid_assignee(p_case_id,r.assignee_id) or (r.substitute_id is not null and (r.substitute_id=r.assignee_id or not public._legal_portal_valid_assignee(p_case_id,r.substitute_id))) then raise exception 'Active same-case assignee/substitute required' using errcode='22023';end if;
 insert into public.legal_followup_rules values(r.*) on conflict(id) do update set title=excluded.title,purpose=excluded.purpose,source_id=excluded.source_id,assignee_id=excluded.assignee_id,substitute_id=excluded.substitute_id,next_occurrence=excluded.next_occurrence,cadence=excluded.cadence,state=excluded.state,valid_until=excluded.valid_until,updated_at=excluded.updated_at returning * into r;
 perform public._legal_portal_event(p_case_id,null,auth.uid(),'followup_rule_changed',jsonb_build_object('rule_id',r.id));return r;
end;$$;
create or replace function public._legal_portal_run_followups(p_case_id uuid,p_actor_id uuid) returns integer language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_followup_rules;t public.legal_case_tasks;n integer:=0;begin
 perform 1 from public.legal_cases where id=p_case_id for update;
 if not exists(select 1 from public.legal_cases c join public.legal_workspace_features w on w.tenant_id=c.tenant_id and w.enabled where c.id=p_case_id and c.status<>'encerrado') then return 0;end if;
 for r in select * from public.legal_followup_rules where case_id=p_case_id and state='active' and next_occurrence<=public._ir4_today() and (valid_until is null or next_occurrence<=valid_until) order by next_occurrence,id for update loop
  if not public._legal_portal_valid_assignee(p_case_id,r.assignee_id) or (r.substitute_id is not null and not public._legal_portal_valid_assignee(p_case_id,r.substitute_id)) or not public._legal_actor_can_edit(p_case_id,r.created_by,'fiscal') then continue;end if;
  if not exists(select 1 from public.legal_followup_occurrences where rule_id=r.id and occurrence_on=r.next_occurrence) then
   insert into public.legal_case_tasks(tenant_id,case_id,title,notes,assignee_id,substitute_id,due_at,created_by) values(r.tenant_id,r.case_id,'Revisar acompanhamento anual','Conferir documentação e retenção. Esta rotina não revalida laudo, poderes ou direito.',r.assignee_id,r.substitute_id,r.next_occurrence::timestamp at time zone r.timezone,r.created_by) returning * into t;
   insert into public.legal_followup_occurrences(tenant_id,case_id,rule_id,occurrence_on,task_id) values(r.tenant_id,r.case_id,r.id,r.next_occurrence,t.id);n:=n+1;
   perform public._legal_portal_event(r.case_id,null,p_actor_id,'followup_task_created',jsonb_build_object('rule_id',r.id,'task_id',t.id));
  end if;
  update public.legal_followup_rules set next_occurrence=case when cadence='annual' then (next_occurrence+interval '1 year')::date else next_occurrence end,state=case when cadence='once' then 'paused' else state end,updated_at=clock_timestamp() where id=r.id;
 end loop;return n;
end;$$;
create or replace function public.legal_run_followups(p_case_id uuid) returns integer language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin perform public._legal_assert_operation(p_case_id,'fiscal');return public._legal_portal_run_followups(p_case_id,auth.uid());end;$$;
create or replace function public.legal_portal_service_run_followups(p_limit integer default 100) returns integer language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare r record;n integer:=0;begin
 perform public._legal_portal_service();for r in select distinct x.case_id,c.owner_id from public.legal_followup_rules x join public.legal_cases c on c.id=x.case_id where x.state='active' and x.next_occurrence<=public._ir4_today() order by x.case_id limit greatest(1,least(p_limit,500)) loop n:=n+public._legal_portal_run_followups(r.case_id,r.owner_id);end loop;return n;
end;$$;

create or replace function public._legal_portal_member_projection(p_member public.legal_portal_memberships) returns jsonb language sql immutable as $$
 select jsonb_build_object('id',p_member.id,'case_id',p_member.case_id,'access_kind',p_member.access_kind,'scopes',p_member.scopes,'allow_medical',p_member.allow_medical,'allow_fiscal',p_member.allow_fiscal,'revision',p_member.revision,'expires_at',p_member.expires_at,'public_title',p_member.public_title);
$$;
create or replace function public.legal_portal_service_context(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare i public.legal_portal_identities;m public.legal_portal_memberships;result jsonb:='[]';begin
 perform public._legal_portal_service();select x.* into i from public.legal_portal_identities x join auth.users u on u.id=x.id where x.id=p_actor_id and u.role='legal_portal' and u.raw_app_meta_data->>'legal_portal'='true' and lower(u.email)=x.email and x.state<>'suspended' and not exists(select 1 from public.profiles p where p.id=x.id);
 if not found then raise exception 'External identity unavailable' using errcode='42501';end if;
 for m in select * from public.legal_portal_memberships where identity_id=p_actor_id order by case_id,id loop
  begin m:=public._legal_portal_assert_member(p_actor_id,m.id,null,case when m.access_kind='accountant' then 'fiscal' else 'general' end);exception when sqlstate '42501' then continue;end;
  result:=result||jsonb_build_array(public._legal_portal_member_projection(m));
 end loop;return jsonb_build_object('identity_id',i.id,'status',i.state,'memberships',result);
end;$$;
create or replace function public.legal_portal_service_cases(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin return public.legal_portal_service_context(p_actor_id)->'memberships';end;$$;
create or replace function public.legal_portal_service_requests(p_actor_id uuid,p_membership_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.legal_portal_memberships;begin
 perform public._legal_portal_service();select * into m from public.legal_portal_memberships where id=p_membership_id;m:=public._legal_portal_assert_member(p_actor_id,m.id,'requests:upload',case when m.access_kind='accountant' then 'fiscal' else 'general' end);
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'category',r.category,'title',r.title,'instructions',r.instructions,'due_at',r.due_at,'expires_at',r.expires_at,'status',q.status,'document_id',q.document_id) order by r.created_at,r.id) from public.legal_portal_requests r join public.legal_document_requests q on q.id=r.request_id where r.membership_id=m.id and public._legal_portal_category(m,r.category)),'[]');
end;$$;
create or replace function public.legal_portal_service_case(p_actor_id uuid,p_membership_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.legal_portal_memberships;begin
 perform public._legal_portal_service();select * into m from public.legal_portal_memberships where id=p_membership_id;m:=public._legal_portal_assert_member(p_actor_id,m.id,null,case when m.access_kind='accountant' then 'fiscal' else 'general' end);
 return jsonb_build_object('membership',public._legal_portal_member_projection(m),
 'publications',case when 'case_summary:read'=any(m.scopes) then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'category',p.category,'publication_kind',p.publication_kind,'title',p.title,'body',p.body,'created_at',p.created_at,'reviewed_at',p.reviewed_at) order by p.reviewed_at,p.id) from public.legal_portal_publications p where p.membership_id=m.id and p.state='approved' and p.publication_kind<>'agenda' and public._legal_portal_category(m,p.category)),'[]') else '[]'::jsonb end,
 'agenda',case when 'agenda:read'=any(m.scopes) then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'category',p.category,'title',p.title,'body',p.body,'starts_at',p.starts_at,'ends_at',p.ends_at,'reviewed_at',p.reviewed_at) order by p.starts_at,p.id) from public.legal_portal_publications p where p.membership_id=m.id and p.state='approved' and p.publication_kind='agenda' and public._legal_portal_category(m,p.category)),'[]') else '[]'::jsonb end,
 'documents',case when 'documents:read'=any(m.scopes) then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'document_id',d.id,'category',r.category,'display_name',d.display_name,'file_name',d.file_name,'mime_type',d.mime_type,'size_bytes',d.size_bytes,'sha256',d.sha256,'purpose',r.purpose,'expires_at',r.expires_at) order by r.created_at,r.id) from public.legal_portal_document_releases r join public.legal_case_documents d on d.id=r.document_id where r.membership_id=m.id and r.state='approved' and r.expires_at>clock_timestamp() and d.status='ready' and d.sha256=r.document_hash and public._legal_portal_category(m,r.category)),'[]') else '[]'::jsonb end,
 'requests',case when 'requests:upload'=any(m.scopes) then public.legal_portal_service_requests(p_actor_id,m.id) else '[]'::jsonb end,
 'messages',case when 'messages:read'=any(m.scopes) then coalesce((select jsonb_agg(x.item order by x.created_at,x.id) from (
 select p.id,p.created_at,jsonb_build_object('id',p.id,'category',p.category,'body',p.body,'direction','client','created_at',p.created_at) item from public.legal_portal_messages p where p.membership_id=m.id and public._legal_portal_category(m,p.category)
 union all select c.id,c.created_at,jsonb_build_object('id',c.id,'category',c.category,'body',c.body,'direction','office','created_at',c.created_at) from public.legal_communication_versions c where c.membership_id=m.id and c.channel='portal' and c.state='approved' and c.expires_at>clock_timestamp() and public._legal_portal_category(m,c.category) and exists(select 1 from public.legal_communication_jobs j where j.communication_id=c.id and j.state in ('delivered','read'))) x),'[]') else '[]'::jsonb end,
 'exports',case when 'fiscal_exports:read'=any(m.scopes) and m.allow_fiscal then coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'reviewed_at',e.reviewed_at) order by e.created_at,e.id) from public.legal_portal_export_versions e where e.membership_id=m.id and e.state='approved'),'[]') else '[]'::jsonb end);
end;$$;
create or replace function public.legal_portal_service_reply(p_actor_id uuid,p_membership_id uuid,p_category text,p_body text,p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.legal_portal_memberships;r public.legal_portal_messages;begin
 perform public._legal_portal_service();m:=public._legal_portal_assert_member(p_actor_id,p_membership_id,'messages:write',p_category);
 select * into r from public.legal_portal_messages where identity_id=p_actor_id and idempotency_key=p_idempotency_key;
 if found then if r.membership_id<>m.id or r.category<>p_category or r.body<>p_body then raise exception 'Reply idempotency payload mismatch' using errcode='22023';end if;
 else insert into public.legal_portal_messages(tenant_id,case_id,membership_id,category,body,identity_id,idempotency_key) values(m.tenant_id,m.case_id,m.id,p_category,p_body,p_actor_id,p_idempotency_key) returning * into r;perform public._legal_portal_event(m.case_id,m.id,p_actor_id,'client_reply',jsonb_build_object('message_id',r.id));end if;
 return jsonb_build_object('id',r.id,'category',r.category,'body',r.body,'created_at',r.created_at);
end;$$;
create or replace function public.legal_portal_service_acknowledge(p_actor_id uuid,p_publication_id uuid,p_membership_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare p public.legal_portal_publications;m public.legal_portal_memberships;r public.legal_portal_acknowledgements;begin
 perform public._legal_portal_service();select * into p from public.legal_portal_publications where id=p_publication_id and membership_id=p_membership_id;
 m:=public._legal_portal_assert_member(p_actor_id,p_membership_id,case when p.publication_kind='agenda' then 'agenda:read' else 'case_summary:read' end,p.category);select * into p from public.legal_portal_publications where id=p_publication_id and membership_id=m.id and state='approved';
 if not found then raise exception 'Published version unavailable' using errcode='42501';end if;
 insert into public.legal_portal_acknowledgements(tenant_id,case_id,membership_id,publication_id,identity_id) values(m.tenant_id,m.case_id,m.id,p.id,p_actor_id) on conflict(membership_id,publication_id) do nothing;
 select * into r from public.legal_portal_acknowledgements where membership_id=m.id and publication_id=p.id;
 return jsonb_build_object('id',r.id,'acknowledged_at',r.acknowledged_at);
end;$$;
create or replace function public.legal_portal_service_statements(p_actor_id uuid,p_membership_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 perform public._legal_portal_service();perform public._legal_portal_assert_member(p_actor_id,p_membership_id,'statements:read','fiscal');return '[]'::jsonb;
end;$$;

create or replace function public.legal_client_care_context(p_case_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare manage boolean;begin
 if not public.legal_can_access_case(p_case_id) then raise exception 'Case access denied' using errcode='42501';end if;manage:=public.legal_portal_can_manage(p_case_id);
 return jsonb_build_object(
 'connections',coalesce((select jsonb_agg(jsonb_build_object('channel',x.channel,'provider',x.provider,'enabled',x.enabled) order by x.channel) from public.legal_communication_connections x where tenant_id=public.legal_actual_tenant()),'[]'),
 'invites',case when manage then coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from public.legal_portal_invites x where case_id=p_case_id),'[]') else '[]'::jsonb end,
 'memberships',coalesce((select jsonb_agg(case when manage then to_jsonb(x) else public._legal_portal_member_projection(x)||jsonb_build_object('state',x.state) end order by created_at,id) from public.legal_portal_memberships x where case_id=p_case_id),'[]'),
 'representation_grants',case when manage then coalesce((select jsonb_agg(to_jsonb(x) order by approved_at,id) from public.legal_portal_representation_grants x where case_id=p_case_id),'[]') else '[]'::jsonb end,
 'publications',coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from public.legal_portal_publications x where case_id=p_case_id and public.legal_can_access_category(case_id,category)),'[]'),
 'releases',coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from public.legal_portal_document_releases x where case_id=p_case_id and public.legal_can_access_category(case_id,category)),'[]'),
 'exports',coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from public.legal_portal_export_versions x where case_id=p_case_id and public.legal_can_access_category(case_id,'fiscal')),'[]'),
 'requests',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('status',q.status,'document_id',q.document_id) order by x.created_at,x.id) from public.legal_portal_requests x join public.legal_document_requests q on q.id=x.request_id where x.case_id=p_case_id and public.legal_can_access_category(x.case_id,x.category)),'[]'),
 'communications',coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from public.legal_communication_versions x where case_id=p_case_id and public.legal_can_access_category(case_id,category)),'[]'),
 'jobs',coalesce((select jsonb_agg(to_jsonb(x)-array['lease_token'] order by x.created_at,x.id) from public.legal_communication_jobs x join public.legal_communication_versions c on c.id=x.communication_id where x.case_id=p_case_id and public.legal_can_access_category(c.case_id,c.category)),'[]'),
 'receipts',coalesce((select jsonb_agg(to_jsonb(x)-array['payload_hash','account_id'] order by x.received_at,x.id) from public.legal_communication_receipts x join public.legal_communication_jobs j on j.id=x.job_id join public.legal_communication_versions c on c.id=j.communication_id where c.case_id=p_case_id and public.legal_can_access_category(c.case_id,c.category)),'[]'),
 'messages',coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from public.legal_portal_messages x where case_id=p_case_id and public.legal_can_access_category(case_id,category)),'[]'),
 'followup_rules',coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from public.legal_followup_rules x where case_id=p_case_id and public.legal_can_access_category(case_id,'fiscal')),'[]'));
end;$$;
create or replace function public.legal_my_day(p_from timestamptz,p_until timestamptz,p_limit integer default 50,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;begin
 if public.legal_actual_tenant() is null or not public.legal_feature_enabled() then raise exception 'Active legal workspace required' using errcode='42501';end if;
 if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until) or p_until<=p_from or p_limit not between 1 and 100 or p_offset not between 0 and 100000 then raise exception 'Invalid work queue range or pagination' using errcode='22023';end if;
 with items as (
 select id,case_id,'task'::text kind,title,due_at,status,assignee_id,id source_id from public.legal_case_tasks where public.legal_can_access_case(case_id) and status='open' and (assignee_id=auth.uid() or substitute_id=auth.uid())
 union all select id,case_id,'appointment',title,starts_at,status,assignee_id,id from public.legal_appointments where public.legal_can_access_case(case_id) and status='scheduled' and (assignee_id=auth.uid() or substitute_id=auth.uid())
 union all select r.id,r.case_id,'waiting_client',r.title,r.due_at,q.status,r.created_by,r.id from public.legal_portal_requests r join public.legal_document_requests q on q.id=r.request_id where public.legal_can_access_category(r.case_id,r.category) and q.status in ('open','submitted','uploading') and r.created_by=auth.uid()
 union all select r.id,r.case_id,'withholding_reopened','Retenção retomada: conferir documentação',null::timestamptz,r.status,r.reviewer_id,r.id from public.ir_cessation_records r where public.legal_can_access_category(r.case_id,'fiscal') and r.reviewer_id=auth.uid() and r.status='reopened' and not exists(select 1 from public.ir_cessation_records newer where newer.source_id=r.source_id and (newer.observed_on,newer.created_at,newer.id)>(r.observed_on,r.created_at,r.id))
 union all select j.id,j.case_id,'communication','Revisar estado da comunicação',j.updated_at,j.state,c.reviewed_by,c.id from public.legal_communication_jobs j join public.legal_communication_versions c on c.id=j.communication_id where public.legal_can_access_category(c.case_id,c.category) and j.state in ('failed','unknown') and c.reviewed_by=auth.uid()
 ),page as(select * from items where due_at is null or (due_at>=p_from and due_at<p_until) order by due_at nulls last,id limit p_limit+1 offset p_offset)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by due_at nulls last,id) from (select * from page limit p_limit) x),'[]'),'has_more',(select count(*)>p_limit from page)) into result;return result;
end;$$;


-- An individual portal request cannot be downgraded to F2 bearer collection.
create or replace function public.legal_issue_document_request_token(p_request_id uuid,p_token_hash text,p_expires_at timestamptz)
returns public.legal_document_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 select * into r from public.legal_document_requests where id=p_request_id for update;
 if exists(select 1 from public.legal_portal_requests where request_id=r.id) then raise exception 'Individual portal request requires authenticated portal access' using errcode='42501';end if;
 if not found then raise exception 'Request access denied' using errcode='42501'; end if;
 perform public._legal_assert_operation(r.case_id,r.category);
 if r.status not in ('open','rejected') or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '7 days' or coalesce(p_token_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid request link or expiry' using errcode='22023'; end if;
 if not public._ir_representation_allows(r.representation_id,r.case_id) then raise exception 'Representation no longer authorizes this collection' using errcode='42501';end if;
 if r.representation_id is not null then p_expires_at:=least(p_expires_at,(select valid_until from public.legal_representations where id=r.representation_id));end if;
 -- The active issuer becomes the responsible actor for the delegated upload.
 insert into public.legal_document_request_tokens(request_id,token_hash) values(r.id,p_token_hash)
 on conflict(request_id) do update set token_hash=excluded.token_hash,created_at=now();
 update public.legal_document_requests set created_by=auth.uid(),status='open',document_id=null,expires_at=p_expires_at,used_at=null,updated_at=now() where id=r.id returning * into r;
 perform public._legal_record_event(r.case_id,'document_request_updated','Link de coleta renovado.',jsonb_build_object('request_id',r.id));return r;
end;$$;
create or replace function public.legal_public_document_request(p_token_hash text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service operation only' using errcode='42501'; end if;
 select d.* into r from public.legal_document_requests d join public.legal_document_request_tokens t on t.request_id=d.id where t.token_hash=p_token_hash;
 if exists(select 1 from public.legal_portal_requests where request_id=r.id) then raise exception 'Individual portal request requires authenticated portal access' using errcode='42501';end if;
 if not found or r.status<>'open' or r.used_at is not null or r.expires_at is null or r.expires_at<=clock_timestamp() or not public._legal_actor_can_edit(r.case_id,r.created_by,r.category) or not public._ir_representation_allows(r.representation_id,r.case_id) then raise exception 'Invalid or expired document link' using errcode='42501'; end if;
 return jsonb_build_object('id',r.id,'title','Envio de documento','expires_at',r.expires_at,'max_bytes',10485760);
end;$$;
create or replace function public.legal_public_prepare_request_upload(p_token_hash text,p_file_name text,p_mime_type text,p_size_bytes bigint)
returns public.legal_case_documents language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;d public.legal_case_documents;i uuid:=gen_random_uuid();
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service operation only' using errcode='42501'; end if;
 select q.* into r from public.legal_document_requests q join public.legal_document_request_tokens t on t.request_id=q.id where t.token_hash=p_token_hash for update of q;
 if exists(select 1 from public.legal_portal_requests where request_id=r.id) then raise exception 'Individual portal request requires authenticated portal access' using errcode='42501';end if;
 if not found then raise exception 'Invalid document link' using errcode='42501'; end if;
 if (select token_hash from public.legal_document_request_tokens where request_id=r.id) is distinct from p_token_hash then raise exception 'Document link was rotated' using errcode='42501'; end if;
 perform 1 from public.legal_cases where id=r.case_id for update;
 if r.status<>'open' or r.used_at is not null or r.expires_at is null or r.expires_at<=clock_timestamp() or not public._legal_actor_can_edit(r.case_id,r.created_by,r.category) or not public._ir_representation_allows(r.representation_id,r.case_id) then raise exception 'Invalid or expired document link' using errcode='42501'; end if;
 if p_size_bytes is null or p_size_bytes not between 1 and 10485760 or (select coalesce(sum(size_bytes),0) from public.legal_case_documents where case_id=r.case_id and status in ('prepared','ready'))+p_size_bytes>209715200 then raise exception 'Document quota exceeded' using errcode='22023'; end if;
 if p_mime_type not in ('application/pdf','image/jpeg','image/png','text/plain','text/csv') then raise exception 'Unsupported legal document MIME' using errcode='23514';end if;
 insert into public.legal_case_documents(id,tenant_id,case_id,category,display_name,file_name,mime_type,size_bytes,storage_path,uploaded_by)
 values(i,r.tenant_id,r.case_id,r.category,r.title,btrim(p_file_name),p_mime_type,p_size_bytes,r.tenant_id::text||'/'||r.case_id::text||'/'||i::text,r.created_by) returning * into d;
 update public.legal_document_requests set status='uploading',document_id=i,used_at=now(),updated_at=now() where id=r.id;
 insert into public.legal_case_events(tenant_id,case_id,actor_id,event_type,description,metadata)
 values(r.tenant_id,r.case_id,r.created_by,'document_prepared','Documento recebido pelo link de coleta; processamento iniciado.',jsonb_build_object('request_id',r.id,'document_id',i,'origin','public_request'));
 return d;
end;$$;
create or replace function public.legal_public_finalize_request_upload(p_token_hash text,p_document_id uuid,p_sha256 text)
returns public.legal_document_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service operation only' using errcode='42501'; end if;
 select q.* into r from public.legal_document_requests q join public.legal_document_request_tokens t on t.request_id=q.id where t.token_hash=p_token_hash for update of q;
 if exists(select 1 from public.legal_portal_requests where request_id=r.id) then raise exception 'Individual portal request requires authenticated portal access' using errcode='42501';end if;
 if not found or r.document_id is distinct from p_document_id or r.status not in ('uploading','submitted') or r.expires_at is null or r.expires_at<=clock_timestamp() then raise exception 'Upload request expired or cancelled' using errcode='42501'; end if;
 if (select token_hash from public.legal_document_request_tokens where request_id=r.id) is distinct from p_token_hash then raise exception 'Document link was rotated' using errcode='42501'; end if;
 perform public.legal_finalize_document(p_document_id,p_sha256);
 -- Finalizer holds the case lock: a concurrent representation revocation is
 -- now visible; failure rolls back document finalization and its audit too.
 if r.expires_at<=clock_timestamp() or not public._ir_representation_allows(r.representation_id,r.case_id) then raise exception 'Link expired or representation no longer authorizes this collection' using errcode='42501';end if;
 if r.status='submitted' then return r; end if;
 update public.legal_document_requests set status='submitted',updated_at=now() where id=r.id returning * into r;
 insert into public.legal_case_events(tenant_id,case_id,actor_id,event_type,description,metadata)
 values(r.tenant_id,r.case_id,r.created_by,'document_request_updated','Documento enviado pelo link de coleta.',jsonb_build_object('request_id',r.id,'document_id',p_document_id,'origin','public_request'));
 return r;
end;$$;
create or replace function public.legal_public_abandon_request_upload(p_token_hash text,p_document_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_document_requests;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service operation only' using errcode='42501'; end if;
 select q.* into r from public.legal_document_requests q join public.legal_document_request_tokens t on t.request_id=q.id where t.token_hash=p_token_hash for update of q;
 if exists(select 1 from public.legal_portal_requests where request_id=r.id) then raise exception 'Individual portal request requires authenticated portal access' using errcode='42501';end if;
 if not found or r.document_id is distinct from p_document_id or r.status not in ('uploading','cancelled') then raise exception 'Upload cleanup denied' using errcode='42501'; end if;
 if (select token_hash from public.legal_document_request_tokens where request_id=r.id) is distinct from p_token_hash then raise exception 'Document link was rotated' using errcode='42501'; end if;
 perform public.legal_abandon_document(p_document_id);
 update public.legal_document_requests set status=case when status='cancelled' then 'cancelled' else 'open' end,expires_at=null,updated_at=now() where id=r.id;
 -- used_at remains populated: the responsible user must issue a fresh link.
end;$$;

-- All tables are read-only for staff through explicit category/owner policies.
-- Secrets, identity registry, provisioning tokens and leases have no staff reads.
do $$declare t text;f record;begin
 foreach t in array array['legal_portal_identities','legal_portal_provisioning','legal_portal_invite_tokens','legal_portal_representation_grants','legal_portal_invites','legal_portal_memberships','legal_portal_events','legal_portal_publications','legal_portal_document_releases','legal_portal_export_versions','legal_portal_requests','legal_portal_uploads','legal_portal_messages','legal_portal_acknowledgements','legal_communication_connections','legal_communication_versions','legal_communication_jobs','legal_communication_receipts','legal_followup_rules','legal_followup_occurrences'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,legal_portal,service_role',t);execute format('grant select on public.%I to service_role',t);
 end loop;
 foreach t in array array['legal_portal_representation_grants','legal_portal_invites','legal_portal_memberships','legal_portal_events','legal_portal_acknowledgements'] loop
  execute format('grant select on public.%I to authenticated',t);execute format('create policy %I on public.%I for select to authenticated using(public.legal_portal_can_manage(case_id))',t||'_read',t);
 end loop;
 foreach t in array array['legal_portal_publications','legal_portal_document_releases','legal_portal_requests','legal_portal_messages','legal_communication_versions'] loop
  execute format('grant select on public.%I to authenticated',t);execute format('create policy %I on public.%I for select to authenticated using(public.legal_can_access_category(case_id,category))',t||'_read',t);
 end loop;
 foreach t in array array['legal_portal_export_versions','legal_followup_rules','legal_followup_occurrences'] loop
  execute format('grant select on public.%I to authenticated',t);execute format('create policy %I on public.%I for select to authenticated using(public.legal_can_access_category(case_id,''fiscal''))',t||'_read',t);
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '\_legal\_portal\_%' escape '\' or p.proname like 'legal_portal_service_%' or p.proname like 'legal_communication_service_%' or p.proname in ('_legal_staff_ensure_user_profile','guard_legal_portal_auth','legal_portal_can_manage','legal_grant_portal_representation','legal_create_portal_invite','legal_review_portal_invite','legal_revoke_portal_access','legal_create_portal_publication','legal_review_portal_publication','legal_release_portal_document','legal_review_portal_document_release','legal_create_portal_export','legal_review_portal_export','legal_create_portal_request','legal_create_communication','legal_review_communication','legal_queue_communication','legal_save_followup_rule','legal_run_followups','legal_client_care_context','legal_my_day')) loop
  execute format('revoke all on function %s from public,anon,authenticated,legal_portal,service_role',f.signature);
  if f.proname like 'legal_portal_service_%' or f.proname like 'legal_communication_service_%' then execute format('grant execute on function %s to service_role',f.signature);
  elsif f.proname not like '\_%' escape '\' and f.proname<>'guard_legal_portal_auth' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;
revoke all on function public.ensure_user_profile(uuid,text,jsonb) from public,anon,authenticated,legal_portal;
grant execute on function public.ensure_user_profile(uuid,text,jsonb) to service_role;
create index legal_portal_memberships_identity_idx on public.legal_portal_memberships(identity_id,case_id);
create index legal_portal_publications_recipient_idx on public.legal_portal_publications(membership_id,state);
create index legal_portal_releases_recipient_idx on public.legal_portal_document_releases(membership_id,state);
create index legal_communication_jobs_queue_idx on public.legal_communication_jobs(connection_id,state,created_at);
select pg_notify('pgrst','reload schema');
