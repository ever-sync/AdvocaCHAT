-- Atendente só enxerga: chats atribuídos a ele + chats do POOL das instâncias às
-- quais ele está vinculado (whatsapp_instance_attendants). Pool de instância não
-- vinculada deixa de aparecer para ele. Gestores (admin/operacao/financeiro)
-- mantêm visão completa. Mensagens continuam visíveis só após assumir (gate atual).

-- Helper: o usuário atual é atendente vinculado a esta instância?
create or replace function public.is_instance_attendant(p_instance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.whatsapp_instance_attendants wia
    where wia.instance_id = p_instance_id
      and wia.profile_id = auth.uid()
  );
$$;

grant execute on function public.is_instance_attendant(uuid) to authenticated, service_role;

-- Lista de conversas (sidebar): própria OU pool da instância vinculada.
drop policy if exists "whatsapp_chats_same_tenant_select" on public.whatsapp_chats;
create policy "whatsapp_chats_same_tenant_select"
on public.whatsapp_chats
for select
using (
  public.is_same_tenant(tenant_id)
  and (
    public.current_user_role() != 'atendimento'
    or assignee_id = auth.uid()
    or (assignee_id is null and public.is_instance_attendant(instance_id))
  )
);

-- Etiquetas do chat: espelha a visibilidade do chat.
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
        or wc.assignee_id = auth.uid()
        or (wc.assignee_id is null and public.is_instance_attendant(wc.instance_id))
      )
  )
  and exists (
    select 1
    from public.chat_tags ct
    where ct.id = tag_id
      and (ct.scope = 'global' or ct.created_by = auth.uid())
  )
);

-- Mensagens (whatsapp_messages) NÃO mudam: atendimento só lê após assumir o chat
-- (can_view_whatsapp_chat já restringe a assignee = self). Pool segue oculto até assumir.
