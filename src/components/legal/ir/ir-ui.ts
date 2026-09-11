import type { IrCaseContext, IrEvidenceType } from "@/types/legal-ir";
import type { LegalDocumentCategory } from "@/types/legal";
import type { LegalOperationsProps } from "../operations/operations-ui";

export type IrPanelProps = LegalOperationsProps & { ir: IrCaseContext };
export const irKey = (props: LegalOperationsProps, section: string) => [
  "legal",
  props.workspace.user_id,
  props.workspace.tenant_id,
  "case",
  props.legalCase.id,
  "ir",
  section,
];
export const irWorkspaceKey = (
  props: LegalOperationsProps,
  section: string,
) => [
  "legal",
  props.workspace.user_id,
  props.workspace.tenant_id,
  "ir",
  section,
];
export const isIrOwner = (props: LegalOperationsProps) =>
  props.legalCase.owner_id === props.workspace.user_id;
export const irCategoryAllowed = (props: IrPanelProps, category: string) =>
  category === "general" ||
  (category === "medical" && props.ir.can_medical) ||
  (category === "fiscal" && props.ir.can_fiscal);
export const WORKFLOW_STATUS = {
  incomplete: "Incompleta",
  in_legal_review: "Em revisão jurídica",
  proposed: "Enquadramento proposto",
  decision_recorded: "Decisão profissional registrada",
} as const;
export const PAYER_TYPES = {
  inss: "INSS",
  rpps: "Regime próprio",
  military: "Fonte militar",
  supplementary: "Previdência complementar",
  employer: "Empregador",
  other: "Outra fonte",
} as const;
export const INCOME_KINDS = {
  retirement: "Aposentadoria",
  pension: "Pensão",
  military_retirement: "Reforma militar",
  paid_reserve: "Reserva remunerada",
  salary: "Salário / atividade laboral",
  rent: "Aluguel",
  supplementary_benefit: "Benefício de previdência complementar",
  supplementary_redemption: "Resgate de previdência complementar",
  other: "Outro rendimento",
} as const;
export const REGIMES = {
  rgps: "RGPS",
  rpps: "RPPS",
  military: "Militar",
  supplementary: "Previdência complementar",
  other: "Outro",
  unknown: "Não informado",
} as const;
export const WITHHOLDING = {
  yes: "Retenção informada",
  no: "Sem retenção informada",
  unknown: "Ainda não informado",
} as const;
export const PRODUCT_TYPES = {
  none: "Não se aplica",
  pgbl: "PGBL",
  vgbl: "VGBL",
  other: "Outro produto",
  unknown: "Não informado",
} as const;
export const PENSION_KINDS = {
  survivor: "Pensão por morte",
  alimony: "Pensão alimentícia",
  other: "Outra pensão",
  unknown: "Não informado",
} as const;
export const INCOME_EVENTS = {
  recurring: "Periódico",
  lump_sum: "Pagamento ou evento único",
  unknown: "Não informado",
} as const;
export const EVIDENCE_TYPES = {
  disease_onset_reported: "Início da doença informado",
  diagnosis_reported: "Diagnóstico informado",
  medical_report_issued: "Emissão de laudo",
  medical_evidence_received: "Documento médico recebido",
  benefit_started: "Início do benefício",
  withholding_started: "Início de retenção",
  withholding_stopped: "Cessação de retenção",
  tax_document_issued: "Documento fiscal emitido",
  administrative_protocol: "Protocolo administrativo",
  judicial_protocol: "Protocolo judicial",
  other: "Outro fato informado",
} as const;
export function evidenceCategory(
  type: IrEvidenceType,
  requested: LegalDocumentCategory,
): LegalDocumentCategory {
  if (
    [
      "diagnosis_reported",
      "disease_onset_reported",
      "medical_report_issued",
      "medical_evidence_received",
    ].includes(type)
  )
    return "medical";
  if (
    [
      "benefit_started",
      "withholding_started",
      "withholding_stopped",
      "tax_document_issued",
    ].includes(type)
  )
    return "fiscal";
  return requested;
}
export const DATE_PRECISION = {
  exact: "Data indicada no documento",
  estimated: "Data estimada / relatada",
  unknown: "Data desconhecida",
} as const;
export const DOCUMENT_CHECKS = {
  identity: "Identificação da pessoa",
  issuer: "Identificação do emissor",
  signature: "Assinatura",
  date: "Data",
  readability: "Legibilidade",
  source: "Origem do documento",
} as const;
export const CHECK_RESULTS = {
  present: "Conferido",
  absent: "Ausente",
  unclear: "Não esclarecido",
  not_applicable: "Não se aplica",
} as const;
export const DOCUMENT_REVIEW_RESULTS = {
  sufficient: "Conferência concluída",
  pending: "Complementação necessária",
  inconsistent: "Divergência identificada",
} as const;
export const CHECKLIST_STAGES = {
  intake: "Coleta inicial",
  decision: "Revisão da estratégia",
  filing: "Preparação do protocolo",
  followup: "Acompanhamento",
} as const;
export const CHECKLIST_STATES = {
  pending: "Pendente",
  open: "Documento solicitado",
  uploading: "Envio em andamento",
  submitted: "Documento aguardando revisão",
  approved: "Documento aprovado",
  rejected: "Correção solicitada",
  cancelled: "Solicitação cancelada",
  waived: "Dispensado com justificativa",
} as const;
export const STRATEGIES = {
  documents_first: "Completar a documentação",
  administrative: "Via administrativa",
  judicial: "Via judicial",
  combined: "Atuação combinada",
} as const;
export const PROPOSALS = {
  needs_review: "Necessita revisão",
  proposed_applicable: "Aplicação proposta pelo advogado",
  proposed_not_applicable: "Não aplicação proposta pelo advogado",
} as const;
export const ASSESSMENT_STATUS = {
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Revisão aprovada",
  superseded: "Versão substituída",
} as const;
export const REPRESENTATION_BASIS = {
  power_of_attorney: "Procuração",
  court_order: "Ordem judicial",
  legal_guardianship: "Representação legal",
  other: "Outro fundamento",
} as const;
export const REPRESENTATION_STATUS = {
  draft: "Aguardando revisão",
  active: "Ativa",
  revoked: "Revogada",
  expired: "Validade encerrada",
  not_started: "Validade ainda não iniciada",
  invalid_evidence: "Evidência precisa de revisão",
} as const;
export const personName = (props: LegalOperationsProps, id?: string | null) =>
  props.workspace.collaborators.find((person) => person.id === id)?.nome ??
  "Profissional do escritório";
export function safeReferenceUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
