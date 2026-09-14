-- Persistent, owner-triggered IR operational tasks. This does not approve legal
-- conclusions, calculate deadlines, contact clients or execute external acts.

create table public.legal_ir_automation_task_links (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 case_id uuid not null,
 action_key text not null check(action_key ~ '^[a-z_]+:[a-z0-9-]+$' and length(action_key)<=120),
 category text not null check(category in ('general','medical','fiscal','combined')),
 source_kind text not null check(source_kind in ('checklist','document_review','fiscal_inventory','calculation','assessment')),
 source_id uuid,
 task_id uuid not null,
 state text not null default 'active' check(state in ('active','resolved','dismissed')),
 opened_at timestamptz not null default clock_timestamp(),
 closed_at timestamptz,
 created_by uuid not null references public.profiles(id) on delete restrict,
 unique(id,case_id,tenant_id),
 unique(task_id,case_id,tenant_id),
 foreign key(case_id,tenant_id) references public.legal_cases(id,tenant_id) on delete restrict,
 foreign key(task_id,case_id,tenant_id) references public.legal_case_tasks(id,case_id,tenant_id) on delete restrict,
 check((state='active' and closed_at is null) or (state<>'active' and closed_at is not null))
);
create unique index legal_ir_automation_active_key
 on public.legal_ir_automation_task_links(case_id,action_key) where state='active';
create index legal_ir_automation_case_history
 on public.legal_ir_automation_task_links(case_id,opened_at desc,id);
alter table public.legal_ir_automation_task_links enable row level security;

create or replace function public.legal_ir_can_read_automation_task(p_task_id uuid,p_case_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select public.legal_can_access_case(p_case_id) and not exists(
  select 1 from public.legal_ir_automation_task_links l where l.task_id=p_task_id and
   case l.category when 'combined' then not(public.legal_can_access_category(l.case_id,'medical') and public.legal_can_access_category(l.case_id,'fiscal'))
   else not public.legal_can_access_category(l.case_id,l.category) end
 );
$$;
create policy legal_ir_automation_links_read on public.legal_ir_automation_task_links for select to authenticated
 using(public.legal_ir_can_read_automation_task(task_id,case_id));
create policy legal_ir_automation_task_category on public.legal_case_tasks as restrictive for select to authenticated
 using(public.legal_ir_can_read_automation_task(id,case_id));

create or replace function public.legal_ir_sync_automation_tasks(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare
 tenant uuid:=public._legal_assert_operation(p_case_id,'general',true);
 owner_id uuid;
 context jsonb;
 desired record;
 link public.legal_ir_automation_task_links;
 task public.legal_case_tasks;
 created_count integer:=0;
 resolved_count integer:=0;
 dismissed_count integer:=0;
begin
 select c.owner_id into owner_id from public.legal_cases c where c.id=p_case_id for update;
 if owner_id is null or auth.uid() is distinct from owner_id then raise exception 'Case owner required' using errcode='42501';end if;
 context:=public.ir_get_case_context(p_case_id);
 create temporary table if not exists pg_temp.ir_desired_actions(
  action_key text primary key,category text,source_kind text,source_id uuid,title text,notes text
 ) on commit drop;
 truncate pg_temp.ir_desired_actions;

 insert into pg_temp.ir_desired_actions
 select 'checklist:'||i.id,i.category,'checklist',i.id,i.title,
  'Pendência derivada do checklist de IR. Confira o documento e o estado atual no módulo de isenção antes de concluir.'
 from public.ir_case_checklist_items i left join public.legal_document_requests q on q.id=i.document_request_id
 where i.case_id=p_case_id and i.required and i.waived_by is null and coalesce(q.status,'open') not in ('approved','cancelled');

 insert into pg_temp.ir_desired_actions
 select 'document_review:'||r.document_id,r.category,'document_review',r.document_id,
  case when r.result='inconsistent' then 'Conferir divergência documental de IR' else 'Concluir conferência documental de IR' end,
  'Abra a versão atual do documento e registre a conferência. A tarefa não aprova o conteúdo automaticamente.'
 from (select distinct on(document_id) * from public.ir_document_reviews where case_id=p_case_id order by document_id,created_at desc,id desc) r
 where r.result<>'sufficient';

 if context->>'can_fiscal'='true' and exists(select 1 from public.ir_tax_entries where case_id=p_case_id and (source_id is null or (calendar_year is null and competence is null) or withheld is null)) then
  insert into pg_temp.ir_desired_actions values('fiscal_inventory:'||p_case_id,'fiscal','fiscal_inventory',null,'Conferir lançamentos fiscais incompletos','Há lançamentos sem fonte, período ou retenção. Valor não informado não equivale a zero.');
 end if;
 if context->>'can_assess'='true' then
  insert into pg_temp.ir_desired_actions
  select 'calculation:'||c.id,'combined','calculation',c.id,'Revisar cálculo de IR · versão '||c.version_number,
   'Confira parâmetros, inventário, memória e recusas antes de qualquer aprovação profissional.'
  from public.ir_calculation_versions c where c.case_id=p_case_id and c.status in ('incomplete','draft','in_review');
  if context->>'latest_assessment_id' is null or coalesce((context->>'assessment_is_current')::boolean,false)=false then
   insert into pg_temp.ir_desired_actions values('assessment:'||p_case_id,'combined','assessment',null,'Preparar análise profissional atualizada','Revisar fatos, fontes e documentos atuais. Esta tarefa não define enquadramento ou estratégia automaticamente.');
  end if;
 end if;

 for desired in select * from pg_temp.ir_desired_actions order by action_key loop
  select * into link from public.legal_ir_automation_task_links where case_id=p_case_id and action_key=desired.action_key and state='active' for update;
  if not found then
   if not exists(select 1 from public.legal_ir_automation_task_links l where l.case_id=p_case_id and l.action_key=desired.action_key and l.state='dismissed') then
    task:=public._legal_f2_save_case_task(p_case_id,jsonb_build_object('title',desired.title,'notes',desired.notes,'assignee_id',owner_id,'status','open'));
    insert into public.legal_ir_automation_task_links(tenant_id,case_id,action_key,category,source_kind,source_id,task_id,created_by)
     values(tenant,p_case_id,desired.action_key,desired.category,desired.source_kind,desired.source_id,task.id,auth.uid());
    created_count:=created_count+1;
   end if;
  elsif not exists(select 1 from public.legal_case_tasks t where t.id=link.task_id and t.status='open') then
   update public.legal_ir_automation_task_links set state='dismissed',closed_at=clock_timestamp() where id=link.id;
   dismissed_count:=dismissed_count+1;
  end if;
 end loop;

 for link in select l.* from public.legal_ir_automation_task_links l where l.case_id=p_case_id and l.state='active' and not exists(select 1 from pg_temp.ir_desired_actions d where d.action_key=l.action_key) for update loop
  select * into task from public.legal_case_tasks where id=link.task_id for update;
  if task.status='open' then
   perform public._legal_f2_save_case_task(p_case_id,jsonb_build_object('status','completed'),task.id);
  end if;
  update public.legal_ir_automation_task_links set state=case when task.status='open' then 'resolved' else 'dismissed' end,closed_at=clock_timestamp() where id=link.id;
  resolved_count:=resolved_count+1;
 end loop;

 update public.legal_ir_automation_task_links l set state='resolved'
 where l.case_id=p_case_id and l.state='dismissed'
  and not exists(select 1 from pg_temp.ir_desired_actions d where d.action_key=l.action_key);
 return jsonb_build_object('created',created_count,'resolved',resolved_count,'dismissed',dismissed_count,
  'active',(select count(*) from public.legal_ir_automation_task_links where case_id=p_case_id and state='active'));
end;$$;

revoke all on public.legal_ir_automation_task_links from anon,authenticated;
grant select on public.legal_ir_automation_task_links to authenticated;
revoke all on function public.legal_ir_can_read_automation_task(uuid,uuid) from public,anon;
grant execute on function public.legal_ir_can_read_automation_task(uuid,uuid) to authenticated;
revoke all on function public.legal_ir_sync_automation_tasks(uuid) from public,anon;
grant execute on function public.legal_ir_sync_automation_tasks(uuid) to authenticated;
