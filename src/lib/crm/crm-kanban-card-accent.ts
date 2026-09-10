import type { CrmNegotiation, Customer } from "@/types/domain";
import type { CrmFunnel, CrmStageDef } from "@/data/crm-funnels";

export type CrmKanbanCardAccent =
  | "duplicate"
  | "qualified"
  | "lost-lead"
  | "contact-fresh"
  | "contact-warn"
  | "contact-overdue";

export type CrmKanbanCardAccentResult = {
  accents: CrmKanbanCardAccent[];
  className?: string;
  title?: string;
};

const CONTACT_STAGE_RE =
  /(1\s*º|primeir).{0,12}contato|(2\s*º|segundo).{0,12}contato|contato\s*feito/i;

const LOST_KEYWORD_RE =
  /(n[aã]o\s+(é|e)\s+apo?ent|inss|benef[ií]cio|sem\s+direito|indeferente|desqualific)/i;

function normalizePhoneDigits(value?: string | null): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 8) return "";
  return digits.length > 11 ? digits.slice(-11) : digits;
}

export function buildCustomerPhoneIndex(customers: Customer[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const c of customers) {
    const keys = [
      normalizePhoneDigits(c.telefone),
      normalizePhoneDigits(c.celular),
      normalizePhoneDigits(c.phoneE164),
      normalizePhoneDigits(c.phoneDigits),
    ].filter(Boolean);
    for (const key of keys) {
      const set = index.get(key) ?? new Set<string>();
      set.add(c.id);
      index.set(key, set);
    }
  }
  return index;
}

export function isDuplicateLeadCustomer(
  customer: Customer | null | undefined,
  phoneIndex: Map<string, Set<string>>,
  excludeCustomerId?: string | null,
): boolean {
  if (!customer) return false;
  const keys = [
    normalizePhoneDigits(customer.telefone),
    normalizePhoneDigits(customer.celular),
    normalizePhoneDigits(customer.phoneE164),
    normalizePhoneDigits(customer.phoneDigits),
  ].filter(Boolean);
  for (const key of keys) {
    const ids = phoneIndex.get(key);
    if (!ids || ids.size < 2) continue;
    const others = [...ids].filter((id) => id !== excludeCustomerId);
    if (others.length > 0) return true;
  }
  return false;
}

export function isFullyQualifiedNegotiation(card: CrmNegotiation): boolean {
  return (card.qualification ?? 0) >= 5;
}

export function isLostLeadHighlight(
  card: CrmNegotiation,
  customer?: Customer | null,
): boolean {
  if (card.status === "perdido") return true;
  if (!customer) return false;
  const haystack = [
    customer.observacoes ?? "",
    customer.perfil ?? "",
    JSON.stringify(customer.sourceColumns ?? {}),
  ]
    .join(" ")
    .toLowerCase();
  return LOST_KEYWORD_RE.test(haystack);
}

export function isContactTimingStage(stage?: CrmStageDef | null): boolean {
  if (!stage?.title) return false;
  return CONTACT_STAGE_RE.test(stage.title);
}

function hoursSince(iso?: string | null, nowMs = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 3_600_000;
}

export function contactTimingAccent(
  card: CrmNegotiation,
  stage?: CrmStageDef | null,
  nowMs = Date.now(),
): CrmKanbanCardAccent | null {
  if (!isContactTimingStage(stage)) return null;
  const hours =
    hoursSince(card.lastInteractionAt ?? card.lastContactAt, nowMs) ??
    hoursSince(card.createdAt, nowMs);
  if (hours == null) return null;
  if (hours <= 24) return "contact-fresh";
  if (hours <= 48) return "contact-warn";
  return "contact-overdue";
}

const ACCENT_CLASS: Record<CrmKanbanCardAccent, string> = {
  duplicate: "border-amber-400/80 bg-amber-50/40 dark:bg-amber-950/20",
  qualified: "border-emerald-500/80 bg-emerald-50/50 dark:bg-emerald-950/25",
  "lost-lead": "border-[var(--crm-danger-border)] bg-[var(--crm-danger-tint)]/40",
  "contact-fresh": "border-emerald-400/70 bg-emerald-50/30",
  "contact-warn": "border-amber-400/70 bg-amber-50/35",
  "contact-overdue": "border-[var(--crm-danger-border)] bg-[var(--crm-danger-tint)]/30",
};

const ACCENT_LABEL: Record<CrmKanbanCardAccent, string> = {
  duplicate: "Lead repetida — mesmo telefone/cadastro",
  qualified: "100% qualificada",
  "lost-lead": "Lead perdido / desqualificado",
  "contact-fresh": "Dentro do prazo de retorno",
  "contact-warn": "Retorno em atraso leve",
  "contact-overdue": "Retorno urgente",
};

export function resolveCrmKanbanCardAccent(input: {
  card: CrmNegotiation;
  customer?: Customer | null;
  stage?: CrmStageDef | null;
  phoneIndex: Map<string, Set<string>>;
  nowMs?: number;
}): CrmKanbanCardAccentResult {
  const accents: CrmKanbanCardAccent[] = [];

  if (isDuplicateLeadCustomer(input.customer, input.phoneIndex, input.card.customerId)) {
    accents.push("duplicate");
  }
  if (isFullyQualifiedNegotiation(input.card)) {
    accents.push("qualified");
  }
  if (isLostLeadHighlight(input.card, input.customer)) {
    accents.push("lost-lead");
  }
  const timing = contactTimingAccent(input.card, input.stage, input.nowMs);
  if (timing) accents.push(timing);

  if (accents.length === 0) {
    return { accents: [] };
  }

  const primary =
    accents.find((a) => a === "duplicate") ??
    accents.find((a) => a === "qualified") ??
    accents.find((a) => a === "lost-lead") ??
    accents.find((a) => a.startsWith("contact-")) ??
    accents[0];

  return {
    accents,
    className: ACCENT_CLASS[primary],
    title: accents.map((a) => ACCENT_LABEL[a]).join(" · "),
  };
}

export function orderFunnelStages(
  funnel: CrmFunnel,
  customOrder: string[] | null | undefined,
): CrmStageDef[] {
  if (!customOrder?.length) return funnel.stages;
  const byId = new Map(funnel.stages.map((s) => [s.id, s]));
  const ordered: string[] = [];
  for (const id of customOrder) {
    if (byId.has(id)) ordered.push(id);
  }
  for (const s of funnel.stages) {
    if (!ordered.includes(s.id)) ordered.push(s.id);
  }
  return ordered.map((id) => byId.get(id)!);
}

export function funnelStageOrderStorageKey(funnelId: string): string {
  return `crm-funnel-stage-order:${funnelId}`;
}

export function readFunnelStageOrder(funnelId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(funnelStageOrderStorageKey(funnelId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.map((v) => String(v)).filter(Boolean);
  } catch {
    return null;
  }
}

export function writeFunnelStageOrder(funnelId: string, stageOrder: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(funnelStageOrderStorageKey(funnelId), JSON.stringify(stageOrder));
}
