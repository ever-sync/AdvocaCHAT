-- Operacionalizacao do worker de automacoes de marketing (Fase 0).
--  1) marketing_flow_worker_heartbeats: prova de vida do worker independente da
--     fila. Antes o app inferia "worker ativo" de max(locked_at) em
--     marketing_flow_jobs — que so e setado quando ha job pra travar. Com a fila
--     vazia o card ficava "Inativo" mesmo com o cron rodando. Agora o worker
--     grava um batimento a cada execucao (com ou sem jobs).
--  2) cron (pg_cron + pg_net): dispara o worker a cada 1 minuto.
--
-- Pre-requisitos do cron (rodar UMA vez no SQL Editor / Dashboard, pois
-- carregam segredo e nao podem ir versionados):
--   create extension if not exists pg_net;
--   create extension if not exists pg_cron;
--   alter database postgres
--     set app.settings.functions_base_url = 'https://<PROJECT_REF>.supabase.co/functions/v1';
--   alter database postgres
--     set app.settings.cron_secret = '<MESMO valor do secret CRON_SECRET das functions>';
-- Depois e so re-rodar esta migration (idempotente): ela le os GUCs e agenda.
-- Sem os GUCs, a migration aplica a tabela de heartbeat e PULA o agendamento
-- (sem quebrar o db:push) — basta setar os GUCs e reaplicar.

-- 1) Tabela de heartbeat -----------------------------------------------------

create table if not exists public.marketing_flow_worker_heartbeats (
  worker_key text primary key default 'default',
  last_seen timestamptz not null default timezone('utc', now()),
  worker_id text,
  claimed integer not null default 0
);

comment on table public.marketing_flow_worker_heartbeats is
  'Prova de vida do worker de fluxos de marketing; atualizado a cada tick mesmo sem jobs.';

alter table public.marketing_flow_worker_heartbeats enable row level security;

-- Leitura para o app (card "Worker"): qualquer usuario autenticado do tenant.
-- A tabela e global (singleton 'default'), nao expõe dados de tenant, entao
-- basta exigir autenticacao. Escrita e exclusiva do worker (service_role,
-- que bypassa RLS), por isso nao ha policy de insert/update.
drop policy if exists "marketing_flow_worker_heartbeats_select"
  on public.marketing_flow_worker_heartbeats;
create policy "marketing_flow_worker_heartbeats_select"
  on public.marketing_flow_worker_heartbeats for select
  to authenticated
  using (true);

-- RPC de leitura: ultimo batimento (security definer pra dispensar policy fina
-- e manter o contrato estavel pro frontend).
create or replace function public.get_marketing_flow_worker_last_seen()
returns timestamptz
language sql
security invoker
set search_path = public
as $$
  select max(last_seen) from public.marketing_flow_worker_heartbeats;
$$;

grant execute on function public.get_marketing_flow_worker_last_seen() to authenticated;

-- 2) Agendamento do worker via pg_cron -------------------------------------

do $$
declare
  v_base text := current_setting('app.settings.functions_base_url', true);
  v_secret text := current_setting('app.settings.cron_secret', true);
begin
  -- So agenda se pg_cron e pg_net existirem (ambientes locais/CI podem nao ter).
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'pg_cron ausente: pulando agendamento do marketing-flow-worker.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net ausente: pulando agendamento do marketing-flow-worker.';
    return;
  end if;

  -- Reagenda do zero (idempotente).
  if exists (select 1 from cron.job where jobname = 'marketing-flow-worker-tick') then
    perform cron.unschedule('marketing-flow-worker-tick');
  end if;

  if v_base is null or v_secret is null then
    raise notice 'GUCs app.settings.functions_base_url/cron_secret ausentes: '
      'heartbeat criado, mas o tick nao foi agendado. Configure e reaplique.';
    return;
  end if;

  perform cron.schedule(
    'marketing-flow-worker-tick',
    '* * * * *', -- a cada 1 minuto (granularidade minima do pg_cron)
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );$cmd$,
      rtrim(v_base, '/') || '/marketing-flow-worker',
      v_secret
    )
  );
  raise notice 'marketing-flow-worker-tick agendado (1/min).';
end $$;
