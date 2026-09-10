alter table public.tenant_settings
  add column if not exists role_permissions jsonb not null default '{}'::jsonb;

comment on column public.tenant_settings.role_permissions is
  'Matriz de permissoes por papel (view/edit/delete) e funcao do app; editavel em Configuracoes > Colaboradores.';
