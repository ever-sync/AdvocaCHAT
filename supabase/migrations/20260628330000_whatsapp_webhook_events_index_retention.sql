-- Escala: whatsapp_webhook_events recebe um INSERT por webhook do WhatsApp
-- (altíssimo volume) e o RLS filtra por tenant_id, mas a tabela não tinha
-- nenhum índice -> toda query por tenant virava seq scan da tabela inteira,
-- que cresce indefinidamente. Adiciona os índices que casam com os padrões
-- de filtro e uma retenção automática.

-- 1. Índices de acesso (CONCURRENTLY não é possível dentro de migration
--    transacional; tabela é append-only, o lock de build é tolerável).
create index if not exists whatsapp_webhook_events_tenant_received_idx
  on public.whatsapp_webhook_events (tenant_id, received_at desc);

create index if not exists whatsapp_webhook_events_tenant_instance_received_idx
  on public.whatsapp_webhook_events (tenant_id, instance_id, received_at desc);

-- 2. Retenção automática (purga diária). Requer pg_cron — se ausente, ignora.
--    Webhook events são dados operacionais/debug; 30 dias é suficiente.
--    Ajuste o intervalo conforme sua política de retenção.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'whatsapp-webhook-events-retention') then
      perform cron.unschedule('whatsapp-webhook-events-retention');
    end if;
    perform cron.schedule(
      'whatsapp-webhook-events-retention',
      '23 3 * * *', -- diariamente às 03:23 UTC
      'delete from public.whatsapp_webhook_events where received_at < now() - interval ''30 days'';'
    );
  end if;
end $$;
