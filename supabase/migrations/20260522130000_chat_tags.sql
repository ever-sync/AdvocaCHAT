-- Chat tags: hybrid scope (global = tenant-wide, private = per-user)
-- whatsapp_chat_tags: N:N junction with indexes for filtered inbox

-- 1. Tag catalog
create table if not exists public.chat_tags (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  color      text not null default '#4ade80',
  scope      text not null default 'global' check (scope in ('global', 'private')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- unique name within tenant for global tags; unique per-user for private tags
create unique index if not exists chat_tags_global_name_idx
  on public.chat_tags (tenant_id, lower(name))
  where scope = 'global';

create unique index if not exists chat_tags_private_name_idx
  on public.chat_tags (tenant_id, created_by, lower(name))
  where scope = 'private';

create index if not exists chat_tags_tenant_scope_idx
  on public.chat_tags (tenant_id, scope);

drop trigger if exists chat_tags_set_updated_at on public.chat_tags;
create trigger chat_tags_set_updated_at
before update on public.chat_tags
for each row execute function public.set_updated_at();

alter table public.chat_tags enable row level security;

-- select: same tenant + (global OR my private)
create policy "chat_tags_select"
on public.chat_tags for select
using (
  public.is_same_tenant(tenant_id)
  and (scope = 'global' or created_by = auth.uid())
);

-- insert: anyone can create private; admin/op/fin for global
create policy "chat_tags_insert"
on public.chat_tags for insert
with check (
  public.is_same_tenant(tenant_id)
  and (
    scope = 'private'
    or public.current_user_role() in ('admin', 'operacao', 'financeiro')
  )
);

-- update: admin/op/fin for global; owner for private
create policy "chat_tags_update"
on public.chat_tags for update
using (
  public.is_same_tenant(tenant_id)
  and (
    (scope = 'global' and public.current_user_role() in ('admin', 'operacao', 'financeiro'))
    or (scope = 'private' and created_by = auth.uid())
  )
);

-- delete: same rules as update
create policy "chat_tags_delete"
on public.chat_tags for delete
using (
  public.is_same_tenant(tenant_id)
  and (
    (scope = 'global' and public.current_user_role() in ('admin', 'operacao', 'financeiro'))
    or (scope = 'private' and created_by = auth.uid())
  )
);

-- 2. Junction: chat ↔ tag
create table if not exists public.whatsapp_chat_tags (
  chat_id   uuid not null references public.whatsapp_chats(id) on delete cascade,
  tag_id    uuid not null references public.chat_tags(id) on delete cascade,
  tagged_by uuid not null references public.profiles(id) on delete cascade,
  tagged_at timestamptz not null default timezone('utc', now()),
  primary key (chat_id, tag_id)
);

create index if not exists whatsapp_chat_tags_tag_idx
  on public.whatsapp_chat_tags (tag_id);

create index if not exists whatsapp_chat_tags_chat_idx
  on public.whatsapp_chat_tags (chat_id);

alter table public.whatsapp_chat_tags enable row level security;

-- select: accessible if user can see the chat AND can see the tag
create policy "whatsapp_chat_tags_select"
on public.whatsapp_chat_tags for select
using (
  exists (
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
      and (ct.scope = 'global' or ct.created_by = auth.uid())
  )
);

-- insert: can see the chat + can see the tag
create policy "whatsapp_chat_tags_insert"
on public.whatsapp_chat_tags for insert
with check (
  exists (
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

-- delete: tagger can remove their own; admin/op/fin can remove any
create policy "whatsapp_chat_tags_delete"
on public.whatsapp_chat_tags for delete
using (
  (tagged_by = auth.uid() or public.current_user_role() in ('admin', 'operacao', 'financeiro'))
  and exists (
    select 1 from public.whatsapp_chats wc
    where wc.id = chat_id
      and public.is_same_tenant(wc.tenant_id)
  )
);

-- 3. RPC: list_chat_tags_for_chat — tags visible to the current user on a given chat
create or replace function public.list_chat_tags_for_chat(p_chat_id uuid)
returns table(
  tag_id    uuid,
  name      text,
  color     text,
  scope     text,
  tagged_by uuid,
  tagged_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select ct.id, ct.name, ct.color, ct.scope, wct.tagged_by, wct.tagged_at
  from public.whatsapp_chat_tags wct
  join public.chat_tags ct on ct.id = wct.tag_id
  where wct.chat_id = p_chat_id
    and (ct.scope = 'global' or ct.created_by = auth.uid())
  order by ct.name;
$$;

grant execute on function public.list_chat_tags_for_chat(uuid) to authenticated;

-- 4. Index for filtering: find chats that have ANY of a given list of tags
-- (used in listInboxChats with tag filter — implemented at query level, index helps)
create index if not exists whatsapp_chat_tags_tag_chat_idx
  on public.whatsapp_chat_tags (tag_id, chat_id);
