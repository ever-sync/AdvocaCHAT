-- Responsável da tarefa (perfil no tenant), alinhado a crm_negotiations.assignee_id.

alter table public.crm_tasks
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null;

create index if not exists crm_tasks_assignee_idx
  on public.crm_tasks (assignee_id)
  where assignee_id is not null;
