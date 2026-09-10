-- Hardening extra: aplica a matriz de permissoes do tenant no banco
-- para evitar bypass via chamadas diretas ao Supabase.

create or replace function public.default_role_permission(
  p_role text,
  p_function_key text,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_name text := coalesce(nullif(lower(p_role), ''), 'atendimento');
  function_key text := lower(coalesce(p_function_key, ''));
  action_key text := lower(coalesce(p_action, ''));
begin
  if action_key = 'view' then
    case role_name
      when 'admin' then
        return true;
      when 'operacao' then
        return true;
      when 'financeiro' then
        return function_key in ('inbox', 'crm', 'clientes', 'produtos', 'relatorios', 'configuracoes');
      when 'atendimento' then
        return function_key in ('inbox', 'crm', 'clientes', 'produtos', 'relatorios');
      else
        return false;
    end case;
  elsif action_key = 'edit' then
    case role_name
      when 'admin' then
        return true;
      when 'operacao' then
        return true;
      when 'financeiro' then
        return function_key in ('clientes', 'relatorios');
      when 'atendimento' then
        return function_key in ('inbox', 'crm');
      else
        return false;
    end case;
  elsif action_key = 'delete' then
    case role_name
      when 'admin' then
        return true;
      when 'operacao' then
        return true;
      when 'financeiro' then
        return function_key in ('relatorios');
      when 'atendimento' then
        return false;
      else
        return false;
    end case;
  end if;

  return false;
end;
$$;

create or replace function public.has_role_permission(
  target_tenant_id uuid,
  p_function_key text,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_name text := coalesce(public.current_user_role(), 'atendimento');
  stored_value text;
begin
  select case lower(coalesce(p_action, ''))
    when 'view' then role_permissions -> role_name -> p_function_key ->> 'view'
    when 'edit' then role_permissions -> role_name -> p_function_key ->> 'edit'
    when 'delete' then role_permissions -> role_name -> p_function_key ->> 'delete'
    else null
  end
    into stored_value
  from public.tenant_settings
  where tenant_id = target_tenant_id
  limit 1;

  if stored_value is not null then
    return stored_value::boolean;
  end if;

  return public.default_role_permission(role_name, p_function_key, p_action);
end;
$$;

-- chat_notes: notas internas do inbox
drop policy if exists "chat_notes_insert" on public.chat_notes;
create policy "chat_notes_insert"
on public.chat_notes for insert
with check (
  public.is_same_tenant(tenant_id)
  and author_id = auth.uid()
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
);

drop policy if exists "chat_notes_update" on public.chat_notes;
create policy "chat_notes_update"
on public.chat_notes for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
  and (author_id = auth.uid() or public.current_user_role() in ('admin', 'operacao'))
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "chat_notes_delete" on public.chat_notes;
create policy "chat_notes_delete"
on public.chat_notes for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
  and (author_id = auth.uid() or public.current_user_role() in ('admin', 'operacao'))
);

-- quick_replies: respostas rápidas do composer
drop policy if exists "quick_replies_insert" on public.quick_replies;
create policy "quick_replies_insert"
on public.quick_replies for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
);

drop policy if exists "quick_replies_update" on public.quick_replies;
create policy "quick_replies_update"
on public.quick_replies for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "quick_replies_delete" on public.quick_replies;
create policy "quick_replies_delete"
on public.quick_replies for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
);

-- chat_tags + whatsapp_chat_tags: tags do inbox
drop policy if exists "chat_tags_insert" on public.chat_tags;
create policy "chat_tags_insert"
on public.chat_tags for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
);

drop policy if exists "chat_tags_update" on public.chat_tags;
create policy "chat_tags_update"
on public.chat_tags for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "chat_tags_delete" on public.chat_tags;
create policy "chat_tags_delete"
on public.chat_tags for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'inbox', 'edit')
);

drop policy if exists "whatsapp_chat_tags_insert" on public.whatsapp_chat_tags;
create policy "whatsapp_chat_tags_insert"
on public.whatsapp_chat_tags for insert
with check (
  public.has_role_permission(
    (select wc.tenant_id from public.whatsapp_chats wc where wc.id = chat_id),
    'inbox',
    'edit'
  )
  and exists (
    select 1 from public.whatsapp_chats wc
    where wc.id = chat_id
      and public.is_same_tenant(wc.tenant_id)
      and (
        public.current_user_role() != 'atendimento'
        or wc.assignee_id is null
        or wc.assignee_id = auth.uid()
      )
  )
  and exists (
    select 1 from public.chat_tags ct
    where ct.id = tag_id
      and public.is_same_tenant(ct.tenant_id)
      and (ct.scope = 'global' or ct.created_by = auth.uid())
  )
);

drop policy if exists "whatsapp_chat_tags_delete" on public.whatsapp_chat_tags;
create policy "whatsapp_chat_tags_delete"
on public.whatsapp_chat_tags for delete
using (
  public.has_role_permission(
    (select wc.tenant_id from public.whatsapp_chats wc where wc.id = chat_id),
    'inbox',
    'edit'
  )
  and (tagged_by = auth.uid() or public.current_user_role() in ('admin', 'operacao', 'financeiro'))
  and exists (
    select 1 from public.whatsapp_chats wc
    where wc.id = chat_id
      and public.is_same_tenant(wc.tenant_id)
  )
);

-- tenant_crm_funnel_config: funis configuraveis
drop policy if exists "tenant_crm_funnel_config_insert" on public.tenant_crm_funnel_config;
create policy "tenant_crm_funnel_config_insert"
on public.tenant_crm_funnel_config for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
);

drop policy if exists "tenant_crm_funnel_config_update" on public.tenant_crm_funnel_config;
create policy "tenant_crm_funnel_config_update"
on public.tenant_crm_funnel_config for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "tenant_crm_funnel_config_delete" on public.tenant_crm_funnel_config;
create policy "tenant_crm_funnel_config_delete"
on public.tenant_crm_funnel_config for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'configuracoes', 'edit')
);

-- crm_negotiation_stages: override de stage/kanban
drop policy if exists "crm_negotiation_stages_same_tenant_insert" on public.crm_negotiation_stages;
create policy "crm_negotiation_stages_same_tenant_insert"
on public.crm_negotiation_stages for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'edit')
);

drop policy if exists "crm_negotiation_stages_same_tenant_update" on public.crm_negotiation_stages;
create policy "crm_negotiation_stages_same_tenant_update"
on public.crm_negotiation_stages for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'edit')
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiation_stages_same_tenant_delete" on public.crm_negotiation_stages;
create policy "crm_negotiation_stages_same_tenant_delete"
on public.crm_negotiation_stages for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'edit')
);

-- products: catalogo e campos personalizados
drop policy if exists "product_categories_same_tenant_insert" on public.product_categories;
create policy "product_categories_same_tenant_insert"
on public.product_categories for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'produtos', 'edit')
);

drop policy if exists "product_categories_same_tenant_update" on public.product_categories;
create policy "product_categories_same_tenant_update"
on public.product_categories for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'produtos', 'edit')
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "product_categories_same_tenant_delete" on public.product_categories;
create policy "product_categories_same_tenant_delete"
on public.product_categories for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'produtos', 'edit')
);

drop policy if exists "product_category_assignments_insert" on public.product_category_assignments;
create policy "product_category_assignments_insert"
on public.product_category_assignments for insert
with check (
  exists (
    select 1 from public.products p
    where p.id = product_id
      and public.is_same_tenant(p.tenant_id)
      and public.has_role_permission(p.tenant_id, 'produtos', 'edit')
  )
  and exists (
    select 1 from public.product_categories c
    where c.id = category_id
      and public.is_same_tenant(c.tenant_id)
  )
);

drop policy if exists "product_category_assignments_delete" on public.product_category_assignments;
create policy "product_category_assignments_delete"
on public.product_category_assignments for delete
using (
  exists (
    select 1 from public.products p
    where p.id = product_id
      and public.is_same_tenant(p.tenant_id)
      and public.has_role_permission(p.tenant_id, 'produtos', 'edit')
  )
);

drop policy if exists "product_custom_fields_same_tenant_insert" on public.product_custom_fields;
create policy "product_custom_fields_same_tenant_insert"
on public.product_custom_fields for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'produtos', 'edit')
);

drop policy if exists "product_custom_fields_same_tenant_update" on public.product_custom_fields;
create policy "product_custom_fields_same_tenant_update"
on public.product_custom_fields for update
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'produtos', 'edit')
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "product_custom_fields_same_tenant_delete" on public.product_custom_fields;
create policy "product_custom_fields_same_tenant_delete"
on public.product_custom_fields for delete
using (
  public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'produtos', 'edit')
);

drop policy if exists "product_custom_field_values_insert" on public.product_custom_field_values;
create policy "product_custom_field_values_insert"
on public.product_custom_field_values for insert
with check (
  exists (
    select 1 from public.products p
    where p.id = product_id
      and public.is_same_tenant(p.tenant_id)
      and public.has_role_permission(p.tenant_id, 'produtos', 'edit')
  )
  and exists (
    select 1 from public.product_custom_fields f
    where f.id = field_id
      and public.is_same_tenant(f.tenant_id)
  )
);

drop policy if exists "product_custom_field_values_update" on public.product_custom_field_values;
create policy "product_custom_field_values_update"
on public.product_custom_field_values for update
using (
  exists (
    select 1 from public.products p
    where p.id = product_id
      and public.is_same_tenant(p.tenant_id)
      and public.has_role_permission(p.tenant_id, 'produtos', 'edit')
  )
)
with check (true);

drop policy if exists "product_custom_field_values_delete" on public.product_custom_field_values;
create policy "product_custom_field_values_delete"
on public.product_custom_field_values for delete
using (
  exists (
    select 1 from public.products p
    where p.id = product_id
      and public.is_same_tenant(p.tenant_id)
      and public.has_role_permission(p.tenant_id, 'produtos', 'edit')
  )
);

-- entity_tags: tags unificadas por entidade
drop policy if exists "entity_tags_same_tenant_insert" on public.entity_tags;
create policy "entity_tags_same_tenant_insert"
on public.entity_tags for insert
with check (
  public.is_same_tenant(tenant_id)
  and case entity_type
    when 'chat' then public.has_role_permission(tenant_id, 'inbox', 'edit')
    when 'customer' then public.has_role_permission(tenant_id, 'clientes', 'edit')
    when 'negotiation' then public.has_role_permission(tenant_id, 'crm', 'edit')
    else false
  end
);

drop policy if exists "entity_tags_same_tenant_update" on public.entity_tags;
create policy "entity_tags_same_tenant_update"
on public.entity_tags for update
using (
  public.is_same_tenant(tenant_id)
  and case entity_type
    when 'chat' then public.has_role_permission(tenant_id, 'inbox', 'edit')
    when 'customer' then public.has_role_permission(tenant_id, 'clientes', 'edit')
    when 'negotiation' then public.has_role_permission(tenant_id, 'crm', 'edit')
    else false
  end
)
with check (public.is_same_tenant(tenant_id));

drop policy if exists "entity_tags_same_tenant_delete" on public.entity_tags;
create policy "entity_tags_same_tenant_delete"
on public.entity_tags for delete
using (
  public.is_same_tenant(tenant_id)
  and case entity_type
    when 'chat' then public.has_role_permission(tenant_id, 'inbox', 'edit')
    when 'customer' then public.has_role_permission(tenant_id, 'clientes', 'edit')
    when 'negotiation' then public.has_role_permission(tenant_id, 'crm', 'edit')
    else false
  end
);
