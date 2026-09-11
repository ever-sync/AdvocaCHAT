const missingLabels: Record<string, string> = {
  death_document_required: "Vincular a prova do falecimento",
  death_date_unconfirmed: "Conferir e registrar a data do falecimento",
  persons_not_documented: "Identificar as pessoas interessadas",
  person_evidence_required: "Vincular as provas das pessoas interessadas",
};
export function expansionSuccessionMissingLabel(code: string): string {
  return (
    missingLabels[code] ??
    "Há uma pendência documental que exige nova conferência"
  );
}
