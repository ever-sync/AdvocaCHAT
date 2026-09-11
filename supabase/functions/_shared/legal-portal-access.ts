import {
  assertPortalUser, newPortalToken, type PortalAdmin, PortalError, portalBody,
  portalCategory, portalFailure, portalFields, portalHash, portalId, portalMethod,
  portalReply, portalRpc, portalSecret, portalString, portalUser,
} from "./legal-portal.ts";
import type { CommunicationEnvironment } from "./legal-communication.ts";

type Provision = { id: string | null; auth_user_id: string; email: string; status: string };
type Issued = { invite_id: string; expires_at: string; revision: number };

export function createPortalAccessHandler(createAdmin: () => PortalAdmin, env: CommunicationEnvironment = () => undefined) {
  return async (request: Request): Promise<Response> => {
    const method = portalMethod(request); if (method) return method;
    try {
      const body = await portalBody(request, 24576);
      const action = portalString(body.action, 32);
      // Only replies need a larger body. Never expose database errors or input in logs.
      if (action !== "reply" && JSON.stringify(body).length > 4096) throw new PortalError(413, "Solicitação muito grande.");
      const admin = createAdmin();
      if (action === "inspect") {
        portalFields(body, ["action", "token"]);
        const result = await portalRpc<{ available: boolean }>(admin, "legal_portal_service_inspect", { p_token_hash: await portalHash(portalSecret(body.token)) });
        return portalReply({ available: result?.available === true });
      }
      if (action === "configure_communication") {
        portalFields(body, ["action", "provider", "account_id", "channel", "enabled"]);
        const staff = await portalUser(admin, request, "staff");
        if (!((body.provider === "resend" && body.channel === "email") || (body.provider === "uazapi" && body.channel === "whatsapp")) || typeof body.enabled !== "boolean") throw new PortalError(400, "Configuração de canal inválida.");
        const accountId = portalString(body.account_id, 200);
        const expectedTenant = env("LEGAL_RESEND_TENANT_ID")?.trim();
        if (body.provider !== "resend" || !expectedTenant || !env("LEGAL_RESEND_ACCOUNT_ID") || accountId !== env("LEGAL_RESEND_ACCOUNT_ID")?.trim()) return portalReply({ configured: false, status: body.provider === "resend" ? "not_configured" : "adapter_unavailable" }, 503);
        return portalReply(await portalRpc(admin, "legal_communication_service_configure", { p_staff_id: staff.id, p_provider: body.provider, p_account_id: accountId, p_channel: body.channel, p_enabled: body.enabled, p_expected_tenant_id: portalId(expectedTenant) }));
      }
      if (["provision", "issue", "rotate"].includes(action)) {
        portalFields(body, action === "provision" ? ["action", "invite_id", "idempotency_key"] : ["action", "invite_id"]);
        const staff = await portalUser(admin, request, "staff");
        const inviteId = portalId(body.invite_id);
        if (action === "provision") {
          const reserved = await portalRpc<Provision>(admin, "legal_portal_service_reserve", {
            p_staff_id: staff.id, p_invite_id: inviteId, p_auth_user_id: crypto.randomUUID(), p_idempotency_key: portalId(body.idempotency_key),
          });
          portalId(reserved.auth_user_id);
          const existing = await admin.auth.admin.getUserById(reserved.auth_user_id);
          if (existing.error && existing.error.status !== 404) throw new PortalError(503, "Não foi possível verificar a identidade provisionada.");
          let identity = existing.data.user;
          if (!identity) {
            if (!reserved.id) throw new PortalError(409, "A identidade vinculada não está disponível. Revise o convite.");
            // UUID reservation is authoritative during INSERT: GoTrue may apply role/app metadata later.
            const attributes = { id: reserved.auth_user_id, email: reserved.email, role: "legal_portal", email_confirm: false, app_metadata: { legal_portal: true } };
            const created = await admin.auth.admin.createUser(attributes);
            if (created.error) throw new PortalError(409, "Não foi possível provisionar esta identidade. Confira o convite; nenhuma conta existente foi modificada.");
            identity = created.data.user;
          }
          assertPortalUser(identity);
          if (identity.id !== reserved.auth_user_id || identity.email?.toLowerCase() !== reserved.email.toLowerCase()) throw new PortalError(409, "Identidade incompatível com o convite.");
          const profile = await admin.from("profiles").select("id").eq("id", identity.id).maybeSingle();
          if (profile.error || profile.data) throw new PortalError(409, "Identidade externa não isolada. O convite permanece indisponível.");
          if (!reserved.id) return portalReply({ identity_id: identity.id, auth_user_id: identity.id, status: "created" });
          const result = await portalRpc(admin, "legal_portal_service_complete_provision", { p_staff_id: staff.id, p_provisioning_id: reserved.id });
          return portalReply(result, 201);
        }
        const token = newPortalToken();
        const tokenHash = await portalHash(token);
        const issued = await portalRpc<Issued>(admin, "legal_portal_service_issue", { p_staff_id: staff.id, p_invite_id: inviteId, p_token_hash: tokenHash });
        const current = await portalRpc<{ available: boolean }>(admin, "legal_portal_service_inspect", { p_token_hash: tokenHash });
        if (!current.available) throw new PortalError(409, "O convite mudou durante a emissão. Gere outro link.");
        // A case owner must never obtain a login credential for an external identity,
        // even on first activation: that identity may later join other offices/cases.
        // The recipient authenticates directly with Auth; this bearer grants no session.
        const fragment = new URLSearchParams({ invite: token });
        return portalReply({ activation_path: `/portal/ativar#${fragment}`, expires_at: issued.expires_at, revision: issued.revision });
      }
      const actor = await portalUser(admin, request, "portal");
      if (action === "accept") {
        portalFields(body, ["action", "token"]);
        return portalReply(await portalRpc(admin, "legal_portal_service_accept", { p_actor_id: actor.id, p_token_hash: await portalHash(portalSecret(body.token)) }));
      }
      if (action === "context" || action === "cases") {
        portalFields(body, ["action"]);
        const result = await portalRpc<{ memberships: unknown[] }>(admin, "legal_portal_service_context", { p_actor_id: actor.id });
        return portalReply(action === "cases" ? result.memberships : result);
      }
      if (["case", "requests", "statements"].includes(action)) {
        portalFields(body, ["action", "membership_id"]);
        return portalReply(await portalRpc(admin, `legal_portal_service_${action}`, { p_actor_id: actor.id, p_membership_id: portalId(body.membership_id) }));
      }
      if (action === "reply") {
        portalFields(body, ["action", "membership_id", "category", "body", "idempotency_key"]);
        return portalReply(await portalRpc(admin, "legal_portal_service_reply", {
          p_actor_id: actor.id, p_membership_id: portalId(body.membership_id), p_category: portalCategory(body.category),
          p_body: portalString(body.body, 4000), p_idempotency_key: portalId(body.idempotency_key),
        }), 201);
      }
      if (action === "acknowledge") {
        portalFields(body, ["action", "membership_id", "publication_id"]);
        return portalReply(await portalRpc(admin, "legal_portal_service_acknowledge", { p_actor_id: actor.id, p_membership_id: portalId(body.membership_id), p_publication_id: portalId(body.publication_id) }));
      }
      if (action === "request_export") {
        portalFields(body, ["action", "membership_id", "export_id"]);
        return portalReply(await portalRpc(admin, "legal_portal_service_request_export", { p_actor_id: actor.id, p_membership_id: portalId(body.membership_id), p_export_id: portalId(body.export_id) }));
      }
      throw new PortalError(400, "Ação não suportada.");
    } catch (error) { return portalFailure(error); }
  };
}
