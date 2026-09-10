-- Permite que admin do tenant exclua conversas inteiras (cascade já cuida de
-- whatsapp_messages, chat_tags, chat_notes, chat_assignee_transfers, ai_logs etc.).
drop policy if exists "whatsapp_chats_admin_delete" on public.whatsapp_chats;
create policy "whatsapp_chats_admin_delete"
on public.whatsapp_chats
for delete
using (
  tenant_id = public.current_tenant_id()
  and public.current_user_role() = 'admin'
);
