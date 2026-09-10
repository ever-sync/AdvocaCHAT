-- Adiciona a coluna clinical_notes para registro de prontuário clínico/anamnese
alter table public.scheduling_appointments
  add column if not exists clinical_notes text;
