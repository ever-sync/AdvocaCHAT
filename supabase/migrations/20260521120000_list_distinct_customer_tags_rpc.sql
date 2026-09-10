-- Tags distintas do tenant para sugestões no inbox (sem carregar todos os clientes).

create or replace function public.list_distinct_customer_tags()
returns setof text
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tid uuid;
begin
  select p.tenant_id into tid from public.profiles p where p.id = auth.uid();
  if tid is null then
    return;
  end if;

  return query
  select distinct trim(u.tag)::text
  from public.customers c
  cross join lateral (
    select jsonb_array_elements_text(doc) as tag
    from (
      select case jsonb_typeof(coalesce(c.source_columns -> 'wchat_customer_tags', 'null'::jsonb))
        when 'array' then coalesce(c.source_columns -> 'wchat_customer_tags', '[]'::jsonb)
        when 'string' then
          case
            when left(trim(c.source_columns ->> 'wchat_customer_tags'), 1) = '[' then
              (trim(c.source_columns ->> 'wchat_customer_tags'))::jsonb
            else '[]'::jsonb
          end
        else '[]'::jsonb
      end as doc
    ) parsed
    union all
    select trim(s)::text
    from regexp_split_to_table(
      case
        when jsonb_typeof(coalesce(c.source_columns -> 'wchat_customer_tags', 'null'::jsonb)) not in ('array')
          and coalesce(c.source_columns ->> 'wchat_customer_tags', '') !~ '^\s*\['
        then coalesce(c.source_columns ->> 'wchat_customer_tags', '')
        else ''
      end,
      '[,;|]'
    ) s
    where length(trim(s)) >= 2
  ) u(tag)
  where c.tenant_id = tid
    and length(trim(u.tag)) >= 2
  order by 1;
end;
$$;

grant execute on function public.list_distinct_customer_tags() to authenticated;
