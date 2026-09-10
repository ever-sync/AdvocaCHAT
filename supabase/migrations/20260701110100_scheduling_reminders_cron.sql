-- Agenda o worker de lembretes de agendamento.
-- Mesmo padrão: pg_cron + pg_net lendo GUCs
-- app.settings.functions_base_url / app.settings.cron_secret.

do $$
declare
  v_base text := current_setting('app.settings.functions_base_url', true);
  v_secret text := current_setting('app.settings.cron_secret', true);
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'pg_cron ausente: pulando agendamento do scheduling-reminder-dispatch.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net ausente: pulando agendamento do scheduling-reminder-dispatch.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'scheduling-reminder-dispatch-tick') then
    perform cron.unschedule('scheduling-reminder-dispatch-tick');
  end if;

  if v_base is null or v_secret is null then
    raise notice 'GUCs ausentes: scheduling-reminder-dispatch nao agendado. Configure e reaplique.';
    return;
  end if;

  perform cron.schedule(
    'scheduling-reminder-dispatch-tick',
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
      rtrim(v_base, '/') || '/scheduling-reminder-dispatch',
      v_secret
    )
  );

  raise notice 'scheduling-reminder-dispatch-tick agendado (1/min).';
end $$;
