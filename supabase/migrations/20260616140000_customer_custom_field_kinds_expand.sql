-- Amplia tipos de campos personalizados de contato e suporta opções para listas

alter table public.customer_custom_fields
  add column if not exists options jsonb not null default '[]'::jsonb;

alter table public.customer_custom_fields
  drop constraint if exists customer_custom_fields_kind_check;

alter table public.customer_custom_fields
  add constraint customer_custom_fields_kind_check check (
    kind in (
      'texto',
      'texto_longo',
      'numero',
      'inteiro',
      'moeda',
      'porcentagem',
      'data',
      'hora',
      'data_hora',
      'email',
      'telefone',
      'url',
      'cpf',
      'cnpj',
      'cep',
      'booleano',
      'lista',
      'cor'
    )
  );
