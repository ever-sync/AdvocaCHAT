-- Contexto de tenant para SUPERADMIN.
-- Permite selecionar uma empresa ativa sem alterar o perfil original do usuário.

create table if not exists public.platform_user_tenant_context (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  selected_tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.platform_user_tenant_context enable row level security;

create or replace function public.get_platform_tenant_context()
returns table (
  current_tenant_id uuid,
  default_tenant_id uuid,
  selected_tenant_id uuid,
  is_platform_admin boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when exists (
        select 1
        from public.platform_admins pa
        where pa.user_id = auth.uid()
      ) then coalesce(ctx.selected_tenant_id, p.tenant_id)
      else p.tenant_id
    end as current_tenant_id,
    p.tenant_id as default_tenant_id,
    case
      when exists (
        select 1
        from public.platform_admins pa
        where pa.user_id = auth.uid()
      ) then ctx.selected_tenant_id
      else null
    end as selected_tenant_id,
    exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = auth.uid()
    ) as is_platform_admin
  from public.profiles p
  left join public.platform_user_tenant_context ctx
    on ctx.user_id = p.id
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select current_tenant_id
  from public.get_platform_tenant_context()
  limit 1
$$;

create or replace function public.set_platform_tenant_context(p_tenant_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_user_id is null then
    raise exception 'Sessao invalida.';
  end if;

  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = v_user_id
  )
  into v_is_admin;

  if not v_is_admin then
    raise exception 'Acesso restrito ao administrador da plataforma.';
  end if;

  if p_tenant_id is null then
    delete from public.platform_user_tenant_context
    where user_id = v_user_id;
    return null;
  end if;

  if not exists (
    select 1
    from public.tenants t
    where t.id = p_tenant_id
  ) then
    raise exception 'Tenant nao encontrado.';
  end if;

  insert into public.platform_user_tenant_context (
    user_id,
    selected_tenant_id,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    p_tenant_id,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (user_id)
  do update set
    selected_tenant_id = excluded.selected_tenant_id,
    updated_at = excluded.updated_at;

  return p_tenant_id;
end;
$$;

grant execute on function public.get_platform_tenant_context() to authenticated;
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.set_platform_tenant_context(uuid) to authenticated;

select pg_notify('pgrst', 'reload schema');
