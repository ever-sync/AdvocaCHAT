import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import {
  createIrAssessmentVersion,
  listIrAssessmentVersions,
  listIrEvidenceEvents,
  listIrIncomeSources,
  listIrPayers,
  listIrRuleVersions,
  reviewIrAssessment,
  submitIrAssessmentReview,
} from "@/lib/api/legal-ir";
import { listLegalDocuments } from "@/lib/api/legal";
import type {
  IrAssessmentVersion,
  IrEvidenceEvent,
  IrIncomeSource,
  IrJson,
  IrPayer,
  IrRuleVersion,
  IrSourceProposal,
  IrStrategy,
} from "@/types/legal-ir";
import type { LegalCaseDocument } from "@/types/legal";
import { LegalError, LegalField } from "../LegalShared";
import {
  DOCUMENT_CATEGORIES,
  legalDate,
  selectClassName,
  useLegalAction,
} from "../legal-ui";
import {
  OperationPanel,
  OperationReasonDialog,
  OperationRecords,
} from "../operations/OperationPanel";
import { IrAccessNotice, IrDialog, IrSelection } from "./IrShared";
import {
  ASSESSMENT_STATUS,
  EVIDENCE_TYPES,
  INCOME_KINDS,
  PRODUCT_TYPES,
  PENSION_KINDS,
  INCOME_EVENTS,
  PROPOSALS,
  STRATEGIES,
  irKey,
  irWorkspaceKey,
  isIrOwner,
  personName,
  safeReferenceUrl,
  type IrPanelProps,
} from "./ir-ui";

const incomeTitle = (income: IrIncomeSource, payers: IrPayer[]) =>
  `${payers.find((payer) => payer.id === income.payer_id)?.name ?? "Fonte pagadora"} · ${INCOME_KINDS[income.income_kind]}${income.product_type !== "unknown" && income.product_type !== "none" ? ` · ${PRODUCT_TYPES[income.product_type]}` : ""}${income.income_kind === "pension" && income.pension_kind !== "unknown" ? ` · ${PENSION_KINDS[income.pension_kind]}` : ""}${income.income_event !== "unknown" ? ` · ${INCOME_EVENTS[income.income_event]}` : ""}${income.benefit_number ? ` · benefício ${income.benefit_number}` : ""}`;
function snapshotRows<T>(snapshot: IrJson, key: string): T[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return [];
  const value = snapshot[key];
  return Array.isArray(value)
    ? (value.filter(
        (row) => row !== null && typeof row === "object" && !Array.isArray(row),
      ) as unknown as T[])
    : [];
}

function AssessmentDialog({
  props,
  incomes,
  payers,
  evidence,
  rules,
  documents,
  previous,
  onClose,
}: {
  props: IrPanelProps;
  incomes: IrIncomeSource[];
  payers: IrPayer[];
  evidence: IrEvidenceEvent[];
  rules: IrRuleVersion[];
  documents: LegalCaseDocument[];
  previous?: IrAssessmentVersion;
  onClose: () => void;
}) {
  const [proposals, setProposals] = useState<IrSourceProposal[]>(
    incomes.map((income) => {
      const prior = previous?.source_proposals.find(
        (proposal) => proposal.source_id === income.id,
      );
      return prior
        ? {
            ...prior,
            rule_version_ids: prior.rule_version_ids.filter((id) =>
              rules.some(
                (rule) => rule.id === id && rule.status === "approved",
              ),
            ),
            evidence_event_ids: prior.evidence_event_ids.filter((id) =>
              evidence.some((event) => event.id === id),
            ),
            document_ids: prior.document_ids.filter((id) =>
              documents.some((document) => document.id === id),
            ),
          }
        : {
            source_id: income.id,
            proposal: "needs_review",
            rule_version_ids: [],
            evidence_event_ids: [],
            document_ids: [],
            reasoning: "",
            proposed_start_date: null,
            start_date_reason: "",
          };
    }),
  );
  const [strategy, setStrategy] = useState<IrStrategy>(
    previous?.strategy ?? "documents_first",
  );
  const [summary, setSummary] = useState(previous?.summary ?? "");
  const removedReferences = previous?.source_proposals.some(
    (prior) =>
      prior.evidence_event_ids.some(
        (id) => !evidence.some((event) => event.id === id),
      ) ||
      prior.document_ids.some(
        (id) => !documents.some((document) => document.id === id),
      ) ||
      prior.rule_version_ids.some(
        (id) =>
          !rules.some((rule) => rule.id === id && rule.status === "approved"),
      ),
  );
  const action = useLegalAction();
  const change = (index: number, patch: Partial<IrSourceProposal>) =>
    setProposals(
      proposals.map((proposal, current) =>
        current === index ? { ...proposal, ...patch } : proposal,
      ),
    );
  const incomplete = proposals.some(
    (proposal) =>
      !proposal.reasoning.trim() ||
      (proposal.proposed_start_date && !proposal.start_date_reason?.trim()) ||
      (proposal.proposal !== "needs_review" &&
        (!proposal.rule_version_ids.length ||
          (!proposal.evidence_event_ids.length &&
            !proposal.document_ids.length))),
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      await action.run(
        () =>
          createIrAssessmentVersion(
            props.legalCase.id,
            proposals,
            strategy,
            summary.trim(),
          ),
        "Versão de análise salva com cópia dos dados examinados",
      )
    )
      onClose();
  }
  return (
    <IrDialog
      wide
      title="Preparar nova versão da análise"
      description="Preencha a proposta de cada rendimento e as evidências utilizadas. A conclusão depende da revisão expressa do responsável."
      onClose={onClose}
      pending={action.pending}
    >
      <form className="space-y-4" onSubmit={(event) => void save(event)}>
        <p className="text-sm text-muted-foreground">
          O sistema preserva os dados existentes ao salvar. Novos documentos ou
          fatos exigirão uma nova versão antes da aprovação.
        </p>
        {removedReferences ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Algumas referências anteriores foram corrigidas ou deixaram de estar
            disponíveis. Examine novamente as evidências e selecione as que
            fundamentam esta versão. Nenhuma substituição foi selecionada
            automaticamente.
          </p>
        ) : null}
        {proposals.map((proposal, index) => {
          const income = incomes.find(
            (item) => item.id === proposal.source_id,
          )!;
          return (
            <section
              key={proposal.source_id}
              className="space-y-4 rounded-lg border p-4"
              aria-labelledby={`ir-source-${index}`}
            >
              <h3 id={`ir-source-${index}`} className="break-words font-medium">
                {incomeTitle(income, payers)}
              </h3>
              <LegalField label={`Proposta para o rendimento ${index + 1}`}>
                {(id) => (
                  <select
                    id={id}
                    className={selectClassName}
                    value={proposal.proposal}
                    onChange={(event) =>
                      change(index, {
                        proposal: event.target
                          .value as IrSourceProposal["proposal"],
                      })
                    }
                  >
                    {Object.entries(PROPOSALS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </LegalField>
              <IrSelection
                label={`Fundamentos revisados do rendimento ${index + 1}`}
                values={rules
                  .filter((rule) => rule.status === "approved")
                  .map((rule) => ({
                    id: rule.id,
                    label: `${rule.title} · versão ${rule.version_number}`,
                  }))}
                selected={proposal.rule_version_ids}
                onChange={(values) =>
                  change(index, { rule_version_ids: values })
                }
                empty="Nenhuma referência aprovada. Cadastre e revise os fundamentos no Catálogo."
              />
              <IrSelection
                label={`Fatos examinados do rendimento ${index + 1}`}
                values={evidence.map((event) => ({
                  id: event.id,
                  label: `${EVIDENCE_TYPES[event.event_type]} · ${event.description.slice(0, 150)}`,
                }))}
                selected={proposal.evidence_event_ids}
                onChange={(values) =>
                  change(index, { evidence_event_ids: values })
                }
              />
              <IrSelection
                label={`Documentos examinados do rendimento ${index + 1}`}
                values={documents.map((document) => ({
                  id: document.id,
                  label: `${document.display_name} · ${DOCUMENT_CATEGORIES[document.category]}`,
                }))}
                selected={proposal.document_ids}
                onChange={(values) => change(index, { document_ids: values })}
              />
              <LegalField
                label={`Fundamentação do rendimento ${index + 1}`}
                hint="Relacione fatos, prova, regra aplicável, divergências e o que ainda precisa ser confirmado."
              >
                {(id) => (
                  <Textarea
                    id={id}
                    required
                    maxLength={4000}
                    value={proposal.reasoning}
                    onChange={(event) =>
                      change(index, { reasoning: event.target.value })
                    }
                  />
                )}
              </LegalField>
              <LegalField
                label={`Marco inicial proposto do rendimento ${index + 1}`}
                hint="Opcional, indicado pelo advogado. Nenhuma data é calculada automaticamente."
              >
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    value={proposal.proposed_start_date ?? ""}
                    onChange={(event) =>
                      change(index, {
                        proposed_start_date: event.target.value || null,
                      })
                    }
                  />
                )}
              </LegalField>
              {proposal.proposed_start_date ? (
                <LegalField label={`Fundamento do marco inicial ${index + 1}`}>
                  {(id) => (
                    <Textarea
                      id={id}
                      required
                      maxLength={4000}
                      value={proposal.start_date_reason ?? ""}
                      onChange={(event) =>
                        change(index, { start_date_reason: event.target.value })
                      }
                    />
                  )}
                </LegalField>
              ) : null}
            </section>
          );
        })}
        <LegalField label="Estratégia proposta">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={strategy}
              onChange={(event) =>
                setStrategy(event.target.value as IrStrategy)
              }
            >
              {Object.entries(STRATEGIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        <LegalField label="Resumo e plano de atuação do advogado">
          {(id) => (
            <Textarea
              id={id}
              required
              rows={6}
              maxLength={12000}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          )}
        </LegalField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={action.pending || incomplete || !summary.trim()}
          >
            Salvar versão da análise
          </Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}

function AssessmentSnapshot({ version }: { version: IrAssessmentVersion }) {
  const payers = snapshotRows<IrPayer>(version.snapshot, "payers");
  const incomes = snapshotRows<IrIncomeSource>(
    version.snapshot,
    "income_sources",
  );
  const evidence = snapshotRows<IrEvidenceEvent>(
    version.snapshot,
    "evidence_events",
  );
  const rules = snapshotRows<IrRuleVersion>(version.snapshot, "rule_versions");
  const documents = snapshotRows<{
    id: string;
    category: keyof typeof DOCUMENT_CATEGORIES;
    sha256: string | null;
  }>(version.snapshot, "documents");
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Dados e fundamentos preservados nesta versão
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          {payers.length} fontes · {incomes.length} rendimentos ·{" "}
          {evidence.length} fatos · {documents.length} documentos. Os dados
          abaixo correspondem ao momento desta versão.
        </p>
        {version.source_proposals.map((proposal, index) => {
          const income = incomes.find((item) => item.id === proposal.source_id);
          return (
            <section
              key={proposal.source_id}
              className="space-y-3 rounded-lg bg-muted/20 p-3"
            >
              <p className="break-words text-sm font-medium">
                {income
                  ? incomeTitle(income, payers)
                  : `Rendimento ${index + 1}`}
              </p>
              <Badge variant="outline">{PROPOSALS[proposal.proposal]}</Badge>
              <p className="whitespace-pre-wrap break-words text-sm">
                {proposal.reasoning}
              </p>
              {proposal.proposed_start_date ? (
                <p className="text-sm">
                  Marco proposto:{" "}
                  {legalDate(`${proposal.proposed_start_date}T12:00:00`)}.{" "}
                  {proposal.start_date_reason}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sem marco inicial proposto.
                </p>
              )}
              {proposal.rule_version_ids.map((id) => {
                const rule = rules.find((item) => item.id === id);
                return rule ? (
                  <div key={id} className="space-y-1 text-sm">
                    <p className="font-medium">
                      {rule.title} · versão {rule.version_number}
                    </p>
                    <p className="whitespace-pre-wrap break-words">
                      {rule.criteria}
                    </p>
                    {rule.sources.map((source, sourceIndex) => {
                      const url = safeReferenceUrl(source.url);
                      return url ? (
                        <a
                          className="block break-all text-primary underline underline-offset-2"
                          key={sourceIndex}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {source.title || source.url}
                        </a>
                      ) : null;
                    })}
                  </div>
                ) : null;
              })}
              {proposal.evidence_event_ids.map((id) => {
                const event = evidence.find((item) => item.id === id);
                return event ? (
                  <div key={id} className="text-sm">
                    <p className="font-medium">
                      {EVIDENCE_TYPES[event.event_type]} ·{" "}
                      {event.event_date
                        ? legalDate(`${event.event_date}T12:00:00`)
                        : "Data desconhecida"}
                    </p>
                    <p className="whitespace-pre-wrap break-words">
                      {event.description}
                    </p>
                  </div>
                ) : null;
              })}
              {proposal.document_ids.map((id, documentIndex) => {
                const document = documents.find((item) => item.id === id);
                return document ? (
                  <details key={id} className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      Documento examinado {documentIndex + 1} ·{" "}
                      {DOCUMENT_CATEGORIES[document.category]}
                    </summary>
                    <p className="mt-1 break-all">Identificação: {id}</p>
                    <p className="break-all">
                      Integridade SHA-256: {document.sha256 ?? "Não disponível"}
                    </p>
                  </details>
                ) : null;
              })}
            </section>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Conferências documentais:{" "}
          {snapshotRows(version.snapshot, "document_reviews").length} ·
          Entrevistas: {snapshotRows(version.snapshot, "interviews").length} ·
          Requisitos: {snapshotRows(version.snapshot, "checklist_items").length}{" "}
          · Representações:{" "}
          {snapshotRows(version.snapshot, "representations").length}
        </p>
      </div>
    </details>
  );
}

export function IrAssessments(props: IrPanelProps) {
  const enabled = props.ir.can_assess;
  const versions = useQuery({
    queryKey: irKey(props, "assessments"),
    queryFn: () => listIrAssessmentVersions(props.legalCase.id),
    enabled,
  });
  const incomes = useQuery({
    queryKey: irKey(props, "incomes"),
    queryFn: () => listIrIncomeSources(props.legalCase.id),
    enabled,
  });
  const payers = useQuery({
    queryKey: irKey(props, "payers"),
    queryFn: () => listIrPayers(props.legalCase.id),
    enabled,
  });
  const evidence = useQuery({
    queryKey: irKey(props, "evidence"),
    queryFn: () => listIrEvidenceEvents(props.legalCase.id),
    enabled,
  });
  const documents = useQuery({
    queryKey: irKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
    enabled,
  });
  const rules = useQuery({
    queryKey: irWorkspaceKey(props, "rules"),
    queryFn: listIrRuleVersions,
    enabled,
  });
  const [creating, setCreating] = useState(false);
  const [review, setReview] = useState<{
    version: IrAssessmentVersion;
    decision: "approved" | "returned";
  } | null>(null);
  const action = useLegalAction();
  const inputError =
    incomes.error ??
    payers.error ??
    evidence.error ??
    documents.error ??
    rules.error;
  const inputPending =
    incomes.isPending ||
    payers.isPending ||
    evidence.isPending ||
    documents.isPending ||
    rules.isPending;
  if (!enabled)
    return (
      <IrAccessNotice>
        A análise reúne dados de saúde e fiscais. É necessário acesso explícito
        às duas categorias deste caso para consultar ou preparar uma versão.
      </IrAccessNotice>
    );
  return (
    <OperationPanel
      title="Análise individual e plano de atuação"
      description="O advogado registra a proposta de cada rendimento, os fundamentos examinados e a estratégia. Aprovação interna não representa concessão, cessação de retenção ou recebimento de valores."
      actions={
        props.canEdit ? (
          <Button
            size="sm"
            disabled={
              inputPending || Boolean(inputError) || !incomes.data?.length
            }
            onClick={() => setCreating(true)}
          >
            Nova versão da análise
          </Button>
        ) : null
      }
    >
      {inputError ? (
        <LegalError
          error={inputError}
          retry={() => {
            void incomes.refetch();
            void payers.refetch();
            void evidence.refetch();
            void documents.refetch();
            void rules.refetch();
          }}
        />
      ) : null}
      {!inputPending && !inputError && !incomes.data?.length ? (
        <p className="text-sm text-muted-foreground">
          Cadastre os rendimentos antes de preparar a análise individual.
        </p>
      ) : null}
      <OperationRecords
        pending={versions.isPending}
        error={versions.error}
        retry={() => void versions.refetch()}
        empty="Nenhuma análise preparada pelo escritório"
        count={versions.data?.length ?? 0}
      >
        {versions.data?.map((version) => {
          const current = version.id === props.ir.latest_assessment_id;
          const fresh = current && props.ir.assessment_is_current === true;
          const hasPendingSources = version.source_proposals.some(
            (proposal) => proposal.proposal === "needs_review",
          );
          return (
            <div key={version.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium">
                  Análise · versão {version.version_number}
                </p>
                <Badge variant="outline">
                  {ASSESSMENT_STATUS[version.status]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Preparada por {personName(props, version.created_by)} ·{" "}
                {legalDate(version.created_at, true)}
              </p>
              {current && !fresh ? (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  Os dados ou referências mudaram. Prepare uma nova versão antes
                  de encaminhar ou aprovar esta análise.
                </p>
              ) : null}
              <p className="text-sm font-medium">
                Estratégia: {STRATEGIES[version.strategy]}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {version.summary}
              </p>
              {version.review_note ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  Revisão: {version.review_note}
                </p>
              ) : null}
              {version.reviewer_id ? (
                <p className="text-xs text-muted-foreground">
                  {personName(props, version.reviewer_id)} ·{" "}
                  {legalDate(version.reviewed_at, true)}
                </p>
              ) : null}
              <AssessmentSnapshot version={version} />
              {hasPendingSources ? (
                <p className="text-sm text-muted-foreground">
                  Há rendimentos que ainda necessitam de revisão. Prepare uma
                  nova versão com a proposta individual antes da aprovação.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {props.canEdit && fresh && version.status === "draft" ? (
                  <Button
                    size="sm"
                    disabled={action.pending}
                    onClick={() =>
                      void action.run(
                        () => submitIrAssessmentReview(version.id),
                        "Análise encaminhada ao responsável",
                      )
                    }
                  >
                    Encaminhar análise para revisão
                  </Button>
                ) : null}
                {isIrOwner(props) && fresh && version.status === "in_review" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={hasPendingSources}
                      onClick={() =>
                        setReview({ version, decision: "approved" })
                      }
                    >
                      Aprovar análise
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setReview({ version, decision: "returned" })
                      }
                    >
                      Devolver para ajuste
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </OperationRecords>
      {creating ? (
        <AssessmentDialog
          props={props}
          incomes={incomes.data ?? []}
          payers={payers.data ?? []}
          evidence={(evidence.data ?? []).filter(
            (event) =>
              !evidence.data?.some((newer) => newer.supersedes_id === event.id),
          )}
          documents={documents.data ?? []}
          rules={rules.data ?? []}
          previous={versions.data?.find(
            (version) => version.id === props.ir.latest_assessment_id,
          )}
          onClose={() => setCreating(false)}
        />
      ) : null}
      <OperationReasonDialog
        key={review?.version.id + ":" + review?.decision}
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={
          review?.decision === "approved"
            ? "Registrar aprovação da análise"
            : "Devolver análise para ajuste"
        }
        description="Revise os rendimentos, marcos, evidências, fundamentos e pendências da versão. Registre sua decisão profissional e os limites da estratégia."
        pending={action.pending}
        onSave={(note) =>
          review
            ? action.run(
                () =>
                  reviewIrAssessment(review.version.id, review.decision, note),
                "Decisão profissional registrada nesta versão",
              )
            : Promise.resolve(false)
        }
      />
    </OperationPanel>
  );
}
