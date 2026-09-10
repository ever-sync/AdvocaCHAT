-- Fase D: salas/recursos. Uma sala não pode ter 2 agendamentos ativos ao mesmo
-- tempo (constraint análoga à do prestador).
create table if not exists public.scheduling_rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists scheduling_rooms_tenant_idx
  on public.scheduling_rooms (tenant_id) where ativo;

alter table public.scheduling_appointments
  add column if not exists room_id uuid references public.scheduling_rooms(id) on delete set null;

create index if not exists scheduling_appointments_room_idx
  on public.scheduling_appointments (tenant_id, room_id, starts_at) where room_id is not null;

-- Anti-overbooking por sala (só quando há sala atribuída).
alter table public.scheduling_appointments
  drop constraint if exists scheduling_appointments_room_no_overlap;
alter table public.scheduling_appointments
  add constraint scheduling_appointments_room_no_overlap
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (room_id is not null and status not in ('cancelado', 'nao_compareceu'));

drop trigger if exists scheduling_rooms_set_updated_at on public.scheduling_rooms;
create trigger scheduling_rooms_set_updated_at
before update on public.scheduling_rooms
for each row execute function public.set_updated_at();

alter table public.scheduling_rooms enable row level security;

create policy "scheduling_rooms_same_tenant_select" on public.scheduling_rooms
  for select using (public.is_same_tenant(tenant_id));
create policy "scheduling_rooms_same_tenant_insert" on public.scheduling_rooms
  for insert with check (public.is_same_tenant(tenant_id));
create policy "scheduling_rooms_same_tenant_update" on public.scheduling_rooms
  for update using (public.is_same_tenant(tenant_id)) with check (public.is_same_tenant(tenant_id));
create policy "scheduling_rooms_same_tenant_delete" on public.scheduling_rooms
  for delete using (public.is_same_tenant(tenant_id));
