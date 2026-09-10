-- Boas-vindas por e-mail ao primeiro acesso.
--  - welcome_email_dispatches: fila idempotente por perfil.
--  - Trigger em profiles: enfileira quando surge um novo usuário ativo.
--  - Edge worker: consome a fila e dispara via Resend.

create table if not exists public.welcome_email_dispatches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_name text not null default '',
  recipient_email text not null,
  company text,
  role text not null default 'atendimento',
  status text not null default 'queued'
    check (status in ('queued', 'retrying', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  response jsonb,
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (profile_id)
);

create index if not exists welcome_email_dispatches_pending_idx
  on public.welcome_email_dispatches (status, next_attempt_at)
  where status in ('queued', 'retrying');

create index if not exists welcome_email_dispatches_tenant_idx
  on public.welcome_email_dispatches (tenant_id);

drop trigger if exists welcome_email_dispatches_set_updated_at on public.welcome_email_dispatches;
create trigger welcome_email_dispatches_set_updated_at
before update on public.welcome_email_dispatches
for each row
execute function public.set_updated_at();

alter table public.welcome_email_dispatches enable row level security;

create policy "welcome_email_dispatches_same_tenant_select"
on public.welcome_email_dispatches
for select
using (public.is_same_tenant(tenant_id));

create policy "welcome_email_dispatches_same_tenant_insert"
on public.welcome_email_dispatches
for insert
with check (public.is_same_tenant(tenant_id));

create policy "welcome_email_dispatches_same_tenant_update"
on public.welcome_email_dispatches
for update
using (public.is_same_tenant(tenant_id))
with check (public.is_same_tenant(tenant_id));

create policy "welcome_email_dispatches_same_tenant_delete"
on public.welcome_email_dispatches
for delete
using (public.is_same_tenant(tenant_id));

create or replace function public.enqueue_welcome_email_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  normalized_name text;
begin
  if new.email is null or btrim(new.email) = '' then
    return new;
  end if;

  if coalesce(new.plano, '') = 'colaborador' then
    return new;
  end if;

  normalized_email := lower(btrim(new.email));
  normalized_name := coalesce(nullif(btrim(new.nome), ''), split_part(normalized_email, '@', 1), 'Usuário');

  insert into public.welcome_email_dispatches (
    tenant_id,
    profile_id,
    recipient_name,
    recipient_email,
    company,
    role
  )
  values (
    new.tenant_id,
    new.id,
    normalized_name,
    normalized_email,
    nullif(btrim(new.empresa), ''),
    coalesce(nullif(new.role, ''), 'atendimento')
  )
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_enqueue_welcome_email on public.profiles;
create trigger profiles_enqueue_welcome_email
after insert on public.profiles
for each row
execute function public.enqueue_welcome_email_for_profile();
