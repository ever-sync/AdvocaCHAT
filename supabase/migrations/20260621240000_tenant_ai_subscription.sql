-- Add-on de IA controlado pela PLATAFORMA (não pelo tenant): define se está ativo
-- (pago) e a cota mensal de tokens. O cliente LÊ (status/cota), mas só o service role
-- escreve — assim a cobrança não pode ser burlada pelo próprio cliente.
-- O `tenant_ai_config.monthly_token_limit` continua como auto-teto opcional do tenant
-- (um cliente pode se impor um limite menor que a cota do plano).

create table if not exists public.tenant_ai_subscription (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  active boolean not null default false,
  monthly_token_quota bigint not null default 0, -- 0 = sem cota definida
  overage_allowed boolean not null default false, -- true: passa da cota (cobra overage); false: pausa
  notes text,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.tenant_ai_subscription enable row level security;

-- Tenant só LÊ; insert/update/delete somente via service role (sem policy de escrita).
drop policy if exists "tenant_ai_subscription_select" on public.tenant_ai_subscription;
create policy "tenant_ai_subscription_select" on public.tenant_ai_subscription
for select using (public.is_same_tenant(tenant_id));
