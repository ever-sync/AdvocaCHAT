-- Fase 3 complementar: fecha bordas restantes de multi-atendimento.
-- Depende dos helpers de 20260617160000_multi_attendant_border_rls.sql.

-- Notas: autor nao pode continuar editando/removendo nota de chat que deixou
-- de estar sob sua responsabilidade. Gestor continua podendo corrigir.
drop policy if exists "chat_notes_update" on public.chat_notes;
create policy "chat_notes_update"
on public.chat_notes
for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
  and (
    author_id = auth.uid()
    or public.current_user_role() in ('admin', 'operacao')
  )
  and exists (
    select 1
    from public.whatsapp_chats wc
    where wc.id = chat_notes.chat_id
      and public.can_atendimento_act_on_chat(wc.assignee_id)
  )
)
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
  and exists (
    select 1
    from public.whatsapp_chats wc
    where wc.id = chat_notes.chat_id
      and public.can_atendimento_act_on_chat(wc.assignee_id)
  )
);

drop policy if exists "chat_notes_delete" on public.chat_notes;
create policy "chat_notes_delete"
on public.chat_notes
for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
  and (
    author_id = auth.uid()
    or public.current_user_role() in ('admin', 'operacao')
  )
  and exists (
    select 1
    from public.whatsapp_chats wc
    where wc.id = chat_notes.chat_id
      and public.can_atendimento_act_on_chat(wc.assignee_id)
  )
);

-- Transferencias: clientes nao devem forjar historico diretamente. As RPCs
-- security definer continuam gravando o historico operacional.
drop policy if exists "chat_transfers_same_tenant_insert" on public.chat_transfers;
create policy "chat_transfers_same_tenant_insert"
on public.chat_transfers
for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao')
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
);

-- Tags aplicadas em chats: mesma regra de acao no chat. Atendente nao tagueia
-- conversa no pool ou de outro atendente.
drop policy if exists "whatsapp_chat_tags_insert" on public.whatsapp_chat_tags;
create policy "whatsapp_chat_tags_insert"
on public.whatsapp_chat_tags
for insert
with check (
  exists (
    select 1
    from public.whatsapp_chats wc
    where wc.id = whatsapp_chat_tags.chat_id
      and public.is_same_tenant(wc.tenant_id)
      and public.has_role_permission(wc.tenant_id, 'inbox', 'edit')
      and public.can_atendimento_act_on_chat(wc.assignee_id)
  )
  and exists (
    select 1
    from public.chat_tags ct
    where ct.id = whatsapp_chat_tags.tag_id
      and public.is_same_tenant(ct.tenant_id)
      and (ct.scope = 'global' or ct.created_by = auth.uid())
  )
);

-- Historico de etapa: leitura ja segue CRM; insert direto fica restrito a
-- gestores. Trigger security definer segue registrando mudancas reais.
drop policy if exists "crm_stage_history_same_tenant_insert" on public.crm_stage_history;
create policy "crm_stage_history_same_tenant_insert"
on public.crm_stage_history
for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao')
  and public.has_role_permission(tenant_id, 'crm', 'edit')
);

-- Atividades: leitura ja segue CRM quando ha negotiation_id. Inserts diretos
-- passam a exigir permissao sobre a entidade referenciada.
drop policy if exists "crm_activities_same_tenant_insert" on public.crm_activities;
create policy "crm_activities_same_tenant_insert"
on public.crm_activities
for insert
with check (
  public.is_same_tenant(tenant_id)
  and (
    (
      negotiation_id is not null
      and public.has_role_permission(tenant_id, 'crm', 'edit')
      and exists (
        select 1
        from public.crm_negotiations n
        where n.id = crm_activities.negotiation_id
          and public.can_modify_crm_negotiation(n.assignee_id)
      )
    )
    or (
      chat_id is not null
      and public.has_role_permission(tenant_id, 'inbox', 'edit')
      and exists (
        select 1
        from public.whatsapp_chats wc
        where wc.id = crm_activities.chat_id
          and public.can_atendimento_act_on_chat(wc.assignee_id)
      )
    )
    or (
      negotiation_id is null
      and chat_id is null
      and public.current_user_role() in ('admin', 'operacao')
    )
  )
);

-- Documentos CRM: metadata segue a visibilidade/modificacao do negocio.
drop policy if exists "crm_negotiation_documents_same_tenant_select" on public.crm_negotiation_documents;
create policy "crm_negotiation_documents_same_tenant_select"
on public.crm_negotiation_documents
for select
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'view')
  and exists (
    select 1
    from public.crm_negotiations n
    where n.id = crm_negotiation_documents.negotiation_id
      and public.can_access_crm_negotiation(n.assignee_id)
  )
);

-- Storage do bucket de documentos: o path esperado e
-- `{tenant_id}/{negotiation_id}/{arquivo}`. Apertamos select/update/delete pelo
-- negocio referenciado no path. Insert exige permissao de edicao do negocio.
drop policy if exists "crm_lead_docs_select_tenant" on storage.objects;
create policy "crm_lead_docs_select_tenant"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'crm-lead-documents'
  and split_part(name, '/', 1) = public.current_tenant_id()::text
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and n.id = split_part(name, '/', 2)::uuid
      and public.can_access_crm_negotiation(n.assignee_id)
  )
);

drop policy if exists "crm_lead_docs_insert_tenant" on storage.objects;
create policy "crm_lead_docs_insert_tenant"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'crm-lead-documents'
  and split_part(name, '/', 1) = public.current_tenant_id()::text
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and n.id = split_part(name, '/', 2)::uuid
      and public.can_modify_crm_negotiation(n.assignee_id)
  )
);

drop policy if exists "crm_lead_docs_update_tenant" on storage.objects;
create policy "crm_lead_docs_update_tenant"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'crm-lead-documents'
  and split_part(name, '/', 1) = public.current_tenant_id()::text
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and n.id = split_part(name, '/', 2)::uuid
      and public.can_modify_crm_negotiation(n.assignee_id)
  )
)
with check (
  bucket_id = 'crm-lead-documents'
  and split_part(name, '/', 1) = public.current_tenant_id()::text
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and n.id = split_part(name, '/', 2)::uuid
      and public.can_modify_crm_negotiation(n.assignee_id)
  )
);

drop policy if exists "crm_lead_docs_delete_tenant" on storage.objects;
create policy "crm_lead_docs_delete_tenant"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'crm-lead-documents'
  and split_part(name, '/', 1) = public.current_tenant_id()::text
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.crm_negotiations n
    where n.tenant_id = public.current_tenant_id()
      and n.id = split_part(name, '/', 2)::uuid
      and public.can_modify_crm_negotiation(n.assignee_id)
  )
);
