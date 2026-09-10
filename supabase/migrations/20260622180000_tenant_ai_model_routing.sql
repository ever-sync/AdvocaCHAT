-- Model routing: turnos simples (cumprimento, "ok", "sim", "obrigado") vão
-- pro Haiku 4.5 (~5× mais barato); turnos com RAG hit, imagem ou texto longo
-- continuam no modelo configurado (Sonnet 4.6 por padrão). A heurística vive
-- na edge function; aqui é só a flag para o admin poder desligar.

alter table public.tenant_ai_config
  add column if not exists enable_model_routing boolean not null default true;

comment on column public.tenant_ai_config.enable_model_routing is
  'Quando true, o orquestrador roteia turnos curtos/sem contexto pro Haiku e mantém o modelo configurado para turnos complexos.';
