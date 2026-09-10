-- Keyset pagination for inbox messages (newest-first windows, cursor = oldest row in batch).

create or replace function public.whatsapp_messages_page(
  p_chat_id uuid,
  p_before_created_at timestamptz,
  p_before_id uuid,
  p_limit int
)
returns setof public.whatsapp_messages
language sql
stable
security invoker
set search_path = public
as $$
  select m.*
  from public.whatsapp_messages m
  where m.chat_id = p_chat_id
  and (
    (p_before_created_at is null and p_before_id is null)
    or row(m.created_at, m.id) < row(p_before_created_at, p_before_id)
  )
  order by m.created_at desc, m.id desc
  limit least(coalesce(nullif(p_limit, 0), 50), 100) + 1;
$$;

comment on function public.whatsapp_messages_page(uuid, timestamptz, uuid, int) is
  'Returns up to p_limit+1 messages older than the cursor (exclusive), newest batch first.';

grant execute on function public.whatsapp_messages_page(uuid, timestamptz, uuid, int) to authenticated;
