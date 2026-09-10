-- Status legado `nao_pausado` era ambíguo na UX; unifica com `em_andamento`.

update public.crm_negotiations
set
  status = 'em_andamento',
  updated_at = timezone('utc', now())
where status = 'nao_pausado';
