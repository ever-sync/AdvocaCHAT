-- Administradores da PLATAFORMA (super-admin), fora do modelo multi-tenant.
-- Usado pelo painel de provisionamento do add-on de IA (edge function ai-admin),
-- que opera entre tenants com service role e valida a identidade aqui.

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

-- RLS sem policies: só o service role acessa (a edge function valida a partir do JWT).
alter table public.platform_admins enable row level security;

-- Seed: o operador da plataforma. (Se o e-mail não bater, rode o insert manualmente.)
