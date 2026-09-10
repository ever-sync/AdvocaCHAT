import { requireSupabase, supabaseAnonKey, supabaseUrl } from "@/lib/supabase";

let accessTokenInFlight: Promise<string> | null = null;

function parseResponsePayload(rawText: string) {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return rawText;
  }
}

async function getValidAccessToken() {
  if (accessTokenInFlight) {
    return accessTokenInFlight;
  }

  accessTokenInFlight = (async () => {
  const supabase = requireSupabase();
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }

  if (!session?.access_token) {
    throw new Error("Sua sessao expirou. Faca login novamente para continuar.");
  }

  let userResult = await supabase.auth.getUser(session.access_token);
  if (userResult.error || !userResult.data.user) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;

    if (!session?.access_token) {
      throw new Error("Sua sessao atual nao foi aceita pelo Supabase. Saia e entre novamente.");
    }

    userResult = await supabase.auth.getUser(session.access_token);
    if (userResult.error || !userResult.data.user) {
      throw new Error("Sua sessao atual nao foi aceita pelo Supabase. Saia e entre novamente.");
    }
  }

  return session.access_token;
  })().finally(() => {
    accessTokenInFlight = null;
  });

  return accessTokenInFlight;
}

export async function invokeAuthedFunction<TResponse>(
  functionName: string,
  body?: unknown,
  method: "GET" | "POST" | "DELETE" = "POST",
) {
  const supabase = requireSupabase();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase nao configurado corretamente.");
  }

  const accessToken = await getValidAccessToken();
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: method === "GET" || body === undefined ? undefined : JSON.stringify(body),
  });

  const rawText = await response.text();
  const payload = parseResponsePayload(rawText);

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" && payload
        ? String(payload.error ?? payload.message ?? `HTTP ${response.status}`)
        : rawText || `HTTP ${response.status}`;

    if (response.status === 401 || errorMessage.toLowerCase().includes("invalid bearer token")) {
      throw new Error(
        "A funcao recusou sua autenticacao neste momento. A sessao local foi preservada; tente novamente e, se persistir, refaca o login.",
      );
    }

    throw new Error(errorMessage);
  }

  return payload as TResponse;
}

export async function invokePublicFunction<TResponse>(
  functionName: string,
  body?: unknown,
  method: "GET" | "POST" = "POST",
) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase nao configurado corretamente.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: method === "GET" || body === undefined ? undefined : JSON.stringify(body),
  });

  const rawText = await response.text();
  const payload = parseResponsePayload(rawText);

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" && payload
        ? String(payload.error ?? payload.message ?? `HTTP ${response.status}`)
        : rawText || `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload as TResponse;
}
