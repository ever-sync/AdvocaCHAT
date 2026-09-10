-- Marketing Forms: webhook de submissão por formulário.
-- Permite configurar uma URL para receber os dados do preenchimento em JSON estruturado.

alter table public.marketing_forms
  add column if not exists submit_webhook_url text;
