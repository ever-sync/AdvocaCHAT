-- LGPD: retenção e direito ao esquecimento dos logs da IA.
-- ai_turns guarda o TEXTO das conversas (PII). ai_jobs guarda erros/estado.

-- 1. Direito ao esquecimento: ao apagar um chat, apaga os turnos da IA dele.
--    (Antes era ON DELETE SET NULL, deixando o texto da conversa órfão no banco.)
alter table public.ai_turns drop constraint if exists ai_turns_chat_id_fkey;
alter table public.ai_turns
  add constraint ai_turns_chat_id_fkey
  foreign key (chat_id) references public.whatsapp_chats(id) on delete cascade;

-- 2. Retenção automática (purga diária). Requer pg_cron — se ausente, ignora.
--    Ajuste os intervalos conforme sua política de privacidade.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'ai-logs-retention') then
      perform cron.unschedule('ai-logs-retention');
    end if;
    perform cron.schedule(
      'ai-logs-retention',
      '17 3 * * *', -- diariamente às 03:17 UTC
      'delete from public.ai_turns where created_at < now() - interval ''90 days''; '
      || 'delete from public.ai_jobs where status in (''done'',''error'') and updated_at < now() - interval ''30 days'';'
    );
  end if;
end $$;
