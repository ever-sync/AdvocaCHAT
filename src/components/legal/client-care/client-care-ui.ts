import {
  canAccessOperationCategory,
  type LegalOperationsProps,
} from "../operations/operations-ui";
import type {
  CareContext,
  CareMembership,
  PortalCategory,
  PortalScope,
} from "./types";
export type CareProps = LegalOperationsProps & { context: CareContext };
export const careKey = (p: LegalOperationsProps, section: string) => [
  "legal",
  p.workspace.user_id,
  p.workspace.tenant_id,
  "case",
  p.legalCase.id,
  "client-care",
  section,
];
export const careOwner = (p: LegalOperationsProps) =>
  p.workspace.user_id === p.legalCase.owner_id;
export const careCategoryAllowed = canAccessOperationCategory;
/** Re-check the current props before rendering a cached response after a grant change. */
export function visibleCareContext(
  props: LegalOperationsProps,
  data: CareContext,
): CareContext {
  const owner = careOwner(props);
  const allowed = (category: string) => careCategoryAllowed(props, category);
  const communications = data.communications.filter((row) =>
    allowed(row.category),
  );
  const jobs = data.jobs.filter((row) =>
    communications.some((message) => message.id === row.communication_id),
  );
  return {
    ...data,
    invites: owner ? data.invites : [],
    representation_grants: owner ? data.representation_grants : [],
    memberships: data.memberships.map((row) =>
      owner
        ? row
        : ({
            id: row.id,
            case_id: row.case_id,
            access_kind: row.access_kind,
            scopes: row.scopes,
            allow_medical: row.allow_medical,
            allow_fiscal: row.allow_fiscal,
            revision: row.revision,
            expires_at: row.expires_at,
            public_title: row.public_title,
            state: row.state,
          } as CareMembership),
    ),
    publications: data.publications.filter((row) => allowed(row.category)),
    releases: data.releases.filter((row) => allowed(row.category)),
    exports: allowed("fiscal") ? data.exports : [],
    requests: data.requests.filter((row) => allowed(row.category)),
    communications,
    jobs,
    receipts: data.receipts.filter((row) =>
      jobs.some((job) => job.id === row.job_id),
    ),
    messages: data.messages.filter((row) => allowed(row.category)),
    followup_rules: allowed("fiscal") ? data.followup_rules : [],
  };
}
export const CARE_SCOPES: Record<PortalScope, string> = {
  "case_summary:read": "Consultar atualizações revisadas",
  "agenda:read": "Consultar agenda liberada",
  "messages:read": "Ler mensagens do escritório",
  "messages:write": "Escrever mensagens no portal",
  "requests:upload": "Enviar documentos solicitados",
  "documents:read": "Baixar documentos liberados",
  "statements:read": "Consultar demonstrativos liberados",
  "fiscal_exports:read": "Consultar pacotes fiscais aprovados",
};
export const CARE_KINDS = {
  client: "Cliente",
  representative: "Representante",
  accountant: "Contador",
};
export const CARE_STATES: Record<string, string> = {
  draft: "Rascunho",
  approved: "Aprovado",
  rejected: "Não aprovado",
  issued: "Convite emitido",
  accepted: "Convite aceito",
  revoked: "Revogado",
  pending: "Aguardando ativação",
  active: "Ativo",
  superseded: "Versão substituída",
  cancelled: "Cancelado",
};
export const careMemberLabel = (m?: CareMembership) =>
  m
    ? `${m.public_title} · ${CARE_KINDS[m.access_kind]}${m.verified_email ? ` · ${m.verified_email}` : ""}`
    : "Destinatário indisponível";
export const careMemberAllows = (
  m: CareMembership | undefined,
  category: PortalCategory,
) =>
  Boolean(
    m &&
    m.state === "active" &&
    Date.parse(m.expires_at) > Date.now() &&
    (category === "general"
      ? m.access_kind !== "accountant"
      : category === "medical"
        ? m.allow_medical && m.access_kind !== "accountant"
        : m.allow_fiscal),
  );
export function careScopesFor(
  kind: CareMembership["access_kind"],
): PortalScope[] {
  return (Object.keys(CARE_SCOPES) as PortalScope[]).filter(
    (s) =>
      kind !== "accountant" ||
      ["requests:upload", "documents:read", "fiscal_exports:read"].includes(s),
  );
}

export function careTimestamp(value: string) {
  return new Date(`${value}:00-03:00`).toISOString();
}
export function careLocalDateTime(value?: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
