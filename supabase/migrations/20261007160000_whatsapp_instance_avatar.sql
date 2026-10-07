alter table public.whatsapp_instances
  add column if not exists avatar_url text;

comment on column public.whatsapp_instances.avatar_url is
  'Foto do perfil comercial do canal retornada pelo provedor durante a sincronizacao.';
