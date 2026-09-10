-- Status de presença do atendente: impacta a fila automática (round-robin).
-- available -> recebe auto-assign
-- busy/offline -> excluído da seleção de fila (mas continua podendo assumir chats manualmente)

alter table public.profiles
  add column if not exists availability text not null default 'available'
    check (availability in ('available', 'busy', 'offline'));

alter table public.profiles
  add column if not exists availability_updated_at timestamptz not null default timezone('utc', now());

create index if not exists profiles_tenant_availability_idx
  on public.profiles (tenant_id, availability)
  where role = 'atendimento';

-- pick_queue_assignee: passa a filtrar por availability = 'available'.
create or replace function public.pick_queue_assignee(p_tenant_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_max_global integer;
  v_strategy text;
  v_has_pool boolean;
begin
  select
    ts.queue_max_open_chats_per_attendant,
    coalesce(ts.queue_distribution_strategy, 'least_open_chats')
  into v_max_global, v_strategy
  from public.tenant_settings ts
  where ts.tenant_id = p_tenant_id;

  select exists (
    select 1 from public.chat_queue_attendants cqa
    where cqa.tenant_id = p_tenant_id
      and cqa.enabled = true
  ) into v_has_pool;

  if v_strategy = 'round_robin' then
    return (
      select p.id
      from public.profiles p
      left join public.chat_queue_attendants cqa
        on cqa.tenant_id = p_tenant_id
        and cqa.profile_id = p.id
      left join public.whatsapp_chats wc
        on wc.assignee_id = p.id
        and wc.tenant_id = p_tenant_id
        and wc.status = 'open'
      where p.tenant_id = p_tenant_id
        and p.role = 'atendimento'
        and p.status = 'active'
        and p.availability = 'available'
        and (not v_has_pool or (cqa.enabled = true))
        group by p.id, p.created_at, cqa.max_open_chats
        having count(wc.id) < coalesce(cqa.max_open_chats, v_max_global, 2147483647)
        order by count(wc.id) asc, p.created_at asc
        limit 1
    );
  end if;

  return (
    select p.id
    from public.profiles p
    left join public.chat_queue_attendants cqa
      on cqa.tenant_id = p_tenant_id
      and cqa.profile_id = p.id
    left join public.whatsapp_chats wc
      on wc.assignee_id = p.id
      and wc.tenant_id = p_tenant_id
      and wc.status = 'open'
    where p.tenant_id = p_tenant_id
      and p.role = 'atendimento'
      and p.status = 'active'
      and p.availability = 'available'
      and (not v_has_pool or (cqa.enabled = true))
    group by p.id, cqa.max_open_chats
    having count(wc.id) < coalesce(cqa.max_open_chats, v_max_global, 2147483647)
    order by count(wc.id) asc, p.created_at asc
    limit 1
  );
end;
$$;

-- RPC: usuário muda o próprio status (UI da sidebar).
create or replace function public.set_my_availability(p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('available', 'busy', 'offline') then
    raise exception 'Status inválido';
  end if;

  update public.profiles
  set
    availability = p_status,
    availability_updated_at = timezone('utc', now())
  where id = auth.uid();
end;
$$;

grant execute on function public.set_my_availability(text) to authenticated;

-- Expor availability no list_atendimento_users e list_chat_queue_workload? Não — manteríamos
-- compatibilidade. A UI consulta profiles.availability diretamente quando precisar.
