-- Adiciona a coluna stacked_services para guardar os detalhes dos serviços empilhados.
alter table public.scheduling_appointments
  add column if not exists stacked_services jsonb;
