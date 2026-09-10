-- Guarda a condição informada no formulário sem substituir o campo-resumo de saúde.
insert into public.customer_custom_fields (tenant_id, nome, kind, options, sort_order)
select
  t.id,
  'Doença ou condição informada',
  'texto',
  '[]'::jsonb,
  125
from public.tenants t
where not exists (
  select 1
  from public.customer_custom_fields f
  where f.tenant_id = t.id
    and lower(trim(f.nome)) = lower('Doença ou condição informada')
);
