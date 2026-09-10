-- Dias sem interação para alerta "Parado" no Kanban CRM (por tenant).

alter table public.tenant_settings
  add column if not exists stale_negotiation_days integer not null default 7;

alter table public.tenant_settings
  drop constraint if exists tenant_settings_stale_negotiation_days_check;

alter table public.tenant_settings
  add constraint tenant_settings_stale_negotiation_days_check
  check (stale_negotiation_days >= 1 and stale_negotiation_days <= 90);

comment on column public.tenant_settings.stale_negotiation_days is
  'Dias sem contato/interação para exibir alerta de negócio parado no CRM.';
