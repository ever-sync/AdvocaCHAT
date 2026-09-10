-- Fase B do módulo de Agendamento: fluxo de atendimento.
--  - checked_in_at: quando o paciente fez check-in (chegou na recepção).
--  - cancel_reason: motivo do cancelamento.
-- Os status confirmado/concluido/nao_compareceu já existem no enum da tabela.
alter table public.scheduling_appointments
  add column if not exists checked_in_at timestamptz,
  add column if not exists cancel_reason text;
