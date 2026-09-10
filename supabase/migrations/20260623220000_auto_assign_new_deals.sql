-- Auto-atribuição em "deal.created": quando uma negociação entra com
-- assignee_id = null e o tenant ativou a flag, escolhe um atendente via
-- pick_crm_assignee (mesma lógica do auto_assign_pool_negotiations).
--
-- Decisão de design: BEFORE INSERT em vez de AFTER + UPDATE. Vantagens:
--   - Mantém o INSERT/audit limpo (sem segundo evento "assignee mudou de
--     null pra X" segundos depois);
--   - Trigger de webhooks emite `deal.created` já com assignee correto;
--   - Mesma transação, sem race window.
--
-- A flag respeita atendentes ativos + disponíveis (availability='available'),
-- enrollment opcional via chat_queue_attendants e cap por max_open_chats —
-- tudo herdado de pick_crm_assignee.

alter table public.tenant_settings
  add column if not exists auto_assign_new_deals boolean not null default false;

comment on column public.tenant_settings.auto_assign_new_deals is
  'Quando true, deals criados sem responsável recebem auto-assign via pick_crm_assignee (round-robin por menor carga + disponibilidade).';

create or replace function public.tg_auto_assign_new_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_pick uuid;
begin
  -- Já tem dono: respeita escolha explícita do criador.
  if NEW.assignee_id is not null then
    return NEW;
  end if;

  select coalesce(ts.auto_assign_new_deals, false)
    into v_enabled
  from public.tenant_settings ts
  where ts.tenant_id = NEW.tenant_id;

  if not coalesce(v_enabled, false) then
    return NEW;
  end if;

  v_pick := public.pick_crm_assignee(NEW.tenant_id);
  if v_pick is not null then
    NEW.assignee_id := v_pick;
  end if;
  -- Sem atendente disponível: mantém no pool. O trigger NÃO bloqueia o
  -- INSERT — o deal entra mesmo sem atribuição, e fica visível pra rotina
  -- manual de distribuir (Pacote 21).

  return NEW;
end;
$$;

drop trigger if exists crm_negotiations_auto_assign_before on public.crm_negotiations;
create trigger crm_negotiations_auto_assign_before
before insert on public.crm_negotiations
for each row execute function public.tg_auto_assign_new_deal();
