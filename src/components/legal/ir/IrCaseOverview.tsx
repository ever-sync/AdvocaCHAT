import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileCheck2, Landmark, ListChecks, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { listIrAssessmentVersions, listIrChecklistItems, listIrDocumentReviews, listIrEvidenceEvents, listIrIncomeSources, listIrPayers, getIrCaseContext } from "@/lib/api/legal-ir";
import { listIrCalculationVersions, listIrCessationRecords, listIrClaims, listIrTaxEntries } from "@/lib/api/legal-ir-calculations";
import { deriveIrFiscalOverview, deriveIrReadiness, downloadIrCaseDossier, formatIrCents, type IrDossierData } from "@/lib/legal-ir-dossier";
import { OperationPanel } from "../operations/OperationPanel";
import { legalErrorMessage } from "../legal-ui";
import { irCategoryAllowed, irKey, type IrPanelProps } from "./ir-ui";

const LEVEL = { initial: "Cadastro inicial", attention: "Exige atenção", review: "Pronto para revisão", ready: "Organização completa" } as const;

export function IrCaseOverview(props: IrPanelProps) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [payers, incomes, evidence, reviews, checklist, assessments, taxEntries, calculations, claims, cessations] = useQueries({ queries: [
    { queryKey: irKey(props, "payers"), queryFn: () => listIrPayers(props.legalCase.id), enabled: props.ir.can_fiscal },
    { queryKey: irKey(props, "income"), queryFn: () => listIrIncomeSources(props.legalCase.id), enabled: props.ir.can_fiscal },
    { queryKey: irKey(props, "evidence"), queryFn: () => listIrEvidenceEvents(props.legalCase.id) },
    { queryKey: irKey(props, "document-reviews"), queryFn: () => listIrDocumentReviews(props.legalCase.id) },
    { queryKey: irKey(props, "checklist-items"), queryFn: () => listIrChecklistItems(props.legalCase.id) },
    { queryKey: irKey(props, "assessments"), queryFn: () => listIrAssessmentVersions(props.legalCase.id), enabled: props.ir.can_assess },
    { queryKey: irKey(props, "tax-entries"), queryFn: () => listIrTaxEntries(props.legalCase.id), enabled: props.ir.can_fiscal },
    { queryKey: irKey(props, "calculations"), queryFn: () => listIrCalculationVersions(props.legalCase.id), enabled: props.ir.can_fiscal },
    { queryKey: irKey(props, "claims"), queryFn: () => listIrClaims(props.legalCase.id), enabled: props.ir.can_fiscal },
    { queryKey: irKey(props, "cessations"), queryFn: () => listIrCessationRecords(props.legalCase.id), enabled: props.ir.can_fiscal },
  ] });
  const data: IrDossierData = {
    context: props.ir,
    payers: props.ir.can_fiscal ? (payers.data ?? []) : [],
    incomes: props.ir.can_fiscal ? (incomes.data ?? []) : [],
    evidence: (evidence.data ?? []).filter((item) => irCategoryAllowed(props, item.category)),
    reviews: (reviews.data ?? []).filter((item) => irCategoryAllowed(props, item.category)),
    checklist: (checklist.data ?? []).filter((item) => irCategoryAllowed(props, item.category)),
    assessments: props.ir.can_assess ? (assessments.data ?? []) : [],
    taxEntries: props.ir.can_fiscal ? (taxEntries.data ?? []) : [],
    calculations: props.ir.can_fiscal ? (calculations.data ?? []) : [],
    claims: props.ir.can_fiscal ? (claims.data ?? []) : [],
    cessations: props.ir.can_fiscal ? (cessations.data ?? []) : [],
  };
  const readiness = deriveIrReadiness(data);
  const fiscal = deriveIrFiscalOverview(data);
  const queries = [payers, incomes, evidence, reviews, checklist, assessments, taxEntries, calculations, claims, cessations];
  const loading = queries.some((query) => query.isFetching);
  const failed = queries.some((query) => query.error);

  async function exportDossier() {
    setDownloading(true);
    try {
      const before = await getIrCaseContext(props.legalCase.id);
      const [freshPayers, freshIncomes, freshEvidence, freshReviews, freshChecklist, freshAssessments, freshTaxEntries, freshCalculations, freshClaims, freshCessations] = await Promise.all([
        before.can_fiscal ? listIrPayers(props.legalCase.id) : Promise.resolve([]),
        before.can_fiscal ? listIrIncomeSources(props.legalCase.id) : Promise.resolve([]),
        listIrEvidenceEvents(props.legalCase.id), listIrDocumentReviews(props.legalCase.id), listIrChecklistItems(props.legalCase.id),
        before.can_assess ? listIrAssessmentVersions(props.legalCase.id) : Promise.resolve([]),
        before.can_fiscal ? listIrTaxEntries(props.legalCase.id) : Promise.resolve([]),
        before.can_fiscal ? listIrCalculationVersions(props.legalCase.id) : Promise.resolve([]),
        before.can_fiscal ? listIrClaims(props.legalCase.id) : Promise.resolve([]),
        before.can_fiscal ? listIrCessationRecords(props.legalCase.id) : Promise.resolve([]),
      ]);
      const after = await getIrCaseContext(props.legalCase.id);
      if (before.control.input_revision !== after.control.input_revision || before.can_fiscal !== after.can_fiscal || before.can_medical !== after.can_medical || before.can_assess !== after.can_assess) throw new Error("Os dados ou acessos mudaram durante a exportação. Atualize o caso e tente novamente.");
      const result = { context: after, payers: freshPayers, incomes: freshIncomes, evidence: freshEvidence, reviews: freshReviews, checklist: freshChecklist, assessments: freshAssessments, taxEntries: freshTaxEntries, calculations: freshCalculations, claims: freshClaims, cessations: freshCessations } satisfies IrDossierData;
      downloadIrCaseDossier(result, props.legalCase.title);
      toast({ title: "Dossiê preparado", description: "Abra o arquivo e use Imprimir para gerar o PDF após a revisão." });
    } catch (error) {
      toast({ title: "Não foi possível gerar o dossiê", description: legalErrorMessage(error), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  return <div className="space-y-4">
    <OperationPanel title="Visão de decisão do caso" description="Prontidão documental, divergências e próxima providência em uma única leitura." actions={<Button size="sm" variant="outline" onClick={() => void exportDossier()} disabled={downloading || loading || failed}><Download className="mr-2 h-4 w-4" aria-hidden />{downloading ? "Conferindo…" : "Baixar dossiê"}</Button>}>
      {failed ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Parte dos indicadores não pôde ser carregada. Atualize antes de tomar uma decisão.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={CheckCircle2} label="Organização" value={`${readiness.score}%`} detail={LEVEL[readiness.level]} />
        <Metric icon={Landmark} label="Fontes pagadoras" value={String(data.payers.length)} detail={`${data.incomes.length} rendimento(s)`} />
        <Metric icon={ListChecks} label="Checklist obrigatório" value={String(readiness.pendingRequired)} detail="pendência(s)" danger={readiness.pendingRequired > 0} />
        <Metric icon={FileCheck2} label="Documentos divergentes" value={String(readiness.inconsistentDocuments)} detail="a revisar" danger={readiness.inconsistentDocuments > 0} />
      </div>
      <div className="rounded-xl border bg-muted/20 p-4"><div className="flex items-start gap-3"><Route className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próxima ação sugerida</p><p className="mt-1 font-medium">{readiness.nextAction}</p><p className="mt-2 text-xs text-muted-foreground">Sugestão operacional baseada na completude. A estratégia e a decisão pertencem ao profissional responsável.</p></div></div></div>
      <div className="flex flex-wrap gap-2"><Badge variant="outline">{data.evidence.length} fatos na cronologia</Badge><Badge variant="outline">{readiness.evidenceWithoutExactDate} datas não exatas</Badge><Badge variant={readiness.sourcesWithoutWithholdingAnswer ? "secondary" : "outline"}>{readiness.sourcesWithoutWithholdingAnswer} retenções a confirmar</Badge>{!props.ir.assessment_is_current && props.ir.latest_assessment_id ? <Badge variant="secondary"><AlertTriangle className="mr-1 h-3 w-3" aria-hidden />Análise desatualizada</Badge> : null}</div>
      {props.ir.can_fiscal ? <div className="space-y-3 rounded-xl border p-4"><div><p className="font-medium">Panorama fiscal por ano</p><p className="text-xs text-muted-foreground">Somas dos lançamentos acessíveis; não equivalem a crédito reconhecido ou recebido.</p></div>{fiscal.years.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{fiscal.years.map((year) => <div key={year.year} className="rounded-lg bg-muted/40 p-3"><p className="font-semibold">{year.year}</p><p className="text-sm">{year.entries} lançamento(s)</p><p className="text-sm text-muted-foreground">IR retido informado: {formatIrCents(year.withheldCents)}</p></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum lançamento fiscal cadastrado.</p>}<div className="flex flex-wrap gap-2"><Badge variant={fiscal.entriesMissingPeriod ? "secondary" : "outline"}>{fiscal.entriesMissingPeriod} sem período</Badge><Badge variant={fiscal.entriesMissingPayer ? "secondary" : "outline"}>{fiscal.entriesMissingPayer} sem fonte</Badge><Badge variant={fiscal.calculationsAwaitingReview ? "secondary" : "outline"}>{fiscal.calculationsAwaitingReview} cálculos a revisar</Badge><Badge variant="outline">{fiscal.openClaims} pedidos abertos</Badge><Badge variant={fiscal.activeWithholdingChecks ? "secondary" : "outline"}>{fiscal.activeWithholdingChecks} retenções em acompanhamento</Badge></div></div> : null}
    </OperationPanel>
  </div>;
}

function Metric({ icon: Icon, label, value, detail, danger = false }: { icon: typeof CheckCircle2; label: string; value: string; detail: string; danger?: boolean }) {
  return <div className={`rounded-xl border p-4 ${danger ? "border-amber-300 bg-amber-50/60" : "bg-card"}`}><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="h-4 w-4" aria-hidden />{label}</div><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div>;
}
