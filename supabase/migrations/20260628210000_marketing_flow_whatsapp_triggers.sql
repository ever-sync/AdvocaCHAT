-- Fase seguinte das automacoes de marketing: gatilhos de WhatsApp e controle de IA.
--
-- Novos gatilhos:
-- - whatsapp_message_received: toda mensagem inbound do cliente.
-- - chat_assigned: quando a conversa ganha um atendente.
-- - ai_paused: quando a IA sai do modo ativo (off/handoff).
-- - ai_resumed: quando a IA volta para qualifying/full.
--
-- Estes gatilhos apenas enfileiram participantes via RPC existente, sem bloquear
-- o insert/update original em caso de erro.

-- ---------------------------------------------------------------------
-- 1) Inbound WhatsApp message -> whatsapp_message_received
-- ---------------------------------------------------------------------
create or replace function public._trg_marketing_flow_whatsapp_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat record;
begin
  if new.direction is distinct from 'inbound' then
    return new;
  end if;

  select
    wc.tenant_id,
    wc.customer_id,
    wc.primary_negotiation_id,
    wc.assignee_id,
    wc.ai_mode,
    wc.display_name
  into v_chat
  from public.whatsapp_chats wc
  where wc.id = new.chat_id;

  if v_chat.tenant_id is null then
    return new;
  end if;

  begin
    perform public.enroll_marketing_flow_participants(
      v_chat.tenant_id,
      'whatsapp_message_received',
      v_chat.customer_id,
      v_chat.primary_negotiation_id,
      jsonb_build_object(
        'chat_id', new.chat_id,
        'message_id', new.id,
        'message_type', new.message_type,
        'direction', new.direction,
        'status', new.status,
        'body_text', coalesce(new.body_text, ''),
        'media_url', new.media_url,
        'assignee_id', v_chat.assignee_id,
        'chat_ai_mode', v_chat.ai_mode,
        'chat_display_name', v_chat.display_name
      )
    );
  exception when others then
    raise warning 'marketing_flow enroll (whatsapp_message_received) failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_marketing_flow_whatsapp_inbound on public.whatsapp_messages;
create trigger trg_marketing_flow_whatsapp_inbound
after insert on public.whatsapp_messages
for each row
when (new.direction = 'inbound')
execute function public._trg_marketing_flow_whatsapp_inbound();

-- ---------------------------------------------------------------------
-- 2) Chat assigned -> chat_assigned
-- ---------------------------------------------------------------------
create or replace function public._trg_marketing_flow_chat_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
    begin
      perform public.enroll_marketing_flow_participants(
        new.tenant_id,
        'chat_assigned',
        new.customer_id,
        new.primary_negotiation_id,
        jsonb_build_object(
          'chat_id', new.id,
          'assignee_id', new.assignee_id,
          'previous_assignee_id', old.assignee_id,
          'ai_mode', new.ai_mode,
          'status', new.status
        )
      );
    exception when others then
      raise warning 'marketing_flow enroll (chat_assigned) failed: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_marketing_flow_chat_assigned on public.whatsapp_chats;
create trigger trg_marketing_flow_chat_assigned
after update of assignee_id on public.whatsapp_chats
for each row
execute function public._trg_marketing_flow_chat_assigned();

-- ---------------------------------------------------------------------
-- 3) AI mode transitions -> ai_paused / ai_resumed
-- ---------------------------------------------------------------------
create or replace function public._trg_marketing_flow_ai_mode_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ai_mode is distinct from old.ai_mode then
    if new.ai_mode in ('off', 'handoff') and old.ai_mode not in ('off', 'handoff') then
      begin
        perform public.enroll_marketing_flow_participants(
          new.tenant_id,
          'ai_paused',
          new.customer_id,
          new.primary_negotiation_id,
          jsonb_build_object(
            'chat_id', new.id,
            'previous_ai_mode', old.ai_mode,
            'ai_mode', new.ai_mode,
            'assignee_id', new.assignee_id,
            'status', new.status
          )
        );
      exception when others then
        raise warning 'marketing_flow enroll (ai_paused) failed: %', sqlerrm;
      end;
    elsif new.ai_mode in ('qualifying', 'full') and old.ai_mode in ('off', 'handoff') then
      begin
        perform public.enroll_marketing_flow_participants(
          new.tenant_id,
          'ai_resumed',
          new.customer_id,
          new.primary_negotiation_id,
          jsonb_build_object(
            'chat_id', new.id,
            'previous_ai_mode', old.ai_mode,
            'ai_mode', new.ai_mode,
            'assignee_id', new.assignee_id,
            'status', new.status
          )
        );
      exception when others then
        raise warning 'marketing_flow enroll (ai_resumed) failed: %', sqlerrm;
      end;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_marketing_flow_ai_mode_changed on public.whatsapp_chats;
create trigger trg_marketing_flow_ai_mode_changed
after update of ai_mode on public.whatsapp_chats
for each row
execute function public._trg_marketing_flow_ai_mode_changed();
