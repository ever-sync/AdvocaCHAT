-- Modelos de tarefa ("tarefas prontas") por tenant.
-- Cadastrados em Configurações → Configuração do chat → Tarefas; usados para
-- pré-preencher tarefas no CRM e medir uso/conclusão nos Relatórios.

create table if not exists public.crm_task_templates (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  title            text not null,
  notes            text not null default '',
  -- Prazo padrão em dias a partir da criação (null = sem prazo sugerido).
  default_due_days integer,
  sort_order       integer not null default 0,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now())
);

create index if not exists crm_task_templates_tenant_idx
  on public.crm_task_templates (tenant_id, sort_order, title);

drop trigger if exists crm_task_templates_set_updated_at on public.crm_task_templates;
create trigger crm_task_templates_set_updated_at
before update on public.crm_task_templates
for each row execute function public.set_updated_at();

alter table public.crm_task_templates enable row level security;

create policy "crm_task_templates_select"
on public.crm_task_templates for select
using (public.is_same_tenant(tenant_id));

create policy "crm_task_templates_insert"
on public.crm_task_templates for insert
with check (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao', 'financeiro')
);

create policy "crm_task_templates_update"
on public.crm_task_templates for update
using (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao', 'financeiro')
);

create policy "crm_task_templates_delete"
on public.crm_task_templates for delete
using (
  public.is_same_tenant(tenant_id)
  and public.current_user_role() in ('admin', 'operacao', 'financeiro')
);

-- Rastreabilidade: de qual modelo a tarefa foi criada (para relatórios).
alter table public.crm_tasks
  add column if not exists template_id uuid references public.crm_task_templates(id) on delete set null;

create index if not exists crm_tasks_template_idx
  on public.crm_tasks (tenant_id, template_id)
  where template_id is not null;

-- Realtime
do $$
declare has_tbl boolean;
begin
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_task_templates'
  ) into has_tbl;

  if not has_tbl then
    alter publication supabase_realtime add table public.crm_task_templates;
  end if;
end $$;
