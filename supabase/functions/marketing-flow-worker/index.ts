// Worker das automacoes de marketing (Fase 4 do plano completo).
// - Pega ate N jobs vencidos via RPC claim_marketing_flow_jobs (lock atomico
//   `for update skip locked` + `attempts` incrementado).
// - Para cada job: le step do published_definition, dispatcha pro executor,
//   grava evento, agenda proximo step (ou completa participant).
// - Erros: PermanentError -> failed; demais -> retry exponencial [0,1,5,30,120]
//   minutos; depois `dead` + participant.status='failed'.
//
// Acesso: cron interno via x-cron-secret (isInternalRequest).
// Cron sugerido: a cada 1 minuto.

import { handleCors, jsonResponse } from "../_shared/http.ts";
import { PermissionDeniedError, assertTenantBillingActive, createAdminClient, isInternalRequest } from "../_shared/supabase.ts";
import { ensureChat, insertOrDedupeOutboundMessage } from "../_shared/domain.ts";
import { sendMessageViaUazapi } from "../_shared/uazapi.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { createMessage } from "../_shared/anthropic.ts";
import { emitWebhookEvent } from "../_shared/webhook-events.ts";
import { flowRetryDelayMinutes } from "../_shared/retry-backoff.ts";

// ---------------------------------------------------------------- Constants

const JOB_LIMIT = 25;

// ---------------------------------------------------------------- Types

type Job = {
  id: string;
  tenant_id: string;
  flow_id: string;
  participant_id: string;
  step_id: string;
  status: string;
  run_at: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  idempotency_key: string;
};

type Step = {
  id: string;
  actionId: string;
  label: string;
  config?: Record<string, unknown>;
};

type Participant = {
  id: string;
  tenant_id: string;
  flow_id: string;
  customer_id: string | null;
  negotiation_id: string | null;
  current_step_id: string | null;
  context: Record<string, unknown>;
};

type StepResult = {
  waitMs?: number;
  /** Override do proximo step (split). Quando ausente, avanca sequencial. */
  nextStepId?: string;
  /**
   * Reagenda o MESMO job daqui a N ms (wait-until, rate-limit, business-hours).
   * Quando setado, nao avanca pra proximo step e nao gera step_completed —
   * apenas atualiza run_at e dispara step_waiting.
   */
  rescheduleIn?: number;
  /**
   * Dados a mesclar no `context` do participant (Fase 3 — dados entre passos).
   * Ex.: webhook grava `{ webhook: { [stepId]: { status, body } } }`; a acao
   * "definir-variavel" grava `{ vars: { ... } }`. Passos seguintes leem via
   * template `{{contexto.webhook.<stepId>.body.campo}}` / `{{contexto.vars.x}}`.
   */
  contextPatch?: Record<string, unknown>;
  detail?: Record<string, unknown>;
};

type AdminClient = ReturnType<typeof createAdminClient>;

class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

// ---------------------------------------------------------------- Entrypoint

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (!isInternalRequest(request)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const admin = createAdminClient();
  const workerId = `worker-${crypto.randomUUID()}`;

  const { data: jobs, error } = await admin.rpc("claim_marketing_flow_jobs", {
    p_limit: JOB_LIMIT,
    p_worker: workerId,
  });
  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  const list = (jobs ?? []) as Job[];
  let succeeded = 0;
  let permanentFailed = 0;
  let retried = 0;
  let dead = 0;

  for (const job of list) {
    try {
      const outcome = await processJob(admin, job);
      switch (outcome) {
        case "success":
          succeeded++;
          break;
        case "permanent":
          permanentFailed++;
          break;
        case "retry":
          retried++;
          break;
        case "dead":
          dead++;
          break;
      }
    } catch (e) {
      // Defesa em profundidade: erro nao tratado em processJob.
      const message = e instanceof Error ? e.message : String(e);
      await scheduleRetryOrDead(admin, job, message);
      retried++;
    }
  }

  // Heartbeat: registra que o worker rodou — mesmo sem jobs — pro card "Worker"
  // do app nao depender de max(locked_at) (que so existe quando ha fila).
  await admin.from("marketing_flow_worker_heartbeats").upsert(
    {
      worker_key: "default",
      last_seen: new Date().toISOString(),
      worker_id: workerId,
      claimed: list.length,
    },
    { onConflict: "worker_key" },
  );

  return jsonResponse({
    ok: true,
    worker: workerId,
    claimed: list.length,
    succeeded,
    permanent_failed: permanentFailed,
    retried,
    dead,
  });
});

// ---------------------------------------------------------------- Process

type JobOutcome = "success" | "permanent" | "retry" | "dead";

async function processJob(admin: AdminClient, job: Job): Promise<JobOutcome> {
  // 1) Carrega participant e step do published_definition.
  const { data: participantRow, error: pErr } = await admin
    .from("marketing_flow_participants")
    .select("id, tenant_id, flow_id, customer_id, negotiation_id, current_step_id, context")
    .eq("id", job.participant_id)
    .single();
  if (pErr || !participantRow) {
    await markFailed(admin, job, "participant não encontrado");
    return "permanent";
  }
  const participant = participantRow as Participant;

  try {
    await assertTenantBillingActive(admin, participant.tenant_id, "executar automacoes");
  } catch (error) {
    await markFailed(admin, job, error instanceof Error ? error.message : "assinatura bloqueada");
    return error instanceof PermissionDeniedError ? "permanent" : "retry";
  }

  const { error: limitError } = await admin.rpc("assert_tenant_plan_limit", {
    p_tenant_id: participant.tenant_id,
    p_metric: "marketing_flow_runs_monthly",
    p_increment: 1,
  });
  if (limitError) {
    await markFailed(admin, job, limitError.message);
    return "permanent";
  }

  const { data: flowRow, error: fErr } = await admin
    .from("marketing_flows")
    .select("published_definition")
    .eq("id", job.flow_id)
    .single();
  if (fErr || !flowRow) {
    await markFailed(admin, job, "flow não encontrado");
    return "permanent";
  }

  const published = (flowRow as { published_definition: unknown }).published_definition;
  const steps = parseSteps(published);
  const step = steps.find((s) => s.id === job.step_id);
  if (!step) {
    await markFailed(admin, job, `step "${job.step_id}" não está na versão publicada`);
    return "permanent";
  }

  // 2) Evento step_started.
  await insertEvent(admin, job, "step_started", step.id, null, { attempt: job.attempts });

  // 3) Executa.
  let result: StepResult;
  try {
    result = await executeStep(admin, step, participant);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof PermanentError) {
      await markFailed(admin, job, message);
      return "permanent";
    }
    return (await scheduleRetryOrDead(admin, job, message)) ? "dead" : "retry";
  }

  // 4a) Reagendamento do mesmo job (wait-until / rate-limit / business-hours).
  if (result.rescheduleIn != null && result.rescheduleIn > 0) {
    await markRescheduleSame(admin, job, result);
    return "success";
  }

  // 4b) Sucesso: marca done + agenda proximo (via grafo).
  const linearNext = buildLinearNextMap(published, steps);
  await markDone(admin, job, step, steps, participant, result, linearNext);
  return "success";
}

// ---------------------------------------------------------------- Helpers

function parseSteps(published: unknown): Step[] {
  if (!published || typeof published !== "object") return [];
  const stepsRaw = (published as { steps?: unknown }).steps;
  if (!Array.isArray(stepsRaw)) return [];
  return stepsRaw
    .map((item): Step | null => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id : null;
      const actionId = typeof rec.actionId === "string" ? rec.actionId : null;
      const label = typeof rec.label === "string" ? rec.label : actionId ?? "";
      if (!id || !actionId) return null;
      const config =
        rec.config && typeof rec.config === "object"
          ? (rec.config as Record<string, unknown>)
          : undefined;
      return { id, actionId, label, config };
    })
    .filter((s): s is Step => s !== null);
}

// Grafo (Fase 2): mapa "no -> proximo no linear". Executores ja resolvem os
// ramos (split/teste-ab/esperar-condicao) via nextStepId; aqui resolvemos
// apenas a saida linear/default e a reconvergencia (unir-caminho). Em fluxos
// format >= 2 usamos as arestas explicitas (branch ausente = linear); em fluxos
// legados a saida linear e o proximo no do array. Espelha src/lib/marketing/
// flow-graph.ts (boundary Deno x Vite impede import direto).
function buildLinearNextMap(
  published: unknown,
  steps: Step[],
): Map<string, string> {
  const map = new Map<string, string>();
  const ids = new Set(steps.map((s) => s.id));
  const pub = (published && typeof published === "object")
    ? (published as Record<string, unknown>)
    : {};
  const fmt = Number(pub.format ?? 0);
  const edges = pub.edges;

  if (fmt >= 2 && Array.isArray(edges)) {
    // Arestas explicitas: a primeira sem `branch` (ou a unica) e a linear.
    const byFrom = new Map<string, { to: string; branch?: string }[]>();
    for (const e of edges) {
      const rec = (e && typeof e === "object") ? (e as Record<string, unknown>) : {};
      const from = typeof rec.from === "string" ? rec.from : "";
      const to = typeof rec.to === "string" ? rec.to : "";
      if (!from || !to || !ids.has(from) || !ids.has(to)) continue;
      const branch = typeof rec.branch === "string" ? rec.branch : undefined;
      if (!byFrom.has(from)) byFrom.set(from, []);
      byFrom.get(from)!.push({ to, branch });
    }
    for (const [from, outs] of byFrom) {
      const linear = outs.find((o) => o.branch == null) ?? outs[0];
      if (linear) map.set(from, linear.to);
    }
    return map;
  }

  // Legado: linear = proximo no do array.
  steps.forEach((s, i) => {
    const next = steps[i + 1]?.id;
    if (next) map.set(s.id, next);
  });
  return map;
}

// Aplica um filtro de formatacao a um valor resolvido (Fase 3).
// Suportados: date (pt-BR), datetime, currency (BRL), upper, lower.
function applyTemplateFilter(value: unknown, filter: string): string {
  const name = filter.trim().toLowerCase();
  if (name === "upper") return String(value ?? "").toUpperCase();
  if (name === "lower") return String(value ?? "").toLowerCase();
  if (name === "date" || name === "datetime") {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value ?? "");
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...(name === "datetime" ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  }
  if (name === "currency") {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "");
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  return String(value ?? "");
}

// Renderiza variaveis {{cliente.nome}}, {{negociacao.titulo}}, {{contexto.X}}.
// Fase 3: suporta filtros com pipe — fallback `{{x | "padrao"}}` (string entre
// aspas) e formatadores `{{valor | currency}}` / `{{data | date}}` / upper / lower.
function renderTemplate(
  text: string,
  ctx: { customer: Record<string, unknown> | null; negotiation: Record<string, unknown> | null; context: Record<string, unknown> },
): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, raw: string) => {
    // Separa expressao de filtros: `path | filtro1 | "fallback"`.
    const segments = raw.split("|").map((s) => s.trim());
    const path = segments[0];
    const filters = segments.slice(1);

    const parts = path.split(".");
    let source: unknown;
    const [root, ...rest] = parts;
    if (root === "cliente") source = ctx.customer ?? {};
    else if (root === "negociacao") source = ctx.negotiation ?? {};
    else if (root === "contexto") source = ctx.context ?? {};
    else source = undefined;
    if (source !== undefined) {
      for (const part of rest) {
        if (source == null || typeof source !== "object") {
          source = undefined;
          break;
        }
        source = (source as Record<string, unknown>)[part];
      }
    }

    // Filtros: string entre aspas = fallback (usado quando o valor e vazio);
    // identificador = formatador.
    let fallback = "";
    const formatters: string[] = [];
    for (const f of filters) {
      const quoted = f.match(/^["'](.*)["']$/);
      if (quoted) fallback = quoted[1];
      else if (f) formatters.push(f);
    }

    const isEmpty =
      source == null ||
      (typeof source !== "object" && String(source) === "") ||
      (typeof source === "object" && Object.keys(source as object).length === 0);
    if (isEmpty) return fallback;

    if (formatters.length > 0) {
      // Aplica formatadores em cadeia sobre o valor original.
      let out = source;
      for (const fmt of formatters) out = applyTemplateFilter(out, fmt);
      return String(out);
    }
    return typeof source === "object" ? JSON.stringify(source) : String(source);
  });
}

// Confere suppressions por canal: 'all' bloqueia qualquer envio.
async function isSuppressed(
  admin: AdminClient,
  tenantId: string,
  customerId: string,
  channel: "whatsapp" | "email" | "sms",
): Promise<boolean> {
  const { data } = await admin
    .from("marketing_flow_suppressions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .in("channel", [channel, "all"])
    .limit(1)
    .maybeSingle();
  return !!data;
}

// Idempotencia defensiva: se ja existe step_completed pra esse step do
// participant, pula o envio (acontece em retry pos-crash-pre-mark-done).
async function alreadyCompleted(
  admin: AdminClient,
  flowId: string,
  participantId: string,
  stepId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("marketing_flow_events")
    .select("id")
    .eq("flow_id", flowId)
    .eq("participant_id", participantId)
    .eq("step_id", stepId)
    .eq("event_type", "step_completed")
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function loadCustomer(
  admin: AdminClient,
  customerId: string | null,
): Promise<Record<string, unknown> | null> {
  if (!customerId) return null;
  const { data } = await admin
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();
  return (data as Record<string, unknown> | null) ?? null;
}

async function loadNegotiation(
  admin: AdminClient,
  negotiationId: string | null,
): Promise<Record<string, unknown> | null> {
  if (!negotiationId) return null;
  const { data } = await admin
    .from("crm_negotiations")
    .select("*")
    .eq("id", negotiationId)
    .single();
  return (data as Record<string, unknown> | null) ?? null;
}

async function findConnectedWhatsAppInstance(
  admin: AdminClient,
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function insertEvent(
  admin: AdminClient,
  job: Job,
  type: string,
  stepId: string | null,
  message: string | null,
  metadata: Record<string, unknown>,
) {
  await admin.from("marketing_flow_events").insert({
    tenant_id: job.tenant_id,
    flow_id: job.flow_id,
    participant_id: job.participant_id,
    event_type: type,
    step_id: stepId,
    message,
    metadata,
  });
}

async function markDone(
  admin: AdminClient,
  job: Job,
  currentStep: Step,
  allSteps: Step[],
  participant: Participant,
  result: StepResult,
  linearNext: Map<string, string>,
) {
  await admin
    .from("marketing_flow_jobs")
    .update({ status: "done", last_error: null, locked_at: null, locked_by: null })
    .eq("id", job.id);

  await insertEvent(admin, job, "step_completed", currentStep.id, null, {
    result: result.detail ?? null,
  });

  // Dados entre passos (Fase 3): mescla o contextPatch no context do participant.
  const nextContext = result.contextPatch
    ? deepMerge(participant.context ?? {}, result.contextPatch)
    : null;
  const nextNegotiationId =
    typeof result.detail?.negotiation_id === "string" && result.detail.negotiation_id.trim()
      ? result.detail.negotiation_id.trim()
      : null;

  // Branch escolhido pelo executor (split/teste-ab/esperar-condicao) tem
  // prioridade; senao segue a aresta linear do grafo (que cobre reconvergencia
  // / unir-caminho, em vez do antigo "proximo do array").
  const nextId = result.nextStepId ?? linearNext.get(currentStep.id);
  const nextStep = nextId ? allSteps.find((s) => s.id === nextId) : undefined;

  if (!nextStep) {
    await admin
      .from("marketing_flow_participants")
      .update({
        status: "completed",
        exited_at: new Date().toISOString(),
        current_step_id: null,
        next_run_at: null,
        ...(nextNegotiationId ? { negotiation_id: nextNegotiationId } : {}),
        ...(nextContext ? { context: nextContext } : {}),
      })
      .eq("id", participant.id);
    await insertEvent(admin, job, "participant_completed", null, null, {});
    return;
  }

  const waitMs = Math.max(0, Math.floor(result.waitMs ?? 0));
  const runAt = new Date(Date.now() + waitMs).toISOString();

  await admin.from("marketing_flow_jobs").insert({
    tenant_id: job.tenant_id,
    flow_id: job.flow_id,
    participant_id: job.participant_id,
    step_id: nextStep.id,
    status: "queued",
    run_at: runAt,
    attempts: 0,
    max_attempts: 5,
    idempotency_key: `${job.participant_id}:${nextStep.id}:1`,
  });

  await admin
    .from("marketing_flow_participants")
    .update({
      current_step_id: nextStep.id,
      next_run_at: runAt,
      status: waitMs > 0 ? "waiting" : "active",
      ...(nextNegotiationId ? { negotiation_id: nextNegotiationId } : {}),
      ...(nextContext ? { context: nextContext } : {}),
    })
    .eq("id", participant.id);

  if (waitMs > 0) {
    await insertEvent(admin, job, "step_waiting", nextStep.id, null, {
      wait_ms: waitMs,
      until: runAt,
    });
  }
}

async function markRescheduleSame(
  admin: AdminClient,
  job: Job,
  result: StepResult,
) {
  const runAt = new Date(Date.now() + (result.rescheduleIn ?? 0)).toISOString();
  await admin
    .from("marketing_flow_jobs")
    .update({
      status: "queued",
      run_at: runAt,
      locked_at: null,
      locked_by: null,
      // attempts nao incrementa: nao e retry, e reagendamento intencional.
      attempts: 0,
      last_error: null,
    })
    .eq("id", job.id);

  await insertEvent(admin, job, "step_waiting", job.step_id, null, {
    rescheduled: true,
    until: runAt,
    ...(result.detail ?? {}),
  });

  await admin
    .from("marketing_flow_participants")
    .update({ next_run_at: runAt, status: "waiting" })
    .eq("id", job.participant_id);
}

async function preSendCheck(
  admin: AdminClient,
  tenantId: string,
  channel: "whatsapp" | "email" | "smart",
  participantId: string,
  stepId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const { data, error } = await admin.rpc("marketing_flow_pre_send_check", {
    p_tenant_id: tenantId,
    p_channel: channel,
    p_participant_id: participantId,
    p_step_id: stepId,
  });
  if (error) {
    console.warn("pre-send check failed:", error.message);
    return { allowed: true }; // failsafe: nao trava envio se RPC quebrar
  }
  const r = (data as Record<string, unknown>) ?? {};
  return {
    allowed: r.allowed === true,
    reason: typeof r.reason === "string" ? r.reason : undefined,
  };
}

async function markFailed(admin: AdminClient, job: Job, message: string) {
  await admin
    .from("marketing_flow_jobs")
    .update({ status: "failed", last_error: message, locked_at: null, locked_by: null })
    .eq("id", job.id);
  await insertEvent(admin, job, "step_failed", job.step_id, message, {
    permanent: true,
    attempts: job.attempts,
  });
  await admin
    .from("marketing_flow_participants")
    .update({ status: "failed", exited_at: new Date().toISOString() })
    .eq("id", job.participant_id);
  await emitWebhookEvent(admin, job.tenant_id, "marketing_flow.failed", {
    flow_id: job.flow_id,
    participant_id: job.participant_id,
    step_id: job.step_id,
    reason: "permanent",
    attempts: job.attempts,
    error: message,
  });
}

/**
 * Agenda retry com backoff exponencial. Returns true se virou `dead`
 * (ou seja, esgotou tentativas), false se foi reenfileirado.
 */
async function scheduleRetryOrDead(
  admin: AdminClient,
  job: Job,
  message: string,
): Promise<boolean> {
  const attempts = job.attempts;
  if (attempts >= job.max_attempts) {
    await admin
      .from("marketing_flow_jobs")
      .update({ status: "dead", last_error: message, locked_at: null, locked_by: null })
      .eq("id", job.id);
    await insertEvent(admin, job, "step_failed", job.step_id, message, {
      dead: true,
      attempts,
    });
    await admin
      .from("marketing_flow_participants")
      .update({ status: "failed", exited_at: new Date().toISOString() })
      .eq("id", job.participant_id);
    await emitWebhookEvent(admin, job.tenant_id, "marketing_flow.failed", {
      flow_id: job.flow_id,
      participant_id: job.participant_id,
      step_id: job.step_id,
      reason: "exhausted",
      attempts,
      error: message,
    });
    return true;
  }

  const delayMins = flowRetryDelayMinutes(attempts);
  const runAt = new Date(Date.now() + delayMins * 60_000).toISOString();

  await admin
    .from("marketing_flow_jobs")
    .update({
      status: "queued",
      run_at: runAt,
      locked_at: null,
      locked_by: null,
      last_error: message,
    })
    .eq("id", job.id);

  await insertEvent(admin, job, "retry_scheduled", job.step_id, message, {
    attempt: attempts,
    next_attempt_at: runAt,
    delay_minutes: delayMins,
  });
  return false;
}

// ---------------------------------------------------------------- Executors

async function executeStep(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  switch (step.actionId) {
    case "espera":
      return runWait(step.config);
    case "webhook":
      return await runWebhook(admin, step, participant);
    case "definir-variavel":
      return await runSetVariable(admin, step, participant);
    case "criar-tarefa-negociacao":
      return await runCreateTask(admin, step.config, participant);
    case "adicionar-tags":
      return await runTag(admin, step.config, participant, "add");
    case "remover-tag":
      return await runTag(admin, step.config, participant, "remove");
    case "whatsapp":
      return await runWhatsApp(admin, step, participant);
    case "email":
      return await runEmail(admin, step, participant);
    case "criar-negociacao":
      return await runCreateDeal(admin, step, participant);
    case "mover-negociacao":
      return await runMoveDeal(admin, step, participant);
    case "atualizar-nome-negociacao":
      return await runUpdateDealTitle(admin, step, participant);
    case "atualizar-status":
      return await runUpdateDealStatus(admin, step, participant);
    case "definir-qualificacao":
      return await runSetQualification(admin, step, participant);
    case "suprimir-canal":
      return await runSuppressChannel(admin, step, participant);
    case "transferir-humano":
      return await runHandoffToHuman(admin, participant);
    case "adicionar-anotacao":
      return await runAddNote(admin, step, participant);
    case "marcar-venda":
      return await runMarkSale(admin, step, participant);
    case "dividir-caminho":
    case "dividir-por-segmentacao":
      return await runSplit(admin, step, participant);
    case "adicionar-leads-outros-fluxos":
      return await runAddToFlow(admin, step, participant);
    case "remover-leads-outros-fluxos":
      return await runRemoveFromFlow(admin, step, participant);
    case "teste-ab":
      return await runABTest(admin, step, participant);
    case "esperar-condicao":
      return await runWaitUntil(admin, step, participant);
    case "mensagem-inteligente":
      return await runSmartMessage(admin, step, participant);
    case "pausar-ia":
      return await runPauseAi(admin, participant);
    case "retomar-ia":
      return await runResumeAi(admin, participant);
    case "classificar-ia":
      return await runAiClassify(admin, step, participant);
    case "unir-caminho":
      // No de reconvergencia: nao faz acao, apenas segue a saida linear do grafo.
      return { detail: { merge: true } };
    default:
      // Sem executor: falha explicita (PermanentError -> step_failed + participant
      // failed) em vez de "skipped" silencioso, que fazia o passo passar sem fazer
      // nada e o fluxo "concluir" como se tivesse executado. A publicacao ja
      // bloqueia fluxos com acao nao suportada (flow-validation); isto e defesa
      // em profundidade para versoes publicadas antes dessa regra.
      throw new PermanentError(
        `ação "${step.actionId}" não tem executor implementado no worker`,
      );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getParticipantChatId(participant: Participant): string | null {
  const context = asRecord(participant.context);
  const rawChatId = context.chat_id ?? context.chatId ?? context.whatsapp_chat_id;
  if (typeof rawChatId !== "string") return null;
  const chatId = rawChatId.trim();
  return chatId.length > 0 ? chatId : null;
}

async function resolveChatResumeMode(admin: AdminClient, chatId: string): Promise<"qualifying" | "full"> {
  const { data: chat, error: chatError } = await admin
    .from("whatsapp_chats")
    .select("instance_id")
    .eq("id", chatId)
    .maybeSingle();
  if (chatError || !chat?.instance_id) return "full";

  const { data: instance } = await admin
    .from("whatsapp_instances")
    .select("ai_default_mode")
    .eq("id", chat.instance_id as string)
    .maybeSingle();

  return String(instance?.ai_default_mode ?? "full") === "qualifying" ? "qualifying" : "full";
}

async function updateChatAiMode(admin: AdminClient, chatId: string, aiMode: string): Promise<void> {
  const { error } = await admin.from("whatsapp_chats").update({ ai_mode: aiMode }).eq("id", chatId);
  if (error) {
    throw new Error(`falha ao atualizar ai_mode do chat ${chatId}: ${error.message}`);
  }
}

async function runPauseAi(admin: AdminClient, participant: Participant): Promise<StepResult> {
  const chatId = getParticipantChatId(participant);
  if (!chatId) {
    throw new PermanentError("participante sem chat_id no contexto para pausar IA");
  }

  await updateChatAiMode(admin, chatId, "handoff");
  return { detail: { chat_id: chatId, ai_mode: "handoff" } };
}

async function runResumeAi(admin: AdminClient, participant: Participant): Promise<StepResult> {
  const chatId = getParticipantChatId(participant);
  if (!chatId) {
    throw new PermanentError("participante sem chat_id no contexto para retomar IA");
  }

  const aiMode = await resolveChatResumeMode(admin, chatId);
  await updateChatAiMode(admin, chatId, aiMode);
  return { detail: { chat_id: chatId, ai_mode: aiMode } };
}

/** Merge profundo de objetos planos (arrays e escalares sao substituidos). */
function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const prev = out[key];
    if (
      value && typeof value === "object" && !Array.isArray(value) &&
      prev && typeof prev === "object" && !Array.isArray(prev)
    ) {
      out[key] = deepMerge(prev as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function runWait(config: unknown): StepResult {
  const c = asRecord(config);
  const days = Math.max(0, Math.floor(Number(c.days ?? 0)));
  const hours = Math.max(0, Math.floor(Number(c.hours ?? 0)));
  const minutes = Math.max(0, Math.floor(Number(c.minutes ?? 0)));
  const waitMs = ((days * 24 + hours) * 60 + minutes) * 60_000;
  if (waitMs <= 0) {
    throw new PermanentError("Espera com duração zero");
  }
  return { waitMs, detail: { days, hours, minutes } };
}

async function runWebhook(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const url = String(c.url ?? "").trim();
  if (!url) throw new PermanentError("Webhook sem URL");
  const method = String(c.method ?? "POST").toUpperCase();
  try {
    new URL(url);
  } catch {
    throw new PermanentError("URL do webhook inválida");
  }

  // Renderiza URL e corpo com variaveis do contexto (Fase 3).
  const customer = await loadCustomer(admin, participant.customer_id);
  const negotiation = await loadNegotiation(admin, participant.negotiation_id);
  const renderCtx = { customer, negotiation, context: participant.context ?? {} };
  const renderedUrl = renderTemplate(url, renderCtx);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof c.headers === "string") {
    for (const line of c.headers.split("\n")) {
      const colon = line.indexOf(":");
      if (colon <= 0) continue;
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (key) headers[key] = renderTemplate(value, renderCtx);
    }
  }

  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body =
      typeof c.body === "string" && c.body.length > 0
        ? renderTemplate(c.body, renderCtx)
        : "{}";
  }

  let response: Response;
  try {
    response = await fetch(renderedUrl, init);
  } catch (e) {
    // erro de rede = temporario
    throw new Error(`erro de rede: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Captura a resposta pra disponibilizar aos proximos passos. Limita o
  // tamanho pra nao inflar o jsonb do participant.
  const rawText = (await response.text()).slice(0, 8000);
  let parsedBody: unknown = rawText;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText;
    }
  }

  // Grava em contexto.webhook.<stepId> (acessivel via template nos proximos passos).
  const contextPatch = {
    webhook: {
      [step.id]: {
        status: response.status,
        body: parsedBody,
        at: new Date().toISOString(),
      },
    },
  };

  if (response.status >= 200 && response.status < 300) {
    return { contextPatch, detail: { status: response.status } };
  }
  if (response.status >= 400 && response.status < 500) {
    throw new PermanentError(`HTTP ${response.status}`);
  }
  // 5xx = temporario
  throw new Error(`HTTP ${response.status}`);
}

/**
 * Acao "definir-variavel" (Fase 3): grava valores em contexto.vars.* para uso
 * nos passos seguintes. Cada atribuicao tem `key` e `value` (template renderizado).
 */
async function runSetVariable(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const raw = Array.isArray(c.assignments) ? c.assignments : [];
  const assignments = raw
    .map((a) => {
      const ar = asRecord(a);
      return { key: String(ar.key ?? "").trim(), value: String(ar.value ?? "") };
    })
    .filter((a) => a.key);
  if (assignments.length === 0) {
    throw new PermanentError("Definir variável sem atribuições");
  }

  const customer = await loadCustomer(admin, participant.customer_id);
  const negotiation = await loadNegotiation(admin, participant.negotiation_id);
  const renderCtx = { customer, negotiation, context: participant.context ?? {} };

  const vars: Record<string, unknown> = {};
  for (const a of assignments) {
    vars[a.key] = renderTemplate(a.value, renderCtx);
  }

  return { contextPatch: { vars }, detail: { keys: assignments.map((a) => a.key) } };
}

async function runCreateTask(
  admin: AdminClient,
  config: unknown,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(config);
  const title = String(c.title ?? "").trim();
  if (!title) throw new PermanentError("Tarefa sem título");
  if (!participant.negotiation_id && !participant.customer_id) {
    throw new PermanentError("Participante sem negociação/cliente vinculado");
  }
  const dueDays = Math.max(0, Math.floor(Number(c.dueDays ?? 1)));
  const dueAt =
    dueDays > 0 ? new Date(Date.now() + dueDays * 86_400_000).toISOString() : null;
  const notes = typeof c.description === "string" ? c.description : "";

  const { data, error } = await admin
    .from("crm_tasks")
    .insert({
      tenant_id: participant.tenant_id,
      negotiation_id: participant.negotiation_id,
      customer_id: participant.customer_id,
      title,
      due_at: dueAt,
      notes,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { detail: { task_id: (data as { id: string }).id } };
}

async function runTag(
  admin: AdminClient,
  config: unknown,
  participant: Participant,
  mode: "add" | "remove",
): Promise<StepResult> {
  const c = asRecord(config);
  const tag = String(c.tag ?? "").trim();
  if (!tag) throw new PermanentError("Etiqueta vazia");
  if (!participant.customer_id) {
    throw new PermanentError("Participante sem cliente para etiquetar");
  }

  const { data, error } = await admin
    .from("customers")
    .select("source_columns")
    .eq("id", participant.customer_id)
    .single();
  if (error) throw new Error(error.message);

  const cols = asRecord((data as { source_columns: unknown }).source_columns) as Record<
    string,
    string
  >;
  const raw = cols["wchat_customer_tags"] ?? "";
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      tags = parsed.filter((s): s is string => typeof s === "string");
    }
  } catch {
    // formato legado: separadores
    tags = String(raw)
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const exists = tags.includes(tag);
  if (mode === "add" && !exists) tags.push(tag);
  if (mode === "remove" && exists) tags = tags.filter((t) => t !== tag);
  if ((mode === "add" && exists) || (mode === "remove" && !exists)) {
    return { detail: { tag, mode, noop: true } };
  }

  const nextCols: Record<string, string> = {
    ...cols,
    wchat_customer_tags: JSON.stringify([...new Set(tags)]),
  };
  const { error: updateError } = await admin
    .from("customers")
    .update({ source_columns: nextCols })
    .eq("id", participant.customer_id);
  if (updateError) throw new Error(updateError.message);

  return { detail: { tag, mode } };
}

// ---------------------------------------------------------------- WhatsApp

/**
 * Envia texto WhatsApp via uazapi e persiste como outbound. Reutilizado por
 * runWhatsApp (corpo do config) e runSmartMessage (corpo gerado pela IA).
 */
async function sendWhatsAppText(
  admin: AdminClient,
  participant: Participant,
  customer: Record<string, unknown>,
  body: string,
  flowId: string,
  stepId: string,
): Promise<{ chat_id: string; provider_id: string | null }> {
  const phone = String((customer as { telefone?: unknown }).telefone ?? "").trim();
  if (!phone) throw new PermanentError("Cliente sem telefone para WhatsApp");

  const instance = await findConnectedWhatsAppInstance(admin, participant.tenant_id);
  if (!instance) throw new PermanentError("Nenhuma instancia WhatsApp conectada");

  const chat = await ensureChat(admin, instance as Parameters<typeof ensureChat>[1], {
    remoteJid: phone,
    displayName: String((customer as { nome?: unknown }).nome ?? "Cliente"),
    lastMessagePreview: body,
    lastMessageAt: new Date().toISOString(),
  });

  const apiKey = await decryptSecret(String((instance as { encrypted_apikey: string }).encrypted_apikey));
  const uazapiConfig = {
    instanceName: String((instance as { uazapi_instance_name: string }).uazapi_instance_name),
    baseUrl: String((instance as { uazapi_base_url: string }).uazapi_base_url),
    apiKey,
  };

  const response = await sendMessageViaUazapi(uazapiConfig, {
    messageType: "text",
    remoteJid: String((chat as { remote_jid: string }).remote_jid),
    bodyText: body,
    payload: {},
  });

  const providerId =
    (response as { key?: { id?: string }; data?: { key?: { id?: string } }; id?: string })
      .key?.id ??
    (response as { data?: { key?: { id?: string } } }).data?.key?.id ??
    (response as { id?: string }).id ??
    null;

  await insertOrDedupeOutboundMessage(
    admin,
    instance as Parameters<typeof insertOrDedupeOutboundMessage>[1],
    String((chat as { id: string }).id),
    {
      uazapiMessageId: typeof providerId === "string" ? providerId : null,
      messageType: "text",
      status: "sent",
      bodyText: body,
      payloadJson: { source: "marketing-flow-worker", flow_id: flowId, step_id: stepId },
      rawEvent: response as Record<string, unknown>,
      sentAt: new Date().toISOString(),
      actorType: "automation",
    },
  );

  return {
    chat_id: String((chat as { id: string }).id),
    provider_id: typeof providerId === "string" ? providerId : null,
  };
}

async function runWhatsApp(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const messageTemplate = String(c.message ?? "").trim();
  if (!messageTemplate) throw new PermanentError("WhatsApp sem mensagem configurada");
  if (!participant.customer_id) {
    throw new PermanentError("Participante sem cliente para envio de WhatsApp");
  }
  if (await isSuppressed(admin, participant.tenant_id, participant.customer_id, "whatsapp")) {
    return { detail: { skipped: true, reason: "cliente em opt-out de WhatsApp" } };
  }
  if (await alreadyCompleted(admin, participant.flow_id, participant.id, step.id)) {
    return { detail: { skipped: true, reason: "step ja completado (idempotencia)" } };
  }

  const check = await preSendCheck(admin, participant.tenant_id, "whatsapp", participant.id, step.id);
  if (!check.allowed) {
    return {
      rescheduleIn: 60 * 60_000, // tenta de novo daqui a 1h
      detail: { rescheduled: true, reason: check.reason ?? "rate_limit" },
    };
  }

  const customer = await loadCustomer(admin, participant.customer_id);
  if (!customer) throw new PermanentError("Cliente nao encontrado");
  const negotiation = await loadNegotiation(admin, participant.negotiation_id);
  const body = renderTemplate(messageTemplate, {
    customer,
    negotiation,
    context: participant.context ?? {},
  });

  const result = await sendWhatsAppText(
    admin,
    participant,
    customer,
    body,
    participant.flow_id,
    step.id,
  );
  return { detail: { ...result } };
}

// ---------------------------------------------------------------- Email

async function runEmail(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const subjectTemplate = String(c.subject ?? "").trim();
  const bodyTemplate = String(c.body ?? "").trim();
  if (!subjectTemplate) throw new PermanentError("E-mail sem assunto");
  if (!bodyTemplate) throw new PermanentError("E-mail sem corpo");
  if (!participant.customer_id) {
    throw new PermanentError("Participante sem cliente para envio de e-mail");
  }
  if (await isSuppressed(admin, participant.tenant_id, participant.customer_id, "email")) {
    return { detail: { skipped: true, reason: "cliente em opt-out de e-mail" } };
  }
  if (await alreadyCompleted(admin, participant.flow_id, participant.id, step.id)) {
    return { detail: { skipped: true, reason: "step ja completado (idempotencia)" } };
  }

  const check = await preSendCheck(admin, participant.tenant_id, "email", participant.id, step.id);
  if (!check.allowed) {
    return {
      rescheduleIn: 60 * 60_000,
      detail: { rescheduled: true, reason: check.reason ?? "rate_limit" },
    };
  }

  const customer = await loadCustomer(admin, participant.customer_id);
  if (!customer) throw new PermanentError("Cliente nao encontrado");
  const email = String((customer as { email?: unknown }).email ?? "").trim();
  if (!email) throw new PermanentError("Cliente sem e-mail");

  const negotiation = await loadNegotiation(admin, participant.negotiation_id);
  const renderCtx = {
    customer,
    negotiation,
    context: participant.context ?? {},
  };
  const subject = renderTemplate(subjectTemplate, renderCtx);
  const bodyRendered = renderTemplate(bodyTemplate, renderCtx);

  // Enfileira na infra existente (marketing-email-dispatch consome).
  const idempotencyKey = `marketing-flow:${participant.id}:${step.id}`;
  const { error } = await admin.from("marketing_email_dispatches").insert({
    tenant_id: participant.tenant_id,
    negotiation_id: participant.negotiation_id,
    trigger_type: "marketing_flow",
    email_type: "transactional",
    recipient_email: email,
    subject,
    blocks: [{ type: "paragraph", text: bodyRendered }],
    variables: {},
    idempotency_key: idempotencyKey,
    status: "queued",
  });
  if (error) {
    // unique_violation = ja enfileirado em retentativa anterior -> sucesso idempotente
    const msg = error.message ?? "";
    if (msg.includes("idempotency_key") || msg.includes("duplicate key")) {
      return { detail: { enqueued: false, reason: "ja enfileirado anteriormente" } };
    }
    throw new Error(msg);
  }
  return { detail: { enqueued: true, idempotency_key: idempotencyKey } };
}

// ---------------------------------------------------------------- CRM deal

async function runCreateDeal(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const funnelId = String(c.funnelId ?? "").trim();
  const stageId = String(c.stageId ?? "").trim();
  if (!funnelId) throw new PermanentError("Funil ausente");
  if (!stageId) throw new PermanentError("Etapa ausente");
  if (!participant.customer_id) {
    throw new PermanentError("Participante sem cliente para criar negociacao");
  }
  if (await alreadyCompleted(admin, participant.flow_id, participant.id, step.id)) {
    return { detail: { skipped: true, reason: "step ja completado (idempotencia)" } };
  }

  const customer = await loadCustomer(admin, participant.customer_id);
  const titleTemplate = String(c.title ?? "").trim();
  const titleRendered = titleTemplate
    ? renderTemplate(titleTemplate, {
        customer,
        negotiation: null,
        context: participant.context ?? {},
      })
    : String((customer as { nome?: unknown } | null)?.nome ?? "Negociacao");

  // Evita duplicar negociacao em andamento pro mesmo cliente+funil.
  const { data: existing } = await admin
    .from("crm_negotiations")
    .select("id")
    .eq("tenant_id", participant.tenant_id)
    .eq("customer_id", participant.customer_id)
    .eq("funnel_id", funnelId)
    .eq("status", "em_andamento")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { detail: { negotiation_id: (existing as { id: string }).id, already_exists: true } };
  }

  const { data, error } = await admin
    .from("crm_negotiations")
    .insert({
      tenant_id: participant.tenant_id,
      customer_id: participant.customer_id,
      title: titleRendered,
      funnel_id: funnelId,
      stage_id: stageId,
      status: "em_andamento",
      last_interaction_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { detail: { negotiation_id: (data as { id: string }).id } };
}

async function runMoveDeal(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const funnelId = String(c.funnelId ?? "").trim();
  const stageId = String(c.stageId ?? "").trim();
  if (!funnelId) throw new PermanentError("Funil ausente");
  if (!stageId) throw new PermanentError("Etapa ausente");
  if (!participant.negotiation_id) {
    throw new PermanentError("Participante sem negociacao para mover");
  }
  if (await alreadyCompleted(admin, participant.flow_id, participant.id, step.id)) {
    return { detail: { skipped: true, reason: "step ja completado (idempotencia)" } };
  }

  const { data, error } = await admin
    .from("crm_negotiations")
    .update({
      funnel_id: funnelId,
      stage_id: stageId,
      last_interaction_at: new Date().toISOString(),
    })
    .eq("id", participant.negotiation_id)
    .eq("tenant_id", participant.tenant_id)
    .select("id, funnel_id, stage_id")
    .single();
  if (error) throw new Error(error.message);
  return {
    detail: {
      negotiation_id: (data as { id: string }).id,
      funnel_id: (data as { funnel_id: string }).funnel_id,
      stage_id: (data as { stage_id: string }).stage_id,
    },
  };
}

// ---------------------------------------------------------------- CRM negociacao (Fase 4)

// Valores reais da check constraint de crm_negotiations.status.
const DEAL_STATUSES = ["em_andamento", "vendido", "perdido", "pausado", "nao_pausado"] as const;

async function runUpdateDealTitle(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  if (!participant.negotiation_id) {
    throw new PermanentError("Participante sem negociação para renomear");
  }
  const c = asRecord(step.config);
  const titleTemplate = String(c.title ?? "").trim();
  if (!titleTemplate) throw new PermanentError("Novo nome da negociação não definido");

  const customer = await loadCustomer(admin, participant.customer_id);
  const negotiation = await loadNegotiation(admin, participant.negotiation_id);
  const title = renderTemplate(titleTemplate, {
    customer,
    negotiation,
    context: participant.context ?? {},
  }).trim();
  if (!title) throw new PermanentError("Nome renderizado vazio");

  const { error } = await admin
    .from("crm_negotiations")
    .update({ title })
    .eq("id", participant.negotiation_id)
    .eq("tenant_id", participant.tenant_id);
  if (error) throw new Error(error.message);
  return { detail: { title } };
}

async function runUpdateDealStatus(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  if (!participant.negotiation_id) {
    throw new PermanentError("Participante sem negociação para atualizar status");
  }
  const c = asRecord(step.config);
  const status = String(c.status ?? "").trim();
  if (!(DEAL_STATUSES as readonly string[]).includes(status)) {
    throw new PermanentError(`Status inválido: "${status}"`);
  }

  const updates: Record<string, unknown> = { status };
  // O trigger crm_negotiations_require_lost_reason exige lost_reason quando
  // status vira 'perdido' — sem ele o UPDATE falha. Anexa um motivo padrao.
  if (status === "perdido") {
    const reason = String(c.lossReason ?? "").trim();
    updates.lost_reason = reason || "Perdido automaticamente pelo fluxo de marketing";
  }

  const { error } = await admin
    .from("crm_negotiations")
    .update(updates)
    .eq("id", participant.negotiation_id)
    .eq("tenant_id", participant.tenant_id);
  if (error) throw new Error(error.message);
  return { detail: { status } };
}

async function runSetQualification(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  if (!participant.negotiation_id) {
    throw new PermanentError("Participante sem negociação para qualificar");
  }
  const c = asRecord(step.config);
  const n = Number(c.qualification);
  if (!Number.isFinite(n) || n < 0 || n > 5) {
    throw new PermanentError(`Qualificação inválida: "${c.qualification}" (use 0 a 5)`);
  }
  const qualification = Math.round(n);

  const { error } = await admin
    .from("crm_negotiations")
    .update({ qualification, last_interaction_at: new Date().toISOString() })
    .eq("id", participant.negotiation_id)
    .eq("tenant_id", participant.tenant_id);
  if (error) throw new Error(error.message);
  return { detail: { qualification } };
}

const SUPPRESSION_CHANNELS = ["whatsapp", "email", "sms", "all"] as const;

async function runSuppressChannel(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  if (!participant.customer_id) {
    throw new PermanentError("Participante sem cliente para suprimir (opt-out)");
  }
  const c = asRecord(step.config);
  const channel = String(c.channel ?? "").trim();
  if (!(SUPPRESSION_CHANNELS as readonly string[]).includes(channel)) {
    throw new PermanentError(`Canal de opt-out inválido: "${channel}"`);
  }
  const reason = String(c.reason ?? "").trim() || "Opt-out via fluxo de marketing";

  // Idempotente: unique (tenant_id, customer_id, channel) evita duplicar.
  const { error } = await admin
    .from("marketing_flow_suppressions")
    .upsert(
      {
        tenant_id: participant.tenant_id,
        customer_id: participant.customer_id,
        channel,
        reason,
      },
      { onConflict: "tenant_id,customer_id,channel", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
  return { detail: { suppressed_channel: channel } };
}

/**
 * Pausa a IA e entrega o chat ao time: seta ai_mode='handoff' no chat mais
 * recente do cliente. O trigger de banco em whatsapp_chats emite o evento
 * ai_paused (que pode inscrever o lead em outros fluxos).
 */
async function runHandoffToHuman(
  admin: AdminClient,
  participant: Participant,
): Promise<StepResult> {
  if (!participant.customer_id) {
    throw new PermanentError("Participante sem cliente para transferir");
  }

  const { data: chat, error: findError } = await admin
    .from("whatsapp_chats")
    .select("id, ai_mode")
    .eq("tenant_id", participant.tenant_id)
    .eq("customer_id", participant.customer_id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (!chat) {
    // Sem conversa ainda — nada a transferir; segue o fluxo sem falhar o lead.
    return { detail: { skipped: true, reason: "cliente sem chat de WhatsApp" } };
  }
  if ((chat as { ai_mode?: string }).ai_mode === "handoff") {
    return { detail: { skipped: true, reason: "chat ja em handoff" } };
  }

  const { error } = await admin
    .from("whatsapp_chats")
    .update({ ai_mode: "handoff" })
    .eq("id", (chat as { id: string }).id)
    .eq("tenant_id", participant.tenant_id);
  if (error) throw new Error(error.message);
  return { detail: { chat_id: (chat as { id: string }).id, ai_mode: "handoff" } };
}

async function runAddNote(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  if (!participant.negotiation_id) {
    throw new PermanentError("Participante sem negociação para anotar");
  }
  const c = asRecord(step.config);
  const noteTemplate = String(c.note ?? "").trim();
  if (!noteTemplate) throw new PermanentError("Anotação vazia");

  // Idempotencia: evita anotacao duplicada em retry pos-crash.
  if (await alreadyCompleted(admin, participant.flow_id, participant.id, step.id)) {
    return { detail: { skipped: true, reason: "step ja completado (idempotencia)" } };
  }

  const customer = await loadCustomer(admin, participant.customer_id);
  const negotiation = await loadNegotiation(admin, participant.negotiation_id);
  const body = renderTemplate(noteTemplate, {
    customer,
    negotiation,
    context: participant.context ?? {},
  }).trim();
  if (!body) throw new PermanentError("Anotação renderizada vazia");

  // Anotacao automatica do fluxo: crm_activities aceita created_by null
  // (on delete set null). Nao usamos crm_negotiation_comments porque exige
  // created_by NOT NULL (um usuario), que o fluxo nao tem.
  const { error } = await admin.from("crm_activities").insert({
    tenant_id: participant.tenant_id,
    customer_id: participant.customer_id,
    negotiation_id: participant.negotiation_id,
    activity_type: "comment",
    title: "Anotação do fluxo de marketing",
    body,
    created_by: null,
  });
  if (error) throw new Error(error.message);
  return { detail: { note_length: body.length } };
}

async function runMarkSale(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  if (!participant.negotiation_id) {
    throw new PermanentError("Participante sem negociação para marcar venda");
  }
  // Idempotencia: nao marca venda duas vezes.
  if (await alreadyCompleted(admin, participant.flow_id, participant.id, step.id)) {
    return { detail: { skipped: true, reason: "step ja completado (idempotencia)" } };
  }

  const c = asRecord(step.config);
  // valueCents opcional: quando ausente, mantem o total_value atual.
  const raw = c.valueCents;
  const hasValue = raw != null && String(raw).trim() !== "";
  const valueCents = hasValue ? Math.floor(Number(raw)) : null;
  if (hasValue && (!Number.isFinite(valueCents) || (valueCents ?? 0) < 0)) {
    throw new PermanentError("Valor da venda inválido");
  }

  // "Venda" = status 'vendido'. total_value e numeric em reais; converte de
  // centavos quando informado.
  const updates: Record<string, unknown> = {
    status: "vendido",
    last_interaction_at: new Date().toISOString(),
  };
  if (valueCents != null) updates.total_value = valueCents / 100;

  const { error } = await admin
    .from("crm_negotiations")
    .update(updates)
    .eq("id", participant.negotiation_id)
    .eq("tenant_id", participant.tenant_id);
  if (error) throw new Error(error.message);
  return { detail: { sale: true, value_cents: valueCents } };
}

// ---------------------------------------------------------------- Split (Fase 7)

function readFieldPath(
  path: string,
  ctx: {
    cliente?: Record<string, unknown> | null;
    negociacao?: Record<string, unknown> | null;
    contexto?: Record<string, unknown>;
  },
): unknown {
  const parts = (path ?? "").split(".");
  if (parts.length === 0 || !parts[0]) return undefined;
  const [root, ...rest] = parts;
  let source: unknown;
  if (root === "cliente") source = ctx.cliente ?? {};
  else if (root === "negociacao") source = ctx.negociacao ?? {};
  else if (root === "contexto") source = ctx.contexto ?? {};
  else return undefined;
  for (const part of rest) {
    if (source == null || typeof source !== "object") return undefined;
    source = (source as Record<string, unknown>)[part];
  }
  return source;
}

function applyOperator(op: string, lhs: unknown, rhs: unknown): boolean {
  const lhsText = lhs == null ? "" : String(lhs);
  const rhsText = rhs == null ? "" : String(rhs);
  switch (op) {
    case "exists":
      return lhs != null && lhsText !== "";
    case "not_exists":
      return lhs == null || lhsText === "";
    case "equals":
      return lhsText === rhsText;
    case "not_equals":
      return lhsText !== rhsText;
    case "contains":
      return lhsText.length > 0 && rhsText.length > 0 && lhsText.toLowerCase().includes(rhsText.toLowerCase());
    case "not_contains":
      return !lhsText.toLowerCase().includes(rhsText.toLowerCase());
    case "greater_than":
      return Number(lhs) > Number(rhs);
    case "less_than":
      return Number(lhs) < Number(rhs);
    default:
      return true;
  }
}

async function runSplit(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const field = String(c.field ?? "").trim();
  const operator = String(c.operator ?? "equals");
  const value = c.value ?? "";
  const trueStepId = String(c.trueStepId ?? "").trim();
  const falseStepId = String(c.falseStepId ?? "").trim();
  if (!field) throw new PermanentError("Split sem campo de condicao");
  if (!trueStepId || !falseStepId) {
    throw new PermanentError("Split sem caminhos sim/nao definidos");
  }

  const customer = await loadCustomer(admin, participant.customer_id);
  const negotiation = await loadNegotiation(admin, participant.negotiation_id);
  const result = applyOperator(
    operator,
    readFieldPath(field, {
      cliente: customer,
      negociacao: negotiation,
      contexto: participant.context ?? {},
    }),
    value,
  );

  return {
    nextStepId: result ? trueStepId : falseStepId,
    detail: { decision: result, field, operator, value },
  };
}

// ---------------------------------------------------------------- Cross-flow (Fase 7)

async function runAddToFlow(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const targetFlowId = String(c.targetFlowId ?? "").trim();
  if (!targetFlowId) throw new PermanentError("Fluxo de destino nao definido");
  if (!participant.customer_id) {
    throw new PermanentError("Participante sem cliente para mover entre fluxos");
  }

  const { data, error } = await admin.rpc("add_to_marketing_flow", {
    p_flow_id: targetFlowId,
    p_customer_id: participant.customer_id,
    p_negotiation_id: participant.negotiation_id,
    p_context: participant.context ?? {},
  });
  if (error) throw new Error(error.message);
  return {
    detail: {
      target_flow_id: targetFlowId,
      new_participant_id: data ?? null,
      skipped: data == null,
    },
  };
}

async function runRemoveFromFlow(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const targetFlowId = String(c.targetFlowId ?? "").trim();
  const reason = String(c.reason ?? "").trim() || null;
  if (!targetFlowId) throw new PermanentError("Fluxo de origem nao definido");
  if (!participant.customer_id) {
    throw new PermanentError("Participante sem cliente para remover de outro fluxo");
  }

  const { data, error } = await admin.rpc("remove_customer_from_marketing_flow", {
    p_flow_id: targetFlowId,
    p_customer_id: participant.customer_id,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return { detail: { target_flow_id: targetFlowId, removed_count: Number(data ?? 0) } };
}

// ---------------------------------------------------------------- A/B Test (Fase 7 deferido)

async function runABTest(
  _admin: AdminClient,
  step: Step,
  _participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const raw = Array.isArray(c.variants) ? c.variants : [];
  const variants = raw
    .map((v) => {
      const vr = asRecord(v);
      return {
        id: String(vr.id ?? ""),
        weight: Math.max(0, Number(vr.weight ?? 0)),
        nextStepId: String(vr.nextStepId ?? "").trim(),
      };
    })
    .filter((v) => v.nextStepId);
  if (variants.length === 0) throw new PermanentError("AB sem variantes validas");
  const total = variants.reduce((s, v) => s + v.weight, 0);
  if (total <= 0) throw new PermanentError("AB com pesos zerados");

  const r = Math.random() * total;
  let cum = 0;
  let picked = variants[0];
  for (const v of variants) {
    cum += v.weight;
    if (r <= cum) {
      picked = v;
      break;
    }
  }

  return {
    nextStepId: picked.nextStepId,
    detail: { variant_id: picked.id, weight: picked.weight, total },
  };
}

// ---------------------------------------------------------------- Wait Until (Fase 7 deferido)

async function getStepStartedAt(
  admin: AdminClient,
  participantId: string,
  stepId: string,
): Promise<number | null> {
  const { data } = await admin
    .from("marketing_flow_events")
    .select("created_at")
    .eq("participant_id", participantId)
    .eq("step_id", stepId)
    .eq("event_type", "step_started")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const ts = new Date((data as { created_at: string }).created_at).getTime();
  return Number.isFinite(ts) ? ts : null;
}

async function runWaitUntil(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const field = String(c.field ?? "").trim();
  const operator = String(c.operator ?? "equals");
  const value = c.value ?? "";
  const checkIntervalMinutes = Math.max(1, Math.floor(Number(c.checkIntervalMinutes ?? 30)));
  const timeoutHours = Math.max(0, Math.floor(Number(c.timeoutHours ?? 0)));
  const alternativeStepId = String(c.alternativeStepId ?? "").trim() || undefined;

  if (!field) throw new PermanentError("Wait-until sem campo");

  const customer = await loadCustomer(admin, participant.customer_id);
  const negotiation = await loadNegotiation(admin, participant.negotiation_id);
  const matched = applyOperator(
    operator,
    readFieldPath(field, {
      cliente: customer,
      negociacao: negotiation,
      contexto: participant.context ?? {},
    }),
    value,
  );

  if (matched) {
    return { detail: { matched: true, field, operator } };
  }

  if (timeoutHours > 0) {
    const startedAt = (await getStepStartedAt(admin, participant.id, step.id)) ?? Date.now();
    const timeoutAt = startedAt + timeoutHours * 3_600_000;
    if (Date.now() >= timeoutAt) {
      return {
        nextStepId: alternativeStepId,
        detail: {
          timeout: true,
          started_at: new Date(startedAt).toISOString(),
          timeout_at: new Date(timeoutAt).toISOString(),
        },
      };
    }
  }

  return {
    rescheduleIn: checkIntervalMinutes * 60_000,
    detail: { waiting: true, field, operator },
  };
}

// ---------------------------------------------------------------- Smart Message (Fase 7 deferido)

async function runSmartMessage(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const promptTemplate = String(c.prompt ?? "").trim();
  if (!promptTemplate) throw new PermanentError("Smart message sem prompt");
  if (!participant.customer_id) {
    throw new PermanentError("Participante sem cliente para mensagem inteligente");
  }
  if (await isSuppressed(admin, participant.tenant_id, participant.customer_id, "whatsapp")) {
    return { detail: { skipped: true, reason: "cliente em opt-out de WhatsApp" } };
  }
  if (await alreadyCompleted(admin, participant.flow_id, participant.id, step.id)) {
    return { detail: { skipped: true, reason: "step ja completado (idempotencia)" } };
  }

  const check = await preSendCheck(admin, participant.tenant_id, "smart", participant.id, step.id);
  if (!check.allowed) {
    return {
      rescheduleIn: 60 * 60_000,
      detail: { rescheduled: true, reason: check.reason ?? "rate_limit" },
    };
  }

  const customer = await loadCustomer(admin, participant.customer_id);
  if (!customer) throw new PermanentError("Cliente nao encontrado");
  const negotiation = await loadNegotiation(admin, participant.negotiation_id);
  const renderedPrompt = renderTemplate(promptTemplate, {
    customer,
    negotiation,
    context: participant.context ?? {},
  });
  const tone = String(c.tone ?? "").trim();
  const maxLength = Math.max(50, Math.floor(Number(c.maxLength ?? 280)));

  // Gera mensagem com Claude Haiku (rapido + barato).
  let generated: string;
  try {
    const response = await createMessage({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 600,
      system: [
        {
          type: "text",
          text:
            `Você é um atendente conversando por WhatsApp.${
              tone ? " Tom: " + tone + "." : ""
            } Gere uma mensagem curta (até ${maxLength} caracteres), em português brasileiro, sem incluir instruções, prefixos ou explicações meta.`,
        },
      ],
      tools: [],
      messages: [
        { role: "user", content: [{ type: "text", text: renderedPrompt }] },
      ],
    });
    const block = response.content.find((b) => b.type === "text") as
      | { type: "text"; text?: string }
      | undefined;
    generated = (block?.text ?? "").trim();
    if (!generated) throw new Error("Resposta vazia da IA");
    if (generated.length > maxLength) generated = generated.slice(0, maxLength);
  } catch (e) {
    // Falha de IA = temporario (retry pelo backoff padrao).
    throw new Error(`IA indisponivel: ${e instanceof Error ? e.message : String(e)}`);
  }

  const result = await sendWhatsAppText(
    admin,
    participant,
    customer,
    generated,
    participant.flow_id,
    step.id,
  );
  return { detail: { generated_length: generated.length, ...result } };
}

// ---------------------------------------------------------------- Classificacao por IA (Fase 6)

/**
 * Ramifica o fluxo pela classificacao do lead feita por Claude. Combina IA +
 * grafo (retorna nextStepId, como split/teste-ab) + dados entre passos (grava
 * a categoria escolhida em contexto.ai.<stepId>). Config:
 *   { prompt, categories: [{ label, nextStepId }] }
 * O modelo recebe a lista de rotulos e responde com um deles; casamos por
 * igualdade (case-insensitive) e, em fallback, por "contains".
 */
async function runAiClassify(
  admin: AdminClient,
  step: Step,
  participant: Participant,
): Promise<StepResult> {
  const c = asRecord(step.config);
  const promptTemplate = String(c.prompt ?? "").trim();
  if (!promptTemplate) throw new PermanentError("Classificação por IA sem prompt");

  const rawCats = Array.isArray(c.categories) ? c.categories : [];
  const categories = rawCats
    .map((v) => {
      const vr = asRecord(v);
      return {
        label: String(vr.label ?? "").trim(),
        nextStepId: String(vr.nextStepId ?? "").trim(),
      };
    })
    .filter((v) => v.label && v.nextStepId);
  if (categories.length < 2) {
    throw new PermanentError("Classificação por IA precisa de ao menos 2 categorias com destino");
  }

  const customer = await loadCustomer(admin, participant.customer_id);
  const negotiation = await loadNegotiation(admin, participant.negotiation_id);
  const renderedPrompt = renderTemplate(promptTemplate, {
    customer,
    negotiation,
    context: participant.context ?? {},
  });

  const labels = categories.map((cat) => cat.label);
  let chosen: string;
  try {
    const response = await createMessage({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 20,
      temperature: 0,
      system: [
        {
          type: "text",
          text:
            `Você classifica leads em UMA categoria. Categorias válidas: ${labels
              .map((l) => `"${l}"`)
              .join(", ")}. ` +
            `Responda APENAS com o rótulo exato de uma das categorias, sem aspas, sem explicação.`,
        },
      ],
      tools: [],
      messages: [{ role: "user", content: [{ type: "text", text: renderedPrompt }] }],
    });
    const block = response.content.find((b) => b.type === "text") as
      | { type: "text"; text?: string }
      | undefined;
    chosen = (block?.text ?? "").trim();
    if (!chosen) throw new Error("Resposta vazia da IA");
  } catch (e) {
    // Falha de IA = temporario (retry pelo backoff padrao).
    throw new Error(`IA indisponivel: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Casa o rotulo: igualdade case-insensitive; senao "contains" nos dois sentidos.
  const lc = chosen.toLowerCase();
  let match =
    categories.find((cat) => cat.label.toLowerCase() === lc) ??
    categories.find(
      (cat) => lc.includes(cat.label.toLowerCase()) || cat.label.toLowerCase().includes(lc),
    );
  // Fallback determinístico: primeira categoria (nunca trava o lead).
  const fellBack = !match;
  if (!match) match = categories[0];

  return {
    nextStepId: match.nextStepId,
    contextPatch: { ai: { [step.id]: { category: match.label, raw: chosen } } },
    detail: { category: match.label, raw: chosen, fell_back: fellBack },
  };
}
