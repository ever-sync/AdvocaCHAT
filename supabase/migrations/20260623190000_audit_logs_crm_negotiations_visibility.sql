-- Histórico de mudanças do negócio: libera SELECT em audit_logs para qualquer
-- usuário com permissão crm/view ler ENTRADAS DA PRÓPRIA NEGOCIAÇÃO no mesmo
-- tenant. A policy original (admin-only) continua intacta — Postgres combina
-- policies permissivas com OR.
--
-- Escopo deliberadamente estreito:
--   - só entity_type = 'crm_negotiation' (não vaza login/export/permission_change/...);
--   - exige is_same_tenant + permissão crm/view (não usa o fallback genérico
--     do default_role_permission que liberaria operacao em chaves desconhecidas).

drop policy if exists "audit_logs_select_crm_negotiations" on public.audit_logs;
create policy "audit_logs_select_crm_negotiations"
on public.audit_logs for select
using (
  entity_type = 'crm_negotiation'
  and public.is_same_tenant(tenant_id)
  and public.has_role_permission(tenant_id, 'crm', 'view')
);
