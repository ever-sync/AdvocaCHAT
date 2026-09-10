-- Agenda alertas de uso do plano. Mesmo padrão dos demais workers:
-- pg_cron + pg_net lendo GUCs app.settings.functions_base_url / app.settings.cron_secret.
--
-- Pré-requisitos:
--   create extension if not exists pg_net;
--   create extension if not exists pg_cron;
--   alter database postgres set app.settings.functions_base_url = 'https://<host>/functions/v1';
--   alter database postgres set app.settings.cron_secret = '<CRON_SECRET>';

do $$
declare
  v_base text := current_setting('app.settings.functions_base_url', true);
  v_secret text := current_setting('app.settings.cron_secret', true);
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'pg_cron ausente: pulando agendamento do billing-usage-alerts.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net ausente: pulando agendamento do billing-usage-alerts.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'billing-usage-alerts-tick') then
    perform cron.unschedule('billing-usage-alerts-tick');
  end if;

  if v_base is null or v_secret is null then
    raise notice 'GUCs ausentes: billing-usage-alerts nao agendado. Configure e reaplique.';
    return;
  end if;

  perform cron.schedule(
    'billing-usage-alerts-tick',
    '0 */6 * * *', -- a cada 6 horas; dedupe impede reenvio no mesmo mes.
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
      rtrim(v_base, '/') || '/billing-usage-alerts',
      v_secret
    )
  );

  raise notice 'billing-usage-alerts-tick agendado (a cada 6 horas).';
end $$;
