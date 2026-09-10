-- Chaves de API por tenant para integrações externas (n8n, Zapier, etc.)

create table if not exists public.tenant_api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default array['read', 'write']::text[],
  enabled boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.profiles(id) on delete set null,
  constraint tenant_api_keys_name_len check (char_length(trim(name)) >= 2),
  constraint tenant_api_keys_hash_len check (char_length(key_hash) = 64),
  constraint tenant_api_keys_scopes_nonempty check (cardinality(scopes) > 0)
);

create unique index if not exists tenant_api_keys_key_hash_uidx on public.tenant_api_keys (key_hash);
create index if not exists tenant_api_keys_tenant_id_idx on public.tenant_api_keys (tenant_id);

alter table public.tenant_api_keys enable row level security;

-- Acesso apenas via service role (edge functions). Sem policies para authenticated.

comment on table public.tenant_api_keys is
  'Chaves Bearer para API pública wchat-api. O segredo completo só é exibido na criação.';
