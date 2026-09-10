-- Fase E (recorrência) + Fase G (convênio): colunas no agendamento.
--  - series_id: agrupa ocorrências de uma recorrência/pacote de sessões.
--  - convenio: plano/particular (saúde).
alter table public.scheduling_appointments
  add column if not exists series_id uuid,
  add column if not exists convenio text;

create index if not exists scheduling_appointments_series_idx
  on public.scheduling_appointments (tenant_id, series_id) where series_id is not null;
