-- Claim atomico para webhook_deliveries.
--
-- Antes: o dispatcher fazia SELECT das linhas 'pending' e, em seguida, um UPDATE
-- separado empurrando next_attempt_at. Duas execucoes concorrentes (cron + botao
-- "processar agora") podiam ler as MESMAS linhas antes de qualquer UPDATE e
-- disparar a entrega em DUPLICIDADE para o endpoint do cliente.
--
-- Agora: status 'processing' + colunas de lock e um RPC com FOR UPDATE SKIP
-- LOCKED (mesmo padrao de claim_marketing_flow_jobs). O claim e o UPDATE viram
-- uma unica transacao atomica. Tambem reivindica entregas presas em 'processing'
-- (worker caiu no meio) apos 5 minutos, evitando entregas orfas.

alter table public.webhook_deliveries
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text;

alter table public.webhook_deliveries
  drop constraint if exists webhook_deliveries_status_check;

alter table public.webhook_deliveries
  add constraint webhook_deliveries_status_check
  check (status in ('pending', 'processing', 'success', 'error'));

-- Acelera o reclaim de entregas presas em 'processing'.
create index if not exists webhook_deliveries_processing_idx
  on public.webhook_deliveries (status, locked_at)
  where status = 'processing';

create or replace function public.claim_webhook_deliveries(
  p_limit integer default 50,
  p_worker text default 'dispatcher',
  p_tenant uuid default null
)
returns setof public.webhook_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id
    from public.webhook_deliveries
    where (
        (status = 'pending' and next_attempt_at <= timezone('utc', now()))
        or (status = 'processing'
            and locked_at < timezone('utc', now()) - interval '5 minutes')
      )
      and (p_tenant is null or tenant_id = p_tenant)
    order by next_attempt_at asc
    for update skip locked
    limit greatest(coalesce(p_limit, 50), 1)
  )
  update public.webhook_deliveries d
  set status = 'processing',
      locked_at = timezone('utc', now()),
      locked_by = p_worker,
      attempts = d.attempts + 1
  from picked
  where d.id = picked.id
  returning d.*;
end;
$$;

revoke all on function public.claim_webhook_deliveries(integer, text, uuid) from public;
grant execute on function public.claim_webhook_deliveries(integer, text, uuid) to service_role;
