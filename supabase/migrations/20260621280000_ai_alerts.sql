-- Dedupe de alertas de IA por e-mail: no máximo 1 por tenant/tipo/período.
-- kind: 'quota_80' | 'quota_100'. period: 'YYYY-MM'.

create table if not exists public.ai_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null,
  period text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, kind, period)
);

-- RLS sem policies: só o service role (a edge function ai-alerts) acessa.
alter table public.ai_alerts enable row level security;
