import {
  authenticateApiKey,
  hasApiScope,
  type ApiKeyAuth,
} from "../_shared/api-auth.ts";
import { phoneToRemoteJid, resolveWhatsappInstance } from "../_shared/api-instances.ts";
import {
  apiJsonResponse,
  handleApiCors,
  parseRoute,
  resolveApiPath,
} from "../_shared/api-http.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { ensureChat, insertOrDedupeOutboundMessage, normalizeUazapiMessageId } from "../_shared/domain.ts";
import { buildIlikeOrFilter } from "../_shared/postgrest-filter.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { sendMessageViaUazapi } from "../_shared/uazapi.ts";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

const CRM_STAGE_TRANSITIONS: Record<string, readonly string[]> = {
  NOVO_LEAD: ["TENTANDO_CONTATO", "RESPONDEU"],
  TENTANDO_CONTATO: ["RESPONDEU", "PERDIDO"],
  RESPONDEU: [
    "EM_QUALIFICACAO",
    "AUTORIZACAO_PENDENTE",
    "ANALISE_HUMANA",
    "NAO_QUALIFICADO",
    "PERDIDO",
  ],
  EM_QUALIFICACAO: [
    "QUALIFICADO",
    "AUTORIZACAO_PENDENTE",
    "ANALISE_HUMANA",
    "NAO_QUALIFICADO",
    "PERDIDO",
  ],
  QUALIFICADO: [
    "ANALISE_HUMANA",
    "DOCUMENTACAO_PENDENTE",
    "PROPOSTA_E_CONTRATACAO",
    "NAO_QUALIFICADO",
    "PERDIDO",
  ],
  AUTORIZACAO_PENDENTE: [
    "RESPONDEU",
    "EM_QUALIFICACAO",
    "QUALIFICADO",
    "NAO_QUALIFICADO",
    "PERDIDO",
  ],
  ANALISE_HUMANA: [
    "QUALIFICADO",
    "DOCUMENTACAO_PENDENTE",
    "PROPOSTA_E_CONTRATACAO",
    "NAO_QUALIFICADO",
    "PERDIDO",
  ],
  DOCUMENTACAO_PENDENTE: [
    "ANALISE_HUMANA",
    "PROPOSTA_E_CONTRATACAO",
    "PERDIDO",
  ],
  PROPOSTA_E_CONTRATACAO: ["ANALISE_HUMANA", "CONTRATADO", "PERDIDO"],
  CONTRATADO: [],
  NAO_QUALIFICADO: [],
  PERDIDO: [],
};

function normalizeCrmStageTitle(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type CrmStage = {
  id: string;
  title: string;
};

type CrmStateContext = {
  current_stage: CrmStage | null;
  allowed_next_stages: CrmStage[];
  terminal: boolean;
  policy_applied: boolean;
};

async function loadCrmFunnelStages(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  funnelId: string,
) {
  const { data, error } = await admin
    .from("tenant_crm_funnel_config")
    .select("funnels")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;

  const funnels = Array.isArray(data?.funnels) ? data.funnels : [];
  const rawFunnel = funnels.find((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return false;
    const funnel = candidate as Record<string, unknown>;
    return String(funnel.id ?? funnel.listId ?? "") === funnelId;
  }) as Record<string, unknown> | undefined;
  const rawStages = Array.isArray(rawFunnel?.stages) ? rawFunnel.stages : [];
  return rawStages.flatMap((candidate: unknown): CrmStage[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const stage = candidate as Record<string, unknown>;
    const id = String(stage.id ?? "").trim();
    const title = String(stage.title ?? "").trim();
    return id && title ? [{ id, title }] : [];
  });
}

async function loadCrmStateContext(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  funnelId: string,
  currentStageId: string,
): Promise<CrmStateContext> {
  const stages = await loadCrmFunnelStages(admin, tenantId, funnelId);
  const currentStage = stages.find((stage) => stage.id === currentStageId) ?? null;
  const currentKey = normalizeCrmStageTitle(currentStage?.title);
  const allowedKeys = CRM_STAGE_TRANSITIONS[currentKey];
  const policyApplied = Array.isArray(allowedKeys);
  const allowedNextStages = policyApplied
    ? stages.filter((stage) => allowedKeys.includes(normalizeCrmStageTitle(stage.title)))
    : [];

  return {
    current_stage: currentStage,
    allowed_next_stages: allowedNextStages,
    terminal: policyApplied && allowedNextStages.length === 0,
    policy_applied: policyApplied,
  };
}

function clampLimit(raw: string | null): number {
  const n = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function requireScope(auth: ApiKeyAuth, scope: "read" | "write") {
  if (!hasApiScope(auth, scope)) {
    return apiJsonResponse({ error: `Missing scope: ${scope}.` }, 403);
  }
  return null;
}

function normalizeIdempotencyValue(value: unknown, maxLength = 500): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

async function claimAutomationEvent(
  admin: ReturnType<typeof createAdminClient>,
  auth: ApiKeyAuth,
  input: {
    eventType: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
    leaseSeconds?: number;
  },
) {
  const eventType = normalizeIdempotencyValue(input.eventType, 120);
  const idempotencyKey = normalizeIdempotencyValue(input.idempotencyKey);
  if (!eventType || !idempotencyKey) {
    throw new Error("event_type and idempotency_key are required.");
  }
  const { data, error } = await admin.rpc("claim_crm_automation_event", {
    p_tenant_id: auth.tenantId,
    p_event_type: eventType,
    p_idempotency_key: idempotencyKey,
    p_metadata: input.metadata ?? {},
    p_lease_seconds: input.leaseSeconds ?? 600,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

async function completeAutomationEvent(
  admin: ReturnType<typeof createAdminClient>,
  auth: ApiKeyAuth,
  input: {
    eventType: string;
    idempotencyKey: string;
    resourceType?: string | null;
    resourceId?: string | null;
    result?: Record<string, unknown>;
  },
) {
  const { data, error } = await admin.rpc("complete_crm_automation_event", {
    p_tenant_id: auth.tenantId,
    p_event_type: normalizeIdempotencyValue(input.eventType, 120),
    p_idempotency_key: normalizeIdempotencyValue(input.idempotencyKey),
    p_resource_type: input.resourceType ?? null,
    p_resource_id: input.resourceId ?? null,
    p_result: input.result ?? {},
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

async function failAutomationEvent(
  admin: ReturnType<typeof createAdminClient>,
  auth: ApiKeyAuth,
  input: {
    eventType: string;
    idempotencyKey: string;
    result?: Record<string, unknown>;
  },
) {
  const { data, error } = await admin.rpc("fail_crm_automation_event", {
    p_tenant_id: auth.tenantId,
    p_event_type: normalizeIdempotencyValue(input.eventType, 120),
    p_idempotency_key: normalizeIdempotencyValue(input.idempotencyKey),
    p_result: input.result ?? {},
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

async function handleAutomationEvent(
  auth: ApiKeyAuth,
  request: Request,
  action: "claim" | "complete" | "fail",
) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const eventType = normalizeIdempotencyValue(body.event_type, 120);
  const idempotencyKey = normalizeIdempotencyValue(body.idempotency_key);
  if (!eventType || !idempotencyKey) {
    return apiJsonResponse({ error: "event_type and idempotency_key are required." }, 400);
  }

  const admin = createAdminClient();
  if (action === "claim") {
    try {
      const result = await claimAutomationEvent(admin, auth, {
        eventType,
        idempotencyKey,
        metadata:
          body.metadata && typeof body.metadata === "object"
            ? body.metadata as Record<string, unknown>
            : {},
        leaseSeconds: Number(body.lease_seconds ?? 600),
      });
      return apiJsonResponse(result);
    } catch (error) {
      return apiJsonResponse(
        { error: error instanceof Error ? error.message : "Could not claim event." },
        400,
      );
    }
  }

  const rpcName =
    action === "complete"
      ? "complete_crm_automation_event"
      : "fail_crm_automation_event";
  const params =
    action === "complete"
      ? {
        p_tenant_id: auth.tenantId,
        p_event_type: eventType,
        p_idempotency_key: idempotencyKey,
        p_resource_type: normalizeIdempotencyValue(body.resource_type, 120) || null,
        p_resource_id: normalizeIdempotencyValue(body.resource_id) || null,
        p_result:
          body.result && typeof body.result === "object"
            ? body.result as Record<string, unknown>
            : {},
      }
      : {
        p_tenant_id: auth.tenantId,
        p_event_type: eventType,
        p_idempotency_key: idempotencyKey,
        p_result:
          body.result && typeof body.result === "object"
            ? body.result as Record<string, unknown>
            : {},
      };
  const { data, error } = await admin.rpc(rpcName, params);
  if (error) return apiJsonResponse({ error: error.message }, 400);
  return apiJsonResponse(data);
}

type QualificationClassification =
  | "QUALIFIED"
  | "PENDING_AUTHORIZATION"
  | "NOT_QUALIFIED"
  | "NEEDS_MORE_INFO";

type QualificationDecision = {
  classification: QualificationClassification;
  target_stage_key:
    | "QUALIFICADO"
    | "AUTORIZACAO_PENDENTE"
    | "NAO_QUALIFICADO"
    | "EM_QUALIFICACAO";
  reason_codes: string[];
  missing_fields: string[];
  facts: {
    benefit: string;
    pays_ir: string;
    health: string;
    contact_role: string;
    authorization: string;
  };
  qualification: number;
  star_count: number;
  next_step: string;
};

function evaluateQualificationFacts(
  rawFacts: Record<string, unknown>,
): QualificationDecision {
  const facts = {
    benefit: String(
      rawFacts.benefit ?? rawFacts["Benefício recebido"] ?? "",
    ).trim(),
    pays_ir: String(
      rawFacts.pays_ir ?? rawFacts["Desconto de Imposto de Renda"] ?? "",
    ).trim(),
    health: String(
      rawFacts.health ?? rawFacts["Condição grave informada"] ?? "",
    ).trim(),
    contact_role: String(
      rawFacts.contact_role ?? rawFacts["Papel do contato"] ?? "",
    ).trim(),
    authorization: String(
      rawFacts.authorization ?? rawFacts["Autorização do titular"] ?? "",
    ).trim(),
  };
  const benefit = normalizeCrmStageTitle(facts.benefit);
  const paysIr = normalizeCrmStageTitle(facts.pays_ir);
  const health = normalizeCrmStageTitle(facts.health);
  const contactRole = normalizeCrmStageTitle(facts.contact_role);
  const authorization = normalizeCrmStageTitle(facts.authorization);

  const benefitPositive = new Set([
    "APOSENTADORIA",
    "PENSAO",
    "MILITAR_REFORMADO_OU_RESERVA",
    "MILITAR_REFORMADO_OU_DA_RESERVA",
    "PREVIDENCIA_PRIVADA",
  ]);
  const benefitNegative = new Set(["NENHUMA_DAS_OPCOES", "NA_ATIVA"]);
  const irPositive = new Set(["SIM", "PAGOU_NOS_ULTIMOS_CINCO_ANOS"]);
  const irNegative = new Set(["NAO"]);
  const healthPositive = new Set([
    "SIM",
    "TEM_ATUALMENTE",
    "TEVE_OU_ESTA_CONTROLADA",
  ]);
  const healthNegative = new Set(["NAO"]);
  const familyContact = new Set(["FAMILIAR_RESPONSAVEL", "REPRESENTANTE"]);
  const authorizationPositive = new Set(["SABE_E_AUTORIZOU", "NAO_SE_APLICA"]);

  const reasonCodes: string[] = [];
  const missingFields: string[] = [];
  if (!benefit || ["NAO_SEI_INFORMAR", "NAO_INFORMADO"].includes(benefit)) {
    missingFields.push("benefit");
  }
  if (!paysIr || ["NAO_SEI", "NAO_INFORMADO"].includes(paysIr)) {
    missingFields.push("pays_ir");
  }
  if (!health || ["NAO_SEI", "NAO_INFORMADO"].includes(health)) {
    missingFields.push("health");
  }
  if (!contactRole) missingFields.push("contact_role");

  if (benefitNegative.has(benefit)) reasonCodes.push("BENEFIT_NOT_ELIGIBLE");
  if (irNegative.has(paysIr)) reasonCodes.push("NO_IR_PAID");
  if (healthNegative.has(health)) reasonCodes.push("NO_SERIOUS_HEALTH_CONDITION");

  if (reasonCodes.length > 0) {
    return {
      classification: "NOT_QUALIFIED",
      target_stage_key: "NAO_QUALIFICADO",
      reason_codes: reasonCodes,
      missing_fields: missingFields,
      facts,
      qualification: 0,
      star_count: 0,
      next_step: "Encerrar a triagem inicial sem promessa de elegibilidade",
    };
  }

  const needsAuthorization =
    familyContact.has(contactRole) && !authorizationPositive.has(authorization);
  if (needsAuthorization) {
    return {
      classification: "PENDING_AUTHORIZATION",
      target_stage_key: "AUTORIZACAO_PENDENTE",
      reason_codes: ["HOLDER_AUTHORIZATION_REQUIRED"],
      missing_fields: authorization ? missingFields : [...missingFields, "authorization"],
      facts,
      qualification: 3,
      star_count: 3,
      next_step: "Obter autorização adequada do titular antes de avançar",
    };
  }

  const allCriteriaConfirmed =
    benefitPositive.has(benefit) &&
    irPositive.has(paysIr) &&
    healthPositive.has(health) &&
    Boolean(contactRole);
  if (allCriteriaConfirmed) {
    return {
      classification: "QUALIFIED",
      target_stage_key: "QUALIFICADO",
      reason_codes: [
        "ELIGIBLE_BENEFIT_CONFIRMED",
        "IR_PAYMENT_CONFIRMED",
        "HEALTH_CONDITION_REPORTED",
        "CONTACT_AUTHORITY_CONFIRMED",
      ],
      missing_fields: [],
      facts,
      qualification: 5,
      star_count: 5,
      next_step: "Preparar análise especializada sem prometer aprovação",
    };
  }

  return {
    classification: "NEEDS_MORE_INFO",
    target_stage_key: "EM_QUALIFICACAO",
    reason_codes: ["CRITICAL_INFORMATION_MISSING"],
    missing_fields: [...new Set(missingFields)],
    facts,
    qualification: 2,
    star_count: 2,
    next_step: "Coletar somente o próximo dado crítico ainda não confirmado",
  };
}

async function loadCustomerCustomFieldMap(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  customerId: string,
) {
  const { data: fields, error: fieldsError } = await admin
    .from("customer_custom_fields")
    .select("id, nome")
    .eq("tenant_id", tenantId);
  if (fieldsError) throw fieldsError;
  const { data: values, error: valuesError } = await admin
    .from("customer_custom_field_values")
    .select("field_id, value_text, value_numeric, value_date")
    .eq("customer_id", customerId);
  if (valuesError) throw valuesError;
  const fieldsById = new Map(
    (fields ?? []).map((field) => [String(field.id), String(field.nome)]),
  );
  return Object.fromEntries(
    (values ?? []).flatMap((value) => {
      const name = fieldsById.get(String(value.field_id));
      if (!name) return [];
      return [[name, value.value_text ?? value.value_numeric ?? value.value_date ?? null]];
    }),
  );
}

async function saveDeterministicQualificationFields(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  customerId: string,
  decision: QualificationDecision,
) {
  const fieldNames = [
    "Status da qualificação inicial",
    "Temperatura do lead",
    "Próximo passo do atendimento",
  ];
  const { data: fields, error } = await admin
    .from("customer_custom_fields")
    .select("id, nome")
    .eq("tenant_id", tenantId)
    .in("nome", fieldNames);
  if (error) throw error;
  const statusByClassification: Record<QualificationClassification, string> = {
    QUALIFIED: "QUALIFIED_INITIAL",
    PENDING_AUTHORIZATION: "QUALIFIED_PENDING_AUTHORIZATION",
    NOT_QUALIFIED: "NOT_QUALIFIED",
    NEEDS_MORE_INFO: "NEEDS_REVIEW",
  };
  const temperatureByClassification: Record<QualificationClassification, string> = {
    QUALIFIED: "Quente",
    PENDING_AUTHORIZATION: "Morno com pendência",
    NOT_QUALIFIED: "Frio",
    NEEDS_MORE_INFO: "Morno com pendência",
  };
  const valueByName: Record<string, string> = {
    "Status da qualificação inicial":
      statusByClassification[decision.classification],
    "Temperatura do lead":
      temperatureByClassification[decision.classification],
    "Próximo passo do atendimento": decision.next_step,
  };
  const rows = (fields ?? []).map((field) => ({
    customer_id: customerId,
    field_id: field.id,
    value_text: valueByName[String(field.nome)],
    value_numeric: null,
    value_date: null,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;
  const { error: upsertError } = await admin
    .from("customer_custom_field_values")
    .upsert(rows, { onConflict: "customer_id,field_id" });
  if (upsertError) throw upsertError;
}

async function handleEvaluateQualification(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const dryRun = body.dry_run === true || body.apply === false;
  const override =
    dryRun && body.facts && typeof body.facts === "object"
      ? body.facts as Record<string, unknown>
      : null;
  const negotiationId = normalizeIdempotencyValue(body.negotiation_id, 100);
  const customerIdInput = normalizeIdempotencyValue(body.customer_id, 100);
  if (!override && !negotiationId) {
    return apiJsonResponse({ error: "negotiation_id is required." }, 400);
  }

  const admin = createAdminClient();
  let negotiation: Record<string, unknown> | null = null;
  let customerId = customerIdInput;
  let facts: Record<string, unknown>;
  if (override) {
    facts = override;
  } else {
    const { data, error } = await admin
      .from("crm_negotiations")
      .select("*")
      .eq("tenant_id", auth.tenantId)
      .eq("id", negotiationId)
      .maybeSingle();
    if (error) return apiJsonResponse({ error: error.message }, 500);
    if (!data) return apiJsonResponse({ error: "Negotiation not found." }, 404);
    negotiation = data;
    customerId = customerId || String(data.customer_id ?? "");
    if (!customerId) {
      return apiJsonResponse({ error: "Negotiation has no customer." }, 400);
    }
    try {
      facts = await loadCustomerCustomFieldMap(admin, auth.tenantId, customerId);
    } catch (error) {
      return apiJsonResponse(
        { error: error instanceof Error ? error.message : "Could not load lead facts." },
        500,
      );
    }
  }

  const decision = evaluateQualificationFacts(facts);
  if (dryRun || !negotiation) {
    return apiJsonResponse({ ok: true, dry_run: true, applied: false, decision });
  }

  const currentStageKey = normalizeCrmStageTitle(
    (await loadCrmStateContext(
      admin,
      auth.tenantId,
      String(negotiation.funnel_id),
      String(negotiation.stage_id),
    )).current_stage?.title,
  );
  const terminalStages = new Set(["CONTRATADO", "NAO_QUALIFICADO", "PERDIDO"]);
  const advancedStages = new Set([
    "QUALIFICADO",
    "ANALISE_HUMANA",
    "DOCUMENTACAO_PENDENTE",
    "PROPOSTA_E_CONTRATACAO",
    "CONTRATADO",
  ]);
  const preserveAdvanced =
    terminalStages.has(currentStageKey) ||
    (advancedStages.has(currentStageKey) &&
      decision.classification !== "NOT_QUALIFIED");

  const stages = await loadCrmFunnelStages(
    admin,
    auth.tenantId,
    String(negotiation.funnel_id),
  );
  const targetStage =
    stages.find(
      (stage) =>
        normalizeCrmStageTitle(stage.title) === decision.target_stage_key,
    ) ?? null;
  if (!targetStage) {
    return apiJsonResponse({ error: "Decision target stage not found." }, 500);
  }

  const idempotencyKey = normalizeIdempotencyValue(body.idempotency_key);
  const eventType =
    normalizeIdempotencyValue(body.event_type, 120) ||
    "deterministic_qualification_applied";
  if (idempotencyKey) {
    const claim = await claimAutomationEvent(admin, auth, {
      eventType,
      idempotencyKey,
      metadata: { negotiation_id: negotiationId, decision: decision.classification },
    });
    if (claim.deduplicated === true) {
      return apiJsonResponse({
        ok: true,
        deduplicated: true,
        applied: false,
        decision,
        idempotency: claim,
      });
    }
  }

  try {
    await saveDeterministicQualificationFields(
      admin,
      auth.tenantId,
      customerId,
      decision,
    );
  } catch (error) {
    return apiJsonResponse(
      {
        error: error instanceof Error
          ? error.message
          : "Could not save deterministic qualification fields.",
      },
      400,
    );
  }

  let updatedNegotiation = negotiation;
  const shouldMove =
    !preserveAdvanced && String(negotiation.stage_id) !== targetStage.id;
  if (shouldMove) {
    const now = new Date();
    const nextTaskAt =
      decision.classification === "PENDING_AUTHORIZATION"
        ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
        : decision.classification === "QUALIFIED"
          ? new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
          : negotiation.next_task_at;
    const { data, error } = await admin
      .from("crm_negotiations")
      .update({
        stage_id: targetStage.id,
        qualification: decision.qualification,
        star_count: decision.star_count,
        next_task_at: nextTaskAt,
        other_info: {
          ...(negotiation.other_info && typeof negotiation.other_info === "object"
            ? negotiation.other_info
            : {}),
          last_qualification_decision: {
            classification: decision.classification,
            reason_codes: decision.reason_codes,
            missing_fields: decision.missing_fields,
            decided_by: "caleo_deterministic_rules",
            occurred_at: now.toISOString(),
          },
          last_automated_transition: {
            from_stage_id: String(negotiation.stage_id),
            to_stage_id: targetStage.id,
            event: "deterministic_qualification",
            reason: decision.reason_codes.join(","),
            occurred_at: now.toISOString(),
          },
        },
      })
      .eq("tenant_id", auth.tenantId)
      .eq("id", negotiationId)
      .select("*")
      .single();
    if (error) return apiJsonResponse({ error: error.message }, 400);
    updatedNegotiation = data;
  }

  const result = {
    negotiation_id: negotiationId,
    stage_id: updatedNegotiation.stage_id,
    classification: decision.classification,
    applied: shouldMove,
    preserved_advanced_state: preserveAdvanced,
  };
  if (idempotencyKey) {
    await completeAutomationEvent(admin, auth, {
      eventType,
      idempotencyKey,
      resourceType: "crm_negotiation",
      resourceId: negotiationId,
      result,
    });
  }

  return apiJsonResponse({
    ok: true,
    deduplicated: false,
    applied: shouldMove,
    preserved_advanced_state: preserveAdvanced,
    decision,
    negotiation: updatedNegotiation,
  });
}

function handoffText(value: unknown, fallback = "Não informado"): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function handoffField(
  fields: Record<string, unknown>,
  name: string,
  fallback = "Não informado",
): string {
  return handoffText(fields[name], fallback);
}

async function handleCreateHumanHandoff(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const negotiationId = normalizeIdempotencyValue(body.negotiation_id, 100);
  const idempotencyKey = normalizeIdempotencyValue(body.idempotency_key);
  const eventType =
    normalizeIdempotencyValue(body.event_type, 120) || "human_handoff_created";
  const reason = handoffText(body.reason, "Análise humana solicitada");
  const requestedAssigneeId = normalizeIdempotencyValue(body.assignee_id, 100);
  const sourceMessageId = normalizeIdempotencyValue(body.source_message_id, 160);
  const requestedDueHours = Number(body.due_hours ?? 2);
  const dueHours = Number.isFinite(requestedDueHours)
    ? Math.min(168, Math.max(0.25, requestedDueHours))
    : 2;
  if (!negotiationId || !idempotencyKey) {
    return apiJsonResponse(
      { error: "negotiation_id and idempotency_key are required." },
      400,
    );
  }

  const admin = createAdminClient();
  const { data: negotiation, error: negotiationError } = await admin
    .from("crm_negotiations")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("id", negotiationId)
    .maybeSingle();
  if (negotiationError) {
    return apiJsonResponse({ error: negotiationError.message }, 500);
  }
  if (!negotiation) {
    return apiJsonResponse({ error: "Negotiation not found." }, 404);
  }
  const customerId = String(negotiation.customer_id ?? "").trim();
  if (!customerId) {
    return apiJsonResponse({ error: "Negotiation has no customer." }, 400);
  }

  const state = await loadCrmStateContext(
    admin,
    auth.tenantId,
    String(negotiation.funnel_id),
    String(negotiation.stage_id),
  );
  const currentStageKey = normalizeCrmStageTitle(state.current_stage?.title);
  if (state.terminal) {
    return apiJsonResponse(
      {
        error: "Human handoff is blocked for terminal negotiations.",
        code: "CRM_TERMINAL_HANDOFF_BLOCKED",
        current_stage: state.current_stage,
      },
      409,
    );
  }
  const stages = await loadCrmFunnelStages(
    admin,
    auth.tenantId,
    String(negotiation.funnel_id),
  );
  const humanStage =
    stages.find(
      (stage) => normalizeCrmStageTitle(stage.title) === "ANALISE_HUMANA",
    ) ?? null;
  if (!humanStage) {
    return apiJsonResponse({ error: "Human review stage not found." }, 500);
  }
  const alreadyInHumanReview = currentStageKey === "ANALISE_HUMANA";
  const canMoveToHumanReview =
    alreadyInHumanReview ||
    state.allowed_next_stages.some((stage) => stage.id === humanStage.id);
  if (!canMoveToHumanReview) {
    return apiJsonResponse(
      {
        error: "Human handoff is blocked by the CRM state machine.",
        code: "CRM_HUMAN_HANDOFF_BLOCKED",
        current_stage: state.current_stage,
        allowed_next_stages: state.allowed_next_stages,
      },
      409,
    );
  }

  let claim: Record<string, unknown>;
  try {
    claim = await claimAutomationEvent(admin, auth, {
      eventType,
      idempotencyKey,
      metadata: {
        negotiation_id: negotiationId,
        customer_id: customerId,
        reason,
        source_message_id: sourceMessageId || null,
      },
    });
  } catch (error) {
    return apiJsonResponse(
      { error: error instanceof Error ? error.message : "Idempotency claim failed." },
      400,
    );
  }
  if (claim.deduplicated === true) {
    return apiJsonResponse({
      ok: true,
      deduplicated: true,
      created: false,
      idempotency: claim,
    });
  }

  try {
    const { data: customer, error: customerError } = await admin
      .from("customers")
      .select("id, nome, telefone, email")
      .eq("tenant_id", auth.tenantId)
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) throw new Error("Customer not found.");

    const customFields = await loadCustomerCustomFieldMap(
      admin,
      auth.tenantId,
      customerId,
    );
    const qualification = evaluateQualificationFacts(customFields);

    const sourceChatId = String(negotiation.source_chat_id ?? "").trim();
    let chat: Record<string, unknown> | null = null;
    if (sourceChatId) {
      const { data, error } = await admin
        .from("whatsapp_chats")
        .select(
          "id, assignee_id, ai_mode, status, last_message_preview, ai_conversation_summary",
        )
        .eq("tenant_id", auth.tenantId)
        .eq("id", sourceChatId)
        .maybeSingle();
      if (error) throw error;
      chat = data;
    }

    const { data: messages, error: messagesError } = sourceChatId
      ? await admin
        .from("whatsapp_messages")
        .select("id, direction, message_type, body_text, created_at")
        .eq("tenant_id", auth.tenantId)
        .eq("chat_id", sourceChatId)
        .order("created_at", { ascending: false })
        .limit(12)
      : { data: [], error: null };
    if (messagesError) throw messagesError;
    const orderedMessages = [...(messages ?? [])].reverse();
    const recentConversation = orderedMessages
      .map((message) => {
        const bodyText = handoffText(message.body_text, "");
        if (!bodyText) return "";
        const speaker = message.direction === "inbound" ? "Lead" : "Davi";
        return `${speaker}: ${bodyText.slice(0, 500)}`;
      })
      .filter(Boolean);
    const lastInbound =
      [...(messages ?? [])].find((message) => message.direction === "inbound") ??
      null;
    const lastLeadMessage = handoffText(
      lastInbound?.body_text ?? chat?.last_message_preview,
      "Sem mensagem textual disponível",
    );
    const rollingSummary = handoffText(chat?.ai_conversation_summary, "");
    const conversationSummary = rollingSummary ||
      (recentConversation.length > 0
        ? recentConversation.join("\n")
        : "Sem histórico textual disponível.");

    const { data: documents, error: documentsError } = await admin
      .from("crm_negotiation_documents")
      .select("id, display_name, file_name, mime_type, file_size, created_at")
      .eq("tenant_id", auth.tenantId)
      .eq("negotiation_id", negotiationId)
      .order("created_at", { ascending: false });
    if (documentsError) throw documentsError;
    const documentSummary = (documents ?? []).length > 0
      ? (documents ?? [])
        .map((document) =>
          `${handoffText(document.display_name ?? document.file_name)} (${handoffText(document.mime_type)})`
        )
        .join("; ")
      : "Nenhum documento anexado";

    const rolePriority: Record<string, number> = {
      atendimento: 0,
      operacao: 1,
      admin: 2,
      financeiro: 3,
    };
    const candidateAssigneeId =
      requestedAssigneeId ||
      String(negotiation.assignee_id ?? "").trim() ||
      String(chat?.assignee_id ?? "").trim();
    let assignee: Record<string, unknown> | null = null;
    if (candidateAssigneeId) {
      const { data, error } = await admin
        .from("profiles")
        .select("id, nome, email, role, status")
        .eq("tenant_id", auth.tenantId)
        .eq("id", candidateAssigneeId)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      assignee = data;
      if (requestedAssigneeId && !assignee) {
        throw new Error("Requested assignee is not active in this tenant.");
      }
    }
    if (!assignee) {
      const { data: collaborators, error } = await admin
        .from("profiles")
        .select("id, nome, email, role, status")
        .eq("tenant_id", auth.tenantId)
        .eq("status", "active");
      if (error) throw error;
      assignee = [...(collaborators ?? [])].sort(
        (left, right) =>
          (rolePriority[String(left.role)] ?? 99) -
          (rolePriority[String(right.role)] ?? 99),
      )[0] ?? null;
    }
    const assigneeId = assignee ? String(assignee.id) : null;
    const assigneeLabel = assignee
      ? handoffText(assignee.nome ?? assignee.email, "Responsável definido")
      : "Fila de atendimento";

    const confirmedCriteria = [
      `Benefício: ${handoffField(customFields, "Benefício recebido")}`,
      `IR: ${handoffField(customFields, "Desconto de Imposto de Renda")}`,
      `Saúde: ${handoffField(customFields, "Condição grave informada")}`,
      `Doença/condição: ${handoffField(customFields, "Doença ou condição informada")}`,
      `Contato: ${handoffField(customFields, "Papel do contato")}`,
      `Autorização: ${handoffField(customFields, "Autorização do titular")}`,
    ].join(" | ");
    const missingLabels: Record<string, string> = {
      benefit: "benefício recebido",
      pays_ir: "situação do Imposto de Renda",
      health: "condição de saúde",
      contact_role: "papel do contato",
      authorization: "autorização do titular",
    };
    const pendingItems = qualification.missing_fields.map(
      (field) => missingLabels[field] ?? field,
    );
    if (
      qualification.classification === "PENDING_AUTHORIZATION" &&
      !pendingItems.includes("autorização do titular")
    ) {
      pendingItems.push("autorização do titular");
    }
    const pendingSummary = pendingItems.length > 0
      ? pendingItems.join(", ")
      : "Nenhuma pendência crítica identificada pelas regras";
    const nextAction = handoffText(
      body.next_action,
      qualification.classification === "QUALIFIED"
        ? "Revisar critérios e documentos e definir a orientação especializada"
        : qualification.next_step,
    );
    const occurredAt = new Date().toISOString();
    const dueAt = new Date(
      Date.now() + dueHours * 60 * 60 * 1000,
    ).toISOString();
    const handoffSummary = [
      `Contato: ${handoffText(customer.nome)} | ${handoffText(customer.telefone)} | ${handoffText(customer.email)}`,
      `Titular: ${handoffField(customFields, "Nome do titular do direito")}`,
      `Motivo do handoff: ${reason}`,
      `Classificação: ${qualification.classification}`,
      `Critérios: ${confirmedCriteria}`,
      `Pendências: ${pendingSummary}`,
      `Documentos: ${documentSummary}`,
      `Última mensagem do lead: ${lastLeadMessage}`,
      `Próxima ação recomendada: ${nextAction}`,
      `Responsável: ${assigneeLabel}`,
      "",
      "Resumo da conversa:",
      conversationSummary.slice(0, 6000),
    ].join("\n");

    const previousOtherInfo =
      negotiation.other_info && typeof negotiation.other_info === "object"
        ? negotiation.other_info
        : {};
    const handoffOtherInfo: Record<string, unknown> = {
      ...previousOtherInfo,
      "Handoff - resumo": conversationSummary.slice(0, 2000),
      "Handoff - critérios confirmados": confirmedCriteria,
      "Handoff - documentos": documentSummary,
      "Handoff - pendências": pendingSummary,
      "Handoff - última mensagem": lastLeadMessage.slice(0, 1000),
      "Handoff - próxima ação": nextAction,
      "Handoff - motivo": reason,
      "Handoff - responsável": assigneeLabel,
      "Handoff - prazo": dueAt,
      "Handoff - criado em": occurredAt,
      human_handoff: {
        reason,
        classification: qualification.classification,
        reason_codes: qualification.reason_codes,
        missing_fields: qualification.missing_fields,
        document_ids: (documents ?? []).map((document) => document.id),
        last_inbound_message_id: lastInbound?.id ?? null,
        source_message_id: sourceMessageId || null,
        assignee_id: assigneeId,
        due_at: dueAt,
        occurred_at: occurredAt,
      },
      ...(!alreadyInHumanReview
        ? {
          last_automated_transition: {
            from_stage_id: String(negotiation.stage_id),
            to_stage_id: humanStage.id,
            event: "human_handoff",
            reason,
            occurred_at: occurredAt,
          },
        }
        : {}),
    };

    const { data: nextStepFields, error: fieldsError } = await admin
      .from("customer_custom_fields")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("nome", "Próximo passo do atendimento");
    if (fieldsError) throw fieldsError;
    if ((nextStepFields ?? []).length > 0) {
      const { error: nextStepError } = await admin
        .from("customer_custom_field_values")
        .upsert(
          (nextStepFields ?? []).map((field) => ({
            customer_id: customerId,
            field_id: field.id,
            value_text: nextAction,
            value_numeric: null,
            value_date: null,
            updated_at: occurredAt,
          })),
          { onConflict: "customer_id,field_id" },
        );
      if (nextStepError) throw nextStepError;
    }

    const { data: transactionData, error: transactionError } = await admin.rpc(
      "create_crm_human_handoff",
      {
        p_tenant_id: auth.tenantId,
        p_negotiation_id: negotiationId,
        p_customer_id: customerId,
        p_chat_id: sourceChatId || null,
        p_assignee_id: assigneeId,
        p_stage_id: humanStage.id,
        p_due_at: dueAt,
        p_task_title: "Realizar análise humana",
        p_task_notes: handoffSummary,
        p_template_id: "240dd77a-7abf-4e1c-b3ef-a0ab7c4ef870",
        p_other_info: handoffOtherInfo,
      },
    );
    if (transactionError) throw transactionError;
    const transaction =
      transactionData && typeof transactionData === "object"
        ? transactionData as Record<string, unknown>
        : {};
    const task =
      transaction.task && typeof transaction.task === "object"
        ? transaction.task as Record<string, unknown>
        : null;
    const updatedNegotiation =
      transaction.negotiation && typeof transaction.negotiation === "object"
        ? transaction.negotiation as Record<string, unknown>
        : null;
    if (!task?.id || !updatedNegotiation?.id) {
      throw new Error("Human handoff transaction returned an incomplete result.");
    }

    const result = {
      handoff_created: true,
      negotiation_id: negotiationId,
      task_id: task.id,
      stage_id: updatedNegotiation.stage_id,
      chat_id: sourceChatId || null,
      ai_mode: sourceChatId ? "off" : null,
      assignee_id: assigneeId,
      assignee_name: assigneeLabel,
      due_at: dueAt,
      classification: qualification.classification,
      pending_items: pendingItems,
      documents_count: (documents ?? []).length,
    };
    await completeAutomationEvent(admin, auth, {
      eventType,
      idempotencyKey,
      resourceType: "crm_task",
      resourceId: String(task.id),
      result,
    });

    return apiJsonResponse({
      ok: true,
      deduplicated: false,
      created: true,
      result,
      dossier: {
        reason,
        conversation_summary: conversationSummary,
        confirmed_criteria: confirmedCriteria,
        documents: documents ?? [],
        pending_items: pendingItems,
        last_lead_message: lastLeadMessage,
        next_action: nextAction,
      },
      task,
      negotiation: updatedNegotiation,
    }, 201);
  } catch (error) {
    await failAutomationEvent(admin, auth, {
      eventType,
      idempotencyKey,
      result: {
        negotiation_id: negotiationId,
        error: error instanceof Error ? error.message : "Human handoff failed.",
      },
    });
    return apiJsonResponse(
      { error: error instanceof Error ? error.message : "Human handoff failed." },
      400,
    );
  }
}

async function handleHealth(auth: ApiKeyAuth | null) {
  return apiJsonResponse({
    ok: true,
    service: "wchat-api",
    version: "v1",
    authenticated: Boolean(auth),
    tenant_id: auth?.tenantId ?? null,
  });
}

async function handleMe(auth: ApiKeyAuth) {
  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, nome")
    .eq("id", auth.tenantId)
    .maybeSingle();

  return apiJsonResponse({
    tenant: tenant ? { id: tenant.id, nome: tenant.nome } : { id: auth.tenantId },
    api_key: { id: auth.keyId, name: auth.name, scopes: auth.scopes },
  });
}

async function handleListChats(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "read");
  if (denied) return denied;

  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const status = url.searchParams.get("status");
  const admin = createAdminClient();

  let q = admin
    .from("whatsapp_chats")
    .select(
      "id, instance_id, customer_id, remote_jid, display_name, status, resolution, assignee_id, unread_count, last_message_preview, last_message_at, primary_negotiation_id, ai_mode, created_at, updated_at",
    )
    .eq("tenant_id", auth.tenantId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (status) {
    q = q.eq("status", status);
  }

  const { data, error } = await q;
  if (error) {
    return apiJsonResponse({ error: error.message }, 500);
  }

  return apiJsonResponse({ data: data ?? [] });
}

async function handleCrmSla(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "read");
  if (denied) return denied;

  const admin = createAdminClient();
  const now = new Date();
  const atRiskUntil = new Date(now.getTime() + 15 * 60 * 1000);

  const { data: settings, error: settingsError } = await admin
    .from("tenant_settings")
    .select("sla_first_response_minutes")
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();
  if (settingsError) return apiJsonResponse({ error: settingsError.message }, 500);

  const { data: chats, error: chatsError } = await admin
    .from("whatsapp_chats")
    .select(
      "id, customer_id, primary_negotiation_id, display_name, remote_jid, first_inbound_at, first_response_at, sla_first_response_due_at, status, assignee_id",
    )
    .eq("tenant_id", auth.tenantId)
    .eq("status", "open")
    .not("first_inbound_at", "is", null)
    .is("first_response_at", null)
    .not("sla_first_response_due_at", "is", null)
    .order("sla_first_response_due_at", { ascending: true });
  if (chatsError) return apiJsonResponse({ error: chatsError.message }, 500);

  const candidates = (chats ?? []).filter((chat) => {
    const dueAt = new Date(String(chat.sla_first_response_due_at));
    return !Number.isNaN(dueAt.valueOf()) && dueAt <= atRiskUntil;
  });
  const negotiationIds = [...new Set(
    candidates
      .map((chat) => String(chat.primary_negotiation_id ?? "").trim())
      .filter(Boolean),
  )];
  let negotiations: Array<Record<string, unknown>> = [];
  if (negotiationIds.length > 0) {
    const { data, error } = await admin
      .from("crm_negotiations")
      .select("id, customer_id, status, stage_id, next_task_at, priority")
      .eq("tenant_id", auth.tenantId)
      .in("id", negotiationIds);
    if (error) return apiJsonResponse({ error: error.message }, 500);
    negotiations = (data ?? []) as Array<Record<string, unknown>>;
  }
  const negotiationById = new Map(
    negotiations.map((negotiation) => [String(negotiation.id), negotiation]),
  );
  const details = candidates.map((chat) => {
    const dueAt = new Date(String(chat.sla_first_response_due_at));
    const negotiation = negotiationById.get(String(chat.primary_negotiation_id ?? "")) ?? null;
    return {
      ...chat,
      negotiation,
      breached: dueAt < now,
      minutes_overdue: dueAt < now
        ? Math.max(1, Math.floor((now.getTime() - dueAt.getTime()) / 60000))
        : 0,
    };
  });

  return apiJsonResponse({
    generated_at: now.toISOString(),
    sla_first_response_minutes: Number(settings?.sla_first_response_minutes ?? 15),
    summary: {
      awaiting_first_response: (chats ?? []).length,
      at_risk: details.filter((chat) => !chat.breached).length,
      breached: details.filter((chat) => chat.breached).length,
    },
    breached_chats: details.filter((chat) => chat.breached),
    at_risk_chats: details.filter((chat) => !chat.breached),
  });
}

async function handleCrmDashboard(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "read");
  if (denied) return denied;

  const url = new URL(request.url);
  const funnelId = String(url.searchParams.get("funnel_id") ?? "sdr-recupereibr").trim();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const admin = createAdminClient();

  const [negotiationsResult, tasksResult, eventsResult] = await Promise.all([
    admin
      .from("crm_negotiations")
      .select("id, stage_id, status, qualification, priority, created_at, updated_at, next_task_at, other_info")
      .eq("tenant_id", auth.tenantId)
      .eq("funnel_id", funnelId)
      .limit(1000),
    admin
      .from("crm_tasks")
      .select("id, negotiation_id, customer_id, title, status, due_at, created_at")
      .eq("tenant_id", auth.tenantId)
      .eq("status", "aberta")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(1000),
    admin
      .from("crm_automation_events")
      .select("event_type, status, attempts, created_at, updated_at, result")
      .eq("tenant_id", auth.tenantId)
      .gte("updated_at", dayAgo.toISOString())
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);
  if (negotiationsResult.error) return apiJsonResponse({ error: negotiationsResult.error.message }, 500);
  if (tasksResult.error) return apiJsonResponse({ error: tasksResult.error.message }, 500);
  if (eventsResult.error) return apiJsonResponse({ error: eventsResult.error.message }, 500);

  const negotiations = negotiationsResult.data ?? [];
  const tasks = tasksResult.data ?? [];
  const events = eventsResult.data ?? [];
  const stages = await loadCrmFunnelStages(admin, auth.tenantId, funnelId);
  const stageById = new Map(stages.map((stage) => [stage.id, stage.title]));
  const stageCounts = stages.map((stage) => ({
    id: stage.id,
    title: stage.title,
    count: negotiations.filter((negotiation) => negotiation.stage_id === stage.id).length,
  }));
  const sourceCounts = new Map<string, number>();
  for (const negotiation of negotiations) {
    const info = negotiation.other_info && typeof negotiation.other_info === "object"
      ? negotiation.other_info as Record<string, unknown>
      : {};
    const source = String(info.source ?? info.origem ?? "não informado").trim() || "não informado";
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  }
  const overdueTasks = tasks.filter((task) => task.due_at && new Date(task.due_at) < now);
  const dueNextDay = tasks.filter((task) => {
    if (!task.due_at) return false;
    const due = new Date(task.due_at);
    return due >= now && due <= nextDay;
  });
  const failedEvents = events.filter((event) => event.status === "failed");
  const processingEvents = events.filter((event) => event.status === "processing");

  return apiJsonResponse({
    generated_at: now.toISOString(),
    funnel_id: funnelId,
    pipeline: {
      total: negotiations.length,
      open: negotiations.filter((negotiation) => negotiation.status === "em_andamento").length,
      high_priority: negotiations.filter((negotiation) => String(negotiation.priority ?? "").toUpperCase() === "HIGH").length,
      qualified: negotiations.filter((negotiation) => Number(negotiation.qualification ?? 0) >= 4).length,
      stages: stageCounts,
      sources: [...sourceCounts.entries()].map(([source, count]) => ({ source, count })),
    },
    tasks: {
      open: tasks.length,
      overdue: overdueTasks.length,
      due_next_24h: dueNextDay.length,
      overdue_items: overdueTasks.slice(0, 50).map((task) => ({
        ...task,
        stage: negotiations.find((negotiation) => negotiation.id === task.negotiation_id)
          ? stageById.get(negotiations.find((negotiation) => negotiation.id === task.negotiation_id)?.stage_id ?? "") ?? null
          : null,
      })),
    },
    automation: {
      events_last_24h: events.length,
      failed_last_24h: failedEvents.length,
      processing_last_24h: processingEvents.length,
      failed_items: failedEvents.slice(0, 50),
    },
  });
}

async function handleGetChat(auth: ApiKeyAuth, chatId: string) {
  const denied = requireScope(auth, "read");
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_chats")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("id", chatId)
    .maybeSingle();

  if (error) {
    return apiJsonResponse({ error: error.message }, 500);
  }
  if (!data) {
    return apiJsonResponse({ error: "Chat not found." }, 404);
  }

  return apiJsonResponse({ data });
}

async function handleTransferChat(auth: ApiKeyAuth, chatId: string, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const admin = createAdminClient();
  const assigneeId = body.assignee_id != null ? String(body.assignee_id).trim() : null;
  const status = body.status != null ? String(body.status).trim() : "open";
  const aiMode = body.ai_mode != null ? String(body.ai_mode).trim() : "off";

  if (assigneeId) {
    const { data: assignee } = await admin
      .from("profiles")
      .select("id")
      .eq("id", assigneeId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();
    if (!assignee) {
      return apiJsonResponse({ error: "assignee_id not found in this tenant." }, 400);
    }
  }

  const patch: Record<string, unknown> = {
    assignee_id: assigneeId,
    status,
    ai_mode: aiMode,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("whatsapp_chats")
    .update(patch)
    .eq("tenant_id", auth.tenantId)
    .eq("id", chatId)
    .select("*")
    .maybeSingle();

  if (error) {
    return apiJsonResponse({ error: error.message }, 400);
  }
  if (!data) {
    return apiJsonResponse({ error: "Chat not found." }, 404);
  }

  return apiJsonResponse({ ok: true, data });
}

async function handleSendMessage(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const text = String(body.text ?? body.body_text ?? body.caption ?? "").trim();
  const rawChatId = body.chat_id != null ? String(body.chat_id).replace(/^=/, "").trim() : "";
  const chatId = rawChatId !== "undefined" && rawChatId !== "null" ? rawChatId : "";
  const phone = body.phone != null ? String(body.phone).replace(/^=/, "").trim() : "";
  const remoteJidInput = body.remote_jid != null ? String(body.remote_jid).replace(/^=/, "").trim() : "";
  const messageType = String(body.message_type ?? body.type ?? "text").toLowerCase();
  const mediaUrl = body.media_url != null ? String(body.media_url) : (body.mediaUrl != null ? String(body.mediaUrl) : null);
  const fileName = body.file_name != null ? String(body.file_name) : (body.fileName != null ? String(body.fileName) : null);

  if (messageType === "text" && !text) {
    return apiJsonResponse({ error: "text is required for text messages." }, 400);
  }
  if (messageType !== "text" && !mediaUrl) {
    return apiJsonResponse({ error: "media_url is required for non-text messages." }, 400);
  }

  const admin = createAdminClient();
  const idempotencyKey = normalizeIdempotencyValue(body.idempotency_key);
  const idempotencyEventType =
    normalizeIdempotencyValue(body.event_type, 120) || "whatsapp_message_sent";
  let idempotency: Record<string, unknown> | null = null;
  if (idempotencyKey) {
    try {
      idempotency = await claimAutomationEvent(admin, auth, {
        eventType: idempotencyEventType,
        idempotencyKey,
        metadata: {
          chat_id: chatId,
          phone,
          remote_jid: remoteJidInput,
          message_type: messageType,
        },
      });
    } catch (error) {
      return apiJsonResponse(
        { error: error instanceof Error ? error.message : "Idempotency claim failed." },
        400,
      );
    }
    if (idempotency.deduplicated === true) {
      return apiJsonResponse({ ok: true, deduplicated: true, idempotency });
    }
  }

  let chat: Record<string, unknown> | null = null;
  let instanceId = body.instance_id != null ? String(body.instance_id) : "";

  if (chatId) {
    const { data } = await admin
      .from("whatsapp_chats")
      .select("*")
      .eq("tenant_id", auth.tenantId)
      .eq("id", chatId)
      .maybeSingle();
    if (data) {
      chat = data as Record<string, unknown>;
      instanceId = String(chat.instance_id);
    }
  }

  const phoneDigits = phone ? phone.replace(/\D/g, "") : "";
  const remoteJid = remoteJidInput ||
    (chat ? String(chat.remote_jid) : "") ||
    (phoneDigits ? phoneToRemoteJid(phoneDigits) : "");

  if (!remoteJid) {
    return apiJsonResponse({ error: "Chat not found. Provide a valid chat_id, phone, or remote_jid." }, 404);
  }

  const instance = await resolveWhatsappInstance(admin, auth.tenantId, instanceId || null);

  const apiKey = await decryptSecret(instance.encrypted_apikey);
  const config = {
    instanceName: instance.uazapi_instance_name,
    baseUrl: instance.uazapi_base_url,
    apiKey,
  };

  const ensuredChat = chat ??
    (await ensureChat(admin, instance, {
      remoteJid,
      displayName: "Cliente",
      lastMessagePreview: (text || fileName || mediaUrl || "Mídia").slice(0, 200),
      lastMessageAt: new Date().toISOString(),
    }));

  const response = await sendMessageViaUazapi(config, {
    messageType: messageType as "text" | "image" | "document" | "audio" | "video" | "mimetype",
    remoteJid,
    bodyText: text,
    mediaUrl: mediaUrl || undefined,
    fileName: fileName || undefined,
    payload: {},
  });

  const rawProviderId = response.key?.id ?? response.data?.key?.id ?? response.id;
  const uazapiMessageId = normalizeUazapiMessageId(
    typeof rawProviderId === "string" ? rawProviderId : null,
  ) || null;

  const previewText = text || fileName || mediaUrl || "Mídia";
  const message = await insertOrDedupeOutboundMessage(admin, instance, String(ensuredChat.id), {
    uazapiMessageId,
    direction: "outbound",
    messageType: messageType || "text",
    status: "sent",
    bodyText: previewText,
    mediaUrl: mediaUrl || null,
    payloadJson: { source: "wchat-api", file_name: fileName },
    rawEvent: response,
    sentAt: new Date().toISOString(),
    actorType: "system",
  });

  await admin
    .from("whatsapp_chats")
    .update({
      last_message_preview: previewText.slice(0, 200),
      last_message_at: new Date().toISOString(),
    })
    .eq("id", ensuredChat.id);

  if (idempotencyKey) {
    await completeAutomationEvent(admin, auth, {
      eventType: idempotencyEventType,
      idempotencyKey,
      resourceType: "whatsapp_message",
      resourceId: String(message.id),
      result: {
        chat_id: ensuredChat.id,
        message_id: message.id,
        remote_jid: remoteJid,
        message_type: messageType,
      },
    });
  }

  return apiJsonResponse({
    ok: true,
    deduplicated: false,
    chat_id: ensuredChat.id,
    message_id: message.id,
    remote_jid: remoteJid,
    message_type: messageType,
  });
}

async function handleListCustomers(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "read");
  if (denied) return denied;

  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const q = url.searchParams.get("q")?.trim();
  const admin = createAdminClient();

  let query = admin
    .from("customers")
    .select(
      "id, codigo, nome, telefone, celular, email, phone_e164, phone_digits, phone_jid, status, perfil, rota, cidade, canal, ativo, source_columns, cadastrado_em, updated_at",
    )
    .eq("tenant_id", auth.tenantId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (q) {
    const orFilter = buildIlikeOrFilter(q, ["nome", "telefone", "email"]);
    if (orFilter) query = query.or(orFilter);
  }

  const { data, error } = await query;
  if (error) {
    return apiJsonResponse({ error: error.message }, 500);
  }

  return apiJsonResponse({ data: data ?? [] });
}

async function handleGetCustomer(auth: ApiKeyAuth, customerId: string) {
  const denied = requireScope(auth, "read");
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("id", customerId)
    .maybeSingle();

  if (error) {
    return apiJsonResponse({ error: error.message }, 500);
  }
  if (!data) {
    return apiJsonResponse({ error: "Customer not found." }, 404);
  }

  return apiJsonResponse({ data });
}

async function handleCreateCustomer(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const nome = String(body.nome ?? body.name ?? "").trim();
  if (!nome) {
    return apiJsonResponse({ error: "nome is required." }, 400);
  }

  const telefone = String(body.telefone ?? body.phone ?? "").trim();
  const admin = createAdminClient();
  const digits = telefone.replace(/\D/g, "");
  const customFields = body.custom_fields && typeof body.custom_fields === "object" ? body.custom_fields : {};
  const requestedOrigin = String(body.origem ?? "").trim();
  const nativeOrigin = ["organico", "pago"].includes(requestedOrigin)
    ? requestedOrigin
    : "organico";

  const row: Record<string, unknown> = {
    tenant_id: auth.tenantId,
    codigo: String(body.codigo ?? `API-${digits.slice(-8) || crypto.randomUUID().slice(0, 8)}`),
    nome,
    telefone: telefone || "",
    celular: telefone || "",
    email: String(body.email ?? ""),
    origem: nativeOrigin,
    perfil: String(body.perfil ?? "B"),
    rota: String(body.rota ?? ""),
    cidade: String(body.cidade ?? ""),
    status: "ativo",
    canal: String(body.canal ?? "api"),
    ativo: true,
    cadastrado_em: new Date().toISOString(),
    source_columns: { source: "wchat-api", ...customFields },
  };

  if (digits) {
    const e164 = digits.startsWith("55") ? `+${digits}` : `+55${digits.replace(/^0+/, "")}`;
    row.phone_digits = digits.startsWith("55") ? digits : `55${digits}`;
    row.phone_e164 = e164;
    row.phone_jid = `${row.phone_digits}@s.whatsapp.net`;
  }

  const { data, error } = await admin.from("customers").insert(row).select("*").single();
  if (error) {
    return apiJsonResponse({ error: error.message }, 400);
  }

  return apiJsonResponse({ data }, 201);
}

async function handlePatchCustomer(auth: ApiKeyAuth, customerId: string, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const allowed = [
    "nome",
    "telefone",
    "celular",
    "email",
    "perfil",
    "rota",
    "cidade",
    "status",
    "ativo",
    "opt_out",
    "opt_out_at",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) {
      patch[key] = body[key];
    }
  }
  if (body.name !== undefined && patch.nome === undefined) {
    patch.nome = body.name;
  }

  if (body.custom_fields && typeof body.custom_fields === "object") {
    patch.source_columns = body.custom_fields;
  } else if (body.source_columns && typeof body.source_columns === "object") {
    patch.source_columns = body.source_columns;
  }

  if (Object.keys(patch).length === 0) {
    return apiJsonResponse({ error: "No fields to update." }, 400);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .update(patch)
    .eq("tenant_id", auth.tenantId)
    .eq("id", customerId)
    .select("*")
    .maybeSingle();

  if (error) {
    return apiJsonResponse({ error: error.message }, 400);
  }
  if (!data) {
    return apiJsonResponse({ error: "Customer not found." }, 404);
  }

  return apiJsonResponse({ data });
}

async function handleUpsertCustomerCustomFields(
  auth: ApiKeyAuth,
  customerId: string,
  request: Request,
) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const values =
    body.values && typeof body.values === "object" && !Array.isArray(body.values)
      ? body.values as Record<string, unknown>
      : body;
  const entries = Object.entries(values).filter(
    ([name, value]) =>
      name.trim() &&
      value !== undefined &&
      value !== null &&
      (typeof value !== "string" || value.trim() !== ""),
  );
  if (entries.length === 0) {
    return apiJsonResponse({ error: "No custom field values provided." }, 400);
  }

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("tenant_id", auth.tenantId)
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) {
    return apiJsonResponse({ error: "Customer not found." }, 404);
  }

  const { data: fields, error: fieldsError } = await admin
    .from("customer_custom_fields")
    .select("id, nome, kind")
    .eq("tenant_id", auth.tenantId);
  if (fieldsError) {
    return apiJsonResponse({ error: fieldsError.message }, 500);
  }

  const byName = new Map(
    (fields ?? []).map((field) => [String(field.nome).trim().toLocaleLowerCase("pt-BR"), field]),
  );
  const numericKinds = new Set(["numero", "inteiro", "moeda", "porcentagem"]);
  const rows: Array<Record<string, unknown>> = [];
  const unmapped: string[] = [];

  for (const [rawName, rawValue] of entries) {
    const field = byName.get(rawName.trim().toLocaleLowerCase("pt-BR"));
    if (!field) {
      unmapped.push(rawName);
      continue;
    }

    const row: Record<string, unknown> = {
      customer_id: customerId,
      field_id: field.id,
      value_text: null,
      value_numeric: null,
      value_date: null,
      updated_at: new Date().toISOString(),
    };

    if (numericKinds.has(String(field.kind))) {
      const numeric =
        typeof rawValue === "number"
          ? rawValue
          : Number(String(rawValue).replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(numeric)) {
        unmapped.push(rawName);
        continue;
      }
      row.value_numeric = numeric;
    } else if (field.kind === "data") {
      const value = String(rawValue).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        unmapped.push(rawName);
        continue;
      }
      row.value_date = value;
    } else {
      row.value_text =
        typeof rawValue === "boolean" ? String(rawValue) : String(rawValue).trim();
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    return apiJsonResponse({ error: "No matching custom fields.", unmapped }, 400);
  }

  const { data, error } = await admin
    .from("customer_custom_field_values")
    .upsert(rows, { onConflict: "customer_id,field_id" })
    .select("customer_id, field_id, value_text, value_numeric, value_date, updated_at");
  if (error) {
    return apiJsonResponse({ error: error.message }, 400);
  }

  return apiJsonResponse({
    ok: true,
    updated: data?.length ?? rows.length,
    unmapped,
    data: data ?? [],
  });
}

async function handleResolveInboundLead(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const rawPhone = String(body.phone ?? body.telefone ?? "").trim();
  let phoneDigits = rawPhone.replace(/\D/g, "").replace(/^0+/, "");
  if (phoneDigits && !phoneDigits.startsWith("55")) phoneDigits = `55${phoneDigits}`;
  if (phoneDigits.length < 12 || phoneDigits.length > 13) {
    return apiJsonResponse({ error: "A valid Brazilian phone is required." }, 400);
  }

  const name = String(body.name ?? body.nome ?? "").trim() || `WhatsApp ${phoneDigits.slice(-4)}`;
  const email = String(body.email ?? "").trim().toLowerCase();
  const funnelId = String(body.funnel_id ?? "").trim();
  const respondedStageId = String(body.responded_stage_id ?? body.stage_id ?? "").trim();
  const nextTaskAt = String(body.next_task_at ?? "").trim() || null;
  const earlyStageIds = Array.isArray(body.early_stage_ids)
    ? body.early_stage_ids.map(String).filter(Boolean)
    : [];
  if (!funnelId || !respondedStageId) {
    return apiJsonResponse({ error: "funnel_id and responded_stage_id are required." }, 400);
  }

  const admin = createAdminClient();
  const idempotencyKey = normalizeIdempotencyValue(body.idempotency_key);
  const idempotencyEventType =
    normalizeIdempotencyValue(body.event_type, 120) || "whatsapp_message_received";
  let idempotency: Record<string, unknown> | null = null;
  if (idempotencyKey) {
    try {
      idempotency = await claimAutomationEvent(admin, auth, {
        eventType: idempotencyEventType,
        idempotencyKey,
        metadata: { phone: phoneDigits, source: body.source ?? "whatsapp_inbound" },
      });
    } catch (error) {
      return apiJsonResponse(
        { error: error instanceof Error ? error.message : "Idempotency claim failed." },
        400,
      );
    }
    if (idempotency.deduplicated === true) {
      return apiJsonResponse({ ok: true, deduplicated: true, idempotency });
    }
  }

  const phoneJid = `${phoneDigits}@s.whatsapp.net`;
  const { data: existingCustomers, error: customerLookupError } = await admin
    .from("customers")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .or(`phone_digits.eq.${phoneDigits},phone_jid.eq.${phoneJid}`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (customerLookupError) {
    return apiJsonResponse({ error: customerLookupError.message }, 500);
  }

  let customer = existingCustomers?.[0] ?? null;
  let createdCustomer = false;
  if (!customer) {
    const { data, error } = await admin
      .from("customers")
      .insert({
        tenant_id: auth.tenantId,
        codigo: `WA-${phoneDigits.slice(-8)}`,
        nome: name,
        telefone: rawPhone || phoneDigits,
        celular: rawPhone || phoneDigits,
        email,
        origem: "organico",
        perfil: "B",
        rota: "",
        cidade: "",
        status: "ativo",
        canal: "whatsapp",
        ativo: true,
        cadastrado_em: new Date().toISOString(),
        phone_digits: phoneDigits,
        phone_e164: `+${phoneDigits}`,
        phone_jid: phoneJid,
        source_columns: { source: String(body.source ?? "whatsapp_inbound") },
      })
      .select("*")
      .single();
    if (error) {
      return apiJsonResponse({ error: error.message }, 400);
    }
    customer = data;
    createdCustomer = true;
  }

  const { data: existingNegotiations, error: negotiationLookupError } = await admin
    .from("crm_negotiations")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("customer_id", customer.id)
    .eq("status", "em_andamento")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (negotiationLookupError) {
    return apiJsonResponse({ error: negotiationLookupError.message }, 500);
  }

  let negotiation = existingNegotiations?.[0] ?? null;
  let createdNegotiation = false;
  if (!negotiation) {
    const { data, error } = await admin
      .from("crm_negotiations")
      .insert({
        tenant_id: auth.tenantId,
        title: `${String(customer.nome || name)} | WhatsApp receptivo`,
        funnel_id: funnelId,
        stage_id: respondedStageId,
        status: "em_andamento",
        customer_id: customer.id,
        star_count: 1,
        qualification: 1,
        total_value: 0,
        last_contact_at: new Date().toISOString(),
        last_interaction_at: new Date().toISOString(),
        next_task_at: nextTaskAt,
      })
      .select("*")
      .single();
    if (error) {
      return apiJsonResponse({ error: error.message }, 400);
    }
    negotiation = data;
    createdNegotiation = true;
  } else {
    const patch: Record<string, unknown> = {
      last_contact_at: new Date().toISOString(),
      last_interaction_at: new Date().toISOString(),
    };
    if (earlyStageIds.includes(String(negotiation.stage_id))) {
      const state = await loadCrmStateContext(
        admin,
        auth.tenantId,
        String(negotiation.funnel_id),
        String(negotiation.stage_id),
      );
      const canMoveToResponded =
        !state.policy_applied ||
        state.allowed_next_stages.some((stage) => stage.id === respondedStageId);
      if (canMoveToResponded) {
        patch.stage_id = respondedStageId;
        if (nextTaskAt) {
          patch.next_task_at = nextTaskAt;
        }
        patch.other_info = {
          ...(negotiation.other_info && typeof negotiation.other_info === "object"
            ? negotiation.other_info
            : {}),
          last_automated_transition: {
            from_stage_id: String(negotiation.stage_id),
            to_stage_id: respondedStageId,
            event: "message_received",
            reason: "Contato respondeu pelo WhatsApp",
            occurred_at: new Date().toISOString(),
          },
        };
      }
    }
    const { data, error } = await admin
      .from("crm_negotiations")
      .update(patch)
      .eq("tenant_id", auth.tenantId)
      .eq("id", negotiation.id)
      .select("*")
      .single();
    if (error) {
      return apiJsonResponse({ error: error.message }, 400);
    }
    negotiation = data;
  }

  const { data: fields } = await admin
    .from("customer_custom_fields")
    .select("id, nome, kind")
    .eq("tenant_id", auth.tenantId);
  const { data: values } = await admin
    .from("customer_custom_field_values")
    .select("field_id, value_text, value_numeric, value_date")
    .eq("customer_id", customer.id);
  const fieldsById = new Map((fields ?? []).map((field) => [String(field.id), field]));
  const customFields = Object.fromEntries(
    (values ?? []).flatMap((value) => {
      const field = fieldsById.get(String(value.field_id));
      if (!field) return [];
      return [[
        String(field.nome),
        value.value_text ?? value.value_numeric ?? value.value_date ?? null,
      ]];
    }),
  );
  const state = await loadCrmStateContext(
    admin,
    auth.tenantId,
    String(negotiation.funnel_id),
    String(negotiation.stage_id),
  );

  if (idempotencyKey) {
    await completeAutomationEvent(admin, auth, {
      eventType: idempotencyEventType,
      idempotencyKey,
      resourceType: "crm_negotiation",
      resourceId: String(negotiation.id),
      result: {
        customer_id: customer.id,
        negotiation_id: negotiation.id,
        stage_id: negotiation.stage_id,
      },
    });
  }

  return apiJsonResponse({
    ok: true,
    deduplicated: false,
    created_customer: createdCustomer,
    created_negotiation: createdNegotiation,
    customer,
    negotiation,
    custom_fields: customFields,
    state,
  });
}

function decodeBase64File(value: string): Uint8Array {
  const normalized = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(normalized.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function sanitizeDocumentFileName(value: string): string {
  const base = value.split(/[/\\]/).pop() || "documento";
  return base.replace(/[^\w.\-() ]/g, "_").slice(0, 120) || "documento";
}

async function handleCreateNegotiationDocument(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const negotiationId = String(body.negotiation_id ?? "").trim();
  const base64 = String(body.base64 ?? body.base64_data ?? "").trim();
  const mimeType = String(body.mime_type ?? "application/octet-stream").trim();
  const fileName = sanitizeDocumentFileName(String(body.file_name ?? "documento"));
  const displayName = String(body.display_name ?? fileName).trim() || fileName;
  const rawSourceMessageId = String(body.source_message_id ?? "").trim();
  const sourceMessageId = rawSourceMessageId
    ? sanitizeDocumentFileName(rawSourceMessageId).replace(/[^a-zA-Z0-9_-]/g, "")
    : "";
  if (!negotiationId || !base64) {
    return apiJsonResponse({ error: "negotiation_id and base64 are required." }, 400);
  }
  if (base64.length > 21_000_000) {
    return apiJsonResponse({ error: "File exceeds the 15 MB API upload limit." }, 413);
  }

  const admin = createAdminClient();
  const { data: negotiation } = await admin
    .from("crm_negotiations")
    .select("id")
    .eq("tenant_id", auth.tenantId)
    .eq("id", negotiationId)
    .maybeSingle();
  if (!negotiation) {
    return apiJsonResponse({ error: "Negotiation not found." }, 404);
  }

  const storagePath = sourceMessageId
    ? `${auth.tenantId}/${negotiationId}/whatsapp_${sourceMessageId}_${fileName}`
    : `${auth.tenantId}/${negotiationId}/${crypto.randomUUID()}_${fileName}`;
  if (sourceMessageId) {
    const { data: existing } = await admin
      .from("crm_negotiation_documents")
      .select("*")
      .eq("tenant_id", auth.tenantId)
      .eq("negotiation_id", negotiationId)
      .eq("storage_path", storagePath)
      .maybeSingle();
    if (existing) {
      return apiJsonResponse({ ok: true, deduplicated: true, data: existing });
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64File(base64);
  } catch {
    return apiJsonResponse({ error: "Invalid base64 file." }, 400);
  }
  if (bytes.length === 0 || bytes.length > 15 * 1024 * 1024) {
    return apiJsonResponse({ error: "File must contain between 1 byte and 15 MB." }, 413);
  }

  const { error: uploadError } = await admin.storage
    .from("crm-lead-documents")
    .upload(storagePath, bytes, {
      cacheControl: "3600",
      upsert: false,
      contentType: mimeType,
    });
  if (uploadError) {
    return apiJsonResponse({ error: uploadError.message }, 400);
  }

  const { data, error } = await admin
    .from("crm_negotiation_documents")
    .insert({
      tenant_id: auth.tenantId,
      negotiation_id: negotiationId,
      display_name: displayName,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      file_size: bytes.length,
      uploaded_by: null,
    })
    .select("*")
    .single();
  if (error) {
    await admin.storage.from("crm-lead-documents").remove([storagePath]);
    return apiJsonResponse({ error: error.message }, 400);
  }

  return apiJsonResponse({ ok: true, data }, 201);
}

async function handleListNegotiations(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "read");
  if (denied) return denied;

  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const customerId = url.searchParams.get("customer_id");
  const admin = createAdminClient();

  let q = admin
    .from("crm_negotiations")
    .select(
      "id, title, funnel_id, stage_id, status, assignee_id, customer_id, star_count, qualification, total_value, last_contact_at, last_interaction_at, created_at, updated_at, customer:customers(status, opt_out)",
    )
    .eq("tenant_id", auth.tenantId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (customerId) {
    q = q.eq("customer_id", customerId);
  }

  const { data, error } = await q;
  if (error) {
    return apiJsonResponse({ error: error.message }, 500);
  }

  return apiJsonResponse({ data: data ?? [] });
}

async function handleCreateNegotiation(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const title = String(body.title ?? "").trim();
  const funnelId = String(body.funnel_id ?? "");
  const stageId = String(body.stage_id ?? "");

  if (!title || !funnelId || !stageId) {
    return apiJsonResponse({ error: "title, funnel_id and stage_id are required." }, 400);
  }

  const admin = createAdminClient();

  const customerId = body.customer_id ? String(body.customer_id) : null;
  if (customerId) {
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();
    if (!customer) {
      return apiJsonResponse({ error: "customer_id not found in this tenant." }, 400);
    }
  }

  const assigneeId = body.assignee_id ? String(body.assignee_id) : null;
  if (assigneeId) {
    const { data: assignee } = await admin
      .from("profiles")
      .select("id")
      .eq("id", assigneeId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();
    if (!assignee) {
      return apiJsonResponse({ error: "assignee_id not found in this tenant." }, 400);
    }
  }

  const { data, error } = await admin
    .from("crm_negotiations")
    .insert({
      tenant_id: auth.tenantId,
      title,
      funnel_id: funnelId,
      stage_id: stageId,
      status: String(body.status ?? "em_andamento"),
      assignee_id: assigneeId,
      customer_id: customerId,
      star_count: Number(body.star_count ?? 0),
      qualification: Number(body.qualification ?? 0),
      total_value: Number(body.total_value ?? 0),
    })
    .select("*")
    .single();

  if (error) {
    return apiJsonResponse({ error: error.message }, 400);
  }

  return apiJsonResponse({ data }, 201);
}

async function handlePatchNegotiation(auth: ApiKeyAuth, negotiationId: string, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const allowed = [
    "title",
    "funnel_id",
    "stage_id",
    "status",
    "assignee_id",
    "star_count",
    "qualification",
    "total_value",
    "next_task_at",
    "lost_reason",
  ] as const;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (body[key] !== undefined) {
      patch[key] = body[key];
    }
  }

  if (Object.keys(patch).length <= 1) {
    return apiJsonResponse({ error: "No fields to update." }, 400);
  }

  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin
    .from("crm_negotiations")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("id", negotiationId)
    .maybeSingle();
  if (currentError) {
    return apiJsonResponse({ error: currentError.message }, 500);
  }
  if (!current) {
    return apiJsonResponse({ error: "Negotiation not found." }, 404);
  }

  let transition:
    | {
      from: CrmStage | null;
      to: CrmStage | null;
      event: string;
      reason: string;
    }
    | null = null;
  const requestedStageId = body.stage_id != null ? String(body.stage_id).trim() : "";
  if (requestedStageId && requestedStageId !== String(current.stage_id)) {
    const currentFunnelId = String(current.funnel_id);
    const requestedFunnelId = String(body.funnel_id ?? current.funnel_id);
    if (requestedFunnelId !== currentFunnelId) {
      return apiJsonResponse(
        {
          error: "Changing funnel and stage in the same automated transition is not allowed.",
          code: "CRM_FUNNEL_TRANSITION_BLOCKED",
        },
        409,
      );
    }

    let state: CrmStateContext;
    try {
      state = await loadCrmStateContext(
        admin,
        auth.tenantId,
        currentFunnelId,
        String(current.stage_id),
      );
    } catch (stateError) {
      return apiJsonResponse(
        {
          error: stateError instanceof Error
            ? stateError.message
            : "Could not load CRM state policy.",
          code: "CRM_STATE_POLICY_UNAVAILABLE",
        },
        500,
      );
    }

    const targetStage =
      state.allowed_next_stages.find((stage) => stage.id === requestedStageId) ?? null;
    if (state.policy_applied && !targetStage) {
      return apiJsonResponse(
        {
          error: "Transition blocked by the CRM state machine.",
          code: "CRM_STAGE_TRANSITION_BLOCKED",
          current_stage: state.current_stage,
          requested_stage_id: requestedStageId,
          allowed_next_stages: state.allowed_next_stages,
          terminal: state.terminal,
        },
        409,
      );
    }

    transition = {
      from: state.current_stage,
      to: targetStage,
      event: String(body.transition_event ?? "api_update").trim() || "api_update",
      reason: String(body.transition_reason ?? "").trim(),
    };
    patch.other_info = {
      ...(current.other_info && typeof current.other_info === "object"
        ? current.other_info
        : {}),
      last_automated_transition: {
        from_stage_id: String(current.stage_id),
        to_stage_id: requestedStageId,
        event: transition.event,
        reason: transition.reason,
        occurred_at: new Date().toISOString(),
      },
    };
  }

  const idempotencyKey = normalizeIdempotencyValue(body.idempotency_key);
  const idempotencyEventType =
    normalizeIdempotencyValue(body.event_type, 120) || "crm_negotiation_updated";
  let idempotency: Record<string, unknown> | null = null;
  if (idempotencyKey) {
    try {
      idempotency = await claimAutomationEvent(admin, auth, {
        eventType: idempotencyEventType,
        idempotencyKey,
        metadata: {
          negotiation_id: negotiationId,
          current_stage_id: current.stage_id,
          requested_stage_id: requestedStageId || current.stage_id,
          transition_event: body.transition_event ?? null,
        },
      });
    } catch (error) {
      return apiJsonResponse(
        { error: error instanceof Error ? error.message : "Idempotency claim failed." },
        400,
      );
    }
    if (idempotency.deduplicated === true) {
      return apiJsonResponse({
        ok: true,
        deduplicated: true,
        data: current,
        idempotency,
      });
    }
  }

  const { data, error } = await admin
    .from("crm_negotiations")
    .update(patch)
    .eq("tenant_id", auth.tenantId)
    .eq("id", negotiationId)
    .select("*")
    .maybeSingle();

  if (error) {
    return apiJsonResponse({ error: error.message }, 400);
  }
  if (!data) {
    return apiJsonResponse({ error: "Negotiation not found." }, 404);
  }

  const state = await loadCrmStateContext(
    admin,
    auth.tenantId,
    String(data.funnel_id),
    String(data.stage_id),
  );

  if (idempotencyKey) {
    await completeAutomationEvent(admin, auth, {
      eventType: idempotencyEventType,
      idempotencyKey,
      resourceType: "crm_negotiation",
      resourceId: negotiationId,
      result: {
        negotiation_id: negotiationId,
        stage_id: data.stage_id,
        status: data.status,
      },
    });
  }

  return apiJsonResponse({ ok: true, deduplicated: false, data, transition, state });
}

async function handleListStages(auth: ApiKeyAuth) {
  const denied = requireScope(auth, "read");
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant_crm_funnel_config")
    .select("funnels")
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();

  if (error) {
    return apiJsonResponse({ error: error.message }, 500);
  }

  const funnels = Array.isArray(data?.funnels) ? data.funnels : [];
  const stages = funnels.flatMap((rawFunnel: unknown) => {
    if (!rawFunnel || typeof rawFunnel !== "object") return [];
    const funnel = rawFunnel as Record<string, unknown>;
    const funnelId = String(funnel.id ?? "").trim();
    const funnelName = String(funnel.listName ?? funnelId).trim();
    const rawStages = Array.isArray(funnel.stages) ? funnel.stages : [];
    return rawStages.flatMap((rawStage: unknown, orderIndex: number) => {
      if (!rawStage || typeof rawStage !== "object") return [];
      const stage = rawStage as Record<string, unknown>;
      const id = String(stage.id ?? "").trim();
      const title = String(stage.title ?? "").trim();
      if (!funnelId || !id || !title) return [];
      return [{
        ...stage,
        id,
        title,
        funnel_id: funnelId,
        funnel_name: funnelName,
        order_index: orderIndex,
      }];
    });
  });

  return apiJsonResponse({ data: stages });
}

async function handleCreateCrmTask(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const negotiationId = String(body.negotiation_id ?? "").trim() || null;
  const customerId = String(body.customer_id ?? "").trim() || null;
  const title = String(body.title ?? "").trim();
  const dueAt = String(body.due_at ?? "").trim() || null;
  const notes = String(body.notes ?? "").trim();
  const templateId = String(body.template_id ?? "").trim() || null;

  if (!title || (!negotiationId && !customerId)) {
    return apiJsonResponse(
      { error: "title and negotiation_id or customer_id are required." },
      400,
    );
  }
  if (dueAt && Number.isNaN(Date.parse(dueAt))) {
    return apiJsonResponse({ error: "due_at must be a valid ISO date." }, 400);
  }

  const admin = createAdminClient();
  const idempotencyKey = normalizeIdempotencyValue(body.idempotency_key);
  const idempotencyEventType =
    normalizeIdempotencyValue(body.event_type, 120) || "crm_task_created";
  let idempotency: Record<string, unknown> | null = null;
  if (idempotencyKey) {
    try {
      idempotency = await claimAutomationEvent(admin, auth, {
        eventType: idempotencyEventType,
        idempotencyKey,
        metadata: {
          negotiation_id: negotiationId,
          customer_id: customerId,
          title,
          due_at: dueAt,
        },
      });
    } catch (error) {
      return apiJsonResponse(
        { error: error instanceof Error ? error.message : "Idempotency claim failed." },
        400,
      );
    }
    if (idempotency.deduplicated === true) {
      return apiJsonResponse({ ok: true, deduplicated: true, idempotency });
    }
  }

  if (negotiationId) {
    const { data: negotiation } = await admin
      .from("crm_negotiations")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", negotiationId)
      .maybeSingle();
    if (!negotiation) {
      return apiJsonResponse({ error: "negotiation_id not found in this tenant." }, 400);
    }
  }
  if (customerId) {
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", customerId)
      .maybeSingle();
    if (!customer) {
      return apiJsonResponse({ error: "customer_id not found in this tenant." }, 400);
    }
  }

  const { data, error } = await admin
    .from("crm_tasks")
    .insert({
      tenant_id: auth.tenantId,
      negotiation_id: negotiationId,
      customer_id: customerId,
      title,
      due_at: dueAt,
      status: "aberta",
      notes,
      template_id: templateId,
    })
    .select("*")
    .single();

  if (error) {
    return apiJsonResponse({ error: error.message }, 400);
  }

  if (idempotencyKey) {
    await completeAutomationEvent(admin, auth, {
      eventType: idempotencyEventType,
      idempotencyKey,
      resourceType: "crm_task",
      resourceId: String(data.id),
      result: { task_id: data.id, negotiation_id: negotiationId, customer_id: customerId },
    });
  }

  return apiJsonResponse({ ok: true, deduplicated: false, data }, 201);
}

async function handleListTags(auth: ApiKeyAuth) {
  const denied = requireScope(auth, "read");
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tags")
    .select("*")
    .eq("tenant_id", auth.tenantId);

  if (error) {
    return apiJsonResponse({ error: error.message }, 500);
  }

  return apiJsonResponse({ data: data ?? [] });
}

async function handleAssignTag(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const rawEntityType = String(body.entity_type ?? "chat").toLowerCase();
  const entityType = rawEntityType === "whatsapp_chat" ? "chat" : rawEntityType;
  const entityId = String(body.entity_id ?? "").trim();
  const tagName = String(body.tag_name ?? body.name ?? "").trim();

  if (!entityId || !tagName) {
    return apiJsonResponse({ error: "entity_id and tag_name are required." }, 400);
  }

  const admin = createAdminClient();
  let tagId: string;
  const { data: existingTag } = await admin
    .from("tags")
    .select("id")
    .eq("tenant_id", auth.tenantId)
    .eq("name", tagName)
    .maybeSingle();

  if (existingTag) {
    tagId = existingTag.id;
  } else {
    const { data: newTag, error: tagErr } = await admin
      .from("tags")
      .insert({ tenant_id: auth.tenantId, name: tagName })
      .select("id")
      .single();
    if (tagErr || !newTag) {
      return apiJsonResponse({ error: tagErr?.message || "Failed to create tag." }, 400);
    }
    tagId = newTag.id;
  }

  const { data, error } = await admin
    .from("entity_tags")
    .insert({
      tenant_id: auth.tenantId,
      entity_type: entityType,
      entity_id: entityId,
      tag_id: tagId,
    })
    .select("*")
    .maybeSingle();

  if (error && !error.message.includes("duplicate")) {
    return apiJsonResponse({ error: error.message }, 400);
  }

  return apiJsonResponse({ ok: true, tag_id: tagId, entity_id: entityId, data });
}

async function handleListProducts(auth: ApiKeyAuth, request: Request) {
  const denied = requireScope(auth, "read");
  if (denied) return denied;

  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("products")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .limit(limit);

  if (error) {
    return apiJsonResponse({ error: error.message }, 500);
  }

  return apiJsonResponse({ data: data ?? [] });
}

async function handleAddNegotiationItem(auth: ApiKeyAuth, negotiationId: string, request: Request) {
  const denied = requireScope(auth, "write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const productId = String(body.product_id ?? "").trim();
  const quantity = Number(body.quantity ?? 1);
  const unitPrice = Number(body.unit_price ?? 0);

  if (!productId) {
    return apiJsonResponse({ error: "product_id is required." }, 400);
  }

  const admin = createAdminClient();
  const totalPrice = quantity * unitPrice;

  const { data, error } = await admin
    .from("sale_items")
    .insert({
      tenant_id: auth.tenantId,
      sale_id: negotiationId,
      product_id: productId,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    })
    .select("*")
    .single();

  if (error) {
    return apiJsonResponse({ error: error.message }, 400);
  }

  return apiJsonResponse({ data }, 201);
}

async function handleListCollaborators(auth: ApiKeyAuth) {
  const denied = requireScope(auth, "read");
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, nome, email, role, avatar_url, updated_at")
    .eq("tenant_id", auth.tenantId);

  if (error) {
    return apiJsonResponse({ error: error.message }, 500);
  }

  return apiJsonResponse({ data: data ?? [] });
}

Deno.serve(async (request) => {
  const cors = handleApiCors(request);
  if (cors) return cors;

  const path = resolveApiPath(request, "wchat-api");
  const route = parseRoute(path);
  const method = request.method.toUpperCase();

  try {
    const auth = await authenticateApiKey(createAdminClient(), request);

    if (route.version !== "v1") {
      return apiJsonResponse({ error: "Unsupported API version." }, 404);
    }

    if (route.resource === "health" && method === "GET") {
      return await handleHealth(auth);
    }

    if (!auth) {
      return apiJsonResponse({ error: "Unauthorized. Use Authorization: Bearer wchat_..." }, 401);
    }

    if (route.resource === "me" && method === "GET") {
      return await handleMe(auth);
    }

    if (route.resource === "collaborators" && method === "GET") {
      return await handleListCollaborators(auth);
    }

    if (route.resource === "chats" && method === "GET" && !route.id) {
      return await handleListChats(auth, request);
    }

    if (route.resource === "chats" && method === "GET" && route.id && !route.sub) {
      return await handleGetChat(auth, route.id);
    }

    if (route.resource === "chats" && method === "POST" && route.id && route.sub === "transfer") {
      return await handleTransferChat(auth, route.id, request);
    }

    if (route.resource === "messages" && route.id === "send" && method === "POST") {
      return await handleSendMessage(auth, request);
    }

    if (
      route.resource === "automation" &&
      route.id === "events" &&
      method === "POST" &&
      (route.sub === "claim" || route.sub === "complete" || route.sub === "fail")
    ) {
      return await handleAutomationEvent(
        auth,
        request,
        route.sub as "claim" | "complete" | "fail",
      );
    }

    if (route.resource === "customers" && method === "GET" && !route.id) {
      return await handleListCustomers(auth, request);
    }

    if (route.resource === "customers" && method === "GET" && route.id) {
      return await handleGetCustomer(auth, route.id);
    }

    if (route.resource === "customers" && method === "POST" && !route.id) {
      return await handleCreateCustomer(auth, request);
    }

    if (route.resource === "customers" && method === "PATCH" && route.id) {
      return await handlePatchCustomer(auth, route.id, request);
    }

    if (
      route.resource === "customers" &&
      method === "POST" &&
      route.id &&
      route.sub === "custom-fields"
    ) {
      return await handleUpsertCustomerCustomFields(auth, route.id, request);
    }

    if (route.resource === "tags" && method === "GET") {
      return await handleListTags(auth);
    }

    if (route.resource === "tags" && method === "POST" && route.id === "assign") {
      return await handleAssignTag(auth, request);
    }

    if (route.resource === "products" && method === "GET") {
      return await handleListProducts(auth, request);
    }

    if (route.resource === "crm" && route.id === "stages" && method === "GET") {
      return await handleListStages(auth);
    }

    if (route.resource === "crm" && route.id === "sla" && method === "GET") {
      return await handleCrmSla(auth, request);
    }

    if (route.resource === "crm" && route.id === "dashboard" && method === "GET") {
      return await handleCrmDashboard(auth, request);
    }

    if (route.resource === "crm" && route.id === "intake" && method === "POST") {
      return await handleResolveInboundLead(auth, request);
    }

    if (
      route.resource === "crm" &&
      route.id === "qualification" &&
      route.sub === "evaluate" &&
      method === "POST"
    ) {
      return await handleEvaluateQualification(auth, request);
    }

    if (
      route.resource === "crm" &&
      route.id === "handoffs" &&
      method === "POST" &&
      !route.sub
    ) {
      return await handleCreateHumanHandoff(auth, request);
    }

    if (route.resource === "crm" && route.id === "documents" && method === "POST") {
      return await handleCreateNegotiationDocument(auth, request);
    }

    if (route.resource === "crm" && route.id === "tasks" && method === "POST" && !route.sub) {
      return await handleCreateCrmTask(auth, request);
    }

    if (route.resource === "crm" && route.id === "negotiations" && method === "GET" && !route.sub) {
      return await handleListNegotiations(auth, request);
    }

    if (route.resource === "crm" && route.id === "negotiations" && method === "POST" && !route.sub) {
      return await handleCreateNegotiation(auth, request);
    }

    if (route.resource === "crm" && route.id === "negotiations" && method === "PATCH" && route.sub) {
      return await handlePatchNegotiation(auth, route.sub, request);
    }

    if (route.resource === "crm" && route.id === "negotiations" && method === "POST" && route.sub) {
      return await handleAddNegotiationItem(auth, route.sub, request);
    }

    return apiJsonResponse({ error: "Not found.", path, method }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error.";
    return apiJsonResponse({ error: message }, 500);
  }
});
