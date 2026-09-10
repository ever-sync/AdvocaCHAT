-- Agenda o worker de dispatch de conversões de Ads (Meta CAPI / Google Ads).
-- Mesmo padrão do marketing-flow-worker: pg_cron + pg_net lendo GUCs
-- app.settings.functions_base_url / app.settings.cron_secret (não versiona o
-- segredo). Idempotente: se faltar extensão ou GUC, cria nada e só avisa.
--
-- Pré-requisitos (rodar UMA vez no SQL Editor, ver migration ...190000):
--   create extension if not exists pg_net;
--   create extension if not exists pg_cron;
--   alter database postgres set app.settings.functions_base_url = 'https://<ref>.supabase.co/functions/v1';
--   alter database postgres set app.settings.cron_secret = '<CRON_SECRET>';

do $$
declare
  v_base text := current_setting('app.settings.functions_base_url', true);
  v_secret text := current_setting('app.settings.cron_secret', true);
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'pg_cron ausente: pulando agendamento do marketing-ad-conversion-dispatch.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net ausente: pulando agendamento do marketing-ad-conversion-dispatch.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'marketing-ad-conversion-dispatch-tick') then
    perform cron.unschedule('marketing-ad-conversion-dispatch-tick');
  end if;

  if v_base is null or v_secret is null then
    raise notice 'GUCs ausentes: dispatch de Ads nao agendado. Configure e reaplique.';
    return;
  end if;

  perform cron.schedule(
    'marketing-ad-conversion-dispatch-tick',
    '*/5 * * * *', -- a cada 5 minutos (conversões não são urgentes)
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
      rtrim(v_base, '/') || '/marketing-ad-conversion-dispatch',
      v_secret
    )
  );
  raise notice 'marketing-ad-conversion-dispatch-tick agendado (5/min).';
end $$;
