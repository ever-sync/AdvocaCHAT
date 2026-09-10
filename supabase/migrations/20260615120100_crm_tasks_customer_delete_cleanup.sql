-- Corrige a exclusão de contatos (customers) bloqueada pela check
-- crm_tasks_negotiation_or_customer.
--
-- Problema: crm_tasks.customer_id é "on delete set null". Ao excluir um
-- contato que tem tarefa ligada SOMENTE a ele (negotiation_id null), o banco
-- tenta setar customer_id = null e a check (negotiation_id is not null OR
-- customer_id is not null) passa a falhar -> a exclusão do contato é abortada
-- com "new row for relation crm_tasks violates check constraint".
--
-- Solução: antes de excluir o contato, remover as tarefas que existem apenas
-- por causa dele (sem negociação). Tarefas que também têm negociação
-- sobrevivem: o customer_id vira null, mas o negotiation_id mantém a linha
-- válida perante a check.

create or replace function public.cleanup_customer_only_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.crm_tasks
  where customer_id = old.id
    and negotiation_id is null;
  return old;
end;
$$;

drop trigger if exists crm_tasks_cleanup_on_customer_delete on public.customers;
create trigger crm_tasks_cleanup_on_customer_delete
before delete on public.customers
for each row execute function public.cleanup_customer_only_tasks();
