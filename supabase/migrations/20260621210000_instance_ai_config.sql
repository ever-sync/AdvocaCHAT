-- AI orchestrator — Fase 6 (F6): operação por canal.
-- Liga/desliga a IA por instância de WhatsApp + persona por canal + modo padrão
-- aplicado a conversas novas desse canal (auto-on).

alter table public.whatsapp_instances
  add column if not exists ai_enabled boolean not null default false,
  add column if not exists ai_default_mode text not null default 'full',
  add column if not exists ai_persona text;

-- Restringe ai_default_mode aos modos em que a IA atua.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_instances_ai_default_mode_chk'
  ) then
    alter table public.whatsapp_instances
      add constraint whatsapp_instances_ai_default_mode_chk
      check (ai_default_mode in ('qualifying', 'full'));
  end if;
end $$;
