// Helpers puros do quadro de CRM extraidos de Crm.tsx (que era um monolito de
// ~4,5k linhas). Sao constantes de UI (opcoes de filtro/ordenacao) e funcoes
// puras de filtro/ordenacao/comparacao — sem hooks nem JSX, faceis de testar.

import {
  Bookmark,
  ClipboardCheck,
  ClipboardList,
  Flame,
  Footprints,
  Pause,
  Snowflake,
  Target,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type { CrmFunnel } from "@/data/crm-funnels";
import type { CrmNegotiation, CrmNegotiationStatus, Customer } from "@/types/domain";
import { parseSyntheticCustomerCardId } from "@/lib/crm/negotiation-model";
import {
  type CrmAlertsFilterMode,
  isNegotiationUnassigned,
} from "@/lib/crm/negotiation-alerts";

export type CardDensity = "compact" | "cozy" | "expanded";

export const CARD_DENSITY_STORAGE_KEY = "CaleoCRM:crm:card-density";

export function readCardDensity(): CardDensity {
  if (typeof window === "undefined") return "cozy";
  try {
    const raw = window.localStorage.getItem(CARD_DENSITY_STORAGE_KEY);
    if (raw === "compact" || raw === "cozy" || raw === "expanded") return raw;
  } catch {
    // localStorage indisponível (modo privado) → silencia.
  }
  return "cozy";
}

export type SortId =
  | "priority"
  | "alpha_az"
  | "alpha_za"
  | "created_desc"
  | "created_asc"
  | "next_task"
  | "closing"
  | "contact_recent"
  | "contact_oldest"
  | "qualified_desc"
  | "qualified_asc"
  | "value_desc"
  | "value_asc"
  | "interaction_recent"
  | "interaction_oldest"
  | "score_desc"
  | "score_asc";

export type AppliedOwner =
  | { mode: "all" }
  | { mode: "mine" }
  | { mode: "pool" }
  | { mode: "custom"; ids: string[] };

export type OwnerDraft = {
  mode: "all" | "mine" | "pool" | "custom";
  customIds: Set<string>;
};

export const STATUS_OPTIONS: {
  id: "all" | CrmNegotiationStatus;
  label: string;
  icon: typeof ClipboardList;
}[] = [
  { id: "all", label: "Todos os status", icon: ClipboardCheck },
  { id: "em_andamento", label: "Em andamento", icon: Footprints },
  { id: "vendido", label: "Vendido", icon: ThumbsUp },
  { id: "perdido", label: "Perdido", icon: ThumbsDown },
  { id: "pausado", label: "Pausado", icon: Pause },
];

export const SORT_OPTIONS: { id: SortId; label: string }[] = [
  { id: "score_desc", label: "Lead score — mais quentes" },
  { id: "score_asc", label: "Lead score — mais frias" },
  { id: "priority", label: "Prioridade (qualif. × valor × tarefa)" },
  { id: "alpha_az", label: "Alfabética A-Z" },
  { id: "alpha_za", label: "Alfabética Z-A" },
  { id: "created_desc", label: "Criadas por último" },
  { id: "created_asc", label: "Criadas primeiro" },
  { id: "next_task", label: "Data da próxima tarefa" },
  { id: "closing", label: "Previsão de fechamento" },
  { id: "contact_recent", label: "Contato mais recente" },
  { id: "contact_oldest", label: "Contato mais antigo" },
  { id: "qualified_desc", label: "Mais qualificadas" },
  { id: "qualified_asc", label: "Menos qualificadas" },
  { id: "value_desc", label: "Maior valor total" },
  { id: "value_asc", label: "Menor valor total" },
  { id: "interaction_recent", label: "Interação mais recente" },
  { id: "interaction_oldest", label: "Interação mais antiga" },
];

export const STATUS_FILTER_IDS = new Set<string>(STATUS_OPTIONS.map((s) => s.id));
export const SORT_FILTER_IDS = new Set<string>(SORT_OPTIONS.map((s) => s.id));
export const ALERTS_FILTER_IDS = new Set<CrmAlertsFilterMode>([
  "off",
  "any",
  "stale",
  "no_future_task",
]);
export const OWNER_MODE_IDS = new Set<AppliedOwner["mode"]>(["all", "mine", "pool", "custom"]);

export type ScoreFilterMode = "all" | "hot" | "warm_plus" | "tepid_plus" | "cold";
export const SCORE_FILTER_IDS = new Set<ScoreFilterMode>([
  "all",
  "hot",
  "warm_plus",
  "tepid_plus",
  "cold",
]);
export const SCORE_FILTER_OPTIONS: { id: ScoreFilterMode; label: string; hint: string }[] = [
  { id: "all", label: "Todos os scores", hint: "Sem filtro de lead score" },
  { id: "hot", label: "🔥 Só quentes", hint: "Lead score ≥ 75" },
  { id: "warm_plus", label: "Mornos ou melhores", hint: "Lead score ≥ 50" },
  { id: "tepid_plus", label: "Tépidos ou melhores", hint: "Lead score ≥ 25" },
  { id: "cold", label: "❄️ Só frios", hint: "Lead score < 25" },
];
export function scoreFilterMatches(mode: ScoreFilterMode, total: number): boolean {
  switch (mode) {
    case "hot":
      return total >= 75;
    case "warm_plus":
      return total >= 50;
    case "tepid_plus":
      return total >= 25;
    case "cold":
      return total < 25;
    case "all":
    default:
      return true;
  }
}

export type SavedViewId = "hot" | "closing" | "cold";

export const SAVED_VIEWS: {
  id: SavedViewId;
  label: string;
  description: string;
  icon: typeof Bookmark;
}[] = [
  {
    id: "hot",
    label: "Minhas quentes",
    description: "Em andamento, comigo, qualif. alta primeiro",
    icon: Flame,
  },
  {
    id: "closing",
    label: "Fechando logo",
    description: "Em andamento, previsão de fechamento mais próxima",
    icon: Target,
  },
  {
    id: "cold",
    label: "Negócios frios",
    description: "Parados há tempo demais — reanime",
    icon: Snowflake,
  },
];

export const BASE_ATTENDANTS = [
  { id: "att-hitalo", name: "Hitalo Viana" },
  { id: "att-jorge", name: "Jorge Menezes Seixas" },
  { id: "att-rafael", name: "Rafael Santos" },
  { id: "att-nessa", name: "nessa" },
  { id: "att-recup", name: "recuperei lead" },
];

export function statusLabel(status: CrmNegotiationStatus): string {
  const row = STATUS_OPTIONS.find((s) => s.id === status);
  return row?.label ?? status;
}

/** Intervalo de filtro por data de criação (`yyyy-mm-dd`). */
export type CreationDateRangeIso = { from: string; to: string };

export function parseDateRangeIso(
  filter: CreationDateRangeIso,
): { from: Date; to: Date } | null {
  const from = new Date(`${filter.from}T00:00:00`);
  const to = new Date(`${filter.to}T23:59:59.999`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }
  return { from, to };
}

export function formatIsoDateToBr(isoDay: string): string {
  const [y, m, d] = isoDay.split("-");
  if (!y || !m || !d) {
    return isoDay;
  }
  return `${d}/${m}/${y}`;
}

export function stageTitleForNegotiation(card: CrmNegotiation, funnels: CrmFunnel[]): string {
  const f = funnels.find((x) => x.id === card.funnelId);
  return f?.stages.find((s) => s.id === card.stageId)?.title ?? card.stageId;
}

/** Prazo da próxima tarefa aberta (rollup em `crm_negotiations.next_task_at`). */
export function negotiationNextTaskDueMeta(
  iso: string | undefined,
): { label: string; overdue: boolean } {
  if (!iso?.trim()) {
    return { label: "", overdue: false };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { label: "", overdue: false };
  }
  return {
    label: d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    overdue: d.getTime() < Date.now(),
  };
}

export function resolveCustomerIdForNegotiation(
  card: CrmNegotiation,
  customers: Customer[],
): string | null {
  const syntheticId = parseSyntheticCustomerCardId(card.id);
  if (syntheticId) {
    return syntheticId;
  }
  if (card.customerId?.trim()) {
    return card.customerId.trim();
  }
  const title = card.title?.trim().toLowerCase();
  if (!title) {
    return null;
  }
  return customers.find((c) => c.nome?.trim().toLowerCase() === title)?.id ?? null;
}

export function appliedToOwnerDraft(applied: AppliedOwner): OwnerDraft {
  if (applied.mode === "custom") {
    return { mode: "custom", customIds: new Set(applied.ids) };
  }
  if (applied.mode === "pool") {
    return { mode: "pool", customIds: new Set() };
  }
  return { mode: applied.mode, customIds: new Set() };
}

export function draftToApplied(draft: OwnerDraft, profileId: string | undefined): AppliedOwner {
  if (draft.mode === "all" || draft.mode === "mine" || draft.mode === "pool") {
    return { mode: draft.mode };
  }
  const ids = [...draft.customIds];
  if (ids.length === 0) {
    return { mode: "all" };
  }
  if (profileId && ids.length === 1 && ids[0] === profileId) {
    return { mode: "mine" };
  }
  return { mode: "custom", ids };
}

export function matchesOwner(
  n: CrmNegotiation,
  applied: AppliedOwner,
  profileId: string | undefined,
): boolean {
  if (applied.mode === "all") {
    return true;
  }
  if (applied.mode === "pool") {
    return isNegotiationUnassigned(n.assigneeId);
  }
  if (applied.mode === "mine") {
    return Boolean(profileId && n.assigneeId === profileId);
  }
  return applied.ids.includes(n.assigneeId);
}

export function compareNegotiations(
  a: CrmNegotiation,
  b: CrmNegotiation,
  sortId: SortId,
): number {
  const str = (x: string | undefined, y: string | undefined, desc: boolean) => {
    const vx = x ?? "";
    const vy = y ?? "";
    const c = vx.localeCompare(vy, "pt-BR", { sensitivity: "base" });
    return desc ? -c : c;
  };
  const num = (x: number, y: number, desc: boolean) => (desc ? y - x : x - y);
  const time = (x: string | undefined, y: string | undefined, desc: boolean) => {
    const tx = x ? new Date(x).getTime() : desc ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    const ty = y ? new Date(y).getTime() : desc ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    return desc ? ty - tx : tx - ty;
  };

  switch (sortId) {
    case "priority": {
      const q = num(a.qualification, b.qualification, true);
      if (q !== 0) {
        return q;
      }
      const v = num(a.totalValue, b.totalValue, true);
      if (v !== 0) {
        return v;
      }
      const nt = time(a.nextTaskAt, b.nextTaskAt, false);
      if (nt !== 0) {
        return nt;
      }
      return time(a.createdAt, b.createdAt, true);
    }
    case "alpha_az":
      return str(a.title, b.title, false);
    case "alpha_za":
      return str(a.title, b.title, true);
    case "created_desc":
      return time(a.createdAt, b.createdAt, true);
    case "created_asc":
      return time(a.createdAt, b.createdAt, false);
    case "next_task":
      return time(a.nextTaskAt, b.nextTaskAt, false);
    case "closing":
      return time(a.closingForecast, b.closingForecast, false);
    case "contact_recent":
      return time(a.lastContactAt, b.lastContactAt, true);
    case "contact_oldest":
      return time(a.lastContactAt, b.lastContactAt, false);
    case "qualified_desc":
      return num(a.qualification, b.qualification, true);
    case "qualified_asc":
      return num(a.qualification, b.qualification, false);
    case "value_desc":
      return num(a.totalValue, b.totalValue, true);
    case "value_asc":
      return num(a.totalValue, b.totalValue, false);
    case "interaction_recent":
      return time(a.lastInteractionAt, b.lastInteractionAt, true);
    case "interaction_oldest":
      return time(a.lastInteractionAt, b.lastInteractionAt, false);
    default:
      return 0;
  }
}
