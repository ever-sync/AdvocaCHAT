// Endpoint público dos formulários de Marketing (embed em sites externos).
//  GET  ?formId=<uuid>  -> config pública do form (variante A/B ponderada) + incrementa views
//  POST { formId, data, meta } -> registra a submissão (scoring + dedup + cria contato/negociação + enriquecimento async)
// Sem JWT (verify_jwt=false). Protegido por allowed_domains, honeypot e rate-limit.

import { corsHeaders, handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import {
  calculateLeadScore,
  fetchIpEnrichment,
  isPhoneValueValid,
  parseUserAgent,
  pickWeightedVariant,
} from "../_shared/marketing-forms.ts";
import { processPendingDispatches } from "../_shared/email.ts";
import { sanitizePublicFormEventMetadata, sanitizePublicFormMetadata } from "../_shared/public-form-privacy.ts";

type FormFieldLike = {
  name: string;
  type: string;
  required?: boolean;
  label?: string;
  mapping?: { kind?: string; key?: string; fieldId?: string } | null;
};

type SubmitWebhookPayload = {
  event: string;
  occurred_at: string;
  source: string;
  form: {
    id: string;
    name: string;
  };
  lead: {
    negotiation_id: string | null;
    score: number;
    is_duplicate: boolean;
  };
  data: Record<string, unknown>;
  answers: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
    value: unknown;
  }>;
  structured: {
    contact: {
      name: string | null;
      email: string | null;
      phone: string | null;
    };
    defaults: Record<string, unknown>;
    custom_fields: Array<{
      field_id: string;
      name: string;
      label: string;
      kind: string;
      value: unknown;
    }>;
    extra_fields: Record<string, unknown>;
  };
  meta: Record<string, unknown>;
  submission: {
    score: number;
    score_factors: unknown[];
    time_to_complete_seconds: number;
    fields_filled: number;
    total_fields: number;
  };
};

type FormInteractionEventPayload = {
  intent: "interaction";
  event_type: string;
  session_id: string;
  step_id?: string | null;
  field_name?: string | null;
  field_label?: string | null;
  metadata?: Record<string, unknown>;
};

const WEBHOOK_TIMEOUT_MS = 5000;

const rateBuckets = new Map<string, number[]>();
const MAX_PER_MINUTE = 20;

function allowRate(key: string, limit = MAX_PER_MINUTE): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const previous = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (previous.length >= limit) return false;
  previous.push(now);
  rateBuckets.set(key, previous);
  return true;
}

function hostFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function originAllowed(request: Request, allowed: unknown): boolean {
  const list = Array.isArray(allowed) ? allowed.map((d) => normalizeDomain(String(d))).filter(Boolean) : [];
  if (list.length === 0) return true;
  const host = hostFromUrl(request.headers.get("origin")) ?? hostFromUrl(request.headers.get("referer"));
  if (!host) return false;
  return list.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

function pickValue(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function normalizeWebhookUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function normalizeEventType(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  const allowed = new Set(["view", "step_view", "field_focus", "field_change", "step_next", "step_back", "submit", "abandon"]);
  return allowed.has(normalized) ? normalized : "";
}

function normalizeEventSessionId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}


function coalesceBoolean(
  settings: unknown,
  key: string,
  fallback: boolean,
): boolean {
  if (!settings || typeof settings !== "object") return fallback;
  const raw = (settings as Record<string, unknown>)[key];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const lowered = raw.trim().toLowerCase();
    if (["true", "t", "1", "yes", "sim"].includes(lowered)) return true;
    if (["false", "f", "0", "no", "nao", "não"].includes(lowered)) return false;
  }
  return fallback;
}

function buildSubmitWebhookPayload(input: {
  formId: string;
  formName: string;
  negotiationId: string | null;
  cleanData: Record<string, unknown>;
  meta: Record<string, unknown>;
  scoring: { score: number; factors: unknown[] };
  isDuplicate: boolean;
  fields: FormFieldLike[];
  timeToCompleteSeconds: number;
}): SubmitWebhookPayload {
  const defaults: Record<string, unknown> = {};
  const customFields: SubmitWebhookPayload["structured"]["custom_fields"] = [];
  const extraFields: Record<string, unknown> = {};

  for (const field of input.fields) {
    const value = input.cleanData[field.name];
    if (value === undefined || value === null || String(value).trim() === "") continue;
    const mappingKind = field.mapping?.kind ?? "extra";
    if (mappingKind === "default") {
      defaults[field.mapping?.key ?? field.name] = value;
      continue;
    }
    if (mappingKind === "custom") {
      customFields.push({
        field_id: field.mapping?.fieldId ?? "",
        name: field.name,
        label: field.label ?? field.name,
        kind: field.type,
        value,
      });
      continue;
    }
    extraFields[field.label ?? field.name] = value;
  }

  return {
    event: "form.submitted",
    occurred_at: new Date().toISOString(),
    source: "wchat",
    form: {
      id: input.formId,
      name: input.formName,
    },
    lead: {
      negotiation_id: input.negotiationId,
      score: input.scoring.score,
      is_duplicate: input.isDuplicate,
    },
    data: input.cleanData,
    answers: input.fields.map((field) => ({
      name: field.name,
      label: field.label ?? field.name,
      type: field.type,
      required: Boolean(field.required),
      value: input.cleanData[field.name] ?? null,
    })),
    structured: {
      contact: {
        name: typeof defaults.nome === "string" ? String(defaults.nome) : typeof defaults.name === "string" ? String(defaults.name) : null,
        email: typeof defaults.email === "string" ? String(defaults.email) : null,
        phone: typeof defaults.telefone === "string" ? String(defaults.telefone) : typeof defaults.phone === "string" ? String(defaults.phone) : null,
      },
      defaults,
      custom_fields: customFields,
      extra_fields: extraFields,
    },
    meta: input.meta,
    submission: {
      score: input.scoring.score,
      score_factors: input.scoring.factors,
      time_to_complete_seconds: input.timeToCompleteSeconds,
      fields_filled: Object.values(input.cleanData).filter(
        (v) => v !== undefined && v !== null && String(v).trim() !== "",
      ).length,
      total_fields: input.fields.length,
    },
  };
}

async function postSubmitWebhook(url: string, payload: SubmitWebhookPayload): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-WChat-Event": payload.event,
        "X-WChat-Form-Id": payload.form.id,
        "X-WChat-Form-Name": payload.form.name,
        "X-WChat-Source": payload.source,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  const admin = createAdminClient();
  const url = new URL(request.url);

  // ---------------------------------------------------------------- GET: config
  if (request.method === "GET") {
    const formId = url.searchParams.get("formId") ?? url.searchParams.get("form");
    if (!formId) return jsonResponse({ error: "formId requerido" }, 400);

    const { data, error } = await admin
      .from("marketing_forms")
      .select("id, name, fields, settings, theme, submit_message, submit_redirect_url, is_active")
      .eq("id", formId)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!data || data.is_active !== true) {
      return jsonResponse({ error: "Formulário não encontrado ou indisponível." }, 404);
    }

    // Variantes A/B ativas: escolhe uma ponderada e conta a view dela
    let fields = data.fields ?? [];
    let theme = data.theme ?? {};
    let variantId: string | null = null;
    const { data: variants } = await admin
      .from("marketing_form_variants")
      .select("id, fields, theme, weight")
      .eq("form_id", formId)
      .eq("is_active", true);

    if (variants && variants.length > 0) {
      const chosen = pickWeightedVariant(variants as Array<{ id: string; weight: number | null }>);
      if (chosen) {
        const full = (variants as Array<Record<string, unknown>>).find((v) => v.id === chosen.id);
        variantId = chosen.id;
        if (full) {
          fields = full.fields ?? fields;
          theme = full.theme ?? theme;
        }
        admin.rpc("increment_marketing_variant_views", { p_variant_id: chosen.id }).then(() => {}, () => {});
      }
    }

    admin.rpc("increment_marketing_form_views", { p_form_id: formId }).then(() => {}, () => {});

    return new Response(
      JSON.stringify({
        form: {
          id: data.id,
          name: data.name,
          fields,
          settings: data.settings ?? {},
          theme,
          submitMessage: data.submit_message ?? "Obrigado!",
          submitRedirectUrl: data.submit_redirect_url ?? null,
          variantId,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
          ...corsHeaders,
        },
      },
    );
  }

  // ---------------------------------------------------------------- POST: submit
  if (request.method === "POST") {
    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent") ?? "";

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "JSON inválido" }, 400);
    }

    const formId = String(body.formId ?? body.form ?? "");
    if (!formId) return jsonResponse({ error: "formId requerido" }, 400);

    const intent = typeof body.intent === "string" ? body.intent.trim().toLowerCase() : "";
    const isInteractionEvent = intent === "interaction";

    if (!allowRate(`${isInteractionEvent ? "interaction" : "submit"}:${formId}:${ip}`, isInteractionEvent ? 120 : MAX_PER_MINUTE)) {
      return jsonResponse({ error: "Muitas tentativas. Aguarde um minuto e tente novamente." }, 429);
    }

    const { data: form, error } = await admin
      .from("marketing_forms")
      .select(
        "id, tenant_id, name, is_active, allowed_domains, fields, settings, email_template_id, submit_message, submit_webhook_url, submit_redirect_url",
      )
      .eq("id", formId)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!form || form.is_active !== true) {
      return jsonResponse({ error: "Formulário não encontrado ou indisponível." }, 404);
    }
    if (!originAllowed(request, form.allowed_domains)) {
      return jsonResponse({ error: "Este site não está autorizado a enviar este formulário." }, 403);
    }
    const allowDuplicates = coalesceBoolean(form.settings, "allowDuplicates", true);

    if (isInteractionEvent) {
      const eventType = normalizeEventType(body.event_type ?? body.eventType ?? body.event);
      const sessionId = normalizeEventSessionId(body.session_id ?? body.sessionId);
      if (!eventType) return jsonResponse({ error: "event_type requerido" }, 400);
      if (!sessionId) return jsonResponse({ error: "session_id requerido" }, 400);

      const { error: insertError } = await admin.from("marketing_form_events").insert({
        tenant_id: form.tenant_id,
        form_id: formId,
        session_id: sessionId,
        event_type: eventType,
        step_id: typeof body.step_id === "string" ? body.step_id.trim() : typeof body.stepId === "string" ? body.stepId.trim() : null,
        field_name: typeof body.field_name === "string" ? body.field_name.trim() : typeof body.fieldName === "string" ? body.fieldName.trim() : null,
        field_label: typeof body.field_label === "string" ? body.field_label.trim() : typeof body.fieldLabel === "string" ? body.fieldLabel.trim() : null,
        metadata: sanitizePublicFormEventMetadata(body.metadata ?? body.meta),
      });
      if (insertError) {
        console.error("[forms-public] interaction event error:", insertError.message);
        return jsonResponse({ error: "Não foi possível registrar o evento." }, 500);
      }

      return jsonResponse({ success: true, event_type: eventType });
    }

    const rawData = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
    const rawMeta = body.meta && typeof body.meta === "object" ? (body.meta as Record<string, unknown>) : {};

    // honeypot
    if (rawData._hp || rawMeta._hp) {
      return jsonResponse({ success: true, message: form.submit_message ?? "Obrigado!" });
    }

    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawData)) {
      if (!key.startsWith("_")) cleanData[key] = value;
    }

    // --- Detecção de duplicado (cliente já existente no tenant) ---
    const email = pickValue(cleanData, ["email"]).toLowerCase();
    const phone = pickValue(cleanData, ["phone", "telefone", "celular", "whatsapp"]);
    const phoneDigits = phone.replace(/\D/g, "");
    let isDuplicate = false;
    if (form.tenant_id && (email || phoneDigits)) {
      let dupQuery = admin.from("customers").select("id").eq("tenant_id", form.tenant_id).limit(1);
      if (phoneDigits) {
        dupQuery = dupQuery.filter("telefone", "ilike", `%${phoneDigits.slice(-8)}%`);
      } else if (email) {
        dupQuery = dupQuery.ilike("email", email);
      }
      const { data: dup } = await dupQuery;
      isDuplicate = Array.isArray(dup) && dup.length > 0;
      if (isDuplicate && allowDuplicates === false) {
        return jsonResponse(
          { error: "Este formulário não aceita duplicados. Já encontramos um cadastro com os mesmos dados." },
          409,
        );
      }
    }

    // --- Lead scoring ---
    const fields = (Array.isArray(form.fields) ? form.fields : []) as FormFieldLike[];
    const requiredFields = fields.filter((f) => f.required && f.type !== "hidden");
    const allRequiredFilled = requiredFields.every((f) => {
      const v = cleanData[f.name];
      return v !== undefined && v !== null && String(v).trim() !== "";
    });
    const filledCount = Object.values(cleanData).filter(
      (v) => v !== undefined && v !== null && String(v).trim() !== "",
    ).length;
    const ua = parseUserAgent(userAgent);
    const utmSource = typeof rawMeta.utm_source === "string" ? rawMeta.utm_source : "";
    const timeToComplete = Number(rawMeta.time_to_complete_seconds) || 0;

    const scoring = calculateLeadScore({
      data: cleanData,
      emailDomain: email ? email.split("@")[1] ?? "" : "",
      phoneValid: isPhoneValueValid(phone),
      timeToCompleteSeconds: timeToComplete,
      deviceType: ua.deviceType,
      isVPN: false,
      isProxy: false,
      allRequiredFieldsFilled: allRequiredFilled,
      isDuplicate,
      hasUtmSource: !!utmSource,
      fieldsFilledCount: filledCount,
      totalFieldsCount: fields.length,
    });

    const meta = sanitizePublicFormMetadata(rawMeta);
    meta.ip_address = ip;
    meta.user_agent = userAgent;
    meta.score = scoring.score;
    meta.score_factors = scoring.factors;
    meta.is_duplicate = isDuplicate;

    const { data: negotiationId, error: rpcError } = await admin.rpc("submit_marketing_form", {
      p_form_id: formId,
      p_data: cleanData,
      p_meta: meta,
    });

    if (rpcError) {
      console.error("[forms-public] submit error:", rpcError.message);
      const limitMsg = rpcError.message?.includes("Limite do plano atingido para customers");
      if (limitMsg) {
        return jsonResponse(
          {
            error:
              "Este formulário está temporariamente indisponível porque a conta atingiu o limite de clientes do plano. Entre em contato com o responsável pelo site.",
            code: "plan_customer_limit",
          },
          503,
        );
      }
      return jsonResponse({ error: "Não foi possível enviar no momento. Tente novamente." }, 500);
    }

    // Conta submissão da variante A/B
    const variantId = typeof meta.variant_id === "string" ? meta.variant_id : null;
    if (variantId) {
      admin.rpc("increment_marketing_variant_submissions", { p_variant_id: variantId }).then(() => {}, () => {});
    }

    if (form.submit_webhook_url) {
      void (async () => {
        try {
          const webhookPayload = buildSubmitWebhookPayload({
            formId,
            formName: String(form.name ?? ""),
            negotiationId: negotiationId ? String(negotiationId) : null,
            cleanData,
            meta,
            scoring,
            isDuplicate,
            fields,
            timeToCompleteSeconds: timeToComplete,
          });
          const webhookUrl = normalizeWebhookUrl(form.submit_webhook_url);
          if (!webhookUrl) return;
          await postSubmitWebhook(webhookUrl, webhookPayload);
        } catch (e) {
          console.error("[forms-public] submit webhook error:", e);
        }
      })();
    }

    // E-mail transacional (lead recebido) se o form tiver template e o lead tiver e-mail
    if (negotiationId && form.email_template_id && email) {
      void (async () => {
        try {
          const { data: tpl } = await admin
            .from("marketing_email_templates")
            .select("id, subject, blocks, from_name, from_email, reply_to")
            .eq("id", form.email_template_id)
            .maybeSingle();
          if (!tpl) return;

          const variables: Record<string, string> = {};
          for (const [k, v] of Object.entries(cleanData)) {
            if (v != null) variables[k] = String(v);
          }
          variables.email = email;
          variables.name = String(cleanData.name ?? cleanData.nome ?? "Lead");
          variables.form_name = String(form.name ?? "");
          variables.created_at = new Date().toISOString();
          if (tpl.from_name) variables.from_name = String(tpl.from_name);
          if (tpl.from_email) variables.from_email = String(tpl.from_email);
          if (tpl.reply_to) variables.reply_to = String(tpl.reply_to);

          await admin.from("marketing_email_dispatches").upsert(
            {
              tenant_id: form.tenant_id,
              negotiation_id: negotiationId,
              template_id: tpl.id,
              trigger_type: "lead_received",
              email_type: "transactional",
              recipient_email: email,
              subject: tpl.subject || `Recebemos seu contato — ${form.name ?? ""}`,
              blocks: tpl.blocks ?? [],
              variables,
              idempotency_key: `lead_received:${negotiationId}:${email}:${tpl.id}`,
            },
            { onConflict: "idempotency_key", ignoreDuplicates: true },
          );

          await processPendingDispatches(admin, { tenantId: form.tenant_id, limit: 5 });
        } catch (e) {
          console.error("[forms-public] email enqueue error:", e);
        }
      })();
    }

    // Consentimentos LGPD: campos checkbox/radio que parecem termo/consentimento
    if (negotiationId && form.tenant_id) {
      const consentRows = fields
        .filter((f) => {
          if (f.type !== "checkbox" && f.type !== "radio") return false;
          const combined = `${f.name} ${f.label ?? ""}`.toLowerCase();
          return /consent|termo|lgpd|autoriz|aceito/.test(combined);
        })
        .map((f) => {
          const v = rawData[f.name];
          const granted = Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "";
          return granted
            ? {
                tenant_id: form.tenant_id,
                negotiation_id: negotiationId,
                form_id: formId,
                consent_key: f.name,
                consent_text: f.label ?? null,
                granted: true,
                ip_address: ip,
                user_agent: userAgent,
              }
            : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (consentRows.length > 0) {
        admin.from("marketing_lead_consents").insert(consentRows).then(() => {}, () => {});
      }
    }

    // Enriquecimento de IP/dispositivo (async, não bloqueia a resposta)
    if (negotiationId) {
      void (async () => {
        try {
          const enrichment = await fetchIpEnrichment(ip);
          await admin
            .from("crm_negotiation_marketing")
            .update({
              city: enrichment?.city ?? null,
              region: enrichment?.region ?? null,
              country: enrichment?.country ?? null,
              country_code: enrichment?.countryCode ?? null,
              latitude: enrichment?.latitude ?? null,
              longitude: enrichment?.longitude ?? null,
              timezone: enrichment?.timezone ?? null,
              isp: enrichment?.isp ?? null,
              org: enrichment?.org ?? null,
              is_vpn: enrichment?.isVpn ?? false,
              is_proxy: enrichment?.isProxy ?? false,
              is_hosting: enrichment?.isHosting ?? false,
              browser: ua.browser,
              browser_version: ua.browserVersion,
              os: ua.os,
              device_type: ua.deviceType,
              is_mobile: ua.isMobile,
              enriched_at: new Date().toISOString(),
            })
            .eq("negotiation_id", negotiationId);
        } catch (e) {
          console.error("[forms-public] enrichment error:", e);
        }
      })();
    }

    return jsonResponse({
      success: true,
      message: form.submit_message ?? "Obrigado!",
      redirect_url: form.submit_redirect_url ?? null,
      lead_id: negotiationId,
    });
  }

  return jsonResponse({ error: "Método não suportado" }, 405);
});
