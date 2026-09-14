-- Human confirmation of the medical document type. OCR suggestions remain
-- non-authoritative and are never persisted as a professional conclusion.

create or replace function public.ir_record_document_review(p_document_id uuid,p_checks jsonb,p_result text,p_note text default '',p_metadata jsonb default '{}'::jsonb)
returns public.ir_document_reviews language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare d public.legal_case_documents;r public.ir_document_reviews;
begin
 select * into d from public.legal_case_documents where id=p_document_id;
 if not found then raise exception 'Document access denied' using errcode='42501';end if;
 perform public._legal_assert_operation(d.case_id,d.category,true);perform public._ir_document(d.case_id,d.id,d.category);
 if p_checks is null or jsonb_typeof(p_checks)<>'object' or exists(select 1 from jsonb_each_text(p_checks) kv where kv.key not in ('identity','issuer','signature','date','readability','source') or kv.value not in ('present','absent','unclear','not_applicable')) then raise exception 'Invalid documentary checks' using errcode='22023';end if;
 if p_result in ('pending','inconsistent') and length(btrim(coalesce(p_note,'')))=0 then raise exception 'Document review needs a reason' using errcode='22023';end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>4000 or exists(select 1 from jsonb_object_keys(p_metadata) k where k not in ('issuer_name','professional_registration','document_nature','confirmed_document_type','issued_on','reported_onset_on')) or (p_metadata ? 'document_nature' and p_metadata->>'document_nature' not in ('official','private','unknown')) or (p_metadata ? 'confirmed_document_type' and p_metadata->>'confirmed_document_type' not in ('medical_report','medical_certificate','exam','prescription','other','unknown')) then raise exception 'Invalid documentary metadata' using errcode='22023';end if;
 if p_metadata->>'reported_onset_on' is not null and d.category<>'medical' then raise exception 'Reported disease onset requires medical category' using errcode='22023';end if;
 if p_metadata->>'confirmed_document_type' is not null and d.category<>'medical' then raise exception 'Confirmed medical document type requires medical category' using errcode='22023';end if;
 if d.category='medical' and coalesce(p_metadata->>'confirmed_document_type','unknown')='unknown' then raise exception 'Responsible lawyer must confirm the medical document type' using errcode='22023';end if;
 if (p_metadata->>'issued_on' is not null and p_metadata->>'issued_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') or (p_metadata->>'reported_onset_on' is not null and p_metadata->>'reported_onset_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Document dates must use YYYY-MM-DD' using errcode='22023';end if;
 perform (p_metadata->>'issued_on')::date,(p_metadata->>'reported_onset_on')::date;
 insert into public.ir_document_reviews(tenant_id,case_id,document_id,category,checks,metadata,result,review_note,reviewer_id) values(d.tenant_id,d.case_id,d.id,d.category,p_checks,p_metadata,p_result,p_note,auth.uid()) returning * into r;
 perform public._ir_touch(d.case_id);perform public._legal_record_event(d.case_id,'ir_document_reviewed','Conferência documental registrada; sem diagnóstico automático.',jsonb_build_object('document_review_id',r.id));return r;
end;$$;

revoke all on function public.ir_record_document_review(uuid,jsonb,text,text,jsonb) from public,anon;
grant execute on function public.ir_record_document_review(uuid,jsonb,text,text,jsonb) to authenticated;
