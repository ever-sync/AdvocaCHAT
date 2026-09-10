-- Lembretes de agendamento por WhatsApp (F5).
--  - Trigger enfileira scheduling_reminders quando um agendamento é criado/movido.
--  - Estado 'sending' evita dupla-entrega entre execuções do worker.
--  - Worker scheduling-reminder-dispatch consome a fila (cron à parte).

-- 'sending' = reivindicado por um worker (claim atômico).
alter table public.scheduling_reminders
  drop constraint if exists scheduling_reminders_status_check;
alter table public.scheduling_reminders
  add constraint scheduling_reminders_status_check
  check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'cancelled'));

create or replace function public.enqueue_scheduling_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  now_utc timestamptz := timezone('utc', now());
begin
  if (TG_OP = 'INSERT') then
    if NEW.status not in ('cancelado', 'nao_compareceu') then
      -- Confirmação imediata só p/ agendamentos vindos da página pública.
      if NEW.origin = 'publico' then
        insert into public.scheduling_reminders (tenant_id, appointment_id, kind, send_at)
        values (NEW.tenant_id, NEW.id, 'confirmacao', now_utc)
        on conflict (appointment_id, kind) do nothing;
      end if;
      if NEW.starts_at - interval '24 hours' > now_utc then
        insert into public.scheduling_reminders (tenant_id, appointment_id, kind, send_at)
        values (NEW.tenant_id, NEW.id, 'lembrete_24h', NEW.starts_at - interval '24 hours')
        on conflict (appointment_id, kind) do nothing;
      end if;
      if NEW.starts_at - interval '1 hour' > now_utc then
        insert into public.scheduling_reminders (tenant_id, appointment_id, kind, send_at)
        values (NEW.tenant_id, NEW.id, 'lembrete_1h', NEW.starts_at - interval '1 hour')
        on conflict (appointment_id, kind) do nothing;
      end if;
    end if;
    return NEW;
  end if;

  if (TG_OP = 'UPDATE') then
    -- Cancelamento: cancela lembretes ainda na fila.
    if NEW.status in ('cancelado', 'nao_compareceu')
       and OLD.status not in ('cancelado', 'nao_compareceu') then
      update public.scheduling_reminders
        set status = 'cancelled'
      where appointment_id = NEW.id and status in ('queued', 'sending');
    -- Reagendamento: recalcula os horários dos lembretes pendentes.
    elsif NEW.starts_at is distinct from OLD.starts_at then
      update public.scheduling_reminders
        set send_at = NEW.starts_at - interval '24 hours', status = 'queued'
      where appointment_id = NEW.id and kind = 'lembrete_24h' and status in ('queued', 'sending');
      update public.scheduling_reminders
        set send_at = NEW.starts_at - interval '1 hour', status = 'queued'
      where appointment_id = NEW.id and kind = 'lembrete_1h' and status in ('queued', 'sending');
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

drop trigger if exists scheduling_appointments_enqueue_reminders on public.scheduling_appointments;
create trigger scheduling_appointments_enqueue_reminders
after insert or update on public.scheduling_appointments
for each row
execute function public.enqueue_scheduling_reminders();
