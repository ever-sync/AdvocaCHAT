const ALLOWED_JOBS = new Set(["uazapi-poll-sync"]);

function getHeader(headers, name) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function resolveFunctionsBaseUrl() {
  const explicit = process.env.SUPABASE_FUNCTIONS_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return null;

  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;
}

function resolveScheduledJobs(now = new Date()) {
  const minute = now.getUTCMinutes();
  const jobs = [];

  // Keep inbound sync alive with a controlled cadence.
  if (minute % 2 === 0) {
    jobs.push("uazapi-poll-sync");
  }

  return jobs;
}

async function invokeSupabaseFunction(baseUrl, cronSecret, job) {
  const controller = new AbortController();
  const timeoutMs = job === "uazapi-poll-sync" ? 12000 : 20000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/${job}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
      },
      body: "{}",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const rawBody = await response.text();
    let body = rawBody;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      // Keep the raw response for diagnostics.
    }

    return {
      job,
      ok: response.ok,
      status: response.status,
      body,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    // Poll sync may legitimately run longer; treat timeout as accepted trigger.
    if (job === "uazapi-poll-sync" && error instanceof Error && error.name === "AbortError") {
      return {
        job,
        ok: true,
        status: 202,
        body: { accepted: true, reason: "timeout_after_trigger" },
      };
    }

    return {
      job,
      ok: false,
      status: 0,
      body: { error: "Request to Supabase function failed." },
    };
  }
}

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return response.status(500).json({ error: "Missing CRON_SECRET." });
  }

  const authHeader = getHeader(request.headers, "authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return response.status(401).json({ error: "Unauthorized." });
  }

  const baseUrl = resolveFunctionsBaseUrl();
  if (!baseUrl) {
    return response.status(500).json({ error: "Missing Supabase functions URL." });
  }

  const requestedJob = Array.isArray(request.query?.job)
    ? request.query.job[0]
    : request.query?.job;
  const jobs = requestedJob ? [requestedJob] : resolveScheduledJobs();

  const invalidJob = jobs.find((job) => !ALLOWED_JOBS.has(job));
  if (invalidJob) {
    return response.status(400).json({ error: `Unsupported job: ${invalidJob}` });
  }

  const results = [];
  for (const job of jobs) {
    results.push(await invokeSupabaseFunction(baseUrl, cronSecret, job));
  }

  const hasFailure = results.some((result) => !result.ok);
  console.log("[supabase-edge-cron] completed", {
    jobs: results.map((result) => ({
      job: result.job,
      ok: result.ok,
      status: result.status,
    })),
  });

  return response.status(hasFailure ? 502 : 200).json({
    success: !hasFailure,
    jobs: results,
  });
}
