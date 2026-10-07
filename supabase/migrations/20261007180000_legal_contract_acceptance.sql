-- Aceite autenticado de instrumentos no portal. O aceite interno não pretende
-- substituir assinatura qualificada de provedor; preserva versão, identidade e prova.

create table public.legal_contract_releases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null,
  membership_id uuid not null,
  instrument_id uuid not null,
  version_id uuid not null,
  category text not null check (category in ('general','medical','fiscal')),
  title text not null check (length(btrim(title)) between 1 and 200),
  content text not null check (length(btrim(content)) between 1 and 100000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'active' check (state in ('active','accepted','declined','revoked','expired')),
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  revoked_by uuid references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  revoke_reason text not null default '' check (length(revoke_reason)<=2000),
  unique(id,case_id,tenant_id),
  unique(membership_id,version_id),
  foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id) on delete restrict,
  foreign key(instrument_id,tenant_id) references public.legal_instruments(id,tenant_id) on delete restrict,
  foreign key(version_id,tenant_id) references public.legal_instrument_versions(id,tenant_id) on delete restrict,
  check (expires_at>created_at),
  check (state<>'revoked' or (revoked_by is not null and revoked_at is not null and length(btrim(revoke_reason))>0))
);

create table public.legal_contract_acceptances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null,
  release_id uuid not null unique,
  membership_id uuid not null,
  version_id uuid not null,
  identity_id uuid not null references public.legal_portal_identities(id) on delete restrict,
  decision text not null check (decision in ('accepted','declined')),
  typed_name text not null check (length(btrim(typed_name)) between 2 and 200),
  statement_version text not null check (statement_version='portal-contract-acceptance-v1'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(tenant_id,idempotency_key),
  foreign key(release_id,case_id,tenant_id) references public.legal_contract_releases(id,case_id,tenant_id) on delete restrict,
  foreign key(membership_id,case_id,tenant_id) references public.legal_portal_memberships(id,case_id,tenant_id) on delete restrict,
  foreign key(version_id,tenant_id) references public.legal_instrument_versions(id,tenant_id) on delete restrict
);

create table public.legal_workflow_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  case_id uuid not null,
  aggregate_type text not null check (aggregate_type in ('contract_release','contract_acceptance')),
  aggregate_id uuid not null,
  event_type text not null check (event_type in ('contract_released','contract_accepted','contract_declined','contract_revoked')),
  payload jsonb not null default '{}',
  state text not null default 'pending' check (state in ('pending','processing','completed','failed')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  available_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  unique(tenant_id,aggregate_id,event_type),
  foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict
);

create index legal_contract_releases_case_idx on public.legal_contract_releases(case_id,created_at desc);
create index legal_contract_releases_portal_idx on public.legal_contract_releases(membership_id,state,expires_at);
create index legal_workflow_outbox_pending_idx on public.legal_workflow_outbox(state,available_at) where state in ('pending','failed');

alter table public.legal_contract_releases enable row level security;
alter table public.legal_contract_acceptances enable row level security;
alter table public.legal_workflow_outbox enable row level security;
revoke all on public.legal_contract_releases,public.legal_contract_acceptances,public.legal_workflow_outbox from public,anon,authenticated;

create or replace function public.legal_release_instrument_to_portal(p_version_id uuid,p_membership_id uuid,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v public.legal_instrument_versions;i public.legal_instruments;m public.legal_portal_memberships;r public.legal_contract_releases;h text;
begin
 select * into v from public.legal_instrument_versions where id=p_version_id;
 if not found then raise exception 'Instrument access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(v.case_id,v.category,true);
 select * into v from public.legal_instrument_versions where id=p_version_id for update;
 select * into i from public.legal_instruments where id=v.instrument_id;
 select * into m from public.legal_portal_memberships where id=p_membership_id and case_id=v.case_id;
 if v.status<>'approved' or v.superseded_at is not null or i.instrument_type not in ('contract','proposal','power_of_attorney') then raise exception 'Current approved instrument required' using errcode='22023';end if;
 if m.id is null or m.state<>'active' or m.expires_at<=clock_timestamp() or not('documents:read'=any(m.scopes)) or not public._legal_portal_category(m,v.category) then raise exception 'Active authorized portal recipient required' using errcode='42501';end if;
 if p_expires_at<=clock_timestamp() or p_expires_at>least(m.expires_at,clock_timestamp()+interval '90 days') then raise exception 'Release validity must fit recipient access and 90 days' using errcode='22023';end if;
 h:=encode(digest(convert_to(v.content,'UTF8'),'sha256'),'hex');
 insert into public.legal_contract_releases(tenant_id,case_id,membership_id,instrument_id,version_id,category,title,content,content_hash,expires_at,created_by)
 values(v.tenant_id,v.case_id,m.id,v.instrument_id,v.id,v.category,i.title,v.content,h,p_expires_at,auth.uid()) returning * into r;
 insert into public.legal_workflow_outbox(tenant_id,case_id,aggregate_type,aggregate_id,event_type,payload) values(r.tenant_id,r.case_id,'contract_release',r.id,'contract_released',jsonb_build_object('release_id',r.id,'membership_id',r.membership_id,'version_id',r.version_id));
 perform public._legal_record_event(r.case_id,'contract_released','Instrumento liberado para decisão no portal.',jsonb_build_object('release_id',r.id,'membership_id',r.membership_id,'version_id',r.version_id,'content_hash',r.content_hash));
 return to_jsonb(r);
end;$$;

create or replace function public.legal_revoke_contract_release(p_release_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.legal_contract_releases;
begin
 select * into r from public.legal_contract_releases where id=p_release_id;
 perform public._legal_assert_operation(r.case_id,r.category,true);
 select * into r from public.legal_contract_releases where id=p_release_id for update;
 if r.state<>'active' or length(btrim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'Only an active release can be revoked with a reason' using errcode='22023';end if;
 update public.legal_contract_releases set state='revoked',revoked_by=auth.uid(),revoked_at=clock_timestamp(),revoke_reason=btrim(p_reason) where id=r.id returning * into r;
 insert into public.legal_workflow_outbox(tenant_id,case_id,aggregate_type,aggregate_id,event_type,payload) values(r.tenant_id,r.case_id,'contract_release',r.id,'contract_revoked',jsonb_build_object('release_id',r.id));
 perform public._legal_record_event(r.case_id,'contract_revoked','Liberação do instrumento revogada.',jsonb_build_object('release_id',r.id));
 return to_jsonb(r);
end;$$;

create or replace function public.legal_contract_release_list(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 perform public._legal_assert_operation(p_case_id,'general');
 return coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('acceptance',(select to_jsonb(a) from public.legal_contract_acceptances a where a.release_id=r.id)) order by r.created_at desc)
   from public.legal_contract_releases r where r.case_id=p_case_id and (r.category='general'
    or exists(select 1 from public.legal_cases c where c.id=r.case_id and c.owner_id=auth.uid())
    or exists(select 1 from public.legal_case_members cm where cm.case_id=r.case_id and cm.profile_id=auth.uid() and ((r.category='medical' and cm.can_view_medical) or (r.category='fiscal' and cm.can_view_fiscal))))),'[]');
end;$$;

create or replace function public.legal_portal_service_contract_decide(p_actor_id uuid,p_membership_id uuid,p_release_id uuid,p_decision text,p_typed_name text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.legal_portal_memberships;r public.legal_contract_releases;a public.legal_contract_acceptances;
begin
 perform public._legal_portal_service();
 select * into r from public.legal_contract_releases where id=p_release_id and membership_id=p_membership_id;
 if not found then raise exception 'Contract release unavailable' using errcode='42501';end if;
 m:=public._legal_portal_assert_member(p_actor_id,p_membership_id,'documents:read',r.category);
 select * into a from public.legal_contract_acceptances where tenant_id=r.tenant_id and idempotency_key=p_idempotency_key;
 if found then if a.release_id<>r.id or a.decision<>p_decision or a.typed_name<>btrim(p_typed_name) then raise exception 'Idempotency key reused with different decision' using errcode='22023';end if;return to_jsonb(a);end if;
 select * into r from public.legal_contract_releases where id=p_release_id for update;
 if r.state<>'active' or r.expires_at<=clock_timestamp() or p_decision not in ('accepted','declined') or length(btrim(coalesce(p_typed_name,''))) not between 2 and 200 then raise exception 'Contract decision is no longer available' using errcode='22023';end if;
 insert into public.legal_contract_acceptances(tenant_id,case_id,release_id,membership_id,version_id,identity_id,decision,typed_name,statement_version,content_hash,idempotency_key)
 values(r.tenant_id,r.case_id,r.id,m.id,r.version_id,p_actor_id,p_decision,btrim(p_typed_name),'portal-contract-acceptance-v1',r.content_hash,p_idempotency_key) returning * into a;
 update public.legal_contract_releases set state=p_decision where id=r.id;
 insert into public.legal_workflow_outbox(tenant_id,case_id,aggregate_type,aggregate_id,event_type,payload) values(r.tenant_id,r.case_id,'contract_acceptance',a.id,case when p_decision='accepted' then 'contract_accepted' else 'contract_declined' end,jsonb_build_object('acceptance_id',a.id,'release_id',r.id,'membership_id',m.id));
 perform public._legal_portal_event(r.case_id,m.id,p_actor_id,'contract_'||p_decision,jsonb_build_object('release_id',r.id,'acceptance_id',a.id,'version_id',r.version_id,'content_hash',r.content_hash,'statement_version',a.statement_version));
 return to_jsonb(a);
end;$$;

-- Extend the portal case projection without exposing internal authors or audit data.
create or replace function public.legal_portal_service_contracts(p_actor_id uuid,p_membership_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare m public.legal_portal_memberships;
begin
 perform public._legal_portal_service();
 select * into m from public.legal_portal_memberships where id=p_membership_id and identity_id=p_actor_id and state='active' and expires_at>clock_timestamp() and 'documents:read'=any(scopes);
 if not found then raise exception 'Portal membership unavailable' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'category',r.category,'content',r.content,'content_hash',r.content_hash,'state',case when r.state='active' and r.expires_at<=clock_timestamp() then 'expired' else r.state end,'expires_at',r.expires_at,'created_at',r.created_at,'decision',(select a.decision from public.legal_contract_acceptances a where a.release_id=r.id),'decided_at',(select a.created_at from public.legal_contract_acceptances a where a.release_id=r.id)) order by r.created_at desc) from public.legal_contract_releases r where r.membership_id=m.id and public._legal_portal_category(m,r.category)),'[]');
end;$$;

revoke all on function public.legal_release_instrument_to_portal(uuid,uuid,timestamptz),public.legal_revoke_contract_release(uuid,text),public.legal_contract_release_list(uuid),public.legal_portal_service_contract_decide(uuid,uuid,uuid,text,text,uuid),public.legal_portal_service_contracts(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.legal_release_instrument_to_portal(uuid,uuid,timestamptz),public.legal_revoke_contract_release(uuid,text),public.legal_contract_release_list(uuid) to authenticated;
grant execute on function public.legal_portal_service_contract_decide(uuid,uuid,uuid,text,text,uuid),public.legal_portal_service_contracts(uuid,uuid) to service_role;
select pg_notify('pgrst','reload schema');
