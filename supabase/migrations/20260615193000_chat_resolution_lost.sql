-- Resolução de conversa: "lost" (Perdido)

do $$
declare
  conname text;
begin
  for conname in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'whatsapp_chats'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%resolution%'
  loop
    execute format('alter table public.whatsapp_chats drop constraint if exists %I', conname);
  end loop;
end $$;

alter table public.whatsapp_chats
  add constraint whatsapp_chats_resolution_check
  check (
    resolution in ('open', 'pending', 'resolved', 'waiting_customer', 'lost')
  );

create or replace function public.set_chat_resolution(
  p_chat_id uuid,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if p_resolution not in ('open', 'pending', 'resolved', 'waiting_customer', 'lost') then
    raise exception 'Resolução inválida';
  end if;

  select tenant_id into v_tenant from public.whatsapp_chats where id = p_chat_id;
  if v_tenant is null or not public.is_same_tenant(v_tenant) then
    raise exception 'Chat não encontrado';
  end if;

  update public.whatsapp_chats
  set
    resolution = p_resolution,
    status = case when p_resolution in ('resolved', 'lost') then 'closed' else 'open' end
  where id = p_chat_id;

  if p_resolution = 'resolved' then
    insert into public.crm_activities (tenant_id, chat_id, customer_id, activity_type, title, created_by)
    select c.tenant_id, c.id, c.customer_id, 'chat_resolved', 'Conversa resolvida', auth.uid()
    from public.whatsapp_chats c
    where c.id = p_chat_id;
  elsif p_resolution = 'lost' then
    insert into public.crm_activities (tenant_id, chat_id, customer_id, activity_type, title, created_by)
    select c.tenant_id, c.id, c.customer_id, 'chat_lost', 'Conversa perdida', auth.uid()
    from public.whatsapp_chats c
    where c.id = p_chat_id;
  end if;
end;
$$;

grant execute on function public.set_chat_resolution(uuid, text) to authenticated;

-- Assumir conversa: reabrir também quando estava perdida
create or replace function public.claim_chat(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_tenant uuid;
  v_chat record;
begin
  select role, tenant_id into v_role, v_tenant
  from public.profiles
  where id = auth.uid();

  if v_role is null then
    raise exception 'Não autenticado';
  end if;

  if v_role not in ('atendimento', 'admin', 'operacao', 'financeiro') then
    raise exception 'Permissão negada';
  end if;

  select tenant_id, assignee_id, status
  into v_chat
  from public.whatsapp_chats
  where id = p_chat_id;

  if v_chat.tenant_id is null or v_chat.tenant_id != v_tenant then
    raise exception 'Chat não encontrado';
  end if;

  if v_chat.assignee_id is not null and v_chat.assignee_id != auth.uid() then
    raise exception 'Conversa já atribuída a outro responsável';
  end if;

  if v_chat.assignee_id = auth.uid() then
    return;
  end if;

  insert into public.chat_transfers (
    tenant_id, chat_id, from_user_id, to_user_id, transferred_by, reason
  ) values (
    v_tenant, p_chat_id, null, auth.uid(), auth.uid(), 'claim'
  );

  update public.whatsapp_chats
  set
    assignee_id = auth.uid(),
    assigned_at = timezone('utc', now()),
    assigned_by = auth.uid(),
    status = 'open',
    resolution = case
      when resolution in ('resolved', 'lost') then 'open'
      else coalesce(resolution, 'open')
    end
  where id = p_chat_id;
end;
$$;

-- Inbound message: voltar para aberta se estava perdida ou resolvida
create or replace function public.touch_crm_on_whatsapp_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg_id uuid;
  v_occurred timestamptz;
  v_chat record;
  v_sla_minutes integer;
  v_inbound_contact timestamptz;
begin
  v_occurred := coalesce(NEW.received_at, NEW.sent_at, timezone('utc', now()));

  select
    c.primary_negotiation_id,
    c.tenant_id,
    c.first_inbound_at,
    c.first_response_at,
    c.resolution,
    c.snooze_until
  into v_chat
  from public.whatsapp_chats c
  where c.id = NEW.chat_id;

  v_neg_id := public.resolve_negotiation_for_chat(NEW.chat_id);

  if v_neg_id is not null then
    v_inbound_contact := case when NEW.direction = 'inbound' then v_occurred else null end;
    perform public.touch_crm_negotiation_interaction(v_neg_id, v_occurred, v_inbound_contact);
  end if;

  if NEW.direction = 'inbound' then
    select coalesce(ts.sla_first_response_minutes, 15) into v_sla_minutes
    from public.tenant_settings ts
    where ts.tenant_id = v_chat.tenant_id;

    update public.whatsapp_chats c
    set
      first_inbound_at = coalesce(c.first_inbound_at, v_occurred),
      sla_first_response_due_at = case
        when c.first_inbound_at is null and c.first_response_at is null
        then v_occurred + make_interval(mins => v_sla_minutes)
        else c.sla_first_response_due_at
      end,
      snooze_until = null,
      resolution = case
        when c.resolution in ('resolved', 'lost') then 'open'
        else coalesce(c.resolution, 'open')
      end,
      status = 'open'
    where c.id = NEW.chat_id;
  elsif NEW.direction = 'outbound'
    and coalesce(NEW.actor_type, 'human') = 'human'
  then
    update public.whatsapp_chats c
    set first_response_at = coalesce(c.first_response_at, v_occurred)
    where c.id = NEW.chat_id
      and c.first_inbound_at is not null
      and c.first_response_at is null;
  end if;

  return NEW;
end;
$$;
