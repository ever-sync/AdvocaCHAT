-- Comentários por negociação com @menções. Aparecem na aba "Comentários" do
-- detalhe e disparam notificação realtime pros mencionados. O front extrai os
-- ids de profiles do texto no momento do envio (autocomplete) e popula
-- `mentions[]`; o banco só valida pertencimento ao tenant.

create table if not exists public.crm_negotiation_comments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  negotiation_id  uuid not null references public.crm_negotiations(id) on delete cascade,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  body            text not null check (length(trim(body)) > 0),
  mentions        uuid[] not null default '{}',
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now())
);

create index if not exists crm_negotiation_comments_negotiation_idx
  on public.crm_negotiation_comments (negotiation_id, created_at desc);

create index if not exists crm_negotiation_comments_mentions_gin
  on public.crm_negotiation_comments using gin (mentions);

drop trigger if exists crm_negotiation_comments_set_updated_at on public.crm_negotiation_comments;
create trigger crm_negotiation_comments_set_updated_at
before update on public.crm_negotiation_comments
for each row execute function public.set_updated_at();

alter table public.crm_negotiation_comments enable row level security;

-- SELECT: qualquer um do mesmo tenant que enxergue a negociação (RLS de
-- crm_negotiations já segura visibilidade — joinamos pra herdar essa regra).
drop policy if exists "crm_negotiation_comments_select" on public.crm_negotiation_comments;
create policy "crm_negotiation_comments_select"
on public.crm_negotiation_comments for select
using (
  public.is_same_tenant(tenant_id)
  and exists (
    select 1 from public.crm_negotiations n
    where n.id = crm_negotiation_comments.negotiation_id
  )
);

-- INSERT: o usuário autenticado, no próprio tenant, sobre negociação que vê.
drop policy if exists "crm_negotiation_comments_insert" on public.crm_negotiation_comments;
create policy "crm_negotiation_comments_insert"
on public.crm_negotiation_comments for insert
with check (
  public.is_same_tenant(tenant_id)
  and created_by = auth.uid()
  and exists (
    select 1 from public.crm_negotiations n
    where n.id = crm_negotiation_comments.negotiation_id
      and n.tenant_id = crm_negotiation_comments.tenant_id
  )
);

-- UPDATE/DELETE: só o autor edita/apaga o próprio comentário.
drop policy if exists "crm_negotiation_comments_update" on public.crm_negotiation_comments;
create policy "crm_negotiation_comments_update"
on public.crm_negotiation_comments for update
using (created_by = auth.uid() and public.is_same_tenant(tenant_id))
with check (created_by = auth.uid() and public.is_same_tenant(tenant_id));

drop policy if exists "crm_negotiation_comments_delete" on public.crm_negotiation_comments;
create policy "crm_negotiation_comments_delete"
on public.crm_negotiation_comments for delete
using (created_by = auth.uid() and public.is_same_tenant(tenant_id));

-- Espelha o comentário na timeline já existente (crm_activities) para
-- continuar aparecendo na aba "Atividades" sem mudar o front da timeline.
create or replace function public.log_crm_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat_id uuid;
  v_customer_id uuid;
begin
  select source_chat_id, customer_id
    into v_chat_id, v_customer_id
  from public.crm_negotiations
  where id = NEW.negotiation_id;

  insert into public.crm_activities (
    tenant_id, customer_id, negotiation_id, chat_id,
    activity_type, title, body, created_by
  ) values (
    NEW.tenant_id, v_customer_id, NEW.negotiation_id, v_chat_id,
    case when array_length(NEW.mentions, 1) > 0 then 'mention' else 'comment' end,
    case when array_length(NEW.mentions, 1) > 0 then 'Menção em comentário' else 'Comentário' end,
    NEW.body,
    NEW.created_by
  );
  return NEW;
end;
$$;

drop trigger if exists crm_negotiation_comments_log_activity on public.crm_negotiation_comments;
create trigger crm_negotiation_comments_log_activity
after insert on public.crm_negotiation_comments
for each row execute function public.log_crm_comment_activity();

-- Realtime: front escuta novos comments para popular thread e disparar push
-- pros mencionados (filtro feito no cliente).
do $$
declare
  already_in boolean;
begin
  execute 'alter table public.crm_negotiation_comments replica identity full';

  select exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_negotiation_comments'
  ) into already_in;

  if not already_in then
    execute 'alter publication supabase_realtime add table public.crm_negotiation_comments';
  end if;
end
$$;
