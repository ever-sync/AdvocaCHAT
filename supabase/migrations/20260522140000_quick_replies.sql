-- Respostas rápidas por tenant (global = visível a todos; private = só do criador)
-- Ativadas via botão no composer ou atalho "/" no campo de texto.

create table if not exists public.quick_replies (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  title      text not null,
  shortcut   text,
  body_text  text not null,
  scope      text not null default 'global' check (scope in ('global', 'private')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Shortcut único por tenant (global) ou por usuário (private)
create unique index if not exists quick_replies_global_shortcut_idx
  on public.quick_replies (tenant_id, lower(shortcut))
  where scope = 'global' and shortcut is not null;

create unique index if not exists quick_replies_private_shortcut_idx
  on public.quick_replies (tenant_id, created_by, lower(shortcut))
  where scope = 'private' and shortcut is not null;

create index if not exists quick_replies_tenant_idx
  on public.quick_replies (tenant_id, scope, sort_order);

drop trigger if exists quick_replies_set_updated_at on public.quick_replies;
create trigger quick_replies_set_updated_at
before update on public.quick_replies
for each row execute function public.set_updated_at();

alter table public.quick_replies enable row level security;

create policy "quick_replies_select"
on public.quick_replies for select
using (
  public.is_same_tenant(tenant_id)
  and (scope = 'global' or created_by = auth.uid())
);

create policy "quick_replies_insert"
on public.quick_replies for insert
with check (
  public.is_same_tenant(tenant_id)
  and (
    scope = 'private'
    or public.current_user_role() in ('admin', 'operacao', 'financeiro')
  )
);

create policy "quick_replies_update"
on public.quick_replies for update
using (
  public.is_same_tenant(tenant_id)
  and (
    (scope = 'global' and public.current_user_role() in ('admin', 'operacao', 'financeiro'))
    or (scope = 'private' and created_by = auth.uid())
  )
);

create policy "quick_replies_delete"
on public.quick_replies for delete
using (
  public.is_same_tenant(tenant_id)
  and (
    (scope = 'global' and public.current_user_role() in ('admin', 'operacao', 'financeiro'))
    or (scope = 'private' and created_by = auth.uid())
  )
);
