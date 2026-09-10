export const apiCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wchat-signature",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function handleApiCors(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: apiCorsHeaders });
  }
  return null;
}

export function apiJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...apiCorsHeaders,
    },
  });
}

export function resolveApiPath(request: Request, functionName: string): string {
  const url = new URL(request.url);
  const marker = `/${functionName}`;
  const idx = url.pathname.indexOf(marker);
  const suffix = idx >= 0 ? url.pathname.slice(idx + marker.length) : url.pathname;
  const normalized = suffix.replace(/\/+$/, "") || "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function parseRoute(
  path: string,
): { version: string; resource: string; id: string | null; sub: string | null } {
  const parts = path.split("/").filter(Boolean);
  const version = parts[0] ?? "v1";
  const resource = parts[1] ?? "";
  const id = parts[2] ?? null;
  const sub = parts[3] ?? null;
  return { version, resource, id, sub };
}
