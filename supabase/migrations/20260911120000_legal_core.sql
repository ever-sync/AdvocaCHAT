-- F1 legal core. Feature defaults OFF. Legacy records/policies are not rewritten.
-- Access is derived from auth.uid() + the actual active profile, never an admin
-- impersonation context. All application writes go through the RPCs below.

create unique index if not exists legal_profiles_id_tenant_uid on public.profiles(id, tenant_id);
create unique index if not exists legal_customers_id_tenant_uid on public.customers(id, tenant_id);
create unique index if not exists legal_negotiations_id_tenant_uid on public.crm_negotiations(id, tenant_id);

create table public.legal_workspace_features (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.legal_professional_profiles (
  profile_id uuid primary key,
  tenant_id uuid not null,
  oab_number text not null default '' check (length(oab_number) <= 30),
  oab_state text not null default '' check (oab_state = '' or oab_state in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  updated_at timestamptz not null default now(),
  foreign key (profile_id, tenant_id) references public.profiles(id, tenant_id) on delete restrict
);
comment on table public.legal_professional_profiles is 'Informational self-declared OAB; never grants authority or verifies professional registration.';

create table public.legal_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  customer_id uuid,
  negotiation_id uuid,
  owner_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  area text not null default '' check (length(area) <= 100),
  case_type text not null default 'consultivo' check (case_type in ('consultivo','extrajudicial','judicial')),
  status text not null default 'ativo' check (status in ('ativo','aguardando','encerrado')),
  next_action text not null default '' check (length(next_action) <= 500),
  next_action_due_at timestamptz,
  wait_reason text not null default '' check (length(wait_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, negotiation_id),
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete restrict,
  foreign key (negotiation_id, tenant_id) references public.crm_negotiations(id, tenant_id) on delete restrict,
  foreign key (owner_id, tenant_id) references public.profiles(id, tenant_id) on delete restrict,
  check (status <> 'ativo' or length(btrim(next_action)) > 0),
  check (status <> 'aguardando' or length(btrim(wait_reason)) > 0)
);
create index legal_cases_tenant_owner_idx on public.legal_cases(tenant_id, owner_id, updated_at desc);
create index legal_cases_next_action_idx on public.legal_cases(tenant_id, status, next_action_due_at);

create table public.legal_case_members (
  case_id uuid not null,
  tenant_id uuid not null,
  profile_id uuid not null,
  can_edit boolean not null default false,
  can_view_medical boolean not null default false,
  can_view_fiscal boolean not null default false,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (case_id, profile_id),
  foreign key (case_id, tenant_id) references public.legal_cases(id, tenant_id) on delete restrict,
  foreign key (profile_id, tenant_id) references public.profiles(id, tenant_id) on delete restrict
);
create index legal_case_members_profile_idx on public.legal_case_members(profile_id, case_id);

create table public.legal_case_parties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null,
  customer_id uuid,
  name text not null check (length(btrim(name)) between 1 and 200),
  party_role text not null check (length(btrim(party_role)) between 1 and 80),
  created_at timestamptz not null default now(),
  foreign key (case_id, tenant_id) references public.legal_cases(id, tenant_id) on delete restrict,
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete restrict
);
create index legal_case_parties_case_idx on public.legal_case_parties(case_id);

create or replace function public.legal_valid_cnj(p_number text)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select case when p_number ~ '^[0-9]{20}$' then
    substring(p_number, 8, 2)::integer = 98 - mod(
      (substring(p_number, 1, 7) || substring(p_number, 10, 11) || '00')::numeric, 97)::integer
  else false end;
$$;

create table public.judicial_proceedings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null,
  cnj_number text not null check (public.legal_valid_cnj(cnj_number)),
  court text not null default '' check (length(court) <= 150),
  division text not null default '' check (length(division) <= 200),
  description text not null default '' check (length(description) <= 1000),
  created_at timestamptz not null default now(),
  unique (case_id, cnj_number),
  foreign key (case_id, tenant_id) references public.legal_cases(id, tenant_id) on delete restrict
);
create index judicial_proceedings_case_idx on public.judicial_proceedings(case_id);

create table public.legal_case_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('case_created','case_updated','member_granted','member_revoked','party_added','proceeding_added','manual','document_prepared','document_ready','document_abandoned','document_download','retention_changed')),
  description text not null check (length(btrim(description)) between 1 and 2000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (case_id, tenant_id) references public.legal_cases(id, tenant_id) on delete restrict
);
create index legal_case_events_case_created_idx on public.legal_case_events(case_id, created_at desc);

create table public.legal_case_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null,
  category text not null check (category in ('general','medical','fiscal')),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  file_name text not null check (length(btrim(file_name)) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','text/plain')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  storage_path text not null unique,
  status text not null default 'prepared' check (status in ('prepared','ready','abandoned')),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid not null,
  retention_hold boolean not null default true,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  unique (id, tenant_id),
  foreign key (case_id, tenant_id) references public.legal_cases(id, tenant_id) on delete restrict,
  foreign key (uploaded_by, tenant_id) references public.profiles(id, tenant_id) on delete restrict,
  check (status <> 'ready' or (sha256 is not null and ready_at is not null)),
  check (storage_path = tenant_id::text || '/' || case_id::text || '/' || id::text)
);
create index legal_case_documents_case_idx on public.legal_case_documents(case_id, category, created_at desc);

-- Helpers are SECURITY DEFINER to avoid recursive RLS. No active-tenant override.
create or replace function public.legal_actual_tenant()
returns uuid language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select tenant_id from public.profiles where id = auth.uid() and status = 'active';
$$;

create or replace function public.legal_feature_enabled()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (select 1 from public.legal_workspace_features
    where tenant_id = public.legal_actual_tenant() and enabled);
$$;

create or replace function public.legal_can_create()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (select 1 from public.profiles p left join public.tenant_settings s on s.tenant_id = p.tenant_id
    where p.id = auth.uid() and p.status = 'active' and p.role in ('admin','operacao')
    and public.legal_feature_enabled()
    and coalesce((s.role_permissions -> p.role -> 'crm' ->> 'view')::boolean, true)
    and coalesce((s.role_permissions -> p.role -> 'crm' ->> 'edit')::boolean, true));
$$;

create or replace function public.legal_can_access_case(p_case_id uuid, p_edit boolean default false, p_owner boolean default false)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.legal_feature_enabled() and exists (
    select 1 from public.legal_cases c where c.id = p_case_id and c.tenant_id = public.legal_actual_tenant()
    and (c.owner_id = auth.uid() or (not p_owner and exists (
      select 1 from public.legal_case_members m where m.case_id = c.id and m.profile_id = auth.uid()
        and (not p_edit or m.can_edit)))));
$$;

create or replace function public.legal_can_access_category(p_case_id uuid, p_category text)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select p_category in ('general','medical','fiscal') and public.legal_can_access_case(p_case_id)
    and (p_category = 'general' or public.legal_can_access_case(p_case_id, false, true) or exists (
      select 1 from public.legal_case_members where case_id = p_case_id and profile_id = auth.uid()
      and case p_category when 'medical' then can_view_medical when 'fiscal' then can_view_fiscal else false end));
$$;

-- Audit contains IDs/action keys only. Never copy a document name/body or data diff.
create or replace function public._legal_record_event(p_case_id uuid, p_type text, p_description text, p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid;
begin
  insert into public.legal_case_events(tenant_id,case_id,actor_id,event_type,description,metadata)
    select tenant_id,id,auth.uid(),p_type,p_description,p_metadata from public.legal_cases where id=p_case_id
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.legal_workspace_context()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_tenant uuid := public.legal_actual_tenant(); v_result jsonb;
begin
  if v_tenant is null then raise exception 'Active profile required' using errcode='42501'; end if;
  select jsonb_build_object('tenant_id',v_tenant,'user_id',auth.uid(),'enabled',public.legal_feature_enabled(),
    'can_activate',p.role='admin','can_create',public.legal_can_create(),
    'professional_profile',(select to_jsonb(lp) from public.legal_professional_profiles lp where lp.profile_id=auth.uid()),
    'collaborators',coalesce((select jsonb_agg(jsonb_build_object('id',cp.id,'nome',cp.nome,'role',cp.role,
      'oab_number',coalesce(lp.oab_number,''),'oab_state',coalesce(lp.oab_state,'')) order by cp.nome)
      from public.profiles cp left join public.legal_professional_profiles lp on lp.profile_id=cp.id
      where cp.tenant_id=v_tenant and cp.status='active'),'[]'::jsonb)) into v_result
    from public.profiles p where p.id=auth.uid();
  return v_result;
end;
$$;

create or replace function public.legal_set_workspace_enabled(p_enabled boolean)
returns public.legal_workspace_features language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_row public.legal_workspace_features; v_tenant uuid := public.legal_actual_tenant();
begin
  if v_tenant is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'Only the active workspace administrator can change this feature' using errcode='42501';
  end if;
  insert into public.legal_workspace_features(tenant_id,enabled,updated_by) values(v_tenant,p_enabled,auth.uid())
    on conflict(tenant_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now()
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.legal_create_case(p_title text, p_customer_id uuid default null, p_negotiation_id uuid default null,
  p_area text default '', p_case_type text default 'consultivo', p_next_action text default 'Definir próxima providência',
  p_next_action_due_at timestamptz default null)
returns public.legal_cases language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_tenant uuid := public.legal_actual_tenant(); v_case public.legal_cases; v_customer uuid;
begin
  if not public.legal_can_create() then raise exception 'Case creation not permitted' using errcode='42501'; end if;
  if p_negotiation_id is not null then
    -- Lock source row, making repeated/concurrent conversion atomic without modifying it.
    select customer_id into v_customer from public.crm_negotiations where id=p_negotiation_id and tenant_id=v_tenant for update;
    if not found then raise exception 'Negotiation not found in workspace' using errcode='42501'; end if;
    select * into v_case from public.legal_cases where negotiation_id=p_negotiation_id and tenant_id=v_tenant;
    if found then
      if not public.legal_can_access_case(v_case.id) then raise exception 'Converted case access denied' using errcode='42501'; end if;
      return v_case;
    end if;
    if p_customer_id is not null and v_customer is not null and p_customer_id <> v_customer then
      raise exception 'Customer must match the negotiation' using errcode='22023';
    end if;
  end if;
  v_customer := coalesce(p_customer_id,v_customer);
  if v_customer is not null and not exists(select 1 from public.customers where id=v_customer and tenant_id=v_tenant) then
    raise exception 'Customer not found in workspace' using errcode='42501';
  end if;
  insert into public.legal_cases(tenant_id,customer_id,negotiation_id,owner_id,title,area,case_type,next_action,next_action_due_at)
    values(v_tenant,v_customer,p_negotiation_id,auth.uid(),btrim(p_title),btrim(p_area),p_case_type,btrim(p_next_action),p_next_action_due_at)
    returning * into v_case;
  perform public._legal_record_event(v_case.id,'case_created','Caso criado.',jsonb_build_object('from_negotiation',p_negotiation_id is not null));
  return v_case;
end;
$$;

create or replace function public.legal_update_case(p_case_id uuid,p_patch jsonb)
returns public.legal_cases language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_case public.legal_cases;
begin
  if not public.legal_can_access_case(p_case_id,true) then raise exception 'Case edit denied' using errcode='42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or exists(select 1 from jsonb_object_keys(p_patch) k where k not in
    ('title','area','case_type','status','next_action','next_action_due_at','wait_reason')) then
    raise exception 'Unsupported case fields' using errcode='22023';
  end if;
  update public.legal_cases set
    title=case when p_patch?'title' then btrim(p_patch->>'title') else title end,
    area=case when p_patch?'area' then btrim(p_patch->>'area') else area end,
    case_type=case when p_patch?'case_type' then p_patch->>'case_type' else case_type end,
    status=case when p_patch?'status' then p_patch->>'status' else status end,
    next_action=case when p_patch?'next_action' then btrim(p_patch->>'next_action') else next_action end,
    next_action_due_at=case when p_patch?'next_action_due_at' then (p_patch->>'next_action_due_at')::timestamptz else next_action_due_at end,
    wait_reason=case when p_patch?'wait_reason' then btrim(p_patch->>'wait_reason') else wait_reason end,
    updated_at=now() where id=p_case_id returning * into v_case;
  perform public._legal_record_event(p_case_id,'case_updated','Dados operacionais do caso atualizados.',
    jsonb_build_object('fields',(select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return v_case;
end;
$$;

create or replace function public.legal_set_case_member(p_case_id uuid,p_profile_id uuid,p_can_edit boolean default false,
  p_can_view_medical boolean default false,p_can_view_fiscal boolean default false)
returns public.legal_case_members language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_row public.legal_case_members; v_tenant uuid := public.legal_actual_tenant();
begin
  perform 1 from public.legal_cases where id=p_case_id for update;
  if not public.legal_can_access_case(p_case_id,false,true) then raise exception 'Only the case owner manages members' using errcode='42501'; end if;
  if p_profile_id=auth.uid() or not exists(select 1 from public.profiles where id=p_profile_id and tenant_id=v_tenant and status='active') then
    raise exception 'Member must be another active profile in this workspace' using errcode='22023';
  end if;
  insert into public.legal_case_members(case_id,tenant_id,profile_id,can_edit,can_view_medical,can_view_fiscal,granted_by)
    values(p_case_id,v_tenant,p_profile_id,p_can_edit,p_can_view_medical,p_can_view_fiscal,auth.uid())
    on conflict(case_id,profile_id) do update set can_edit=excluded.can_edit,can_view_medical=excluded.can_view_medical,
      can_view_fiscal=excluded.can_view_fiscal,granted_by=excluded.granted_by returning * into v_row;
  perform public._legal_record_event(p_case_id,'member_granted','Permissões de participante atualizadas.',
    jsonb_build_object('profile_id',p_profile_id,'can_edit',p_can_edit,
      'can_view_medical',p_can_view_medical,'can_view_fiscal',p_can_view_fiscal));
  return v_row;
end;
$$;

create or replace function public.legal_remove_case_member(p_case_id uuid,p_profile_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform 1 from public.legal_cases where id=p_case_id for update;
  if not public.legal_can_access_case(p_case_id,false,true) then raise exception 'Only the case owner manages members' using errcode='42501'; end if;
  delete from public.legal_case_members where case_id=p_case_id and profile_id=p_profile_id;
  if found then perform public._legal_record_event(p_case_id,'member_revoked','Acesso de participante revogado.',jsonb_build_object('profile_id',p_profile_id)); end if;
end;
$$;

create or replace function public.legal_add_case_party(p_case_id uuid,p_name text,p_party_role text,p_customer_id uuid default null)
returns public.legal_case_parties language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_row public.legal_case_parties; v_tenant uuid := public.legal_actual_tenant();
begin
  if not public.legal_can_access_case(p_case_id,true) then raise exception 'Case edit denied' using errcode='42501'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id and tenant_id=v_tenant) then
    raise exception 'Customer not found in workspace' using errcode='42501';
  end if;
  insert into public.legal_case_parties(tenant_id,case_id,customer_id,name,party_role)
    values(v_tenant,p_case_id,p_customer_id,btrim(p_name),btrim(p_party_role)) returning * into v_row;
  perform public._legal_record_event(p_case_id,'party_added','Parte adicionada ao caso.',jsonb_build_object('party_id',v_row.id));
  return v_row;
end;
$$;

create or replace function public.legal_add_proceeding(p_case_id uuid,p_cnj_number text,p_court text default '',p_division text default '',p_description text default '')
returns public.judicial_proceedings language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_row public.judicial_proceedings; v_number text;
begin
  if not public.legal_can_access_case(p_case_id,true) then raise exception 'Case edit denied' using errcode='42501'; end if;
  if p_cnj_number !~ '^([0-9]{20}|[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4})$' then
    raise exception 'Invalid CNJ number format' using errcode='22023';
  end if;
  v_number := regexp_replace(p_cnj_number,'[^0-9]','','g');
  if not public.legal_valid_cnj(v_number) then raise exception 'Invalid CNJ checksum' using errcode='22023'; end if;
  insert into public.judicial_proceedings(tenant_id,case_id,cnj_number,court,division,description)
    values(public.legal_actual_tenant(),p_case_id,v_number,btrim(p_court),btrim(p_division),btrim(p_description)) returning * into v_row;
  perform public._legal_record_event(p_case_id,'proceeding_added','Processo cadastrado manualmente.',jsonb_build_object('proceeding_id',v_row.id));
  return v_row;
end;
$$;

create or replace function public.legal_add_case_event(p_case_id uuid,p_description text)
returns public.legal_case_events language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid; v_row public.legal_case_events;
begin
  if not public.legal_can_access_case(p_case_id,true) then raise exception 'Case edit denied' using errcode='42501'; end if;
  v_id := public._legal_record_event(p_case_id,'manual',btrim(p_description));
  select * into v_row from public.legal_case_events where id=v_id;
  return v_row;
end;
$$;

create or replace function public.legal_set_professional_profile(p_oab_number text,p_oab_state text)
returns public.legal_professional_profiles language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_row public.legal_professional_profiles;
begin
  if not public.legal_feature_enabled() then raise exception 'Active legal workspace required' using errcode='42501'; end if;
  if (btrim(p_oab_number)='') <> (btrim(p_oab_state)='') then raise exception 'Provide both OAB number and state' using errcode='22023'; end if;
  insert into public.legal_professional_profiles(profile_id,tenant_id,oab_number,oab_state)
    values(auth.uid(),public.legal_actual_tenant(),btrim(p_oab_number),upper(btrim(p_oab_state)))
    on conflict(profile_id) do update set oab_number=excluded.oab_number,oab_state=excluded.oab_state,updated_at=now() returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.legal_prepare_document(p_case_id uuid,p_category text,p_display_name text,p_file_name text,p_mime_type text,p_size_bytes bigint)
returns public.legal_case_documents language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_tenant uuid := public.legal_actual_tenant(); v_row public.legal_case_documents;
begin
  if not public.legal_can_access_case(p_case_id,true) or not public.legal_can_access_category(p_case_id,p_category) then
    raise exception 'Document upload denied' using errcode='42501';
  end if;
  -- Serialize quota reservations for a case; prepared rows count before upload.
  perform 1 from public.legal_cases where id=p_case_id for update;
  if p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>10485760 then
    raise exception 'Document must contain 1 byte to 10 MiB' using errcode='22023';
  end if;
  if (select coalesce(sum(size_bytes),0) from public.legal_case_documents where case_id=p_case_id and status in ('prepared','ready'))+p_size_bytes>209715200 then
    raise exception 'Case document limit of 200 MiB exceeded' using errcode='22023';
  end if;
  insert into public.legal_case_documents(id,tenant_id,case_id,category,display_name,file_name,mime_type,size_bytes,storage_path,uploaded_by)
    values(v_id,v_tenant,p_case_id,p_category,btrim(p_display_name),btrim(p_file_name),p_mime_type,p_size_bytes,
      v_tenant::text||'/'||p_case_id::text||'/'||v_id::text,auth.uid()) returning * into v_row;
  perform public._legal_record_event(p_case_id,'document_prepared','Recebimento de documento iniciado.',jsonb_build_object('document_id',v_id));
  return v_row;
end;
$$;

create or replace function public.legal_finalize_document(p_document_id uuid,p_sha256 text)
returns public.legal_case_documents language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_row public.legal_case_documents;
begin
  select * into v_row from public.legal_case_documents where id=p_document_id for update;
  if not found or auth.role() is distinct from 'service_role' or v_row.status='abandoned' then
    raise exception 'Document finalization denied' using errcode='42501';
  end if;
  -- Serialize against membership revocation and recheck the original uploader.
  -- The service JWT identifies the trusted Edge, not the owner of the upload.
  perform 1 from public.legal_cases where id=v_row.case_id for update;
  perform 1 from public.profiles where id=v_row.uploaded_by for share;
  if not exists(select 1 from public.legal_cases c join public.profiles p on p.id=v_row.uploaded_by
    join public.legal_workspace_features w on w.tenant_id=c.tenant_id and w.enabled
    where c.id=v_row.case_id and p.tenant_id=c.tenant_id and p.status='active'
    and (c.owner_id=p.id or exists(select 1 from public.legal_case_members m
      where m.case_id=c.id and m.profile_id=p.id and m.can_edit
      and (v_row.category='general' or (v_row.category='medical' and m.can_view_medical)
        or (v_row.category='fiscal' and m.can_view_fiscal))))) then
    raise exception 'Upload authorization was revoked' using errcode='42501';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'SHA-256 required' using errcode='22023'; end if;
  if v_row.status='ready' then
    if v_row.sha256<>p_sha256 then raise exception 'Document already finalized with a different hash' using errcode='22023'; end if;
    return v_row;
  end if;
  if not exists(select 1 from storage.objects where bucket_id='legal-case-documents' and name=v_row.storage_path) then
    raise exception 'Document object not uploaded' using errcode='22023';
  end if;
  update public.legal_case_documents set status='ready',sha256=p_sha256,ready_at=now() where id=p_document_id returning * into v_row;
  insert into public.legal_case_events(tenant_id,case_id,actor_id,event_type,description,metadata)
    values(v_row.tenant_id,v_row.case_id,v_row.uploaded_by,'document_ready','Documento recebido.',jsonb_build_object('document_id',v_row.id));
  return v_row;
end;
$$;

-- Failed uploads release their reservation but preserve the original draft record.
create or replace function public.legal_abandon_document(p_document_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_row public.legal_case_documents;
begin
  select * into v_row from public.legal_case_documents where id=p_document_id for update;
  if not found or auth.role() is distinct from 'service_role' then raise exception 'Document cleanup denied' using errcode='42501'; end if;
  if v_row.status='abandoned' then return; end if;
  if v_row.status<>'prepared' or exists(select 1 from storage.objects where bucket_id='legal-case-documents' and name=v_row.storage_path) then
    raise exception 'Only an unuploaded draft can be abandoned' using errcode='22023';
  end if;
  update public.legal_case_documents set status='abandoned' where id=p_document_id;
  insert into public.legal_case_events(tenant_id,case_id,actor_id,event_type,description,metadata)
    values(v_row.tenant_id,v_row.case_id,v_row.uploaded_by,'document_abandoned','Recebimento de documento não concluído.',jsonb_build_object('document_id',v_row.id));
end;
$$;

create or replace function public.legal_record_document_download(p_document_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_row public.legal_case_documents;
begin
  select * into v_row from public.legal_case_documents where id=p_document_id and status='ready';
  if not found or not public.legal_can_access_category(v_row.case_id,v_row.category) then
    raise exception 'Document download denied' using errcode='42501';
  end if;
  perform public._legal_record_event(v_row.case_id,'document_download','Acesso a documento autorizado.',jsonb_build_object('document_id',v_row.id));
end;
$$;

create or replace function public.legal_set_document_hold(p_document_id uuid,p_retention_hold boolean,p_reason text default '')
returns public.legal_case_documents language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_row public.legal_case_documents;
begin
  select * into v_row from public.legal_case_documents where id=p_document_id for update;
  if not found or not public.legal_can_access_case(v_row.case_id,false,true) then
    raise exception 'Only the case owner manages retention' using errcode='42501';
  end if;
  if p_retention_hold is null or (not p_retention_hold and length(btrim(coalesce(p_reason,'')))=0) then
    raise exception 'Removing a hold requires a reason' using errcode='22023';
  end if;
  if length(p_reason)>500 then raise exception 'Reason too long' using errcode='22023'; end if;
  update public.legal_case_documents set retention_hold=p_retention_hold where id=p_document_id returning * into v_row;
  -- Keep the reason in category-restricted data, not the shared timeline.
  insert into public.legal_document_retention_events(document_id,tenant_id,case_id,actor_id,retention_hold,reason)
    values(v_row.id,v_row.tenant_id,v_row.case_id,auth.uid(),p_retention_hold,btrim(p_reason));
  perform public._legal_record_event(v_row.case_id,'retention_changed','Política de preservação de documento atualizada.',jsonb_build_object('document_id',v_row.id,'retention_hold',p_retention_hold));
  return v_row;
end;
$$;

create table public.legal_document_retention_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  tenant_id uuid not null,
  case_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  retention_hold boolean not null,
  reason text not null check(length(reason)<=500),
  created_at timestamptz not null default now(),
  foreign key(document_id,tenant_id) references public.legal_case_documents(id,tenant_id) on delete restrict,
  foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict
);

-- Deny direct mutation even when an inherited default GRANT exists.
do $$
declare t text;
begin
  foreach t in array array['legal_workspace_features','legal_professional_profiles','legal_cases','legal_case_members',
    'legal_case_parties','judicial_proceedings','legal_case_events','legal_case_documents','legal_document_retention_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
end;
$$;

create policy legal_workspace_features_read on public.legal_workspace_features for select to authenticated
  using(tenant_id=public.legal_actual_tenant());
create policy legal_professional_profiles_read on public.legal_professional_profiles for select to authenticated
  using(tenant_id=public.legal_actual_tenant() and public.legal_feature_enabled());
create policy legal_cases_read on public.legal_cases for select to authenticated using(public.legal_can_access_case(id));
create policy legal_members_read on public.legal_case_members for select to authenticated using(public.legal_can_access_case(case_id));
create policy legal_parties_read on public.legal_case_parties for select to authenticated using(public.legal_can_access_case(case_id));
create policy legal_proceedings_read on public.judicial_proceedings for select to authenticated using(public.legal_can_access_case(case_id));
create policy legal_events_read on public.legal_case_events for select to authenticated using(public.legal_can_access_case(case_id));
create policy legal_documents_read on public.legal_case_documents for select to authenticated
  using(public.legal_can_access_category(case_id,category));
create policy legal_retention_events_read on public.legal_document_retention_events for select to authenticated
  using(exists(select 1 from public.legal_case_documents d where d.id=document_id and public.legal_can_access_category(d.case_id,d.category)));

insert into storage.buckets(id,name,public,file_size_limit)
  values('legal-case-documents','legal-case-documents',false,10485760)
  on conflict(id) do update set public=false,file_size_limit=10485760;
-- Restrictive policy also neutralizes unrelated permissive storage policies.
create policy legal_objects_proxy_only on storage.objects as restrictive for all to anon, authenticated
  using(bucket_id<>'legal-case-documents') with check(bucket_id<>'legal-case-documents');

-- Explicit function allowlist; internal audit insertion is never client-callable.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'legal\_%' escape '\' or p.proname='_legal_record_event') loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    if f.proname in ('legal_finalize_document','legal_abandon_document') then
      execute format('grant execute on function %s to service_role',f.signature);
    elsif f.proname<>'_legal_record_event' then
      execute format('grant execute on function %s to authenticated',f.signature);
    end if;
  end loop;
end;
$$;

select pg_notify('pgrst', 'reload schema');
