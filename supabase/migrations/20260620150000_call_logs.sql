-- Telefonia (Twilio click-to-call): registro de ligações por lead.
-- Escrita só por service_role (edge functions); leitura por tenant.
-- Credenciais do Twilio ficam em secrets da Edge Function (não no banco).

alter table public.profiles
  add column if not exists call_phone text;

comment on column public.profiles.call_phone is
  'Telefone do atendente (E.164) para o click-to-call discar primeiro a ele.';

create table if not exists public.call_logs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  provider          text not null default 'twilio',
  provider_call_sid text,
  direction         text not null default 'outbound'
                      check (direction in ('outbound', 'inbound')),
  from_number       text,
  to_number         text,
  attendant_id      uuid references public.profiles(id) on delete set null,
  customer_id       uuid references public.customers(id) on delete set null,
  chat_id           uuid references public.whatsapp_chats(id) on delete set null,
  negotiation_id    uuid references public.crm_negotiations(id) on delete set null,
  status            text not null default 'queued'
                      check (status in (
                        'queued','initiated','ringing','in_progress','answered',
                        'completed','failed','no_answer','busy','canceled'
                      )),
  duration_seconds  integer,
  recording_url     text,
  error             text,
  started_at        timestamptz,
  answered_at       timestamptz,
  ended_at          timestamptz,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now())
);

create unique index if not exists call_logs_provider_call_sid_uidx
  on public.call_logs (provider_call_sid)
  where provider_call_sid is not null;

create index if not exists call_logs_tenant_customer_idx
  on public.call_logs (tenant_id, customer_id, created_at desc);

create index if not exists call_logs_tenant_negotiation_idx
  on public.call_logs (tenant_id, negotiation_id, created_at desc);

create index if not exists call_logs_tenant_chat_idx
  on public.call_logs (tenant_id, chat_id, created_at desc);

drop trigger if exists call_logs_set_updated_at on public.call_logs;
create trigger call_logs_set_updated_at
before update on public.call_logs
for each row execute function public.set_updated_at();

alter table public.call_logs enable row level security;

-- Leitura: qualquer membro do tenant.
drop policy if exists "call_logs_same_tenant_select" on public.call_logs;
create policy "call_logs_same_tenant_select"
on public.call_logs for select
using (public.is_same_tenant(tenant_id));

-- Escrita: apenas service_role (edge functions). Sem policies para authenticated
-- (insert/update/delete só via service role, que ignora RLS).

-- Realtime: a timeline de ligações do lead atualiza ao vivo.
alter table public.call_logs replica identity full;

do $$
declare has_tbl boolean;
begin
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_logs'
  ) into has_tbl;

  if not has_tbl then
    alter publication supabase_realtime add table public.call_logs;
  end if;
end $$;
