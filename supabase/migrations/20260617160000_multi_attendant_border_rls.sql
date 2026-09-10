-- Fase 3 do plano multi-atendentes: bordas (notas, transferências, tags)
-- e correção da regressão de SELECT em CRM introduzida no hardening v2.

-- Helpers alinhados à matriz de permissões (financeiro não edita chat/CRM por padrão).
create or replace function public.can_view_whatsapp_chat(p_assignee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role_permission(public.current_tenant_id(), 'inbox', 'view')
    and (
      public.current_user_role() != 'atendimento'
      or p_assignee_id = auth.uid()
    );
$$;

create or replace function public.can_atendimento_act_on_chat(p_assignee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role_permission(public.current_tenant_id(), 'inbox', 'edit')
    and (
      public.current_user_role() in ('admin', 'operacao')
      or (
        public.current_user_role() = 'atendimento'
        and p_assignee_id is not null
        and p_assignee_id = auth.uid()
      )
    );
$$;

create or replace function public.can_modify_crm_negotiation(p_assignee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role_permission(public.current_tenant_id(), 'crm', 'edit')
    and (
      public.current_user_role() in ('admin', 'operacao')
      or (
        public.current_user_role() = 'atendimento'
        and p_assignee_id is not null
        and p_assignee_id = auth.uid()
      )
    );
$$;

create or replace function public.can_access_crm_negotiation(p_assignee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role_permission(public.current_tenant_id(), 'crm', 'view')
    and (
      public.current_user_role() in ('admin', 'operacao', 'financeiro')
      or p_assignee_id is null
      or p_assignee_id = auth.uid()
    );
$$;

-- CRM: restaura isolamento por responsável na leitura (v2 tinha removido).
drop policy if exists "crm_negotiations_same_tenant_select" on public.crm_negotiations;
create policy "crm_negotiations_same_tenant_select"
on public.crm_negotiations
for select
using (
  public.is_same_tenant(tenant_id)
  and public.can_access_crm_negotiation(assignee_id)
);

drop policy if exists "crm_tasks_same_tenant_select" on public.crm_tasks;
create policy "crm_tasks_same_tenant_select"
on public.crm_tasks
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'view')
  and (
    negotiation_id is null
    or exists (
      select 1
      from public.crm_negotiations n
      where n.id = crm_tasks.negotiation_id
        and public.can_access_crm_negotiation(n.assignee_id)
    )
  )
);

-- Notas internas: mesma visibilidade do chat.
drop policy if exists "chat_notes_select" on public.chat_notes;
create policy "chat_notes_select"
on public.chat_notes
for select
using (
  public.is_same_tenant(tenant_id)
  and exists (
    select 1
    from public.whatsapp_chats wc
    where wc.id = chat_notes.chat_id
      and public.can_view_whatsapp_chat(wc.assignee_id)
  )
);

drop policy if exists "chat_notes_insert" on public.chat_notes;
create policy "chat_notes_insert"
on public.chat_notes
for insert
with check (
  public.is_same_tenant(tenant_id)
  and author_id = auth.uid()
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
  and exists (
    select 1
    from public.whatsapp_chats wc
    where wc.id = chat_id
      and public.can_atendimento_act_on_chat(wc.assignee_id)
  )
);

-- Histórico de transferência: gestor vê tudo; atendente só chats em que participa.
drop policy if exists "chat_transfers_same_tenant_select" on public.chat_transfers;
create policy "chat_transfers_same_tenant_select"
on public.chat_transfers
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'view')
  and (
    public.current_user_role() in ('admin', 'operacao', 'financeiro')
    or from_user_id = auth.uid()
    or to_user_id = auth.uid()
    or exists (
      select 1
      from public.whatsapp_chats wc
      where wc.id = chat_transfers.chat_id
        and wc.assignee_id = auth.uid()
    )
  )
);

-- Tags em chat: atendente só remove em conversa própria.
drop policy if exists "whatsapp_chat_tags_delete" on public.whatsapp_chat_tags;
create policy "whatsapp_chat_tags_delete"
on public.whatsapp_chat_tags
for delete
using (
  public.has_role_permission(
    (select wc.tenant_id from public.whatsapp_chats wc where wc.id = chat_id),
    'inbox',
    'edit'
  )
  and (
    tagged_by = auth.uid()
    or public.current_user_role() in ('admin', 'operacao')
  )
  and exists (
    select 1
    from public.whatsapp_chats wc
    where wc.id = chat_id
      and public.is_same_tenant(wc.tenant_id)
      and public.can_atendimento_act_on_chat(wc.assignee_id)
  )
);
