-- Permite que atendentes removam qualquer etiqueta da conversa que eles podem atender.
-- Antes, atendente só removia etiquetas aplicadas por ele mesmo (`tagged_by = auth.uid()`),
-- o que bloqueava etiquetas vindas de outro usuário, gestor ou automação.

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
  and exists (
    select 1
    from public.whatsapp_chats wc
    where wc.id = chat_id
      and public.is_same_tenant(wc.tenant_id)
      and public.can_atendimento_act_on_chat(wc.assignee_id)
  )
);
