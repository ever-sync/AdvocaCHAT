-- Atendimento: reforço em RPCs (conversa/negócio assumidos) e UPDATE de clientes com negócio no pool.

create or replace function public.can_atendimento_act_on_chat(p_assignee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() in ('admin', 'operacao', 'financeiro')
    or (
      public.current_user_role() = 'atendimento'
      and p_assignee_id is not null
      and p_assignee_id = auth.uid()
    );
$$;

grant execute on function public.can_atendimento_act_on_chat(uuid) to authenticated;

create or replace function public.can_atendimento_update_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() in ('admin', 'operacao', 'financeiro')
    or (
      public.current_user_role() = 'atendimento'
      and not exists (
        select 1
        from public.crm_negotiations n
        where n.customer_id = p_customer_id
          and n.tenant_id = public.current_tenant_id()
          and n.status = 'em_andamento'
          and (
            n.assignee_id is null
            or n.assignee_id is distinct from auth.uid()
          )
      )
    );
$$;

grant execute on function public.can_atendimento_update_customer(uuid) to authenticated;

create or replace function public.set_chat_resolution(
  p_chat_id uuid,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_assignee uuid;
begin
  if p_resolution not in ('open', 'pending', 'resolved', 'waiting_customer', 'lost') then
    raise exception 'Resolução inválida';
  end if;

  select tenant_id, assignee_id into v_tenant, v_assignee
  from public.whatsapp_chats
  where id = p_chat_id;

  if v_tenant is null or not public.is_same_tenant(v_tenant) then
    raise exception 'Chat não encontrado';
  end if;

  if not public.can_atendimento_act_on_chat(v_assignee) then
    raise exception 'Assuma a conversa para alterar a resolução';
  end if;

  update public.whatsapp_chats
  set
    resolution = p_resolution,
    status = case when p_resolution in ('resolved', 'lost') then 'closed' else 'open' end
  where id = p_chat_id;

  if p_resolution = 'resolved' then
    insert into public.crm_activities (tenant_id, chat_id, customer_id, activity_type, title, created_by)
    select c.tenant_id, c.id, c.customer_id, 'chat_resolved', 'Conversa resolvida', auth.uid()
    from public.whatsapp_chats c
    where c.id = p_chat_id;
  elsif p_resolution = 'lost' then
    insert into public.crm_activities (tenant_id, chat_id, customer_id, activity_type, title, created_by)
    select c.tenant_id, c.id, c.customer_id, 'chat_lost', 'Conversa perdida', auth.uid()
    from public.whatsapp_chats c
    where c.id = p_chat_id;
  end if;
end;
$$;

create or replace function public.link_chat_negotiation(
  p_chat_id uuid,
  p_negotiation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_chat record;
  v_neg record;
begin
  select tenant_id into v_tenant from public.profiles where id = auth.uid();

  select id, tenant_id, customer_id, assignee_id into v_chat
  from public.whatsapp_chats
  where id = p_chat_id;

  select id, tenant_id, customer_id, status, assignee_id into v_neg
  from public.crm_negotiations
  where id = p_negotiation_id;

  if v_chat.id is null or v_chat.tenant_id != v_tenant then
    raise exception 'Chat não encontrado';
  end if;

  if v_neg.id is null or v_neg.tenant_id != v_tenant then
    raise exception 'Negociação não encontrada';
  end if;

  if v_chat.customer_id is null or v_neg.customer_id is distinct from v_chat.customer_id then
    raise exception 'Negociação não pertence ao cliente desta conversa';
  end if;

  if not public.can_atendimento_act_on_chat(v_chat.assignee_id) then
    raise exception 'Assuma a conversa para vincular negociação';
  end if;

  if not public.can_modify_crm_negotiation(v_neg.assignee_id) then
    raise exception 'Assuma o negócio para vincular esta negociação';
  end if;

  update public.crm_negotiations
  set source_chat_id = coalesce(source_chat_id, p_chat_id)
  where id = p_negotiation_id;

  update public.whatsapp_chats
  set primary_negotiation_id = p_negotiation_id
  where id = p_chat_id;
end;
$$;

drop function if exists public.ensure_lead_from_chat(uuid, boolean);

create or replace function public.ensure_lead_from_chat(
  p_chat_id uuid,
  p_auto_assign boolean default false,
  p_force_new boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat record;
  v_neg_id uuid;
  v_neg_assignee uuid;
  v_funnel_id text;
  v_stage_id text;
  v_title text;
begin
  select
    c.id,
    c.tenant_id,
    c.customer_id,
    c.display_name,
    c.assignee_id,
    c.primary_negotiation_id,
    cu.nome as customer_nome
  into v_chat
  from public.whatsapp_chats c
  left join public.customers cu on cu.id = c.customer_id
  where c.id = p_chat_id;

  if v_chat.id is null then
    raise exception 'Chat não encontrado';
  end if;

  if v_chat.customer_id is null then
    raise exception 'Chat sem cliente vinculado';
  end if;

  if not public.can_atendimento_act_on_chat(v_chat.assignee_id) then
    raise exception 'Assuma a conversa antes de vincular ao CRM';
  end if;

  if not p_force_new then
    if v_chat.primary_negotiation_id is not null then
      select n.id, n.assignee_id into v_neg_id, v_neg_assignee
      from public.crm_negotiations n
      where n.id = v_chat.primary_negotiation_id
        and n.status = 'em_andamento';
      if v_neg_id is not null then
        if not public.can_modify_crm_negotiation(v_neg_assignee) then
          raise exception 'Assuma o negócio antes de continuar';
        end if;
        return v_neg_id;
      end if;
    end if;

    select n.id, n.assignee_id into v_neg_id, v_neg_assignee
    from public.crm_negotiations n
    where n.tenant_id = v_chat.tenant_id
      and n.customer_id = v_chat.customer_id
      and n.status = 'em_andamento'
    order by n.updated_at desc
    limit 1;

    if v_neg_id is not null and not public.can_modify_crm_negotiation(v_neg_assignee) then
      raise exception 'Assuma o negócio antes de continuar';
    end if;
  else
    v_neg_id := null;
  end if;

  if v_neg_id is null then
    select t.funnel_id, t.stage_id into v_funnel_id, v_stage_id
    from public.tenant_default_funnel_stage(v_chat.tenant_id) t;

    v_title := coalesce(
      nullif(trim(v_chat.customer_nome), ''),
      nullif(trim(v_chat.display_name), ''),
      'Lead WhatsApp'
    );

    insert into public.crm_negotiations (
      tenant_id,
      title,
      funnel_id,
      stage_id,
      status,
      customer_id,
      source_chat_id,
      assignee_id,
      last_interaction_at,
      last_contact_at
    ) values (
      v_chat.tenant_id,
      v_title,
      v_funnel_id,
      v_stage_id,
      'em_andamento',
      v_chat.customer_id,
      p_chat_id,
      v_chat.assignee_id,
      timezone('utc', now()),
      timezone('utc', now())
    )
    returning id into v_neg_id;
  else
    update public.crm_negotiations n
    set
      source_chat_id = coalesce(n.source_chat_id, p_chat_id),
      assignee_id = coalesce(n.assignee_id, v_chat.assignee_id),
      last_interaction_at = timezone('utc', now())
    where n.id = v_neg_id;
  end if;

  update public.whatsapp_chats
  set primary_negotiation_id = v_neg_id
  where id = p_chat_id;

  if p_auto_assign and v_chat.assignee_id is null then
    perform public.auto_assign_chat_system(p_chat_id);
  end if;

  return v_neg_id;
end;
$$;

drop policy if exists "customers_same_tenant_update" on public.customers;
create policy "customers_same_tenant_update"
on public.customers for update
using (
  public.is_same_tenant(tenant_id)
  and public.can_atendimento_update_customer(id)
)
with check (
  public.is_same_tenant(tenant_id)
  and public.can_atendimento_update_customer(id)
);

drop policy if exists "crm_tasks_same_tenant_insert" on public.crm_tasks;
create policy "crm_tasks_same_tenant_insert"
on public.crm_tasks for insert
with check (
  public.is_same_tenant(tenant_id)
  and (
    public.current_user_role() != 'atendimento'
    or negotiation_id is not null
  )
  and (
    negotiation_id is null
    or exists (
      select 1 from public.crm_negotiations n
      where n.id = crm_tasks.negotiation_id
        and public.can_modify_crm_negotiation(n.assignee_id)
    )
  )
);
