import type { LegalOperationsProps } from "../operations/operations-ui";

import type {
  JudicialCategory,
  JudicialContext,
  JudicialScope,
} from "@/types/legal-judicial";
export type { JudicialCategory } from "@/types/legal-judicial";
export type JudicialProps = LegalOperationsProps & { context: JudicialContext };
export const blankJudicialScope = (): JudicialScope => ({
  court: "",
  degree: "",
  unit: "",
  territory: "",
});
export const JUDICIAL_CATEGORIES: Record<JudicialCategory, string> = {
  restricted: "Saúde e fiscal — acesso conjunto",
  general: "Geral",
  medical: "Saúde",
  fiscal: "Fiscal",
};
export const judicialOwner = (props: LegalOperationsProps) =>
  props.workspace.enabled &&
  props.legalCase.owner_id === props.workspace.user_id;
export const judicialCaseAccess = (props: LegalOperationsProps) =>
  props.workspace.enabled &&
  props.legalCase.tenant_id === props.workspace.tenant_id &&
  (judicialOwner(props) ||
    props.member?.profile_id === props.workspace.user_id);
export function judicialCategoryAccess(
  props: LegalOperationsProps,
  category: JudicialCategory,
) {
  if (!judicialCaseAccess(props)) return false;
  if (judicialOwner(props) || category === "general") return true;
  if (category === "medical") return Boolean(props.member?.can_view_medical);
  if (category === "fiscal") return Boolean(props.member?.can_view_fiscal);
  return Boolean(
    props.member?.can_view_medical && props.member?.can_view_fiscal,
  );
}
export const judicialKey = (props: LegalOperationsProps, section: string) => [
  "legal",
  props.workspace.user_id,
  props.workspace.tenant_id,
  "case",
  props.legalCase.id,
  "judicial",
  section,
  judicialOwner(props),
  Boolean(props.member?.can_view_medical),
  Boolean(props.member?.can_view_fiscal),
  judicialCaseAccess(props),
];
export const judicialWorkspaceKey = (
  props: LegalOperationsProps,
  section: string,
) => [
  "legal",
  props.workspace.user_id,
  props.workspace.tenant_id,
  "judicial",
  section,
];
export function judicialDate(
  value?: string | null,
  timezone = "America/Sao_Paulo",
) {
  if (!value) return "Não informada";
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) return `${parts[3]}/${parts[2]}/${parts[1]}`;
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    return `${value} (fuso não informado na origem)`;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não reconhecida na origem"
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: timezone,
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

export function judicialVisibleContext(
  props: LegalOperationsProps,
  data: JudicialContext,
): JudicialContext {
  const actual =
    judicialCaseAccess(props) &&
    data.tenant_id === props.workspace.tenant_id &&
    data.user_id === props.workspace.user_id;
  const dual = actual && judicialCategoryAccess(props, "restricted");
  const inbox = actual
    ? data.inbox.filter(
        (item) =>
          item.case_id === props.legalCase.id &&
          judicialCategoryAccess(props, item.category),
      )
    : [];
  const ids = new Set(inbox.map((item) => item.id));
  return {
    ...data,
    can_edit_case: actual && props.canEdit && data.can_edit_case,
    can_review_case: dual && judicialOwner(props) && data.can_review_case,
    can_manage_sources: actual && data.can_manage_sources,
    can_edit_catalog: actual && data.can_edit_catalog,
    can_approve_catalog: actual && data.can_approve_catalog,
    sources: actual ? data.sources : [],
    connections: actual ? data.connections : [],
    coverages: actual ? data.coverages : [],
    calendars: actual ? data.calendars : [],
    rules: actual ? data.rules : [],
    inbox,
    triage: actual ? data.triage.filter((row) => ids.has(row.inbox_id)) : [],
    jobs: dual
      ? data.jobs.filter(
          (row) => !row.case_id || row.case_id === props.legalCase.id,
        )
      : [],
    deadlines: dual
      ? data.deadlines.filter((row) => row.case_id === props.legalCase.id)
      : [],
    deadline_states: dual ? data.deadline_states : [],
  };
}
export const judicialAssignees = (
  props: LegalOperationsProps,
  category: JudicialCategory,
) =>
  props.workspace.collaborators.filter(
    (person) =>
      person.id === props.legalCase.owner_id ||
      props.members?.some(
        (member) =>
          member.profile_id === person.id &&
          (category === "general" ||
            (category === "medical" && member.can_view_medical) ||
            (category === "fiscal" && member.can_view_fiscal) ||
            (category === "restricted" &&
              member.can_view_medical &&
              member.can_view_fiscal)),
      ),
  );
export const judicialName = (props: LegalOperationsProps, id: string | null) =>
  props.workspace.collaborators.find((person) => person.id === id)?.nome ??
  (id ? "Integrante autorizado" : "Não informado");
export const JUDICIAL_STATES: Record<string, string> = {
  draft: "Rascunho",
  approved: "Aprovado",
  rejected: "Rejeitado",
  revoked: "Revogado",
  permission_pending: "Permissão pendente",
  not_configured: "Não configurado",
  disabled: "Desabilitado",
  active: "Ativo",
  degraded: "Com falha ou atraso",
  rate_limited: "Limite de frequência",
  quota_exhausted: "Cota esgotada",
  coverage_unknown: "Cobertura não confirmada",
  queued: "Na fila",
  sending: "Consulta em andamento",
  retry_wait: "Aguardando nova tentativa",
  succeeded: "Consulta concluída",
  failed: "Falhou",
  unknown: "Resultado não confirmado",
  cancelled: "Cancelado",
  verified: "Cobertura conferida",
  interrupted: "Interrompido",
  unmatched: "Sem vínculo",
  ambiguous: "Vínculo ambíguo",
  confirmed: "Vínculo conferido",
  quarantined: "Nova versão para conferir",
  pending: "Aguardando tratamento",
  accepted: "Assumido no escritório",
  completed: "Conferido no escritório",
  incomplete: "Contagem incompleta",
  in_review: "Em revisão",
  reviewed: "Prazo revisado",
  returned: "Devolvido para ajuste",
};
export const JUDICIAL_OPERATIONS: Record<string, string> = {
  consult_cnj: "Consultar processo pelo CNJ",
  discover_oab: "Descobrir candidatos por OAB",
  monitor_process: "Solicitar monitoramento de processo",
  monitor_diary: "Solicitar monitoramento de diário",
  read_updates: "Consultar atualizações",
  reconcile_monitor: "Conciliar monitor com resultado desconhecido",
};

export function judicialApprovedHeads<
  T extends { state: string; version_number: number },
>(rows: T[], key: (row: T) => string): T[] {
  const heads = new Map<string, T>();
  for (const row of rows) {
    if (row.state !== "approved") continue;
    const old = heads.get(key(row));
    if (!old || row.version_number > old.version_number)
      heads.set(key(row), row);
  }
  return [...heads.values()];
}

export const JUDICIAL_ANCHORS: Record<string, string> = {
  made_available_on: "Disponibilização na fonte",
  published_on: "Publicação na fonte",
  awareness_effective_on: "Ciência jurídica comprovada",
  decision_signed_at: "Assinatura da decisão",
  communication_sent_at: "Envio da comunicação",
  source_consulted_at: "Consulta documentada à fonte",
  manual_verified: "Marco alternativo documentado e conferido",
};

export function judicialContinuation(
  job: import("@/types/legal-judicial").JudicialJob,
): import("@/types/legal-judicial").JudicialQuery["cursor"] | null {
  const raw = job.result_summary?.next_cursor;
  if (
    !["discover_oab", "read_updates"].includes(job.operation) ||
    job.state !== "succeeded" ||
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  )
    return null;
  const cursor = raw as Record<string, unknown>;
  const entries = Object.entries(cursor);
  if (
    !entries.length ||
    entries.some(
      ([key, value]) =>
        !["cursor", "li", "page"].includes(key) ||
        (typeof value !== "string" && typeof value !== "number") ||
        (typeof value === "number" && !Number.isSafeInteger(value)) ||
        (key === "cursor"
          ? !/^[A-Za-z0-9_+/=-]{1,1000}$/.test(String(value))
          : !/^\d{1,20}$/.test(String(value))),
    )
  )
    return null;
  return cursor as import("@/types/legal-judicial").JudicialQuery["cursor"];
}
