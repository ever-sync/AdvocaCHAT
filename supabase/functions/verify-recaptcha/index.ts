import { handleCors, jsonResponse } from "../_shared/http.ts";

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
/** Secret de teste do Google (par da site key de teste). */
const RECAPTCHA_TEST_SECRET_KEY = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";

type VerifyPayload = {
  token?: string;
};

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) {
    return cors;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let body: VerifyPayload;
  try {
    body = (await request.json()) as VerifyPayload;
  } catch {
    return jsonResponse({ error: "Corpo JSON invalido." }, 400);
  }

  const token = body.token?.trim();
  if (!token) {
    return jsonResponse({ error: "Token do reCAPTCHA obrigatorio." }, 400);
  }

  // Fail-closed: sem RECAPTCHA_SECRET_KEY a verificação não pode acontecer.
  // O secret de teste do Google retorna success:true para qualquer token, então
  // só é permitido quando explicitamente habilitado em dev (RECAPTCHA_ALLOW_TEST_SECRET).
  const configuredSecret = Deno.env.get("RECAPTCHA_SECRET_KEY")?.trim();
  const allowTestSecret = Deno.env.get("RECAPTCHA_ALLOW_TEST_SECRET")?.trim() === "true";
  const secret = configuredSecret || (allowTestSecret ? RECAPTCHA_TEST_SECRET_KEY : "");

  if (!secret) {
    console.error("RECAPTCHA_SECRET_KEY ausente; verificação indisponível.");
    return jsonResponse({ error: "reCAPTCHA nao configurado no servidor." }, 500);
  }

  const verifyResponse = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });

  let result: { success?: boolean; "error-codes"?: string[] };
  try {
    result = (await verifyResponse.json()) as typeof result;
  } catch {
    return jsonResponse({ error: "Resposta invalida do Google reCAPTCHA." }, 502);
  }

  if (!result.success) {
    return jsonResponse(
      {
        success: false,
        error: "reCAPTCHA invalido ou expirado.",
        codes: result["error-codes"] ?? [],
      },
      400,
    );
  }

  return jsonResponse({ success: true });
});
