-- Atendimento: lista conversas próprias e do pool na sidebar; mensagens só após assumir.
-- Admin/operacao/financeiro: visão completa conforme permissões de inbox.

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

drop policy if exists "whatsapp_chats_same_tenant_select" on public.whatsapp_chats;
create policy "whatsapp_chats_same_tenant_select"
on public.whatsapp_chats
for select
using (
  public.is_same_tenant(tenant_id)
  and (
    public.current_user_role() != 'atendimento'
    or assignee_id is null
    or assignee_id = auth.uid()
  )
);

drop policy if exists "whatsapp_chat_tags_select" on public.whatsapp_chat_tags;
create policy "whatsapp_chat_tags_select"
on public.whatsapp_chat_tags
for select
using (
  exists (
    select 1
    from public.whatsapp_chats wc
    where wc.id = chat_id
      and public.is_same_tenant(wc.tenant_id)
      and (
        public.current_user_role() != 'atendimento'
        or wc.assignee_id is null
        or wc.assignee_id = auth.uid()
      )
  )
  and exists (
    select 1
    from public.chat_tags ct
    where ct.id = tag_id
      and (ct.scope = 'global' or ct.created_by = auth.uid())
  )
);

-- Mensagens: atendimento só lê chat já atribuído a si (alinha ao gate de assumir no app).
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
      and public.can_view_whatsapp_chat(c.assignee_id)
  )
);
