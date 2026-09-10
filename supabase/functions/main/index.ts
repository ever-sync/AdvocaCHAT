import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

console.log("main function started");

const JWT_SECRET = Deno.env.get("JWT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const publicFunctions = new Set(
  [...Deno.readTextFileSync("/home/deno/functions/function-access.toml").matchAll(/\[functions\.([^\]]+)\]\s*verify_jwt\s*=\s*false/g)].map((match) => match[1]),
);
publicFunctions.add("health");

let SUPABASE_JWT_KEYS: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
if (SUPABASE_URL) {
  try {
    SUPABASE_JWT_KEYS = jose.createRemoteJWKSet(
      new URL("/auth/v1/.well-known/jwks.json", SUPABASE_URL),
    );
  } catch (error) {
    console.error("Failed to fetch JWKS from SUPABASE_URL:", error);
  }
}

function getAuthToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }

  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer") {
    throw new Error("Auth header is not 'Bearer {token}'");
  }

  return token;
}

async function isValidLegacyJWT(jwt: string): Promise<boolean> {
  if (!JWT_SECRET) {
    console.error("JWT_SECRET not available for HS256 token verification");
    return false;
  }

  try {
    await jose.jwtVerify(jwt, new TextEncoder().encode(JWT_SECRET));
  } catch (error) {
    console.error("Symmetric Legacy JWT verification error", error);
    return false;
  }

  return true;
}

async function isValidJWT(jwt: string): Promise<boolean> {
  if (!SUPABASE_JWT_KEYS) {
    console.error("JWKS not available for ES256/RS256 token verification");
    return false;
  }

  try {
    await jose.jwtVerify(jwt, SUPABASE_JWT_KEYS);
  } catch (error) {
    console.error("Asymmetric JWT verification error", error);
    return false;
  }

  return true;
}

async function isValidHybridJWT(jwt: string): Promise<boolean> {
  const { alg: jwtAlgorithm } = jose.decodeProtectedHeader(jwt);

  if (jwtAlgorithm === "HS256") {
    return await isValidLegacyJWT(jwt);
  }

  if (jwtAlgorithm === "ES256" || jwtAlgorithm === "RS256") {
    return await isValidJWT(jwt);
  }

  return false;
}

Deno.serve(async (req: Request) => {
  const functionName = new URL(req.url).pathname.split("/")[1];
  if (!functionName || !/^[a-z0-9-]+$/.test(functionName) || functionName === "main") {
    return new Response("Not found", { status: 404 });
  }
  if (req.method !== "OPTIONS" && !publicFunctions.has(functionName)) {
    try {
      const token = getAuthToken(req);
      const validJWT = await isValidHybridJWT(token);

      if (!validJWT) {
        return new Response(JSON.stringify({ msg: "Invalid JWT" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ msg: String(error) }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const url = new URL(req.url);
  const serviceName = url.pathname.split("/")[1];

  if (!serviceName) {
    return new Response(JSON.stringify({ msg: "missing function name in request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const envVarsObj = Deno.env.toObject();
  const envVars = Object.keys(envVarsObj).map((key) => [key, envVarsObj[key]]);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${serviceName}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 60 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars,
    });

    return await worker.fetch(req);
  } catch (error) {
    return new Response(JSON.stringify({ msg: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
