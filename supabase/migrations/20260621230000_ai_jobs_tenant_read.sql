-- Visibilidade de erros da IA: permite o tenant LER seus próprios jobs (status/erro)
-- na aba Atividade. Escrita continua só via service role (sem policy de insert/update).

drop policy if exists "ai_jobs_select" on public.ai_jobs;
create policy "ai_jobs_select" on public.ai_jobs
for select using (public.is_same_tenant(tenant_id));
