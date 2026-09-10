-- Fase 4 RecupereiBR: aplica o handoff humano como uma única transação.
-- Tarefa, negociação e chat não podem ficar parcialmente atualizados.

create or replace function public.create_crm_human_handoff(
  p_tenant_id uuid,
  p_negotiation_id uuid,
  p_customer_id uuid,
  p_chat_id uuid,
  p_assignee_id uuid,
  p_stage_id text,
  p_due_at timestamptz,
  p_task_title text,
  p_task_notes text,
  p_template_id uuid,
  p_other_info jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.crm_tasks%rowtype;
  v_negotiation public.crm_negotiations%rowtype;
  v_other_info jsonb;
begin
  if not exists (
    select 1
    from public.crm_negotiations n
    where n.id = p_negotiation_id
      and n.tenant_id = p_tenant_id
      and n.customer_id = p_customer_id
  ) then
    raise exception 'Negotiation or customer not found in tenant';
  end if;

  if p_assignee_id is not null and not exists (
    select 1
    from public.profiles p
    where p.id = p_assignee_id
      and p.tenant_id = p_tenant_id
      and p.status = 'active'
  ) then
    raise exception 'Assignee is not active in tenant';
  end if;

  if p_chat_id is not null and not exists (
    select 1
    from public.whatsapp_chats c
    where c.id = p_chat_id
      and c.tenant_id = p_tenant_id
  ) then
    raise exception 'Chat not found in tenant';
  end if;

  insert into public.crm_tasks (
    tenant_id,
    negotiation_id,
    customer_id,
    assignee_id,
    title,
    due_at,
    status,
    notes,
    template_id
  )
  values (
    p_tenant_id,
    p_negotiation_id,
    p_customer_id,
    p_assignee_id,
    p_task_title,
    p_due_at,
    'aberta',
    p_task_notes,
    p_template_id
  )
  returning * into v_task;

  v_other_info :=
    coalesce(p_other_info, '{}'::jsonb)
    || jsonb_build_object(
      'human_handoff',
      coalesce(p_other_info->'human_handoff', '{}'::jsonb)
      || jsonb_build_object('task_id', v_task.id)
    );

  update public.crm_negotiations
  set
    assignee_id = p_assignee_id,
    next_task_at = p_due_at,
    stage_id = p_stage_id,
    other_info = v_other_info,
    updated_at = timezone('utc', now())
  where id = p_negotiation_id
    and tenant_id = p_tenant_id
  returning * into v_negotiation;

  if p_chat_id is not null then
    update public.whatsapp_chats
    set
      assignee_id = p_assignee_id,
      status = 'open',
      ai_mode = 'off',
      updated_at = timezone('utc', now())
    where id = p_chat_id
      and tenant_id = p_tenant_id;
  end if;

  return jsonb_build_object(
    'task', to_jsonb(v_task),
    'negotiation', to_jsonb(v_negotiation),
    'chat_id', p_chat_id,
    'ai_mode', case when p_chat_id is null then null else 'off' end
  );
end;
$$;

revoke all on function public.create_crm_human_handoff(
  uuid, uuid, uuid, uuid, uuid, text, timestamptz, text, text, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.create_crm_human_handoff(
  uuid, uuid, uuid, uuid, uuid, text, timestamptz, text, text, uuid, jsonb
) to service_role;
