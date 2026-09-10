import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase";

export function getRecaptchaSiteKey(): string | null {
  return import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim() || null;
}

export function isRecaptchaEnabled(): boolean {
  return Boolean(getRecaptchaSiteKey());
}

export async function verifyRecaptchaToken(
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isRecaptchaEnabled()) {
    return { ok: true };
  }

  if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
    return {
      ok: false,
      error: "Supabase nao configurado para validar o reCAPTCHA.",
    };
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/verify-recaptcha`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ token }),
  });

  type VerifyResponse = { success?: boolean; error?: string; skipped?: boolean };
  let payload: VerifyResponse | null = null;
  try {
    payload = (await response.json()) as VerifyResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (import.meta.env.DEV && response.status === 404 && token) {
      return { ok: true };
    }

    return {
      ok: false,
      error: payload?.error ?? "Nao foi possivel validar o reCAPTCHA. Tente novamente.",
    };
  }

  if (payload?.success || payload?.skipped) {
    return { ok: true };
  }

  return { ok: false, error: "reCAPTCHA invalido. Marque novamente a caixa." };
}
