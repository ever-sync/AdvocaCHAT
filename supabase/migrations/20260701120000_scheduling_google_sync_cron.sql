-- Agenda os workers de sincronização com o Google Calendar.
--  - scheduling-google-push: espelha agendamentos no Google (1/min).
--  - scheduling-google-pull: importa ocupação externa como bloqueios (5/min).
-- Mesmo padrão dos demais workers (pg_cron + pg_net + GUCs).

do $$
declare
  v_base text := current_setting('app.settings.functions_base_url', true);
  v_secret text := current_setting('app.settings.cron_secret', true);
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'pg_cron ausente: pulando crons de Google sync.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net ausente: pulando crons de Google sync.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'scheduling-google-push-tick') then
    perform cron.unschedule('scheduling-google-push-tick');
  end if;
  if exists (select 1 from cron.job where jobname = 'scheduling-google-pull-tick') then
    perform cron.unschedule('scheduling-google-pull-tick');
  end if;

  if v_base is null or v_secret is null then
    raise notice 'GUCs ausentes: crons de Google sync nao agendados. Configure e reaplique.';
    return;
  end if;

  perform cron.schedule(
    'scheduling-google-push-tick',
    '*/1 * * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', %L),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );$cmd$,
      rtrim(v_base, '/') || '/scheduling-google-push',
      v_secret
    )
  );

  perform cron.schedule(
    'scheduling-google-pull-tick',
    '*/5 * * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', %L),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );$cmd$,
      rtrim(v_base, '/') || '/scheduling-google-pull',
      v_secret
    )
  );

  raise notice 'Google sync crons agendados (push 1/min, pull 5/min).';
end $$;
