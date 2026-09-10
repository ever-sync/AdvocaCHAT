import { requireSupabase } from "@/lib/supabase";

/** Tipos aceitos em `verifyOtp` via query string (Supabase Auth). */
type OtpQueryType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

const OTP_QUERY_TYPES = new Set<string>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function cleanAuthParams() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  [
    "code",
    "type",
    "token_hash",
    "access_token",
    "refresh_token",
    "expires_at",
    "expires_in",
    "token_type",
  ].forEach((key) => url.searchParams.delete(key));

  if (url.hash) {
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    [
      "type",
      "access_token",
      "refresh_token",
      "expires_at",
      "expires_in",
      "token_type",
    ].forEach((key) => hash.delete(key));

    const nextHash = hash.toString();
    url.hash = nextHash ? `#${nextHash}` : "";
  }

  window.history.replaceState({}, document.title, url.toString());
}

export async function resolveAuthRedirectSession() {
  const supabase = requireSupabase();

  if (typeof window === "undefined") {
    const { data } = await supabase.auth.getSession();
    return data.session;
  }

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const queryType = url.searchParams.get("type");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw error;
    }
    cleanAuthParams();
  } else if (tokenHash && queryType && OTP_QUERY_TYPES.has(queryType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: queryType as OtpQueryType,
    });
    if (error) {
      throw error;
    }
    cleanAuthParams();
  }

  await new Promise((resolve) => window.setTimeout(resolve, 150));
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    cleanAuthParams();
  }

  return session;
}
