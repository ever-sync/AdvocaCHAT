import type {
  ExpansionActChecks,
  ExpansionOperation,
} from "@/types/legal-expansion";
export const ACT_KIND_LABELS = {
  petition: "Petição",
  awareness: "Ciência",
  administrative_request: "Requerimento administrativo",
  other: "Outro ato",
};
export const ACT_CHECK_LABELS: Record<keyof ExpansionActChecks, string> = {
  documents_complete: "Conferi a integridade e a suficiência dos documentos",
  recipient_verified: "Conferi o destinatário e o processo, quando aplicável",
  representation_reviewed:
    "Examinei os poderes específicos de representação para este ato",
  signature_checked: "Conferi a assinatura e sua prova",
  channel_authorized: "Conferi o canal e a autorização institucional",
  legal_consequences_reviewed: "Examinei as consequências jurídicas do ato",
};
export const OPERATION_LABELS: Record<ExpansionOperation, string> = {
  domicilio_list: "Listar comunicações",
  domicilio_logs: "Consultar registros de comunicação",
  domicilio_awareness: "Ciência no Domicílio",
  court_case_read: "Consultar processo",
  court_publication_read: "Consultar publicações",
  petition_submit: "Peticionamento",
  inss_request: "Requerimento ao INSS",
  registry_search: "Pesquisa de registro",
  registry_signature: "Assinatura em registro",
  other_manual: "Operação manual específica",
};
const ACT_MISSING: Record<string, string> = {
  operation_permission_required:
    "Conferir permissão institucional, prova e vigência da operação.",
  operation_channel_mismatch:
    "A operação e o canal do ato precisam coincidir com a cobertura.",
  court_coverage_mismatch:
    "O órgão do processo precisa coincidir com a cobertura.",
  signed_artifact_evidence_required:
    "Selecionar o arquivo final assinado e a prova de assinatura.",
  communication_origin_proof_required:
    "Selecionar a prova de origem da comunicação para ciência.",
  representation_not_current:
    "A representação selecionada precisa estar vigente.",
  instrument_not_current_approved:
    "Selecionar uma versão atual e aprovada do instrumento.",
  succession_operation_authority_required:
    "Conferir poderes sucessórios atuais para esta operação.",
  source_snapshot_changed:
    "As fontes mudaram: preparar nova versão para conferência.",
};
export function expansionActMissing(code: string) {
  if (code.startsWith("check_"))
    return (
      ACT_CHECK_LABELS[code.slice(6) as keyof typeof ACT_CHECK_LABELS] ??
      "Completar a conferência do preparo."
    );
  return (
    ACT_MISSING[code] ??
    "Há um elemento do preparo que precisa ser conferido no registro atualizado."
  );
}
