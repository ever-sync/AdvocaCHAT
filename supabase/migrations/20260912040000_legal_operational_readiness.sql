-- F9: measured case-scoped operations. No provider activation or commercial billing.
create table public.legal_operational_costs (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, case_id uuid not null,
 kind text not null check(kind in ('actual','estimate','budget')),
 category text not null check(category in ('infrastructure','storage','monitoring','signature','messages','ai','other')),
 amount numeric(16,2) not null check(amount>=0), currency text not null check(currency ~ '^[A-Z]{3}$'),
 period_start date not null check(isfinite(period_start)), period_end date not null check(isfinite(period_end)),
 source text not null check(length(btrim(source)) between 1 and 1000), allocation_method text not null check(length(btrim(allocation_method)) between 1 and 2000),
 evidence_document_id uuid, idempotency_key uuid not null, payload_hash text not null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 unique(tenant_id,idempotency_key), foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id),
 foreign key(evidence_document_id,case_id,tenant_id) references public.legal_case_documents(id,case_id,tenant_id),
 check(period_end>=period_start),check(kind<>'actual' or evidence_document_id is not null)
);
alter table public.legal_operational_costs enable row level security;
revoke all on public.legal_operational_costs from public,anon,authenticated,legal_portal;
create table public.legal_case_import_batches (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),actor_id uuid not null references public.profiles(id),
 idempotency_key uuid not null,payload_hash text not null,result jsonb not null,created_at timestamptz not null default now(),unique(tenant_id,idempotency_key)
);
alter table public.legal_case_import_batches enable row level security;
revoke all on public.legal_case_import_batches from public,anon,authenticated,legal_portal;

create or replace function public.legal_readiness_metrics() returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public.legal_actual_tenant(); cids uuid[]; fiscal uuid[]; medical uuid[]; tax uuid[]; owned uuid[];begin
 if t is null or not public.legal_feature_enabled() then raise exception 'Active legal workspace required' using errcode='42501';end if;
 select coalesce(array_agg(c.id),'{}'),coalesce(array_agg(c.id) filter(where c.owner_id=auth.uid()),'{}'),
 coalesce(array_agg(c.id) filter(where c.owner_id=auth.uid() or m.can_view_medical),'{}'),
 coalesce(array_agg(c.id) filter(where c.owner_id=auth.uid() or m.can_view_fiscal),'{}'),
 coalesce(array_agg(c.id) filter(where c.owner_id=auth.uid() or m.can_view_medical and m.can_view_fiscal),'{}')
 into cids,owned,medical,tax,fiscal from public.legal_cases c left join public.legal_case_members m on m.case_id=c.id and m.profile_id=auth.uid()
 where c.tenant_id=t and (c.owner_id=auth.uid() or m.profile_id is not null);
 return jsonb_build_object('tenant_id',t,'user_id',auth.uid(),'measured_at',clock_timestamp(),'scope','accessible_cases','case_count',cardinality(cids),
 'active_cases',(select count(*) from public.legal_cases where id=any(cids) and status='ativo'),
 'waiting_cases',(select count(*) from public.legal_cases where id=any(cids) and status='aguardando'),
 'closed_cases',(select count(*) from public.legal_cases where id=any(cids) and status='encerrado'),
 'overdue_next_actions',(select count(*) from public.legal_cases where id=any(cids) and status='ativo' and next_action_due_at<clock_timestamp()),
 'ir_visible_cases',cardinality(fiscal),'ir_claims',(select count(*) from public.ir_claims where case_id=any(fiscal)),
 'ir_received_brl',(select coalesce(sum(amount::numeric),0)::text from public.ir_recoveries where case_id=any(fiscal)),
 'ir_recognized_by_claim_brl',(select coalesce(sum(recognized_amount::numeric),0)::text from public.ir_claims where case_id=any(fiscal)),
 'ir_cessation_verified_sources',(select count(*) from (select distinct on(source_id) status from public.ir_cessation_records where case_id=any(fiscal) order by source_id,observed_on desc,created_at desc,id desc) q where status='verified'),
 'ir_warning','Reconhecido por pedido pode conter sobreposição e não representa crédito líquido. Recebido é a soma dos recebimentos documentados; não é cálculo nem economia futura.',
 'storage_visible_bytes',(select coalesce(sum(size_bytes),0) from public.legal_case_documents d where case_id=any(cids) and status in ('ready','diligence_restricted') and (d.category='general' or d.category='medical' and d.case_id=any(medical) or d.category='fiscal' and d.case_id=any(tax)) and (d.status<>'diligence_restricted' or d.case_id=any(fiscal))),
 'cost_totals',coalesce((select jsonb_agg(to_jsonb(q)) from (select kind,currency,sum(amount)::text amount from public.legal_operational_costs where case_id=any(owned) group by kind,currency order by currency,kind) q),'[]'),
 'cost_warning','Custos registrados manualmente pelo responsável. Ausência de registro não significa consumo zero. Moedas, estimativas e orçamentos não são somados entre si.');
end;$$;

create or replace function public.legal_record_operational_cost(p_case_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public._legal_judicial_assert(p_case_id,'fiscal',true); r public.legal_operational_costs; h text; k uuid;begin
 if not public.legal_can_access_case(p_case_id,true,true) then raise exception 'Case owner required' using errcode='42501';end if;
 perform public._legal_expansion_payload(p_payload,array['kind','category','amount','currency','period_start','period_end','source','allocation_method','evidence_document_id','idempotency_key'],8192);
 if coalesce(p_payload->>'amount','') !~ '^[0-9]{1,14}(\.[0-9]{1,2})?$' then raise exception 'Decimal amount required' using errcode='22023';end if;
 h:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');k:=(p_payload->>'idempotency_key')::uuid;if k is null then raise exception 'Idempotency key required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||k::text,9009));
 select * into r from public.legal_operational_costs where tenant_id=t and idempotency_key=k;
 if r.id is not null then if r.case_id<>p_case_id or r.payload_hash<>h then raise exception 'Idempotency payload mismatch' using errcode='22023';end if;return to_jsonb(r)-'payload_hash';end if;
 if p_payload->>'evidence_document_id' is not null and not exists(select 1 from public.legal_case_documents d where d.id=(p_payload->>'evidence_document_id')::uuid and d.case_id=p_case_id and d.status='ready' and public.legal_can_access_category(d.case_id,d.category)) then raise exception 'Accessible ready proof required' using errcode='42501';end if;
 r.id:=gen_random_uuid();r.tenant_id:=t;r.case_id:=p_case_id;r.created_by:=auth.uid();r.created_at:=clock_timestamp();r.payload_hash:=h;r:=jsonb_populate_record(r,p_payload);
 insert into public.legal_operational_costs values(r.*);perform public._legal_expansion_event(p_case_id,'fiscal','operational_cost_recorded',jsonb_build_object('cost_id',r.id,'kind',r.kind));return to_jsonb(r)-'payload_hash';
end;$$;

create or replace function public.legal_preview_case_import(p_rows jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public.legal_actual_tenant(); r jsonb;i integer:=0; normalized jsonb:='[]';begin
 if not public.legal_can_create() then raise exception 'Case creation permission required' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 100 or octet_length(p_rows::text)>131072 then raise exception 'One to 100 case rows, maximum 128 KiB required' using errcode='22023';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  i:=i+1;perform public._legal_expansion_payload(r,array['title','customer_id','area','case_type','next_action'],8192);
  if length(btrim(coalesce(r->>'title',''))) not between 1 and 200 or length(coalesce(r->>'area',''))>100 or coalesce(r->>'case_type','consultivo') not in ('consultivo','extrajudicial','judicial') or length(btrim(coalesce(r->>'next_action','Conferir cadastro importado'))) not between 1 and 500 then raise exception 'Invalid case row %',i using errcode='22023';end if;
  if r->>'customer_id' is not null and not exists(select 1 from public.customers where id=(r->>'customer_id')::uuid and tenant_id=t) then raise exception 'Customer must belong to the current office' using errcode='42501';end if;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('title',btrim(r->>'title'),'customer_id',r->>'customer_id','area',coalesce(r->>'area',''),'case_type',coalesce(r->>'case_type','consultivo'),'next_action',btrim(coalesce(r->>'next_action','Conferir cadastro importado'))));
 end loop;
 return jsonb_build_object('rows',normalized,'count',i,'preview_hash',encode(sha256(convert_to(t::text||auth.uid()::text||normalized::text,'UTF8')),'hex'),'warning','Cria apenas casos novos para o responsável atual. Não importa clientes, documentos, prazos legais, poderes, mensagens ou decisões.');
end;$$;
create or replace function public.legal_apply_case_import(p_rows jsonb,p_preview_hash text,p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare p jsonb;t uuid:=public.legal_actual_tenant();b public.legal_case_import_batches;r jsonb;c public.legal_cases;ids jsonb:='[]';h text;begin
 if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode='22023';end if;
 p:=public.legal_preview_case_import(p_rows);h:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(t::text||p_idempotency_key::text,9009));select * into b from public.legal_case_import_batches where tenant_id=t and idempotency_key=p_idempotency_key;
 if b.id is not null then if b.actor_id<>auth.uid() or b.payload_hash<>h then raise exception 'Idempotency mismatch' using errcode='22023';end if;return b.result||'{"already_applied":true}'::jsonb;end if;
 if p->>'preview_hash' is distinct from p_preview_hash then raise exception 'Preview changed' using errcode='22023';end if;
 for r in select value from jsonb_array_elements(p->'rows') loop c:=public.legal_create_case(r->>'title',(r->>'customer_id')::uuid,null,r->>'area',r->>'case_type',r->>'next_action',null);ids:=ids||jsonb_build_array(c.id);end loop;
 r:=jsonb_build_object('case_ids',ids,'count',jsonb_array_length(ids),'already_applied',false);
 insert into public.legal_case_import_batches(tenant_id,actor_id,idempotency_key,payload_hash,result) values(t,auth.uid(),p_idempotency_key,h,r);return r;
end;$$;

create or replace function public.legal_export_case_manifest(p_case_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid:=public._legal_judicial_assert(p_case_id,'restricted',true); tables jsonb:='{}'; rows jsonb; name text; result jsonb; total integer:=0; row_count bigint; row_bytes bigint; total_bytes bigint:=0;begin
 if not public.legal_can_access_case(p_case_id,false,true) then raise exception 'Case owner export required' using errcode='42501';end if;
 foreach name in array array['ir_assessment_reviews','ir_assessment_versions','ir_calculation_reviews','ir_calculation_versions','ir_case_checklist_items','ir_case_controls','ir_cessation_records','ir_claim_events','ir_claim_overlaps','ir_claim_strategy_reviews','ir_claims','ir_document_reviews','ir_evidence_events','ir_fact_revisions','ir_income_sources','ir_payers','ir_payment_principals','ir_period_reviews','ir_principal_allocations','ir_recoveries','ir_tax_entries','ir_tax_import_reviews','ir_tax_imports','ir_tax_return_events','ir_tax_returns','legal_appointments','legal_assistance_audit','legal_case_documents','legal_case_events','legal_case_members','legal_case_operations','legal_case_parties','legal_case_tasks','legal_cash_allocations','legal_cash_transactions','legal_communication_versions','legal_conflict_reviews','legal_deadline_reviews','legal_deadline_versions','legal_diligence_deliveries','legal_diligence_messages','legal_diligence_versions','legal_document_requests','legal_document_retention_events','legal_expansion_audit','legal_external_act_attempt_reports','legal_external_act_attempts','legal_external_act_receipts','legal_external_act_versions','legal_external_signature_records','legal_fee_agreement_versions','legal_fee_basis_versions','legal_financial_obligations','legal_financial_statement_releases','legal_financial_statement_versions','legal_followup_occurrences','legal_followup_rules','legal_instrument_versions','legal_instruments','legal_interview_submissions','legal_judicial_association_reviews','legal_judicial_audit','legal_judicial_inbox','legal_judicial_task_links','legal_judicial_triage','legal_payment_receipts','legal_portal_acknowledgements','legal_portal_document_releases','legal_portal_events','legal_portal_export_versions','legal_portal_messages','legal_portal_publications','legal_portal_requests','legal_portal_uploads','legal_representations','legal_specialty_installations','legal_specialty_items','legal_succession_authority_reviews','legal_succession_events','legal_succession_persons','legal_succession_versions','judicial_proceedings','legal_operational_costs']::text[] loop
  execute format('select count(*),coalesce(sum(octet_length(to_jsonb(q)::text)),0) from (select * from public.%I where case_id=$1 and tenant_id=$2 limit 10001) q',name) into row_count,row_bytes using p_case_id,t;
  total_bytes:=total_bytes+row_bytes;
  if row_count>10000 or total+row_count>50000 or total_bytes>16777216 then raise exception 'Export exceeds interactive limits; assisted batch export required' using errcode='22023';end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(q) - ''payload_hash'' - ''idempotency_key'' order by to_jsonb(q)::text),''[]''::jsonb) from (select * from public.%I where case_id=$1 and tenant_id=$2 limit 10001) q',name) into rows using p_case_id,t;
  if jsonb_array_length(rows)>10000 then raise exception 'Export table exceeds 10000 records; assisted batch export required' using errcode='22023';end if;
  total:=total+jsonb_array_length(rows);tables:=tables||jsonb_build_object(name,rows);
  if total>50000 or octet_length(tables::text)>16777216 then raise exception 'Export exceeds interactive size; assisted batch export required' using errcode='22023';end if;
 end loop;
 result:=jsonb_build_object('format','advocachat-case-v1','exported_at',clock_timestamp(),'tenant_id',t,'case',(select to_jsonb(c) from public.legal_cases c where id=p_case_id),'tables',tables,
 'scope','Case records and version snapshots; OCR text, assistance drafts and source citations require their original access/review workflow and are excluded; shared office libraries, Auth identities, access grants, tokens, provider credentials and queue internals excluded. Private document bytes must be downloaded separately and verified by sha256. This is not a full database backup or automatic reimport format.');
 perform public._legal_expansion_event(p_case_id,'restricted','case_manifest_exported',jsonb_build_object('record_count',total,'format','advocachat-case-v1'));
 return result;
end;$$;

revoke all on function public.legal_readiness_metrics(),public.legal_record_operational_cost(uuid,jsonb),public.legal_preview_case_import(jsonb),public.legal_apply_case_import(jsonb,text,uuid),public.legal_export_case_manifest(uuid) from public,anon,legal_portal;
grant execute on function public.legal_readiness_metrics(),public.legal_record_operational_cost(uuid,jsonb),public.legal_preview_case_import(jsonb),public.legal_apply_case_import(jsonb,text,uuid),public.legal_export_case_manifest(uuid) to authenticated;
notify pgrst,'reload schema';
