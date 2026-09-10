-- Stats incrementais para campaigns: substitui o `refreshCampaignStats`
-- (que faz 2x SELECT count + 1x UPDATE) no hot path do `campaign-dispatcher`
-- por um UPDATE atomico de 1 linha.
--
-- Chamada apos cada destinatario:
--   sent  +=1  quando o envio sucede
--   failed +=1 quando falha (erro ou numero invalido)
--
-- Quando `sent + failed >= total_recipients`, a funcao marca a campanha como
-- `completed` automaticamente (idempotente: so altera se ainda estiver `running`).
--
-- `delivered_count`/`read_count` continuam sendo recalculados via
-- `refreshCampaignStats` no webhook MESSAGES_UPDATE, pois sao derivados de
-- transicoes de status em `whatsapp_messages` que nao sao monotonicas em delta
-- (uma mensagem que vai de `delivered` para `read` nao soma duas vezes em
-- `delivered_count`).

create or replace function public.bump_campaign_counters(
  p_campaign_id uuid,
  p_sent_delta int default 0,
  p_failed_delta int default 0,
  p_responded_delta int default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_sent int;
  v_failed int;
  v_status text;
begin
  update public.campaigns
  set
    sent_count      = greatest(0, sent_count      + p_sent_delta),
    failed_count    = greatest(0, failed_count    + p_failed_delta),
    responded_count = greatest(0, responded_count + p_responded_delta)
  where id = p_campaign_id
  returning total_recipients, sent_count, failed_count, status
    into v_total, v_sent, v_failed, v_status;

  if not found then
    raise exception 'campaign % not found', p_campaign_id;
  end if;

  if v_total > 0 and (v_sent + v_failed) >= v_total and v_status = 'running' then
    update public.campaigns
       set status = 'completed'
     where id = p_campaign_id
       and status = 'running';
  end if;
end;
$$;

comment on function public.bump_campaign_counters(uuid, int, int, int) is
  'Atualiza contadores de campanha de forma incremental e marca como completed quando aplicavel. Substitui agregacoes full-scan no hot path do dispatcher.';

revoke all on function public.bump_campaign_counters(uuid, int, int, int) from public;
grant execute on function public.bump_campaign_counters(uuid, int, int, int) to authenticated, service_role;
