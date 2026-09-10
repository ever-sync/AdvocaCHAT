-- Trial do add-on de IA: data de expiração.
-- Trial = active=true + cota + trial_ends_at no futuro. Após trial_ends_at, a IA pausa
-- (mesmo com active=true), até o operador converter (trial_ends_at = null) ou renovar.

alter table public.tenant_ai_subscription
  add column if not exists trial_ends_at timestamptz;
