-- Registros criados por ajuste administrativo nao devem parecer assinaturas do Asaas.
update public.billing_subscriptions
set
  gateway_provider = 'manual',
  gateway_status = null,
  updated_at = timezone('utc', now())
where gateway_provider = 'asaas'
  and gateway_subscription_id is null
  and gateway_checkout_id is null
  and gateway_payment_id is null;
