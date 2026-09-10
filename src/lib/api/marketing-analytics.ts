import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { getCampaignFormReport, type CampaignFormRow } from "@/lib/api/marketing-campaign-report";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export interface MarketingAnalyticsComparison {
  periodDays: number;
  leads: number;
  submissions: number;
  won: number;
  revenue: number;
  avgScore: number;
  duplicateRate: number;
  conversionRate: number;
  previous: {
    leads: number;
    submissions: number;
    won: number;
    revenue: number;
    avgScore: number;
    duplicateRate: number;
    conversionRate: number;
  };
  delta: {
    leads: number;
    submissions: number;
    won: number;
    revenue: number;
    avgScore: number;
    duplicateRate: number;
    conversionRate: number;
  };
}

export interface MarketingFormInsight {
  formId: string;
  formName: string;
  slug: string | null;
  isActive: boolean;
  updatedAt: string;
  views: number;
  submissions: number;
  leads: number;
  won: number;
  revenue: number;
  conversion: number;
  abandonment: number;
  avgScore: number;
  duplicateRate: number;
  hasWebhook: boolean;
  hasRedirect: boolean;
  hasActivity: boolean;
  hasCustomerTags: boolean;
  hasAutoWinner: boolean;
  allowDuplicates: boolean;
  attentionLevel: "ok" | "warning" | "critical";
  attentionReasons: string[];
}

export interface MarketingSubmissionInsight {
  id: string;
  formId: string;
  formName: string;
  negotiationTitle: string;
  status: string;
  totalValue: number;
  score: number;
  duplicate: boolean;
  utmSource: string;
  deviceType: string;
  createdAt: string;
}

export interface MarketingStepAbandonmentInsight {
  formId: string;
  formName: string;
  stepId: string;
  stepTitle: string;
  abandons: number;
  stepViews: number;
  abandonmentRate: number;
  previousAbandons: number;
  previousStepViews: number;
}

export interface MarketingFieldAbandonmentInsight {
  formId: string;
  formName: string;
  fieldName: string;
  fieldLabel: string;
  abandons: number;
  interactions: number;
  abandonmentRate: number;
  previousAbandons: number;
  previousInteractions: number;
}

export interface MarketingAbandonmentTrendInsight {
  kind: "step" | "field" | "form";
  formId: string;
  formName: string;
  title: string;
  subtitle: string;
  current: number;
  previous: number;
  delta: number;
  currentRate: number;
  previousRate: number;
  severity: "ok" | "warning" | "critical";
}

export interface MarketingAnalytics {
  totals: {
    forms: number;
    activeForms: number;
    views: number;
    submissions: number;
    leads: number;
    won: number;
    revenue: number;
    conversionRate: number; // %
    abandonmentRate: number; // %
    avgScore: number;
    duplicateRate: number; // %
  };
  comparison: MarketingAnalyticsComparison;
  perForm: MarketingFormInsight[];
  byUtmSource: Array<{ source: string; count: number }>;
  byDevice: Array<{ device: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
  scoreBuckets: Array<{ bucket: string; count: number }>;
  recentSubmissions: MarketingSubmissionInsight[];
  recentUpdates: Array<Pick<MarketingFormInsight, "formId" | "formName" | "updatedAt" | "attentionLevel">>;
  abandonmentByStep: MarketingStepAbandonmentInsight[];
  abandonmentByField: MarketingFieldAbandonmentInsight[];
  abandonmentTrends: MarketingAbandonmentTrendInsight[];
  trackedSessions: number;
}

function emptyAnalytics(periodDays = 30): MarketingAnalytics {
  return {
    totals: {
      forms: 0,
      activeForms: 0,
      views: 0,
      submissions: 0,
      leads: 0,
      won: 0,
      revenue: 0,
      conversionRate: 0,
      abandonmentRate: 0,
      avgScore: 0,
      duplicateRate: 0,
    },
    comparison: {
      periodDays,
      leads: 0,
      submissions: 0,
      won: 0,
      revenue: 0,
      avgScore: 0,
      duplicateRate: 0,
      conversionRate: 0,
      previous: {
        leads: 0,
        submissions: 0,
        won: 0,
        revenue: 0,
        avgScore: 0,
        duplicateRate: 0,
        conversionRate: 0,
      },
      delta: {
        leads: 0,
        submissions: 0,
        won: 0,
        revenue: 0,
        avgScore: 0,
        duplicateRate: 0,
        conversionRate: 0,
      },
    },
    perForm: [],
    byUtmSource: [],
    byDevice: [],
    byDay: [],
    scoreBuckets: [],
    recentSubmissions: [],
    recentUpdates: [],
    abandonmentByStep: [],
    abandonmentByField: [],
    abandonmentTrends: [],
    trackedSessions: 0,
  };
}

function bucketForScore(score: number): string {
  if (score <= 25) return "0–25";
  if (score <= 50) return "26–50";
  if (score <= 75) return "51–75";
  return "76–100";
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function percentDelta(current: number, previous: number): number {
  if (!Number.isFinite(previous) || previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return clampPercent(((current - previous) / previous) * 100);
}

function numberDelta(current: number, previous: number): number {
  return Math.round(current - previous);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type FormEventRow = {
  form_id: string;
  session_id: string;
  event_type: string;
  step_id: string | null;
  field_name: string | null;
  field_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type FormAbandonmentMaps = {
  stepViewMap: Map<string, number>;
  abandonStepMap: Map<string, number>;
  fieldInteractionMap: Map<string, number>;
  abandonFieldMap: Map<string, number>;
  trackedSessionCount: number;
};

function buildFormAbandonmentMaps(formEvents: Array<Record<string, unknown>>): FormAbandonmentMaps {
  const trackedSessions = new Set<string>();
  const stepViewMap = new Map<string, number>();
  const abandonStepMap = new Map<string, number>();
  const fieldInteractionMap = new Map<string, number>();
  const abandonFieldMap = new Map<string, number>();

  for (const event of formEvents) {
    const formId = toString(event.form_id);
    const sessionId = toString(event.session_id);
    const eventType = toString(event.event_type);
    if (!formId || !sessionId || !eventType) continue;
    trackedSessions.add(`${formId}:${sessionId}`);

    const stepId = toString(event.step_id);
    const fieldName = toString(event.field_name);
    const keyPrefix = `${formId}:`;

    if (eventType === "step_view" && stepId) {
      const key = `${keyPrefix}${stepId}`;
      stepViewMap.set(key, (stepViewMap.get(key) ?? 0) + 1);
    }

    if (eventType === "field_focus" || eventType === "field_change") {
      if (!fieldName) continue;
      const key = `${keyPrefix}${fieldName}`;
      fieldInteractionMap.set(key, (fieldInteractionMap.get(key) ?? 0) + 1);
    }

    if (eventType === "abandon") {
      if (stepId) {
        const key = `${keyPrefix}${stepId}`;
        abandonStepMap.set(key, (abandonStepMap.get(key) ?? 0) + 1);
      }
      if (fieldName) {
        const key = `${keyPrefix}${fieldName}`;
        abandonFieldMap.set(key, (abandonFieldMap.get(key) ?? 0) + 1);
      }
    }
  }

  return {
    stepViewMap,
    abandonStepMap,
    fieldInteractionMap,
    abandonFieldMap,
    trackedSessionCount: trackedSessions.size,
  };
}

async function fetchNegotiationStats(ids: string[]): Promise<Map<string, { title: string; status: string; totalValue: number }>> {
  const result = new Map<string, { title: string; status: string; totalValue: number }>();
  if (!isSupabaseConfigured || ids.length === 0) return result;

  const supabase = requireSupabase();
  for (const batch of chunk([...new Set(ids.filter(Boolean))], 200)) {
    const { data, error } = await supabase
      .from("crm_negotiations")
      .select("id, title, status, total_value")
      .in("id", batch);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const id = toString(row.id);
      if (!id) continue;
      result.set(id, {
        title: toString(row.title, "Negociação"),
        status: toString(row.status, "em_andamento"),
        totalValue: toNumber(row.total_value),
      });
    }
  }
  return result;
}

function buildAttentionLevel(insight: {
  views: number;
  conversion: number;
  duplicateRate: number;
  hasWebhook: boolean;
  hasRedirect: boolean;
  hasActivity: boolean;
  hasAutoWinner: boolean;
}): MarketingFormInsight["attentionLevel"] {
  if (insight.views >= 20 && (insight.conversion < 20 || insight.duplicateRate >= 15)) {
    return "critical";
  }
  if (insight.views >= 10 && (insight.conversion < 35 || !insight.hasWebhook || (!insight.hasRedirect && !insight.hasActivity))) {
    return "warning";
  }
  if (!insight.hasWebhook || !insight.hasAutoWinner) {
    return "warning";
  }
  return "ok";
}

function buildAttentionReasons(row: {
  views: number;
  conversion: number;
  duplicateRate: number;
  hasWebhook: boolean;
  hasRedirect: boolean;
  hasActivity: boolean;
  hasCustomerTags: boolean;
  hasAutoWinner: boolean;
  allowDuplicates: boolean;
}): string[] {
  const reasons: string[] = [];
  if (row.views >= 20 && row.conversion < 20) reasons.push("Conversão muito baixa para o volume de views.");
  if (row.views >= 10 && row.duplicateRate >= 15) reasons.push("Taxa de duplicados alta.");
  if (!row.hasWebhook) reasons.push("Sem webhook de envio configurado.");
  if (!row.hasRedirect) reasons.push("Sem redirecionamento pós-envio.");
  if (!row.hasActivity) reasons.push("Sem atividade automática no CRM.");
  if (!row.hasCustomerTags) reasons.push("Sem tags automáticas no envio.");
  if (!row.hasAutoWinner) reasons.push("A/B sem vencedor automático.");
  if (!row.allowDuplicates) reasons.push("Duplicados já são bloqueados, ótimo para qualidade.");
  return reasons;
}

export async function fetchMarketingAnalytics(periodDays = 30): Promise<MarketingAnalytics> {
  if (!isSupabaseConfigured) return emptyAnalytics(periodDays);
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const endIso = new Date().toISOString();
  const sinceIso = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
  const previousSinceIso = new Date(Date.now() - periodDays * 2 * 24 * 60 * 60 * 1000).toISOString();
  const previousUntilIso = sinceIso;

  const [formsRes, currentLeadsRes, previousLeadsRes, formReportRows, currentFormEventRows, previousFormEventRows] = await Promise.all([
    supabase
      .from("marketing_forms")
      .select(
        "id, name, slug, fields, settings, theme, allowed_domains, is_active, submit_webhook_url, submit_redirect_url, total_views, total_submissions, updated_at",
      )
      .eq("tenant_id", tenantId),
    supabase
      .from("crm_negotiation_marketing")
      .select("form_id, negotiation_id, score, utm_source, device_type, is_duplicate, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("crm_negotiation_marketing")
      .select("form_id, negotiation_id, score, utm_source, device_type, is_duplicate, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", previousSinceIso)
      .lt("created_at", previousUntilIso)
      .order("created_at", { ascending: false })
      .limit(5000),
    getCampaignFormReport(periodDays),
    supabase
      .from("marketing_form_events")
      .select("form_id, session_id, event_type, step_id, field_name, field_label, metadata, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(8000),
    supabase
      .from("marketing_form_events")
      .select("form_id, session_id, event_type, step_id, field_name, field_label, metadata, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", previousSinceIso)
      .lt("created_at", previousUntilIso)
      .order("created_at", { ascending: false })
      .limit(8000),
  ]);

  if (formsRes.error) throw new Error(formsRes.error.message);
  if (currentLeadsRes.error) throw new Error(currentLeadsRes.error.message);
  if (previousLeadsRes.error) throw new Error(previousLeadsRes.error.message);
  if (currentFormEventRows.error) throw new Error(currentFormEventRows.error.message);
  if (previousFormEventRows.error) throw new Error(previousFormEventRows.error.message);

  const forms = (formsRes.data ?? []) as Array<Record<string, unknown>>;
  const leads = (currentLeadsRes.data ?? []) as Array<Record<string, unknown>>;
  const previousLeads = (previousLeadsRes.data ?? []) as Array<Record<string, unknown>>;
  const formReports = (formReportRows ?? []) as CampaignFormRow[];
  const formEvents = (currentFormEventRows.data ?? []) as Array<Record<string, unknown>>;
  const previousFormEvents = (previousFormEventRows.data ?? []) as Array<Record<string, unknown>>;

  const formReportMap = new Map(
    formReports.map((row) => [
      row.formId,
      {
        leads: Number(row.leads ?? 0),
        won: Number(row.won ?? 0),
        revenue: Number(row.revenue ?? 0),
      },
    ]),
  );

  const currentNegotiationMap = await fetchNegotiationStats(
    leads.map((lead) => toString(lead.negotiation_id)).filter(Boolean),
  );
  const previousNegotiationMap = await fetchNegotiationStats(
    previousLeads.map((lead) => toString(lead.negotiation_id)).filter(Boolean),
  );

  const currentByForm = new Map<
    string,
    { leads: number; won: number; revenue: number; duplicateCount: number; scoreSum: number }
  >();
  const previousByForm = new Map<string, { leads: number; won: number; revenue: number }>();

  for (const lead of leads) {
    const formId = toString(lead.form_id);
    if (!formId) continue;
    const current = currentByForm.get(formId) ?? { leads: 0, won: 0, revenue: 0, duplicateCount: 0, scoreSum: 0 };
    const negotiationId = toString(lead.negotiation_id);
    const negotiation = currentNegotiationMap.get(negotiationId);
    current.leads += 1;
    current.scoreSum += toNumber(lead.score);
    current.duplicateCount += lead.is_duplicate === true ? 1 : 0;
    if (negotiation?.status === "vendido") {
      current.won += 1;
      current.revenue += negotiation.totalValue;
    }
    currentByForm.set(formId, current);
  }

  for (const lead of previousLeads) {
    const formId = toString(lead.form_id);
    if (!formId) continue;
    const current = previousByForm.get(formId) ?? { leads: 0, won: 0, revenue: 0 };
    const negotiationId = toString(lead.negotiation_id);
    const negotiation = previousNegotiationMap.get(negotiationId);
    current.leads += 1;
    if (negotiation?.status === "vendido") {
      current.won += 1;
      current.revenue += negotiation.totalValue;
    }
    previousByForm.set(formId, current);
  }

  const formRows = forms.map((f) => {
    const views = Number(f.total_views ?? 0);
    const submissions = Number(f.total_submissions ?? 0);
    const formId = String(f.id);
    const period = currentByForm.get(formId) ?? { leads: 0, won: 0, revenue: 0, duplicateCount: 0, scoreSum: 0 };
    const report = formReportMap.get(formId) ?? { leads: 0, won: 0, revenue: 0 };
    const settings = asRecord(f.settings);
    const customerTags = Array.isArray(settings.customerTags) ? (settings.customerTags as unknown[]).length : 0;
    const abAutoWinner = asRecord(settings.abAutoWinner);
    const allowDuplicates = settings.allowDuplicates !== false;
    const conversion = views > 0 ? (submissions / views) * 100 : 0;
    const duplicateRate = period.leads > 0 ? (period.duplicateCount / period.leads) * 100 : 0;
    const avgScore = period.leads > 0 ? period.scoreSum / period.leads : 0;
    const hasWebhook = Boolean(String(f.submit_webhook_url ?? "").trim());
    const hasRedirect = Boolean(String(f.submit_redirect_url ?? "").trim());
    const hasActivity = settings.createActivityOnSubmit === true;
    const hasAutoWinner = abAutoWinner.enabled === true;

    return {
      formId,
      formName: String(f.name ?? ""),
      slug: f.slug == null ? null : String(f.slug),
      isActive: f.is_active !== false,
      updatedAt: String(f.updated_at ?? ""),
      views,
      submissions,
      leads: report.leads,
      won: report.won,
      revenue: report.revenue,
      conversion: clampPercent(conversion),
      abandonment: clampPercent(100 - conversion),
      avgScore: Math.round(avgScore),
      duplicateRate: clampPercent(duplicateRate),
      hasWebhook,
      hasRedirect,
      hasActivity,
      hasCustomerTags: customerTags > 0,
      hasAutoWinner,
      allowDuplicates,
      attentionLevel: buildAttentionLevel({
        views,
        conversion,
        duplicateRate,
        hasWebhook,
        hasRedirect,
        hasActivity,
        hasAutoWinner,
      }),
      attentionReasons: buildAttentionReasons({
        views,
        conversion,
        duplicateRate,
        hasWebhook,
        hasRedirect,
        hasActivity,
        hasCustomerTags: customerTags > 0,
        hasAutoWinner,
        allowDuplicates,
      }),
    };
  });

  const totalViews = formRows.reduce((s, f) => s + f.views, 0);
  const totalSubmissions = formRows.reduce((s, f) => s + f.submissions, 0);
  const totalLeads = leads.length;

  const utmMap = new Map<string, number>();
  const deviceMap = new Map<string, number>();
  const dayMap = new Map<string, number>();
  const scoreMap = new Map<string, number>();
  let scoreSum = 0;
  let duplicateCount = 0;

  for (const lead of leads) {
    const src = toString(lead.utm_source, "(direto)");
    utmMap.set(src, (utmMap.get(src) ?? 0) + 1);

    const dev = toString(lead.device_type, "desconhecido");
    deviceMap.set(dev, (deviceMap.get(dev) ?? 0) + 1);

    const created = toString(lead.created_at);
    const day = created.slice(0, 10);
    if (day) dayMap.set(day, (dayMap.get(day) ?? 0) + 1);

    const score = toNumber(lead.score);
    scoreSum += score;
    const b = bucketForScore(score);
    scoreMap.set(b, (scoreMap.get(b) ?? 0) + 1);

    if (lead.is_duplicate === true) duplicateCount++;
  }

  const prevLeadCount = previousLeads.length;
  const prevScoreSum = previousLeads.reduce((sum, lead) => sum + toNumber(lead.score), 0);
  const prevDuplicateCount = previousLeads.filter((lead) => lead.is_duplicate === true).length;
  const prevNegotiationMap = previousNegotiationMap;
  let prevWon = 0;
  let prevRevenue = 0;
  for (const lead of previousLeads) {
    const negotiation = prevNegotiationMap.get(toString(lead.negotiation_id));
    if (negotiation?.status === "vendido") {
      prevWon++;
      prevRevenue += negotiation.totalValue;
    }
  }

  const byDay = Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-30)
    .map(([day, count]) => ({ day: day.slice(5), count }));

  const formMetaById = new Map(
    forms.map((form) => {
      const formId = String(form.id ?? "");
      const settings = asRecord(form.settings);
      const steps = Array.isArray(settings.steps) ? (settings.steps as Array<Record<string, unknown>>) : [];
      const fields = Array.isArray(form.fields) ? (form.fields as Array<Record<string, unknown>>) : [];
      const stepTitleById = new Map(
        steps.map((step, index) => [String(step.id ?? `step_${index + 1}`), String(step.title ?? `Etapa ${index + 1}`)] as const),
      );
      const fieldLabelByName = new Map(
        fields.map((field) => [String(field.name ?? ""), String(field.label ?? field.name ?? "")] as const),
      );
      return [formId, { stepTitleById, fieldLabelByName }] as const;
    }),
  );
  const currentEventMaps = buildFormAbandonmentMaps(formEvents);
  const previousEventMaps = buildFormAbandonmentMaps(previousFormEvents);
  const {
    stepViewMap,
    abandonStepMap,
    fieldInteractionMap,
    abandonFieldMap,
    trackedSessionCount,
  } = currentEventMaps;

  const abandonmentByStep = Array.from(abandonStepMap.entries())
    .map(([key, abandons]) => {
      const [formId, stepId] = key.split(":");
      const form = forms.find((item) => String(item.id) === formId);
      const meta = formMetaById.get(formId);
      const stepTitle = meta?.stepTitleById.get(stepId) ?? stepId;
      const stepViews = stepViewMap.get(key) ?? 0;
      const previousKey = key;
      const previousStepViews = previousEventMaps.stepViewMap.get(previousKey) ?? 0;
      const previousAbandons = previousEventMaps.abandonStepMap.get(previousKey) ?? 0;
      return {
        formId,
        formName: String(form?.name ?? "Formulário"),
        stepId,
        stepTitle,
        abandons,
        stepViews,
        abandonmentRate: stepViews > 0 ? clampPercent((abandons / stepViews) * 100) : clampPercent(abandons > 0 ? 100 : 0),
        previousAbandons,
        previousStepViews,
      };
    })
    .sort((a, b) => b.abandons - a.abandons || b.abandonmentRate - a.abandonmentRate)
    .slice(0, 8);

  const abandonmentByField = Array.from(abandonFieldMap.entries())
    .map(([key, abandons]) => {
      const [formId, fieldName] = key.split(":");
      const form = forms.find((item) => String(item.id) === formId);
      const meta = formMetaById.get(formId);
      const fieldLabel = meta?.fieldLabelByName.get(fieldName) ?? fieldName;
      const interactions = fieldInteractionMap.get(key) ?? 0;
      const previousInteractions = previousEventMaps.fieldInteractionMap.get(key) ?? 0;
      const previousAbandons = previousEventMaps.abandonFieldMap.get(key) ?? 0;
      return {
        formId,
        formName: String(form?.name ?? "Formulário"),
        fieldName,
        fieldLabel,
        abandons,
        interactions,
        abandonmentRate: interactions > 0 ? clampPercent((abandons / interactions) * 100) : clampPercent(abandons > 0 ? 100 : 0),
        previousAbandons,
        previousInteractions,
      };
    })
    .sort((a, b) => b.abandons - a.abandons || b.abandonmentRate - a.abandonmentRate)
    .slice(0, 8);

  const abandonmentTrends: MarketingAbandonmentTrendInsight[] = [
    ...abandonmentByStep.map((item) => {
      const previousRate = item.previousStepViews > 0 ? clampPercent((item.previousAbandons / item.previousStepViews) * 100) : clampPercent(item.previousAbandons > 0 ? 100 : 0);
      const currentRate = item.stepViews > 0 ? clampPercent((item.abandons / item.stepViews) * 100) : clampPercent(item.abandons > 0 ? 100 : 0);
      const delta = Math.round((currentRate - previousRate) * 10) / 10;
      const severity: MarketingAbandonmentTrendInsight["severity"] =
        currentRate >= 50 || delta >= 15 ? "critical" : delta >= 5 ? "warning" : "ok";
      return {
        kind: "step" as const,
        formId: item.formId,
        formName: item.formName,
        title: item.stepTitle,
        subtitle: "Etapa",
        current: item.abandons,
        previous: item.previousAbandons,
        delta,
        currentRate,
        previousRate,
        severity,
      };
    }),
    ...abandonmentByField.map((item) => {
      const previousRate = item.previousInteractions > 0 ? clampPercent((item.previousAbandons / item.previousInteractions) * 100) : clampPercent(item.previousAbandons > 0 ? 100 : 0);
      const currentRate = item.interactions > 0 ? clampPercent((item.abandons / item.interactions) * 100) : clampPercent(item.abandons > 0 ? 100 : 0);
      const delta = Math.round((currentRate - previousRate) * 10) / 10;
      const severity: MarketingAbandonmentTrendInsight["severity"] =
        currentRate >= 50 || delta >= 15 ? "critical" : delta >= 5 ? "warning" : "ok";
      return {
        kind: "field" as const,
        formId: item.formId,
        formName: item.formName,
        title: item.fieldLabel,
        subtitle: "Campo",
        current: item.abandons,
        previous: item.previousAbandons,
        delta,
        currentRate,
        previousRate,
        severity,
      };
    }),
  ]
    .sort((a, b) => b.currentRate - a.currentRate || b.delta - a.delta)
    .slice(0, 8);

  const recentSubmissions = leads
    .slice(0, 12)
    .map((lead, index) => {
      const negotiationId = toString(lead.negotiation_id);
      const negotiation = currentNegotiationMap.get(negotiationId);
      const formId = toString(lead.form_id);
      const form = formRows.find((item) => item.formId === formId);
      return {
        id: `${negotiationId || formId || "lead"}-${index}`,
        formId,
        formName: form?.formName ?? "Formulário",
        negotiationTitle: negotiation?.title ?? "Negociação criada",
        status: negotiation?.status ?? "em_andamento",
        totalValue: negotiation?.totalValue ?? 0,
        score: toNumber(lead.score),
        duplicate: lead.is_duplicate === true,
        utmSource: toString(lead.utm_source, "(direto)"),
        deviceType: toString(lead.device_type, "desconhecido"),
        createdAt: toString(lead.created_at, endIso),
      };
    });

  return {
    totals: {
      forms: formRows.length,
      activeForms: formRows.filter((f) => f.isActive).length,
      views: totalViews,
      submissions: totalSubmissions,
      leads: totalLeads,
      won: formRows.reduce((sum, row) => sum + row.won, 0),
      revenue: formRows.reduce((sum, row) => sum + row.revenue, 0),
      conversionRate: totalViews > 0 ? clampPercent((totalSubmissions / totalViews) * 100) : 0,
      abandonmentRate: totalViews > 0 ? clampPercent((1 - totalSubmissions / totalViews) * 100) : 0,
      avgScore: totalLeads > 0 ? Math.round(scoreSum / totalLeads) : 0,
      duplicateRate: totalLeads > 0 ? clampPercent((duplicateCount / totalLeads) * 100) : 0,
    },
    comparison: {
      periodDays,
      leads: totalLeads,
      submissions: totalSubmissions,
      won: formRows.reduce((sum, row) => sum + row.won, 0),
      revenue: formRows.reduce((sum, row) => sum + row.revenue, 0),
      avgScore: totalLeads > 0 ? Math.round(scoreSum / totalLeads) : 0,
      duplicateRate: totalLeads > 0 ? clampPercent((duplicateCount / totalLeads) * 100) : 0,
      conversionRate: totalViews > 0 ? clampPercent((totalSubmissions / totalViews) * 100) : 0,
      previous: {
        leads: prevLeadCount,
        submissions: 0,
        won: prevWon,
        revenue: prevRevenue,
        avgScore: prevLeadCount > 0 ? Math.round(prevScoreSum / prevLeadCount) : 0,
        duplicateRate: prevLeadCount > 0 ? clampPercent((prevDuplicateCount / prevLeadCount) * 100) : 0,
        conversionRate: totalViews > 0 ? clampPercent((totalSubmissions / totalViews) * 100) : 0,
      },
      delta: {
        leads: numberDelta(totalLeads, prevLeadCount),
        submissions: numberDelta(totalSubmissions, 0),
        won: numberDelta(formRows.reduce((sum, row) => sum + row.won, 0), prevWon),
        revenue: numberDelta(formRows.reduce((sum, row) => sum + row.revenue, 0), prevRevenue),
        avgScore: numberDelta(totalLeads > 0 ? Math.round(scoreSum / totalLeads) : 0, prevLeadCount > 0 ? Math.round(prevScoreSum / prevLeadCount) : 0),
        duplicateRate: numberDelta(
          totalLeads > 0 ? clampPercent((duplicateCount / totalLeads) * 100) : 0,
          prevLeadCount > 0 ? clampPercent((prevDuplicateCount / prevLeadCount) * 100) : 0,
        ),
        conversionRate: numberDelta(
          totalViews > 0 ? clampPercent((totalSubmissions / totalViews) * 100) : 0,
          totalViews > 0 ? clampPercent((totalSubmissions / totalViews) * 100) : 0,
        ),
      },
    },
    perForm: formRows.sort((a, b) => b.revenue - a.revenue || b.leads - a.leads),
    byUtmSource: Array.from(utmMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    byDevice: Array.from(deviceMap.entries()).map(([device, count]) => ({ device, count })),
    byDay,
    scoreBuckets: ["0–25", "26–50", "51–75", "76–100"].map((bucket) => ({
      bucket,
      count: scoreMap.get(bucket) ?? 0,
    })),
    recentSubmissions,
    recentUpdates: formRows
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8)
      .map((row) => ({
        formId: row.formId,
        formName: row.formName,
        updatedAt: row.updatedAt,
        attentionLevel: row.attentionLevel,
      })),
    abandonmentByStep,
    abandonmentByField,
    abandonmentTrends,
    trackedSessions: trackedSessionCount,
  };
}

export function useMarketingAnalytics(
  periodDays = 30,
  options?: Omit<UseQueryOptions<MarketingAnalytics>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: ["marketing-analytics", periodDays],
    queryFn: () => fetchMarketingAnalytics(periodDays),
    enabled: (enabledOption ?? true) && isSupabaseConfigured,
    staleTime: 60_000,
  });
}
