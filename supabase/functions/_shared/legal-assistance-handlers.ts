import { type PortalAdmin, PortalError, portalFailure, portalFields, portalId, portalMethod, portalReply, portalRpc, portalUser, portalUuid } from "./legal-portal.ts";
import { judicialBytes, judicialJson, validJudicialSecret } from "./legal-judicial.ts";
import { type AssistanceInput, type AssistanceOutcome, assistanceBinding, assistanceConfig, assistanceInputTokenBound, generateAssistanceDraft } from "./legal-assistance.ts";

type Job = { id: string; lease_token: string; input: AssistanceInput };
type Runtime = { fetcher?: typeof fetch; now?: () => number };
async function within<T>(run: () => Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) throw new PortalError(503, "Tempo de execução esgotado.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([run(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new PortalError(503, "A conclusão ainda não foi confirmada.")), ms); })]); }
  finally { clearTimeout(timer); }
}

export function createLegalAssistanceHandler(createAdmin: () => PortalAdmin, env: (key: string) => string | undefined, runtime: Runtime = {}) {
  return async (request: Request): Promise<Response> => {
    const method = portalMethod(request); if (method) return method;
    const now = runtime.now ?? (() => performance.now());
    const deadline = now() + 38000;
    const remaining = () => deadline - now();
    try {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new PortalError(415, "Envie uma solicitação JSON.");
      let body: Record<string, unknown>;
      try { body = judicialJson(await judicialBytes(request.body, 4096, 4000)).value; } catch { throw new PortalError(400, "Solicitação inválida ou muito grande."); }
      const binding = assistanceBinding(env), config = assistanceConfig(env);
      if (body.action === "configure") {
        portalFields(body, ["action", "policy_version_id", "enabled"]);
        if (typeof body.enabled !== "boolean") throw new PortalError(400, "Habilitação explícita necessária.");
        const admin = createAdmin();
        const user = await within(() => portalUser(admin, request, "staff"), 4000);
        if (!binding || (body.enabled && !config)) throw new PortalError(409, "A conta e o modelo ainda não estão configurados no servidor.");
        const connection = await within(() => portalRpc(admin, "legal_ai_service_configure", { p_actor_id: user.id, p_expected_tenant_id: binding.tenantId, p_account_id: binding.accountId, p_model: binding.model, p_policy_version_id: portalId(body.policy_version_id), p_enabled: body.enabled }), 4000);
        return portalReply({ connection });
      }
      if (!validJudicialSecret(request.headers.get("x-cron-secret"), env("CRON_SECRET"))) throw new PortalError(401, "Acesso não autorizado.");
      portalFields(body, ["action"]);
      if (body.action !== "dispatch") throw new PortalError(400, "Ação inválida.");
      if (!binding) return portalReply({ configured: false, state: "not_configured", processed: 0 });
      const admin = createAdmin();
      const call = <T>(name: string, args: Record<string, unknown>) => within(() => portalRpc<T>(admin, name, args), Math.min(4000, remaining()));
      const jobs = await call<Job[]>("legal_ai_service_claim", { p_expected_tenant_id: binding.tenantId, p_account_id: binding.accountId, p_model: binding.model, p_configured: !!config });
      if (!config) return portalReply({ configured: false, state: "not_configured", processed: 0 });
      if (!Array.isArray(jobs) || jobs.length > 1) throw new PortalError(503, "Fila indisponível.");
      if (!jobs.length) return portalReply({ configured: true, state: "idle", processed: 0 });
      const job = jobs[0];
      if (!job || !portalUuid.test(job.id) || !portalUuid.test(job.lease_token)) throw new PortalError(503, "Vínculo da fila indisponível.");
      let bound = 0;
      try { bound = assistanceInputTokenBound(config, job.input); } catch { /* invalid input is finalized without consuming provider quota */ }
      let outcome: AssistanceOutcome;
      if (bound < 1 || bound > 50000) outcome = { ok: false, code: "invalid_input", consumption: "not_sent" };
      else if (remaining() < 12000) outcome = { ok: false, code: "execution_budget", consumption: "not_sent" };
      else {
        const authorized = await call<{ allowed: boolean }>("legal_ai_service_authorize", { p_job_id: job.id, p_lease_token: job.lease_token, p_expected_tenant_id: binding.tenantId, p_account_id: binding.accountId, p_model: binding.model, p_input_token_bound: bound });
        if (authorized?.allowed !== true) return portalReply({ configured: true, state: "authorization_denied", processed: 1 });
        const budget = Math.min(25000, remaining() - 5000);
        outcome = budget <= 0 ? { ok: false, code: "execution_budget", consumption: "not_sent" } : await generateAssistanceDraft(config, job.input, runtime.fetcher ?? fetch, budget);
      }
      // No retry after ambiguous persistence; lease recovery preserves conservative quota.
      const finished = await call<{ job: { id: string; state: string }; version_id: string | null }>("legal_ai_service_finish", { p_job_id: job.id, p_lease_token: job.lease_token, p_outcome: outcome });
      if (finished?.job?.id !== job.id || !["succeeded", "failed", "cancelled", "authorization_revoked", "unknown", "quota_exhausted"].includes(finished.job.state) || (finished.job.state === "succeeded" && (!finished.version_id || !portalUuid.test(finished.version_id)))) throw new PortalError(503, "A versão gerada ainda não foi confirmada.");
      return portalReply({ configured: true, state: finished.job.state, processed: 1 });
    } catch (error) { return portalFailure(error); }
  };
}
