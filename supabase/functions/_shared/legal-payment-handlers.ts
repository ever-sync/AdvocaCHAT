import { limitedBody } from "./limited-body.ts";
import { timingSafeEqual } from "./timing-safe-equal.ts";
import { asaasBinding, asaasConfig, type LegalChargeJob, type PaymentEnvironment, parseAsaasReceipt, sendLegalAsaas, validAsaasWebhookToken } from "./legal-payment.ts";
import { type PortalAdmin, PortalError, portalBody, portalFailure, portalFields, portalHash, portalMethod, portalReply, portalRpc } from "./legal-portal.ts";

export function createLegalPaymentDispatchHandler(createAdmin: () => PortalAdmin, env: PaymentEnvironment, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    const method = portalMethod(request); if (method) return method;
    try {
      const expected = env("CRON_SECRET"); const supplied = request.headers.get("x-cron-secret");
      if (!expected || !supplied || !timingSafeEqual(supplied, expected)) throw new PortalError(401, "Acesso não autorizado.");
      const body = await portalBody(request, 1024); portalFields(body, ["action"]);
      if (body.action !== "dispatch") throw new PortalError(400, "Ação inválida.");
      const binding = asaasBinding(env); const config = asaasConfig(env);
      if (!binding) return portalReply({ configured: false, status: "not_configured", processed: 0 });
      const admin = createAdmin();
      const jobs = await portalRpc<LegalChargeJob[]>(admin, "legal_finance_service_claim", { p_expected_tenant_id: binding.tenantId, p_account_id: binding.accountId, p_environment: binding.environment, p_configured: !!config });
      if (!config) return portalReply({ configured: false, status: "not_configured", processed: 0 });
      if (!Array.isArray(jobs) || jobs.length > 10) throw new PortalError(503, "Fila indisponível.");
      const counts = { provider_accepted: 0, failed: 0, unknown: 0 }; let next = 0;
      const workers = await Promise.allSettled(Array.from({ length: Math.min(3, jobs.length) }, async () => {
        while (next < jobs.length) {
          const job = jobs[next++]; const result = await sendLegalAsaas(config, job, fetcher);
          await portalRpc(admin, "legal_finance_service_finish", { p_attempt_id: job.id, p_lease_token: job.lease_token, p_status: result.status, p_provider_id: result.providerId, p_provider_url: result.providerUrl, p_provider_state: result.providerState });
          counts[result.status]++;
        }
      }));
      if (workers.some((worker) => worker.status === "rejected")) throw new PortalError(503, "Resultado pendente de reconciliação.");
      return portalReply({ configured: true, processed: jobs.length, ...counts });
    } catch (error) { return portalFailure(error); }
  };
}

export function createLegalPaymentWebhookHandler(createAdmin: () => PortalAdmin, env: PaymentEnvironment) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return portalReply({ error: "Método não permitido." }, 405);
    try {
      const binding = asaasBinding(env);
      if (!binding || !validAsaasWebhookToken(request.headers.get("asaas-access-token"), env("LEGAL_ASAAS_WEBHOOK_TOKEN"), env("LEGAL_ASAAS_API_KEY"))) throw new PortalError(403, "Acesso não autorizado.");
      const bytes = await limitedBody(request, 65536); if (!bytes) throw new PortalError(413, "Solicitação muito grande.");
      let receipt;
      try { receipt = parseAsaasReceipt(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new PortalError(400, "Evento de cobrança inválido."); }
      await portalRpc(createAdmin(), "legal_finance_service_receipt", { p_expected_tenant_id: binding.tenantId, p_account_id: binding.accountId, p_environment: binding.environment, p_payload: { ...receipt, body_hash: await portalHash(bytes) } });
      return portalReply({ received: true });
    } catch (error) { return portalFailure(error); }
  };
}
