-- Pure SQL oracles. No tenant, customer, external source or approved production rule is created.
begin;
create function pg_temp.deadline_fixture() returns jsonb language sql as $f$
 select jsonb_build_object(
 'input',jsonb_build_object('quantity',3,'unit','business_days','anchor_date','2026-09-14','anchor_kind','publication',
  'duration_basis','Duração sintética de três dias, independente do algoritmo.','conditions_confirmed',true,'coverage_confirmed',true,'conflict_detected',false,'scope',s),
 'rule',jsonb_build_object('state','approved','valid_from','2026-01-01','valid_until','2027-12-31','scope',s,'sources',sources,
  'body',jsonb_build_object('regime','civil_procedure','nature','procedural','modality','synthetic','recipient_kind','synthetic',
   'conditions','Ensaio sem processo ou efeito jurídico real.','exclusions','Somente fixture.','validity_note','Transição sintética resolvida.',
   'transition_resolved',true,'input_kind','civil_date','anchor_kind','publication','marker_offset_count',0,'marker_offset_unit','business_days',
   'marker_adjustment','none','exclude_marker',true,'count_unit','business_days','apply_suspensions',true,'due_adjustment','next_business_day','due_time','23:59:59')),
 'calendar',jsonb_build_object('state','approved','valid_from','2026-01-01','valid_until','2027-12-31','scope',s,'sources',sources,
  'timezone','America/Sao_Paulo','body',jsonb_build_object('working_weekdays',jsonb_build_array(1,2,3,4,5),'exceptions','[]'::jsonb,'suspensions','[]'::jsonb)))
 from (select '{"court":"Órgão fictício","degree":"Grau fictício","unit":"Unidade fictícia","territory":"UF fictícia"}'::jsonb s,
  '[{"title":"Fonte inteiramente sintética","url":"https://example.invalid/source","document_id":"00000000-0000-4000-8000-000000000001","checked_on":"2026-09-11"}]'::jsonb sources) x;
$f$;
create function pg_temp.calculate(f jsonb) returns jsonb language sql as $$
 select public._legal_deadline_compute(f->'input',f->'rule',f->'calendar');
$$;
create function pg_temp.expect(f jsonb,due text,marker text,first_day text,label text) returns void language plpgsql as $$declare r jsonb;begin
 r:=pg_temp.calculate(f);
 if r->>'proposed_due_on' is distinct from due or r->>'start_marker_on' is distinct from marker
  or r->>'first_counted_on' is distinct from first_day or jsonb_array_length(r->'refusals')<>0 then
  raise exception 'Failed oracle %: %',label,r;
 end if;
 if not exists(select 1 from jsonb_array_elements(r->'memory') x where x->>'stage'='due' and x->>'on'=due) then raise exception 'Missing final trace %',label;end if;
 raise notice 'PASS %',label;
end;$$;
create function pg_temp.refused(f jsonb,code text,label text) returns void language plpgsql as $$declare r jsonb;begin
 r:=pg_temp.calculate(f);
 if r->>'proposed_due_on' is not null or r->>'due_at' is not null or not exists(select 1 from jsonb_array_elements(r->'refusals') x where x->>'code'=code) then
  raise exception 'Failed refusal %: %',label,r;
 end if;raise notice 'PASS %',label;
end;$$;

do $$declare f jsonb;g jsonb;r jsonb;h jsonb;k text;begin
 f:=pg_temp.deadline_fixture();
 g:=jsonb_set(jsonb_set(f,'{input,anchor_date}','"2026-09-11"'),'{rule,body,marker_offset_count}','1');
 perform pg_temp.expect(g,'2026-09-17','2026-09-14','2026-09-15','C01 Friday availability, Monday publication, Tuesday first day');
 g:=jsonb_set(g,'{calendar,body,exceptions}','[{"on":"2026-09-14","working_day":false,"suspend_count":false,"allow_start":true,"allow_due":true,"reason":"Feriado sintético","source_index":0}]');
 perform pg_temp.expect(g,'2026-09-18','2026-09-15','2026-09-16','C02 documented holiday changes publication and first day');
 perform pg_temp.expect(f,'2026-09-17','2026-09-14','2026-09-15','C03 exclude marker and count exactly three business days');
 g:=jsonb_set(f,'{calendar,body,exceptions}','[{"on":"2026-09-16","suspend_count":true,"allow_start":false,"allow_due":false,"reason":"Suspensão sintética","source_index":0}]');
 perform pg_temp.expect(g,'2026-09-18','2026-09-14','2026-09-15','C04 suspension skips count');
 g:=jsonb_set(f,'{input,anchor_date}','"2026-09-18"');
 perform pg_temp.expect(g,'2026-09-23','2026-09-18','2026-09-21','C05a business days cross weekend');
 g:=jsonb_set(jsonb_set(g,'{input,unit}','"calendar_days"'),'{rule,body,count_unit}','"calendar_days"');
 perform pg_temp.expect(g,'2026-09-21','2026-09-18','2026-09-19','C05b calendar days count weekend');
 g:=jsonb_set(f,'{rule,body,marker_offset_count}','5');
 perform pg_temp.expect(g,'2026-09-24','2026-09-21','2026-09-22','C06 fifth business day is excluded marker');
 g:=jsonb_set(f,'{calendar,valid_until}','"2026-09-16"');
 perform pg_temp.refused(g,'coverage_gap','C07 insufficient calendar coverage never produces a due date');
 g:=jsonb_set(f,'{input,anchor_date}','"2026-12-18"');
 g:=jsonb_set(g,'{calendar,body,suspensions}','[{"from":"2026-12-20","until":"2027-01-20","suspend_count":true,"allow_start":false,"allow_due":false,"reason":"Suspensão sintética de fim de ano","source_index":0}]');
 perform pg_temp.expect(g,'2027-01-25','2026-12-18','2027-01-21','C08 finite year-end suspension, then Thursday Friday Monday');
 g:=jsonb_set(f#-'{input,anchor_date}','{input,anchor_at}','"2026-09-15T01:00:00Z"');
 g:=jsonb_set(g,'{rule,body,input_kind}','"timestamp"');
 perform pg_temp.expect(g,'2026-09-17','2026-09-14','2026-09-15','C09 UTC timestamp derives court civil date');
 r:=pg_temp.calculate(g);if r->>'due_at'<>'2026-09-18T02:59:59Z' then raise exception 'Court due timestamp mismatch';end if;
 perform set_config('TimeZone','Pacific/Honolulu',true);r:=pg_temp.calculate(g);
 perform set_config('TimeZone','Asia/Tokyo',true);h:=pg_temp.calculate(g);
 if r is distinct from h then raise exception 'Server timezone changed result';end if;
 perform pg_temp.refused(jsonb_set(g,'{input,anchor_at}','"2026-09-15T01:00:00"'),'invalid_structure','C09b timestamp requires explicit offset');
 perform pg_temp.refused(f#-'{calendar,timezone}','timezone_required','C09c missing court timezone');
 foreach k in array array['hours','months','years'] loop
  perform pg_temp.refused(jsonb_set(f,'{input,unit}',to_jsonb(k)),'unsupported_unit','C10 unsupported unit '||k);
 end loop;
 perform pg_temp.refused(jsonb_set(f,'{rule,body,nature}','"substantive"'),'unsupported_regime','C10 material period requires manual review');
 perform pg_temp.refused(jsonb_set(f,'{rule,body,restart}','true'),'unsupported_rule','C10 unsupported restart effect cannot be ignored');
 perform pg_temp.refused(jsonb_set(f,'{rule,body,transition_resolved}','false'),'transition_unresolved','Unresolved transition');
 perform pg_temp.refused(jsonb_set(f,'{input,scope,court}','"Outro órgão"'),'scope_mismatch','Different court');
 perform pg_temp.refused(jsonb_set(f,'{input,conflict_detected}','true'),'unconfirmed_conditions','Conflicting sources');
 perform pg_temp.refused(jsonb_set(f,'{input,quantity}','0'),'invalid_quantity','Zero duration');
 perform pg_temp.refused(jsonb_set(f,'{input,quantity}','1.7'),'invalid_quantity','Fractional duration cannot be rounded');
 perform pg_temp.refused(jsonb_set(f,'{input,quantity}','999999999999999999999'),'invalid_quantity','Oversize duration');
 perform pg_temp.refused(jsonb_set(f,'{input,anchor_date}','"2026-02-30"'),'invalid_structure','Impossible civil date');
 perform pg_temp.refused(jsonb_set(f,'{rule,state}','"draft"'),'rule_unapproved','Draft rule');
 perform pg_temp.refused(jsonb_set(f,'{calendar,state}','"revoked"'),'calendar_unapproved','Revoked calendar');
 perform pg_temp.refused(jsonb_set(f,'{rule}','null'),'rule_unapproved','Missing rule');
 perform pg_temp.refused(jsonb_set(f,'{calendar,sources}','[]'),'missing_sources','Missing evidence source');
 perform pg_temp.refused(jsonb_set(f,'{calendar,body,exceptions}','[{"from":"2026-09-14","until":"2026-09-16"}]'),'invalid_calendar','Misplaced interval is not silently ignored');
 perform pg_temp.refused(jsonb_set(f,'{calendar,body,exceptions}','[{"on":"2026-09-14","suspend_count":false,"allow_start":true,"allow_due":true,"reason":"Sem referência","source_index":4}]'),'invalid_calendar','Out-of-bounds source index');
 perform pg_temp.refused(jsonb_set(f,'{calendar,body,working_weekdays}','[1,2,3,4,4]'),'conflicting_calendar','Duplicate weekdays');
 g:=jsonb_set(jsonb_set(f,'{input,anchor_date}','"2026-09-18"'),'{input,quantity}','1');
 g:=jsonb_set(g,'{calendar,body,exceptions}','[{"on":"2026-09-19","working_day":true,"suspend_count":false,"allow_start":true,"allow_due":true,"reason":"Sábado útil sintético","source_index":0}]');
 perform pg_temp.expect(g,'2026-09-19','2026-09-18','2026-09-19','Explicit working Saturday');
 g:=jsonb_set(jsonb_set(f,'{input,quantity}','1'),'{rule,body,exclude_marker}','false');
 perform pg_temp.expect(g,'2026-09-14','2026-09-14','2026-09-14','Explicit included marker');
 g:=jsonb_set(g,'{calendar,body,exceptions}','[{"on":"2026-09-14","suspend_count":false,"allow_start":false,"allow_due":true,"reason":"Início impedido","source_index":0}]');
 perform pg_temp.expect(g,'2026-09-15','2026-09-14','2026-09-15','Explicit impediment to beginning');
 g:=jsonb_set(jsonb_set(jsonb_set(f,'{input,quantity}','1'),'{input,anchor_date}','"2026-09-18"'),'{input,unit}','"calendar_days"');
 g:=jsonb_set(g,'{rule,body,count_unit}','"calendar_days"');
 perform pg_temp.expect(g,'2026-09-21','2026-09-18','2026-09-19','Explicit due-date adjustment after weekend');
 g:=jsonb_set(jsonb_set(g,'{rule,body,due_adjustment}','"none"'),'{rule,body,exclude_marker}','false');
 g:=jsonb_set(jsonb_set(g,'{input,anchor_date}','"2026-11-01"'),'{calendar,timezone}','"America/New_York"');
 g:=jsonb_set(g,'{rule,body,due_time}','"01:30:00"');
 perform pg_temp.refused(g,'ambiguous_local_time','Repeated DST local time cannot be guessed');
 g:=jsonb_set(jsonb_set(g,'{input,anchor_date}','"2026-03-08"'),'{rule,body,due_time}','"02:30:00"');
 perform pg_temp.refused(g,'nonexistent_local_time','Nonexistent DST local time cannot be normalized silently');
 if has_function_privilege('authenticated','public._legal_deadline_compute(jsonb,jsonb,jsonb)','execute')
  or has_function_privilege('legal_portal','public._legal_deadline_compute(jsonb,jsonb,jsonb)','execute')
  or has_function_privilege('anon','public._legal_deadline_compute(jsonb,jsonb,jsonb)','execute') then
  raise exception 'Pure helper is publicly callable, bypassing reviewed application workflow';
 end if;
 raise notice 'PASS private engine permissions';
end;$$;
rollback;
