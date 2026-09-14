import type { IrDocumentChecks } from "@/types/legal-ir";

export type MedicalDocumentClassification =
  | "probable_medical_report"
  | "needs_review"
  | "probably_other"
  | "unreadable"
  | "no_ocr";

export interface MedicalDocumentPageInput {
  page: number;
  text: string | null;
  status:
    | "recognized"
    | "low_confidence"
    | "no_text_recognized"
    | "not_processed"
    | "manual";
}

export interface MedicalDocumentSignal {
  key: string;
  label: string;
  pages: number[];
  kind: "support" | "counter";
}

export interface MedicalDocumentAnalysis {
  classification: MedicalDocumentClassification;
  signals: MedicalDocumentSignal[];
  missing: string[];
  suggestedChecks: IrDocumentChecks;
  summary: string;
}

const SUPPORT = [
  [
    "title",
    "Título ou expressão de laudo/relatório médico",
    /\b(laudo|relatorio)\s+(medico|clinico)\b/,
    3,
  ],
  [
    "patient",
    "Identificação do paciente",
    /\b(paciente|nome\s+do\s+paciente|identificacao\s+do\s+paciente)\b/,
    1,
  ],
  [
    "registration",
    "Registro CRM identificável",
    /\bcrm\s*(?:[-/:]\s*)?(?:[a-z]{2}\s*)?(?:[-/:]\s*)?\d{4,10}\b/,
    2,
  ],
  [
    "signature",
    "Indício textual de assinatura",
    /\b(assinatura|assinado\s+digitalmente|documento\s+assinado)\b/,
    1,
  ],
  [
    "date",
    "Data indicada",
    /\b(?:[0-3]?\d[/.][01]?\d[/.](?:19|20)\d{2}|(?:19|20)\d{2}-[01]\d-[0-3]\d)\b/,
    1,
  ],
  [
    "clinical",
    "Descrição ou histórico clínico",
    /\b(quadro\s+clinico|historico\s+clinico|diagnostico|anamnese|evolucao\s+clinica)\b/,
    2,
  ],
  [
    "conclusion",
    "Conclusão ou avaliação médica",
    /\b(conclusao|parecer|prognostico|incapacidade|limitacao\s+funcional)\b/,
    2,
  ],
] as const;

const COUNTER = [
  [
    "prescription",
    "Texto característico de receita ou prescrição",
    /\b(receita\s+medica|prescricao|uso\s+(oral|topico|continuo))\b/,
    3,
  ],
  [
    "exam_request",
    "Texto característico de pedido de exame",
    /\b(solicitacao|pedido)\s+de\s+exame\b/,
    3,
  ],
  [
    "exam_result",
    "Texto característico de resultado de exame",
    /\b(resultado\s+(laboratorial|de\s+exame)|valores?\s+de\s+referencia)\b/,
    2,
  ],
  [
    "attendance",
    "Texto característico de declaração de comparecimento",
    /\b(declaracao\s+de\s+comparecimento|compareceu\s+(a|ao))\b/,
    3,
  ],
  [
    "certificate",
    "Texto característico de atestado",
    /\b(atestado\s+medico|atesto\s+para\s+os\s+devidos\s+fins)\b/,
    2,
  ],
] as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function pagesMatching(pages: MedicalDocumentPageInput[], pattern: RegExp) {
  return pages
    .filter((page) => pattern.test(normalize(page.text ?? "")))
    .map((page) => page.page);
}

export function analyzeMedicalDocument(
  pages: MedicalDocumentPageInput[],
): MedicalDocumentAnalysis {
  if (!pages.length)
    return {
      classification: "no_ocr",
      signals: [],
      missing: ["Texto OCR ainda não disponível"],
      suggestedChecks: { readability: "unclear", source: "unclear" },
      summary: "Execute ou aprove uma transcrição antes da análise assistida.",
    };
  const readable = pages.filter(
    (page) =>
      page.text?.trim() &&
      !["not_processed", "no_text_recognized"].includes(page.status),
  );
  if (!readable.length)
    return {
      classification: "unreadable",
      signals: [],
      missing: ["Nenhuma página com texto legível"],
      suggestedChecks: { readability: "absent", source: "unclear" },
      summary:
        "O arquivo não produziu texto legível; confira o original ou solicite nova cópia.",
    };

  let supportScore = 0;
  let counterScore = 0;
  const signals: MedicalDocumentSignal[] = [];
  for (const [key, label, pattern, weight] of SUPPORT) {
    const found = pagesMatching(readable, pattern);
    if (found.length) {
      supportScore += weight;
      signals.push({ key, label, pages: found, kind: "support" });
    }
  }
  for (const [key, label, pattern, weight] of COUNTER) {
    const found = pagesMatching(readable, pattern);
    if (found.length) {
      counterScore += weight;
      signals.push({ key, label, pages: found, kind: "counter" });
    }
  }
  const has = (key: string) =>
    signals.some((signal) => signal.key === key && signal.kind === "support");
  const probable =
    supportScore >= 7 &&
    has("title") &&
    has("registration") &&
    (has("clinical") || has("conclusion"));
  const classification = probable
    ? "probable_medical_report"
    : counterScore >= 3 && supportScore < 5
      ? "probably_other"
      : "needs_review";
  const missing = [
    ["patient", "Identificação do paciente não localizada"],
    ["registration", "Registro CRM não localizado"],
    ["signature", "Assinatura não confirmada pelo texto"],
    ["date", "Data de emissão não localizada"],
    ["clinical", "Descrição clínica não localizada"],
    ["conclusion", "Conclusão médica não localizada"],
  ]
    .filter(([key]) => !has(key))
    .map(([, label]) => label);
  const suggestedChecks: IrDocumentChecks = {
    identity: has("patient") ? "present" : "unclear",
    issuer: has("registration") ? "present" : "unclear",
    signature: has("signature") ? "present" : "unclear",
    date: has("date") ? "present" : "unclear",
    readability: pages.some((page) => page.status === "low_confidence")
      ? "unclear"
      : "present",
    source: "unclear",
  };
  const label =
    classification === "probable_medical_report"
      ? "Provável laudo ou relatório médico"
      : classification === "probably_other"
        ? "Provavelmente outro tipo de documento"
        : "Tipo documental exige conferência";
  return {
    classification,
    signals,
    missing,
    suggestedChecks,
    summary: `${label}. ${signals.filter((signal) => signal.kind === "support").length} indício(s) favorável(is) e ${signals.filter((signal) => signal.kind === "counter").length} contrário(s).`,
  };
}
