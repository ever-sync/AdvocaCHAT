alter table public.tenant_settings
  add column if not exists onboarding_state jsonb not null default '{}'::jsonb;

comment on column public.tenant_settings.onboarding_state is
  'Estado persistido do onboarding por tenant (objetivo, conclusão e passos vistos).';
