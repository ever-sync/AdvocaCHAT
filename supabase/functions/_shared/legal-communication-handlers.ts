import { limitedBody } from "./limited-body.ts";
import { timingSafeEqual } from "./timing-safe-equal.ts";
import { type CommunicationEnvironment, type CommunicationJob, parseLegalReceipt, resendConfig, sendLegalResend, verifyLegalSvix } from "./legal-communication.ts";
import { type PortalAdmin, PortalError, portalBody, portalFailure, portalFields, portalHash, portalMethod, portalReply, portalRpc, portalUuid } from "./legal-portal.ts";

export function createLegalDispatchHandler(createAdmin: () => PortalAdmin, env: CommunicationEnvironment, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    const method = portalMethod(request); if (method) return method;
    try {
      const expected = env("CRON_SECRET");
      const provided = request.headers.get("x-cron-secret");
      if (!expected || !provided || !timingSafeEqual(expected, provided)) throw new PortalError(401, "Acesso não autorizado.");
      const body = await portalBody(request, 1024);
      portalFields(body, ["action"]);
      if (body.action === "followups") {
        const created = await portalRpc<number>(createAdmin(), "legal_portal_service_run_followups", { p_limit: 100 });
        return portalReply({ created });
      }
      if (body.action !== "dispatch") throw new PortalError(400, "Ação inválida.");
      const config = resendConfig(env);
      if (!config) return portalReply({ configured: false, status: "not_configured", processed: 0 });
      const admin = createAdmin();
      const jobs = await portalRpc<CommunicationJob[]>(admin, "legal_communication_service_claim", { p_provider: "resend", p_account_id: config.accountId, p_limit: 5, p_expected_tenant_id: config.tenantId });
      const counts = { provider_accepted: 0, failed: 0, unknown: 0 };
      for (const job of jobs) {
        const result = await sendLegalResend(config, job, fetcher);
        await portalRpc(admin, "legal_communication_service_complete", {
          p_job_id: job.job_id, p_lease_token: job.lease_token, p_status: result.status,
          p_provider_message_id: result.messageId, p_error_code: result.errorCode,
        });
        counts[result.status]++;
      }
      return portalReply({ configured: true, processed: jobs.length, ...counts });
    } catch (error) { return portalFailure(error); }
  };
}

export function createLegalWebhookHandler(createAdmin: () => PortalAdmin, env: CommunicationEnvironment) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return portalReply({ error: "Método não permitido." }, 405);
    try {
      const secret = env("LEGAL_RESEND_WEBHOOK_SECRET")?.trim();
      const accountId = env("LEGAL_RESEND_ACCOUNT_ID")?.trim();
      const tenantId = env("LEGAL_RESEND_TENANT_ID")?.trim();
      if (!secret || !accountId || !tenantId || !portalUuid.test(tenantId)) return portalReply({ configured: false, status: "not_configured" }, 503);
      const bytes = await limitedBody(request, 65536);
      if (!bytes) throw new PortalError(413, "Solicitação muito grande.");
      let raw: string;
      try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new PortalError(400, "Evento inválido."); }
      if (!await verifyLegalSvix(raw, request.headers, secret)) throw new PortalError(401, "Assinatura inválida.");
      let receipt;
      try { receipt = parseLegalReceipt(raw, request.headers.get("svix-id")!); } catch { throw new PortalError(400, "Evento inválido."); }
      if (!receipt) return portalReply({ received: true, ignored: true });
      // Account comes from this verified endpoint's config, never from an untrusted tenant field.
      await portalRpc(createAdmin(), "legal_communication_service_receipt", {
        p_provider: "resend", p_account_id: accountId, p_event_id: receipt.eventId,
        p_message_id: receipt.messageId, p_status: receipt.status, p_occurred_at: receipt.occurredAt, p_payload_hash: await portalHash(bytes), p_expected_tenant_id: tenantId,
      });
      return portalReply({ received: true });
    } catch (error) { return portalFailure(error); }
  };
}
