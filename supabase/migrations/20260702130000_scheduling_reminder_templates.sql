-- Mensagens de lembrete WhatsApp editáveis pelo tenant.
-- Variáveis disponíveis: {{nome}}, {{servico}}, {{data}}, {{hora}}
-- Nulo = usa o texto padrão do sistema.
alter table public.scheduling_public_config
  add column if not exists msg_confirmacao text,
  add column if not exists msg_lembrete_24h text,
  add column if not exists msg_lembrete_1h  text;
