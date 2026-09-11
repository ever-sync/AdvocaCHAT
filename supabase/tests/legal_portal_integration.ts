// Explicit, opt-in integration harness. Requires an isolated, reviewed synthetic invite.
// Never run in ordinary test suites. Does not call an email provider or clean existing accounts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type Fixture = { baseUrl: string; anonKey: string; staffJwt: string; inviteId: string; password: string; serviceKey: string };
function requireStep(condition: unknown, step: string): asserts condition {
  if (!condition) throw new Error(`Portal integration failed at ${step}. Inspect the synthetic fixture privately.`);
}
export async function runLegalPortalIntegration(fixture: Fixture) {
  const origin = new URL(fixture.baseUrl);
  requireStep(origin.protocol === "https:" || ["127.0.0.1", "localhost"].includes(origin.hostname), "fixture_origin");
  requireStep(!origin.username && !origin.password && !origin.search && !origin.hash, "fixture_origin");
  const base = fixture.baseUrl.replace(/\/+$/, "");
  const headers = (jwt: string) => ({ apikey: fixture.anonKey, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" });
  const invoke = async (body: unknown, jwt: string) => {
    const response = await fetch(`${base}/functions/v1/legal-portal-access`, { method: "POST", headers: headers(jwt), body: JSON.stringify(body) });
    requireStep(response.ok, `edge_${(body as { action: string }).action}`);
    return await response.json();
  };
  const staffBefore = await fetch(`${base}/auth/v1/user`, { headers: headers(fixture.staffJwt) });
  requireStep(staffBefore.ok, "staff_before");
  const staff = await staffBefore.json();
  requireStep(staff.role === "authenticated", "staff_role");
  const provisioned = await invoke({ action: "provision", invite_id: fixture.inviteId, idempotency_key: crypto.randomUUID() }, fixture.staffJwt);
  requireStep(typeof provisioned.auth_user_id === "string", "reserved_identity");
  const issued = await invoke({ action: "issue", invite_id: fixture.inviteId }, fixture.staffJwt);
  requireStep(typeof issued.activation_path === "string" && issued.activation_path.startsWith("/portal/ativar#"), "activation_fragment");
  const fragment = new URLSearchParams(issued.activation_path.split("#")[1]);
  const token = fragment.get("invite");
  requireStep(token && fragment.size === 1, "no_staff_auth_credentials");
  // Technical fixture only: obtain OTP directly with the operator's service key.
  // Neither the staff API nor the staff session can perform this operation.
  // Real recipients request Auth delivery themselves; this harness sends no email.
  const operator = createClient(base, fixture.serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const external = await operator.auth.admin.getUserById(provisioned.auth_user_id);
  requireStep(!external.error && external.data.user?.role === "legal_portal" && external.data.user?.email, "fixture_external_identity");
  const credentials = await operator.auth.admin.generateLink({ type: "magiclink", email: external.data.user.email });
  requireStep(!credentials.error && credentials.data.user?.id === provisioned.auth_user_id, "operator_fixture_credential");
  const authHash = credentials.data.properties?.hashed_token; const type = credentials.data.properties?.verification_type;
  requireStep(authHash && (type === "signup" || type === "magiclink"), "fixture_otp_format");
  const portal = createClient(base, fixture.anonKey, { auth: { storageKey: "legal-portal-integration-fixture", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verified = await portal.auth.verifyOtp({ token_hash: authHash, type });
  requireStep(!verified.error && verified.data.user?.id === provisioned.auth_user_id && verified.data.user?.role === "legal_portal" && verified.data.user?.app_metadata?.legal_portal === true, "verify_otp_role");
  const password = await portal.auth.updateUser({ password: fixture.password });
  requireStep(!password.error, "set_password");
  const session = await portal.auth.getSession();
  const jwt = session.data.session?.access_token;
  requireStep(jwt, "portal_session");
  const accepted = await invoke({ action: "accept", token }, jwt);
  requireStep(typeof accepted.membership_id === "string", "accept_membership");
  const context = await invoke({ action: "context" }, jwt);
  requireStep(context.memberships.some((membership: { id: string }) => membership.id === accepted.membership_id), "case_grant");
  for (const endpoint of ["profiles?select=id", "customers?select=id", "billing_subscriptions?select=tenant_id"]) {
    const response = await fetch(`${base}/rest/v1/${endpoint}`, { headers: headers(jwt) });
    requireStep([401, 403, 404].includes(response.status), "internal_table_denied"); await response.body?.cancel();
  }
  const serviceRpc = await fetch(`${base}/rest/v1/rpc/legal_portal_service_context`, { method: "POST", headers: headers(jwt), body: JSON.stringify({ p_actor_id: provisioned.auth_user_id }) });
  requireStep([401, 403, 404].includes(serviceRpc.status), "service_rpc_denied"); await serviceRpc.body?.cancel();
  const staffAfter = await fetch(`${base}/auth/v1/user`, { headers: headers(fixture.staffJwt) });
  requireStep(staffAfter.ok && (await staffAfter.json()).id === staff.id, "staff_session_preserved");
  // Password login proves the setup survives the activation credential. No email is sent.
  const email = verified.data.user!.email;
  requireStep(email, "fixture_email");
  await portal.auth.signOut({ scope: "local" });
  const login = await portal.auth.signInWithPassword({ email, password: fixture.password });
  requireStep(!login.error && login.data.user?.role === "legal_portal", "password_login");
  await portal.auth.signOut({ scope: "local" });
  return { passed: true, checks: 13, externalMessagesSent: 0, fixtureCleanupRequired: true };
}

if (import.meta.main) {
  const get = (name: string) => Deno.env.get(name) ?? "";
  requireStep(get("LEGAL_PORTAL_TEST_ALLOW_MUTATIONS") === "synthetic-fixture-only", "explicit_fixture_opt_in");
  const fixture = { baseUrl: get("LEGAL_PORTAL_TEST_URL"), anonKey: get("LEGAL_PORTAL_TEST_ANON_KEY"), staffJwt: get("LEGAL_PORTAL_TEST_STAFF_JWT"), inviteId: get("LEGAL_PORTAL_TEST_INVITE_ID"), password: get("LEGAL_PORTAL_TEST_PASSWORD"), serviceKey: get("LEGAL_PORTAL_TEST_SERVICE_ROLE_KEY") };
  requireStep(Object.values(fixture).every(Boolean), "fixture_configuration");
  // Only a compact verdict is printed; never print links, JWTs, email, password or response bodies.
  console.log(JSON.stringify(await runLegalPortalIntegration(fixture)));
}
