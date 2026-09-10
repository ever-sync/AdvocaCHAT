-- Fase F: lista de espera / encaixe. Pacientes aguardando horário; ao cancelar
-- um agendamento, a recepção sugere encaixes compatíveis.
create table if not exists public.scheduling_waitlist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  service_id uuid references public.products(id) on delete set null,
  provider_id uuid references public.profiles(id) on delete set null,
  customer_nome text not null,
  customer_telefone text,
  /** Janela desejada (texto livre: "manhãs", "qualquer", etc.) + datas opcionais. */
  preferencia text,
  desired_from date,
  desired_to date,
  status text not null default 'aguardando'
    check (status in ('aguardando', 'agendado', 'cancelado')),
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists scheduling_waitlist_open_idx
  on public.scheduling_waitlist (tenant_id, status) where status = 'aguardando';
create index if not exists scheduling_waitlist_service_idx
  on public.scheduling_waitlist (tenant_id, service_id, provider_id) where status = 'aguardando';

drop trigger if exists scheduling_waitlist_set_updated_at on public.scheduling_waitlist;
create trigger scheduling_waitlist_set_updated_at
before update on public.scheduling_waitlist
for each row execute function public.set_updated_at();

alter table public.scheduling_waitlist enable row level security;

create policy "scheduling_waitlist_same_tenant_select" on public.scheduling_waitlist
  for select using (public.is_same_tenant(tenant_id));
create policy "scheduling_waitlist_same_tenant_insert" on public.scheduling_waitlist
  for insert with check (public.is_same_tenant(tenant_id));
create policy "scheduling_waitlist_same_tenant_update" on public.scheduling_waitlist
  for update using (public.is_same_tenant(tenant_id)) with check (public.is_same_tenant(tenant_id));
create policy "scheduling_waitlist_same_tenant_delete" on public.scheduling_waitlist
  for delete using (public.is_same_tenant(tenant_id));
