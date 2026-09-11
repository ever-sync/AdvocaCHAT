import type {
  AssistanceCitationChoice,
  AssistanceDraftBody,
  AssistanceDraftKind,
  AssistanceOcrKernelResult,
  AssistanceOcrPage,
} from "@/types/legal-assistance";
export const ASSISTANCE_DRAFT_KINDS: Record<AssistanceDraftKind, string> = {
  summary: "Resumo",
  chronology: "Cronologia",
  message: "Mensagem",
  pleading: "Peça",
};
export const OCR_PAGE_LABELS: Record<AssistanceOcrPage["status"], string> = {
  recognized: "Texto reconhecido",
  low_confidence: "Reconhecimento com baixa confiança",
  no_text_recognized: "Nenhum texto reconhecido",
  not_processed: "Página não processada",
};
export const OCR_RESULT_LABELS: Record<
  AssistanceOcrKernelResult["status"],
  string
> = {
  complete: "Reconhecimento concluído; revisão pendente",
  partial: "Processamento parcial",
  unreadable: "Texto não reconhecido",
  failed: "Processamento interrompido",
  refused: "Documento não processado",
};
const OCR_REASONS: Record<string, string> = {
  page_limit: "O documento ultrapassa o limite de páginas autorizado.",
  time_limit: "O tempo máximo de processamento foi atingido.",
  output_limit: "O texto ou a saída ultrapassou o limite autorizado.",
  input_limit: "O arquivo ultrapassa o tamanho permitido.",
  pixel_limit: "A resolução da página ultrapassa o limite seguro.",
  unsupported_mime: "Este formato não é aceito pelo reconhecimento disponível.",
  mime_mismatch: "O conteúdo do arquivo não corresponde ao formato informado.",
  encrypted_pdf: "O PDF está protegido e exige tratamento manual.",
  protected_pdf: "O PDF está protegido e exige tratamento manual.",
  invalid_pdf: "Não foi possível ler a estrutura do PDF.",
  invalid_png: "Não foi possível ler a imagem PNG.",
  animated_image_unsupported:
    "Imagens animadas não são aceitas para reconhecimento.",
  language_unavailable:
    "O idioma necessário não está instalado no serviço de reconhecimento.",
  engine_unavailable: "O serviço de reconhecimento está indisponível.",
  engine_failed: "O reconhecimento não foi concluído nesta tentativa.",
  invalid_tsv: "A saída de reconhecimento não passou pela validação.",
  processing_failed: "O processamento não foi concluído.",
  hash_mismatch: "O arquivo não corresponde à integridade esperada.",
};
export function assistanceOcrReason(reason: string | null | undefined) {
  return reason
    ? (OCR_REASONS[reason] ??
        "O processamento não pôde ser concluído. Examine o original e considere transcrição manual.")
    : null;
}
export function assistanceConfidence(value: string | null) {
  return value !== null && /^\d+(\.\d+)?$/.test(value)
    ? `${value.replace(".", ",")}%`
    : "Não disponível";
}
export function inspectAssistanceDraft(
  body: AssistanceDraftBody,
  choices: AssistanceCitationChoice[],
) {
  const byId = new Map(choices.map((choice) => [choice.citation.id, choice]));
  const unavailable = new Set<string>(),
    stale = new Set<string>();
  const uncited: number[] = [];
  body.sections.forEach((section, index) => {
    if (!section.citation_ids.length) uncited.push(index);
    for (const id of section.citation_ids) {
      const choice = byId.get(id);
      if (!choice?.readable) unavailable.add(id);
      else if (!choice.current) stale.add(id);
    }
  });
  return {
    uncited_sections: uncited,
    unavailable_citation_ids: [...unavailable],
    stale_citation_ids: [...stale],
  };
}

import type { LegalOperationsProps } from "../operations/operations-ui";
import type {
  AssistanceCategory,
  AssistanceContext,
  AssistanceTextState,
} from "@/types/legal-assistance";
export type AssistanceProps = LegalOperationsProps & {
  context: AssistanceContext;
};
export const ASSISTANCE_CATEGORIES: Record<AssistanceCategory, string> = {
  restricted: "Saúde e fiscal — acesso conjunto",
  general: "Geral",
  medical: "Saúde",
  fiscal: "Fiscal",
};
export const ASSISTANCE_TEXT_STATES: Record<AssistanceTextState, string> = {
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Versão revisada",
  returned: "Devolvida para ajuste",
  revoked: "Revogada",
};
export const assistanceOwner = (props: LegalOperationsProps) =>
  props.workspace.enabled &&
  props.legalCase.owner_id === props.workspace.user_id;
export const assistanceCaseAccess = (props: LegalOperationsProps) =>
  props.workspace.enabled &&
  props.legalCase.tenant_id === props.workspace.tenant_id &&
  (assistanceOwner(props) ||
    props.member?.profile_id === props.workspace.user_id);
export function assistanceCategoryAccess(
  props: LegalOperationsProps,
  category: AssistanceCategory,
) {
  if (!assistanceCaseAccess(props)) return false;
  if (assistanceOwner(props) || category === "general") return true;
  if (category === "medical") return Boolean(props.member?.can_view_medical);
  if (category === "fiscal") return Boolean(props.member?.can_view_fiscal);
  return Boolean(
    props.member?.can_view_medical && props.member?.can_view_fiscal,
  );
}
export const assistanceKey = (props: LegalOperationsProps, section: string) => [
  "legal",
  props.workspace.user_id,
  props.workspace.tenant_id,
  "case",
  props.legalCase.id,
  "assistance",
  section,
  assistanceOwner(props),
  Boolean(props.member?.can_view_medical),
  Boolean(props.member?.can_view_fiscal),
  assistanceCaseAccess(props),
];
export function assistanceDate(value: string | null | undefined) {
  if (!value) return "Não informada";
  const civil = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (civil) return `${civil[3]}/${civil[2]}/${civil[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não reconhecida"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(date);
}
export function assistanceVisible<
  T extends {
    tenant_id: string;
    category?: AssistanceCategory;
    case_id?: string;
  },
>(props: LegalOperationsProps, rows: T[]) {
  return rows.filter(
    (row) =>
      row.tenant_id === props.workspace.tenant_id &&
      (!row.case_id || row.case_id === props.legalCase.id) &&
      (!row.category || assistanceCategoryAccess(props, row.category)),
  );
}
export function assistanceChoice(
  citation: import("@/types/legal-assistance").AssistanceCitation,
  current = true,
): AssistanceCitationChoice {
  return { citation, label: citation.source_label, readable: true, current };
}
