-- F6: deterministic, table-free counting engine. No approved legal rule is seeded.
-- Approval, source permissions, association and current-version checks belong to 2400.
create or replace function public._legal_deadline_day(p_on date,p_calendar jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
declare b jsonb:=p_calendar->'body'; e jsonb; w boolean; s boolean:=false;
 a boolean:=true; d boolean:=true; reasons text[]:='{}';
begin
 w:=exists(select 1 from jsonb_array_elements_text(b->'working_weekdays') x where x::integer=extract(isodow from p_on)::integer);
 for e in select value from jsonb_array_elements(b->'suspensions') loop
  if p_on between (e->>'from')::date and (e->>'until')::date then
   s:=s or (e->>'suspend_count')::boolean;
   a:=a and (e->>'allow_start')::boolean;d:=d and (e->>'allow_due')::boolean;
   reasons:=array_append(reasons,e->>'reason');
  end if;
 end loop;
 for e in select value from jsonb_array_elements(b->'exceptions') loop
  if p_on=(e->>'on')::date then
   if e ? 'working_day' then w:=(e->>'working_day')::boolean;end if;
   -- An exception never silently cancels a suspension. Overlap keeps the stricter effect.
   s:=s or (e->>'suspend_count')::boolean;
   a:=a and (e->>'allow_start')::boolean;d:=d and (e->>'allow_due')::boolean;
   reasons:=array_append(reasons,e->>'reason');
  end if;
 end loop;
 return jsonb_build_object('working_day',w,'suspended',s,'allow_start',a,'allow_due',d,
  'reason',case when cardinality(reasons)>0 then array_to_string(reasons,'; ') when w then 'Dia útil do calendário revisado' else 'Dia não útil do calendário revisado' end);
end;$$;

create or replace function public._legal_deadline_refuse(p_result jsonb,p_code text,p_message text)
returns jsonb language sql immutable set search_path=pg_catalog,public,pg_temp as $$
 select p_result || jsonb_build_object('proposed_due_on',null,'due_at',null,
  'refusals',coalesce(p_result->'refusals','[]'::jsonb)||jsonb_build_array(jsonb_build_object('code',p_code,'message',p_message)));
$$;

create or replace function public._legal_deadline_compute(p_input jsonb,p_rule jsonb,p_calendar jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
declare
 r jsonb:=jsonb_build_object('proposed_due_on',null,'start_marker_on',null,'first_counted_on',null,
  'due_at',null,'timezone',null,'memory','[]'::jsonb,'refusals','[]'::jsonb);
 b jsonb:=p_rule->'body'; cb jsonb:=p_calendar->'body'; e jsonb; k text; v jsonb; scope jsonb;
 tz text; anchor date; marker date; current_day date; first_day date; due_day date;
 cal_from date;cal_until date;rule_from date;rule_until date;
 quantity integer;offset_count integer;counted integer:=0;steps integer:=0;offset_done integer:=0;
 dp jsonb;eligible boolean;reason text;stage text;apply_suspensions boolean;
 local_due timestamp;utc_due timestamptz;alternate integer;
 memory jsonb[]:='{}';
begin
 if jsonb_typeof(p_input) is distinct from 'object' then
  return public._legal_deadline_refuse(r,'invalid_input','Informe os dados da contagem.');
 end if;
 if jsonb_typeof(p_rule) is distinct from 'object' or p_rule->>'state' is distinct from 'approved' then
  r:=public._legal_deadline_refuse(r,'rule_unapproved','Selecione uma versão de regra aprovada.');
 end if;
 if jsonb_typeof(p_calendar) is distinct from 'object' or p_calendar->>'state' is distinct from 'approved' then
  r:=public._legal_deadline_refuse(r,'calendar_unapproved','Selecione uma versão de calendário aprovada.');
 end if;
 if jsonb_array_length(r->'refusals')>0 then return r;end if;
 if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(cb) is distinct from 'object' then
  return public._legal_deadline_refuse(r,'invalid_structure','Regra ou calendário sem estrutura válida.');
 end if;
 if exists(select 1 from jsonb_object_keys(b) x where x<>all(array['regime','nature','modality','recipient_kind','conditions','exclusions','validity_note','transition_resolved','input_kind','anchor_kind','marker_offset_count','marker_offset_unit','marker_adjustment','exclude_marker','count_unit','apply_suspensions','due_adjustment','due_time']))
  or exists(select 1 from jsonb_object_keys(cb) x where x<>all(array['working_weekdays','exceptions','suspensions'])) then
  return public._legal_deadline_refuse(r,'unsupported_rule','A regra contém efeitos não suportados pelo motor; faça conferência manual.');
 end if;
 if b->>'regime' is distinct from 'civil_procedure' or b->>'nature' is distinct from 'procedural' then
  return public._legal_deadline_refuse(r,'unsupported_regime','Esta contagem suporta somente prazo processual civil em dias; faça conferência manual para outra natureza.');
 end if;
 if b->>'input_kind' not in ('civil_date','timestamp') or b->>'input_kind' is null
  or b->>'marker_offset_unit' not in ('business_days','calendar_days') or b->>'marker_offset_unit' is null
  or b->>'marker_adjustment' not in ('none','next_business_day') or b->>'marker_adjustment' is null
  or b->>'count_unit' not in ('business_days','calendar_days') or b->>'count_unit' is null
  or b->>'due_adjustment' not in ('none','next_business_day') or b->>'due_adjustment' is null
  or p_input->>'unit' is distinct from b->>'count_unit' then
  return public._legal_deadline_refuse(r,'unsupported_unit','Unidade ou ajuste não suportado, ou divergente da regra revisada.');
 end if;
 foreach k in array array['transition_resolved','exclude_marker','apply_suspensions'] loop
  if jsonb_typeof(b->k) is distinct from 'boolean' then
   return public._legal_deadline_refuse(r,'invalid_rule','A regra precisa declarar os efeitos de contagem e de transição.');
  end if;
 end loop;
 if b->'transition_resolved' is distinct from 'true'::jsonb then
  return public._legal_deadline_refuse(r,'transition_unresolved','Resolva a vigência e a transição da regra antes de contar.');
 end if;
 foreach k in array array['modality','recipient_kind','conditions','exclusions','validity_note','anchor_kind'] loop
  if jsonb_typeof(b->k) is distinct from 'string' or length(btrim(b->>k)) not between 1 and 4000 then
   return public._legal_deadline_refuse(r,'invalid_rule','Modalidade, destinatário, condições, exclusões e vigência precisam ser expressos.');
  end if;
 end loop;
 if p_input->>'anchor_kind' is distinct from b->>'anchor_kind' then
  return public._legal_deadline_refuse(r,'anchor_mismatch','O marco informado não corresponde ao marco da regra.');
 end if;
 if p_input->'conditions_confirmed' is distinct from 'true'::jsonb
  or p_input->'coverage_confirmed' is distinct from 'true'::jsonb
  or p_input->'conflict_detected' is distinct from 'false'::jsonb
  or jsonb_typeof(p_input->'duration_basis') is distinct from 'string'
  or length(btrim(p_input->>'duration_basis')) not between 1 and 4000 then
  return public._legal_deadline_refuse(r,'unconfirmed_conditions','Conferir condições, duração, cobertura e eventual divergência entre fontes.');
 end if;
 scope:=p_input->'scope';
 if jsonb_typeof(scope) is distinct from 'object' or scope is distinct from p_rule->'scope' or scope is distinct from p_calendar->'scope' then
  return public._legal_deadline_refuse(r,'scope_mismatch','Órgão, grau, unidade e território precisam coincidir exatamente.');
 end if;
 foreach k in array array['court','degree','unit','territory'] loop
  if jsonb_typeof(scope->k) is distinct from 'string' or length(btrim(scope->>k)) not between 1 and 200 then
   return public._legal_deadline_refuse(r,'incomplete_scope','Informe órgão, grau, unidade e território da contagem.');
  end if;
 end loop;
 foreach v in array array[p_rule,p_calendar] loop
  if jsonb_typeof(v->'sources') is distinct from 'array' or jsonb_array_length(v->'sources') not between 1 and 100 then
   return public._legal_deadline_refuse(r,'missing_sources','Regra e calendário precisam de fontes documentadas.');
  end if;
  for e in select value from jsonb_array_elements(v->'sources') loop
   if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'title') is distinct from 'string'
    or length(btrim(e->>'title')) not between 1 and 500 or jsonb_typeof(e->'url') is distinct from 'string'
    or e->>'url' !~ '^https://[^[:space:]]+$' or jsonb_typeof(e->'document_id') is distinct from 'string'
    or e->>'document_id' !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    or public._legal_judicial_date(e->>'checked_on') is null then
    return public._legal_deadline_refuse(r,'invalid_sources','Cada fonte precisa de origem, documento e data de consulta.');
   end if;
  end loop;
 end loop;
 tz:=p_calendar->>'timezone';
 if jsonb_typeof(p_calendar->'timezone') is distinct from 'string'
  or (tz<>'UTC' and tz !~ '^[A-Za-z_]+/[A-Za-z_+-]+(/[A-Za-z_+-]+)?$') then
  return public._legal_deadline_refuse(r,'timezone_required','Informe o fuso IANA do órgão; não use o fuso do navegador.');
 end if;
 -- AT TIME ZONE also rejects an unknown IANA name without consulting application tables.
 perform timestamp '2000-01-01 12:00:00' at time zone tz;r:=r||jsonb_build_object('timezone',tz);
 cal_from:=public._legal_judicial_date(p_calendar->>'valid_from');cal_until:=public._legal_judicial_date(p_calendar->>'valid_until');
 rule_from:=public._legal_judicial_date(p_rule->>'valid_from');rule_until:=public._legal_judicial_date(p_rule->>'valid_until');
 if cal_from is null or cal_until is null or rule_from is null or rule_until is null
  or cal_until<cal_from or rule_until<rule_from or cal_until>cal_from+interval '10 years' then
  return public._legal_deadline_refuse(r,'invalid_coverage','Regra e calendário precisam de vigência finita e cobertura explícita.');
 end if;
 if jsonb_typeof(cb->'working_weekdays') is distinct from 'array' or jsonb_array_length(cb->'working_weekdays') not between 1 and 7
  or jsonb_typeof(cb->'exceptions') is distinct from 'array' or jsonb_array_length(cb->'exceptions')>1000
  or jsonb_typeof(cb->'suspensions') is distinct from 'array' or jsonb_array_length(cb->'suspensions')>100 then
  return public._legal_deadline_refuse(r,'invalid_calendar','Calendário sem dias úteis, exceções e suspensões válidos.');
 end if;
 for e in select value from jsonb_array_elements(cb->'working_weekdays') loop
  if jsonb_typeof(e) is distinct from 'number' or e::text !~ '^[1-7]$' then
   return public._legal_deadline_refuse(r,'invalid_calendar','Dias da semana devem usar ISO: 1 a 7.');
  end if;
 end loop;
 if exists(select value from jsonb_array_elements(cb->'working_weekdays') group by value having count(*)>1)
  or exists(select value->>'on' from jsonb_array_elements(cb->'exceptions') group by value->>'on' having count(*)>1) then
  return public._legal_deadline_refuse(r,'conflicting_calendar','Remova dias repetidos ou exceções conflitantes antes da contagem.');
 end if;
 for e in select value from jsonb_array_elements(cb->'exceptions') loop
  if jsonb_typeof(e) is distinct from 'object' or not(e ? 'on') then
   return public._legal_deadline_refuse(r,'invalid_calendar','Cada exceção precisa de uma data civil.');
  end if;
  if exists(select 1 from jsonb_object_keys(e) x where x<>all(array['on','working_day','suspend_count','allow_start','allow_due','reason','source_index'])) then
   return public._legal_deadline_refuse(r,'invalid_calendar','Exceção contém um efeito não suportado.');
  end if;
 end loop;
 for e in select value from jsonb_array_elements(cb->'suspensions') loop
  if jsonb_typeof(e) is distinct from 'object' or not(e ? 'from' and e ? 'until') then
   return public._legal_deadline_refuse(r,'invalid_calendar','Cada suspensão precisa de um intervalo explícito.');
  end if;
  if exists(select 1 from jsonb_object_keys(e) x where x<>all(array['from','until','suspend_count','allow_start','allow_due','reason','source_index'])) then
   return public._legal_deadline_refuse(r,'invalid_calendar','Suspensão contém um efeito não suportado.');
  end if;
 end loop;
 for e in select value from jsonb_array_elements((cb->'exceptions')||(cb->'suspensions')) loop
  if jsonb_typeof(e) is distinct from 'object' then return public._legal_deadline_refuse(r,'invalid_calendar','Exceção ou suspensão inválida.');end if;
  foreach k in array array['suspend_count','allow_start','allow_due'] loop
   if jsonb_typeof(e->k) is distinct from 'boolean' then return public._legal_deadline_refuse(r,'invalid_calendar','Cada exceção precisa declarar seus efeitos sobre a contagem.');end if;
  end loop;
  if (e ? 'working_day' and jsonb_typeof(e->'working_day') is distinct from 'boolean')
   or jsonb_typeof(e->'reason') is distinct from 'string' or length(btrim(e->>'reason')) not between 1 and 2000
   or jsonb_typeof(e->'source_index') is distinct from 'number' or (e->>'source_index') !~ '^\d+$'
   or (e->>'source_index')::numeric>=jsonb_array_length(p_calendar->'sources') then
   return public._legal_deadline_refuse(r,'invalid_calendar','Exceções e suspensões precisam de motivo e referência válida.');
  end if;
  if e ? 'on' then
   current_day:=public._legal_judicial_date(e->>'on');
   if current_day is null or current_day not between cal_from and cal_until or e ? 'from' or e ? 'until' then
    return public._legal_deadline_refuse(r,'invalid_calendar','Exceção fora da cobertura ou com datas ambíguas.');
   end if;
  else
   current_day:=public._legal_judicial_date(e->>'from');due_day:=public._legal_judicial_date(e->>'until');
   if current_day is null or due_day is null or due_day<current_day or current_day<cal_from or due_day>cal_until then
    return public._legal_deadline_refuse(r,'invalid_calendar','Suspensão fora da cobertura ou sem intervalo válido.');
   end if;
  end if;
 end loop;
 if jsonb_typeof(p_input->'quantity') is distinct from 'number' or p_input->>'quantity' !~ '^\d+$'
  or (p_input->>'quantity')::numeric not between 1 and 3650
  or jsonb_typeof(b->'marker_offset_count') is distinct from 'number' or b->>'marker_offset_count' !~ '^\d+$'
  or (b->>'marker_offset_count')::numeric not between 0 and 365 then
  return public._legal_deadline_refuse(r,'invalid_quantity','Informe duração inteira de 1 a 3650 dias e deslocamento de marco de 0 a 365.');
 end if;
 quantity:=(p_input->>'quantity')::integer;offset_count:=(b->>'marker_offset_count')::integer;
 apply_suspensions:=(b->>'apply_suspensions')::boolean;
 if b->>'input_kind'='civil_date' then
  if nullif(p_input->>'anchor_at','') is not null then return public._legal_deadline_refuse(r,'ambiguous_anchor','Informe apenas a data civil do marco.');end if;
  anchor:=public._legal_judicial_date(p_input->>'anchor_date');
 else
  if nullif(p_input->>'anchor_date','') is not null then return public._legal_deadline_refuse(r,'ambiguous_anchor','Informe apenas o instante do marco com offset.');end if;
  anchor:=(public._legal_judicial_timestamp(p_input->>'anchor_at') at time zone tz)::date;
 end if;
 if anchor is null then return public._legal_deadline_refuse(r,'missing_anchor','Informe o marco comprovado na forma exigida pela regra.');end if;
 if b->>'due_time' is null or b->>'due_time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' then
  return public._legal_deadline_refuse(r,'due_time_required','A regra deve declarar o horário de vencimento do órgão.');
 end if;
 if anchor not between cal_from and cal_until or anchor not between rule_from and rule_until then
  return public._legal_deadline_refuse(r,'coverage_gap','O marco está fora da vigência da regra ou da cobertura do calendário.');
 end if;
 current_day:=anchor;
 dp:=public._legal_deadline_day(current_day,p_calendar);
 memory:=array_append(memory,jsonb_build_object('on',current_day,'stage','anchor','working_day',dp->'working_day','suspended',dp->'suspended','eligible',false,'index',0,'reason','Marco informado; '||(dp->>'reason')));
 while offset_done<offset_count loop
  current_day:=current_day+1;steps:=steps+1;
  if steps>3700 or current_day not between cal_from and cal_until or current_day not between rule_from and rule_until then
   return public._legal_deadline_refuse(r||jsonb_build_object('memory',to_jsonb(memory)),'coverage_gap','Cobertura insuficiente durante o deslocamento do marco.');
  end if;
  dp:=public._legal_deadline_day(current_day,p_calendar);
  eligible:=(b->>'marker_offset_unit'='calendar_days' or (dp->>'working_day')::boolean) and (not apply_suspensions or not(dp->>'suspended')::boolean);
  if eligible then offset_done:=offset_done+1;end if;
  memory:=array_append(memory,jsonb_build_object('on',current_day,'stage','marker_offset','working_day',dp->'working_day','suspended',dp->'suspended','eligible',eligible,'index',offset_done,'reason',dp->>'reason'));
 end loop;
 if b->>'marker_adjustment'='next_business_day' then
  loop
   dp:=public._legal_deadline_day(current_day,p_calendar);
   exit when (dp->>'working_day')::boolean and (dp->>'allow_start')::boolean and (not apply_suspensions or not(dp->>'suspended')::boolean);
   memory:=array_append(memory,jsonb_build_object('on',current_day,'stage','marker_adjustment','working_day',dp->'working_day','suspended',dp->'suspended','eligible',false,'index',0,'reason',dp->>'reason'));
   current_day:=current_day+1;steps:=steps+1;
   if steps>3700 or current_day not between cal_from and cal_until or current_day not between rule_from and rule_until then
    return public._legal_deadline_refuse(r||jsonb_build_object('memory',to_jsonb(memory)),'coverage_gap','Cobertura insuficiente para ajustar o marco.');
   end if;
  end loop;
 end if;
 marker:=current_day;r:=r||jsonb_build_object('start_marker_on',marker);
 if (b->>'exclude_marker')::boolean then
  dp:=public._legal_deadline_day(current_day,p_calendar);
  memory:=array_append(memory,jsonb_build_object('on',current_day,'stage','excluded_marker','working_day',dp->'working_day','suspended',dp->'suspended','eligible',false,'index',0,'reason','Marco excluído pela regra revisada'));
  current_day:=current_day+1;
 end if;
 while counted<quantity loop
  steps:=steps+1;
  if steps>3700 or current_day not between cal_from and cal_until or current_day not between rule_from and rule_until then
   return public._legal_deadline_refuse(r||jsonb_build_object('memory',to_jsonb(memory)),'coverage_gap','Cobertura insuficiente para completar a contagem; confira manualmente.');
  end if;
  dp:=public._legal_deadline_day(current_day,p_calendar);
  eligible:=(b->>'count_unit'='calendar_days' or (dp->>'working_day')::boolean)
   and (not apply_suspensions or not(dp->>'suspended')::boolean)
   and (counted>0 or (dp->>'allow_start')::boolean);
  if eligible then
   counted:=counted+1;if first_day is null then first_day:=current_day;r:=r||jsonb_build_object('first_counted_on',first_day);end if;
  end if;
  memory:=array_append(memory,jsonb_build_object('on',current_day,'stage','count','working_day',dp->'working_day','suspended',dp->'suspended','eligible',eligible,'index',counted,'reason',dp->>'reason'));
  if counted<quantity then current_day:=current_day+1;end if;
 end loop;
 if b->>'due_adjustment'='next_business_day' then
  loop
   dp:=public._legal_deadline_day(current_day,p_calendar);
   exit when (dp->>'working_day')::boolean and (dp->>'allow_due')::boolean and (not apply_suspensions or not(dp->>'suspended')::boolean);
   memory:=array_append(memory,jsonb_build_object('on',current_day,'stage','due_adjustment','working_day',dp->'working_day','suspended',dp->'suspended','eligible',false,'index',counted,'reason',dp->>'reason'));
   current_day:=current_day+1;steps:=steps+1;
   if steps>3700 or current_day not between cal_from and cal_until or current_day not between rule_from and rule_until then
    return public._legal_deadline_refuse(r||jsonb_build_object('memory',to_jsonb(memory)),'coverage_gap','Cobertura insuficiente para ajustar o vencimento.');
   end if;
  end loop;
 elsif not(dp->>'allow_due')::boolean then
  return public._legal_deadline_refuse(r||jsonb_build_object('memory',to_jsonb(memory)),'due_not_allowed','O calendário impede o vencimento nesta data e a regra não define ajuste.');
 end if;
 due_day:=current_day;local_due:=due_day+(b->>'due_time')::time;utc_due:=local_due at time zone tz;
 if utc_due at time zone tz<>local_due then
  return public._legal_deadline_refuse(r||jsonb_build_object('memory',to_jsonb(memory)),'nonexistent_local_time','O horário não existe neste fuso na data proposta; confira a regra.');
 end if;
 -- Detect repeated local times in historical timezone transitions (including half-hour shifts).
 for alternate in -8..8 loop
  if alternate<>0 and (utc_due+alternate*interval '30 minutes') at time zone tz=local_due then
   return public._legal_deadline_refuse(r||jsonb_build_object('memory',to_jsonb(memory)),'ambiguous_local_time','O horário ocorre duas vezes neste fuso; o vencimento exige conferência.');
  end if;
 end loop;
 memory:=array_append(memory,jsonb_build_object('on',due_day,'stage','due','working_day',dp->'working_day','suspended',dp->'suspended','eligible',true,'index',counted,'reason','Vencimento proposto; '||(dp->>'reason')));
 r:=jsonb_set(r,'{memory}',to_jsonb(memory));
 return r||jsonb_build_object('proposed_due_on',due_day,'due_at',to_char(utc_due at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
exception when invalid_datetime_format or datetime_field_overflow or invalid_parameter_value or invalid_text_representation or numeric_value_out_of_range then
 return public._legal_deadline_refuse(r||jsonb_build_object('memory',to_jsonb(memory)),'invalid_structure','Data, fuso ou estrutura inválidos; nenhum vencimento foi definido.');
end;$$;

revoke all on function public._legal_deadline_day(date,jsonb),public._legal_deadline_refuse(jsonb,text,text),public._legal_deadline_compute(jsonb,jsonb,jsonb) from public,anon,authenticated,legal_portal;
