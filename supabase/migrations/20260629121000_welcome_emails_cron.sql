-- Agenda o worker de boas-vindas.
-- Mesmo padrão dos demais workers: pg_cron + pg_net lendo GUCs
-- app.settings.functions_base_url / app.settings.cron_secret.

do $$
declare
  v_base text := current_setting('app.settings.functions_base_url', true);
  v_secret text := current_setting('app.settings.cron_secret', true);
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'pg_cron ausente: pulando agendamento do welcome-email-dispatch.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net ausente: pulando agendamento do welcome-email-dispatch.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'welcome-email-dispatch-tick') then
    perform cron.unschedule('welcome-email-dispatch-tick');
  end if;

  if v_base is null or v_secret is null then
    raise notice 'GUCs ausentes: welcome-email-dispatch nao agendado. Configure e reaplique.';
    return;
  end if;

  perform cron.schedule(
    'welcome-email-dispatch-tick',
    '*/1 * * * *',
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
      rtrim(v_base, '/') || '/welcome-email-dispatch',
      v_secret
    )
  );

  raise notice 'welcome-email-dispatch-tick agendado (1/min).';
end $$;
