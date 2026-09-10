-- Tighten server-side guards for multi-attendant chat/CRM isolation.

-- Chat updates must follow the same attendant ownership rule used by chat
-- actions. Managers keep tenant-wide access; atendimento only updates own chat.
drop policy if exists "whatsapp_chats_same_tenant_update" on public.whatsapp_chats;
create policy "whatsapp_chats_same_tenant_update"
on public.whatsapp_chats
for update
using (
  public.is_same_tenant(tenant_id)
  and public.can_atendimento_act_on_chat(assignee_id)
)
with check (
  public.is_same_tenant(tenant_id)
  and public.can_atendimento_act_on_chat(assignee_id)
);

-- Messages inherit visibility from their chat. This closes direct/RPC reads by
-- chat_id for conversations assigned to another attendant.
drop policy if exists "whatsapp_messages_same_tenant_select" on public.whatsapp_messages;
create policy "whatsapp_messages_same_tenant_select"
on public.whatsapp_messages
for select
using (
  exists (
    select 1
    from public.whatsapp_chats c
    where c.id = whatsapp_messages.chat_id
      and public.is_same_tenant(c.tenant_id)
      and public.can_atendimento_act_on_chat(c.assignee_id)
  )
);

drop policy if exists "whatsapp_messages_same_tenant_insert" on public.whatsapp_messages;
create policy "whatsapp_messages_same_tenant_insert"
on public.whatsapp_messages
for insert
with check (
  exists (
    select 1
    from public.whatsapp_chats c
    where c.id = whatsapp_messages.chat_id
      and c.tenant_id = whatsapp_messages.tenant_id
      and public.is_same_tenant(c.tenant_id)
      and public.can_atendimento_act_on_chat(c.assignee_id)
  )
);

drop policy if exists "whatsapp_messages_same_tenant_update" on public.whatsapp_messages;
create policy "whatsapp_messages_same_tenant_update"
on public.whatsapp_messages
for update
using (
  exists (
    select 1
    from public.whatsapp_chats c
    where c.id = whatsapp_messages.chat_id
      and public.is_same_tenant(c.tenant_id)
      and public.can_atendimento_act_on_chat(c.assignee_id)
  )
)
with check (
  exists (
    select 1
    from public.whatsapp_chats c
    where c.id = whatsapp_messages.chat_id
      and c.tenant_id = whatsapp_messages.tenant_id
      and public.is_same_tenant(c.tenant_id)
      and public.can_atendimento_act_on_chat(c.assignee_id)
  )
);

-- Atendimento can create CRM negotiations only already assigned to themselves.
-- Managers can still create pool or assigned negotiations.
drop policy if exists "crm_negotiations_same_tenant_insert" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_insert"
on public.crm_negotiations
for insert
with check (
  public.is_same_tenant(tenant_id)
  and (
    public.current_user_role() in ('admin', 'operacao', 'financeiro')
    or (
      public.current_user_role() = 'atendimento'
      and assignee_id = auth.uid()
    )
  )
);

-- Direct deletion of negotiations is a manager operation.
drop policy if exists "crm_negotiations_same_tenant_delete" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_delete"
on public.crm_negotiations
for delete
using (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao')
);

-- Task deletion follows the same modify rules as task insert/update.
drop policy if exists "crm_tasks_same_tenant_delete" on public.crm_tasks;
create policy "crm_tasks_same_tenant_delete"
on public.crm_tasks
for delete
using (
  public.is_same_tenant(tenant_id)
  and (
    (
      negotiation_id is not null
      and exists (
        select 1
        from public.crm_negotiations n
        where n.id = crm_tasks.negotiation_id
          and public.can_modify_crm_negotiation(n.assignee_id)
      )
    )
    or (
      negotiation_id is null
      and customer_id is not null
      and public.can_atendimento_update_customer(customer_id)
    )
  )
);
