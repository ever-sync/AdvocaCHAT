import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import {
  addIrEvidenceEvent,
  listIrDocumentReviews,
  listIrEvidenceEvents,
  recordIrDocumentReview,
} from "@/lib/api/legal-ir";
import { downloadLegalDocument, listLegalDocuments } from "@/lib/api/legal";
import type {
  IrDocumentChecks,
  IrDocumentReview,
  IrDocumentReviewMetadata,
  IrEvidenceEvent,
  IrEvidencePayload,
  IrEvidenceType,
} from "@/types/legal-ir";
import type { LegalCaseDocument, LegalDocumentCategory } from "@/types/legal";
import { LegalError, LegalField } from "../LegalShared";
import {
  DOCUMENT_CATEGORIES,
  legalDate,
  selectClassName,
  useLegalAction,
} from "../legal-ui";
import { OperationPanel, OperationRecords } from "../operations/OperationPanel";
import { IrDialog } from "./IrShared";
import {
  CHECK_RESULTS,
  DATE_PRECISION,
  DOCUMENT_CHECKS,
  DOCUMENT_REVIEW_RESULTS,
  EVIDENCE_TYPES,
  evidenceCategory,
  irCategoryAllowed,
  irKey,
  isIrOwner,
  personName,
  type IrPanelProps,
} from "./ir-ui";

function EvidenceDialog({
  props,
  documents,
  events,
  onClose,
}: {
  props: IrPanelProps;
  documents: LegalCaseDocument[];
  events: IrEvidenceEvent[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<IrEvidencePayload>({
    event_type: "other",
    category: "general",
    date_precision: "unknown",
    event_date: null,
    description: "",
    document_id: null,
    source_page: null,
    supersedes_id: null,
  });
  const action = useLegalAction();
  const category = evidenceCategory(form.event_type, form.category);
  function changeType(type: IrEvidenceType) {
    setForm({
      ...form,
      event_type: type,
      category: evidenceCategory(type, form.category),
      document_id: null,
      supersedes_id: null,
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      await action.run(
        () =>
          addIrEvidenceEvent(props.legalCase.id, {
            ...form,
            category,
            event_date:
              form.date_precision === "unknown" ? null : form.event_date,
            description: form.description.trim(),
          }),
        "Fato e sua origem registrados na cronologia",
      )
    )
      onClose();
  }
  return (
    <IrDialog
      title="Registrar fato na cronologia"
      description="Diferencie o fato informado, a data indicada e a evidência. Uma informação relatada permanece sujeita à revisão profissional."
      onClose={onClose}
      pending={action.pending}
    >
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <LegalField label="Tipo de fato">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.event_type}
              onChange={(event) =>
                changeType(event.target.value as IrEvidenceType)
              }
            >
              {Object.entries(EVIDENCE_TYPES)
                .filter(([type]) =>
                  irCategoryAllowed(
                    props,
                    evidenceCategory(type as IrEvidenceType, "general"),
                  ),
                )
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          )}
        </LegalField>
        <LegalField label="Categoria protegida do fato">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              disabled={
                ![
                  "other",
                  "administrative_protocol",
                  "judicial_protocol",
                ].includes(form.event_type)
              }
              value={category}
              onChange={(event) =>
                setForm({
                  ...form,
                  category: event.target.value as LegalDocumentCategory,
                  document_id: null,
                  supersedes_id: null,
                })
              }
            >
              {Object.entries(DOCUMENT_CATEGORIES)
                .filter(([value]) => irCategoryAllowed(props, value))
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          )}
        </LegalField>
        <LegalField label="Precisão da data">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.date_precision}
              onChange={(event) =>
                setForm({
                  ...form,
                  date_precision: event.target
                    .value as IrEvidencePayload["date_precision"],
                  event_date:
                    event.target.value === "unknown" ? null : form.event_date,
                })
              }
            >
              {Object.entries(DATE_PRECISION).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        {form.date_precision !== "unknown" ? (
          <LegalField label="Data do fato informado">
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={form.event_date ?? ""}
                onChange={(event) =>
                  setForm({ ...form, event_date: event.target.value || null })
                }
              />
            )}
          </LegalField>
        ) : null}
        <LegalField
          label="Descrição do fato e de quem o informou"
          hint={
            category === "general"
              ? "Use apenas fatos gerais. Diagnóstico e informações fiscais exigem a categoria correspondente."
              : "Preserve a descrição original e indique o que ainda precisa ser confirmado."
          }
        >
          {(id) => (
            <Textarea
              id={id}
              required
              maxLength={4000}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          )}
        </LegalField>
        <LegalField label="Documento de origem">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.document_id ?? ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  document_id: event.target.value || null,
                  source_page: null,
                })
              }
            >
              <option value="">Ainda sem documento vinculado</option>
              {documents
                .filter((document) => document.category === category)
                .map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.display_name}
                  </option>
                ))}
            </select>
          )}
        </LegalField>
        {form.document_id ? (
          <LegalField label="Página da evidência">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={100000}
                value={form.source_page ?? ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    source_page: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              />
            )}
          </LegalField>
        ) : null}
        <LegalField label="Corrige um registro anterior?">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.supersedes_id ?? ""}
              onChange={(event) =>
                setForm({ ...form, supersedes_id: event.target.value || null })
              }
            >
              <option value="">Novo fato, sem substituição</option>
              {events
                .filter((item) => item.category === category)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {EVIDENCE_TYPES[item.event_type]} ·{" "}
                    {item.description.slice(0, 70)}
                  </option>
                ))}
            </select>
          )}
        </LegalField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={action.pending || !form.description.trim()}
          >
            Salvar fato informado
          </Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}

function DocumentReviewDialog({
  document,
  onClose,
}: {
  document: LegalCaseDocument;
  onClose: () => void;
}) {
  const [checks, setChecks] = useState<IrDocumentChecks>({
    identity: "unclear",
    issuer: "unclear",
    signature: "unclear",
    date: "unclear",
    readability: "unclear",
    source: "unclear",
  });
  const [result, setResult] = useState<IrDocumentReview["result"]>("pending");
  const [note, setNote] = useState("");
  const [metadata, setMetadata] = useState<IrDocumentReviewMetadata>({
    issuer_name: "",
    professional_registration: "",
    document_nature: "unknown",
    issued_on: null,
    reported_onset_on: null,
  });
  const action = useLegalAction();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      await action.run(
        () =>
          recordIrDocumentReview(
            document.id,
            checks,
            result,
            note.trim(),
            metadata,
          ),
        "Conferência documental registrada pelo responsável",
      )
    )
      onClose();
  }
  return (
    <IrDialog
      wide
      title="Conferir documento"
      description={document.display_name}
      onClose={onClose}
      pending={action.pending}
    >
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Registre o que consta no arquivo e a avaliação do responsável. A data
          de emissão não define validade automática do laudo.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(DOCUMENT_CHECKS).map(([key, label]) => (
            <LegalField key={key} label={label}>
              {(id) => (
                <select
                  id={id}
                  className={selectClassName}
                  value={checks[key as keyof IrDocumentChecks] ?? "unclear"}
                  onChange={(event) =>
                    setChecks({ ...checks, [key]: event.target.value })
                  }
                >
                  {Object.entries(CHECK_RESULTS).map(([value, title]) => (
                    <option key={value} value={value}>
                      {title}
                    </option>
                  ))}
                </select>
              )}
            </LegalField>
          ))}
        </div>
        <LegalField label="Serviço ou profissional emissor">
          {(id) => (
            <Input
              id={id}
              maxLength={200}
              value={metadata.issuer_name ?? ""}
              onChange={(event) =>
                setMetadata({ ...metadata, issuer_name: event.target.value })
              }
            />
          )}
        </LegalField>
        <div className="grid gap-3 sm:grid-cols-2">
          <LegalField label="Registro profissional indicado">
            {(id) => (
              <Input
                id={id}
                maxLength={100}
                value={metadata.professional_registration ?? ""}
                onChange={(event) =>
                  setMetadata({
                    ...metadata,
                    professional_registration: event.target.value,
                  })
                }
              />
            )}
          </LegalField>
          <LegalField label="Natureza do documento">
            {(id) => (
              <select
                id={id}
                className={selectClassName}
                value={metadata.document_nature ?? "unknown"}
                onChange={(event) =>
                  setMetadata({
                    ...metadata,
                    document_nature: event.target
                      .value as IrDocumentReviewMetadata["document_nature"],
                  })
                }
              >
                <option value="unknown">Ainda não confirmada</option>
                <option value="official">Serviço oficial</option>
                <option value="private">Particular</option>
              </select>
            )}
          </LegalField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <LegalField label="Emissão indicada no documento">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={metadata.issued_on ?? ""}
                onChange={(event) =>
                  setMetadata({
                    ...metadata,
                    issued_on: event.target.value || null,
                  })
                }
              />
            )}
          </LegalField>
          {document.category === "medical" ? (
            <LegalField
              label="Início da doença indicado"
              hint="Deixe vazio se o documento não trouxer essa data."
            >
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={metadata.reported_onset_on ?? ""}
                  onChange={(event) =>
                    setMetadata({
                      ...metadata,
                      reported_onset_on: event.target.value || null,
                    })
                  }
                />
              )}
            </LegalField>
          ) : null}
        </div>
        <LegalField label="Resultado da conferência">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={result}
              onChange={(event) =>
                setResult(event.target.value as IrDocumentReview["result"])
              }
            >
              {Object.entries(DOCUMENT_REVIEW_RESULTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        <LegalField
          label="Fundamento da conferência e pendências"
          hint="Descreva divergências e complementos necessários, mantendo a categoria do documento."
        >
          {(id) => (
            <Textarea
              id={id}
              required
              maxLength={4000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </LegalField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={action.pending || !note.trim()}>
            Registrar conferência
          </Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}

export function IrEvidence(props: IrPanelProps) {
  const documents = useQuery({
    queryKey: irKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
  });
  const events = useQuery({
    queryKey: irKey(props, "evidence"),
    queryFn: () => listIrEvidenceEvents(props.legalCase.id),
  });
  const reviews = useQuery({
    queryKey: irKey(props, "document-reviews"),
    queryFn: () => listIrDocumentReviews(props.legalCase.id),
  });
  const [category, setCategory] = useState("all");
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<LegalCaseDocument | null>(null);
  const action = useLegalAction();
  const visibleDocuments = (documents.data ?? []).filter(
    (document) =>
      irCategoryAllowed(props, document.category) &&
      (category === "all" || document.category === category),
  );
  const visibleEvents = (events.data ?? []).filter(
    (event) =>
      irCategoryAllowed(props, event.category) &&
      (category === "all" || event.category === category),
  );
  return (
    <div className="space-y-4">
      <LegalField label="Categoria do dossiê">
        {(id) => (
          <select
            id={id}
            className={selectClassName}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">Todas as categorias autorizadas</option>
            {Object.entries(DOCUMENT_CATEGORIES)
              .filter(([value]) => irCategoryAllowed(props, value))
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        )}
      </LegalField>
      <OperationPanel
        title="Cronologia com evidências"
        description="Diagnóstico, início da doença, emissão, benefício e retenções permanecem como fatos distintos. Datas desconhecidas não são preenchidas pelo sistema."
        actions={
          props.canEdit ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              Registrar fato
            </Button>
          ) : null
        }
      >
        <OperationRecords
          pending={events.isPending}
          error={events.error}
          retry={() => void events.refetch()}
          empty="Nenhum fato registrado nesta categoria"
          count={visibleEvents.length}
        >
          {visibleEvents.map((event) => {
            const original = documents.data?.find(
              (document) => document.id === event.document_id,
            );
            const replaced = events.data?.some(
              (item) => item.supersedes_id === event.id,
            );
            return (
              <div key={event.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {EVIDENCE_TYPES[event.event_type]}
                  </p>
                  <Badge variant="outline">
                    {DOCUMENT_CATEGORIES[event.category]}
                    {replaced ? " · registro corrigido" : ""}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {event.event_date
                    ? legalDate(`${event.event_date}T12:00:00`)
                    : "Data desconhecida"}
                  {event.date_precision !== "unknown"
                    ? ` · ${DATE_PRECISION[event.date_precision]}`
                    : ""}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {event.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  Registrado por {personName(props, event.created_by)}
                  {event.source_page ? ` · página ${event.source_page}` : ""}
                </p>
                {original ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.pending}
                    onClick={() =>
                      void action.run(
                        () => downloadLegalDocument(original),
                        "Download iniciado",
                      )
                    }
                  >
                    Abrir documento de origem
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sem documento de origem disponível para consulta.
                  </p>
                )}
              </div>
            );
          })}
        </OperationRecords>
      </OperationPanel>
      <OperationPanel
        title="Dossiê e conferência documental"
        description="Os arquivos originais são guardados na aba Documentos. A conferência registra emissor, datas, legibilidade e pendências do responsável."
      >
        {reviews.error ? (
          <LegalError
            error={reviews.error}
            retry={() => void reviews.refetch()}
          />
        ) : null}
        <OperationRecords
          pending={documents.isPending}
          error={documents.error}
          retry={() => void documents.refetch()}
          empty="Nenhum documento disponível nesta categoria"
          count={visibleDocuments.length}
        >
          {visibleDocuments.map((document) => (
            <div key={document.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-words font-medium">
                  {document.display_name}
                </p>
                <Badge variant="outline">
                  {DOCUMENT_CATEGORIES[document.category]}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.pending}
                  onClick={() =>
                    void action.run(
                      () => downloadLegalDocument(document),
                      "Download iniciado",
                    )
                  }
                >
                  Baixar documento
                  <span className="sr-only"> {document.display_name}</span>
                </Button>
                {isIrOwner(props) ? (
                  <Button size="sm" onClick={() => setReviewing(document)}>
                    Conferir documento
                    <span className="sr-only"> {document.display_name}</span>
                  </Button>
                ) : null}
              </div>
              {reviews.data
                ?.filter((review) => review.document_id === document.id)
                .map((review) => (
                  <details
                    key={review.id}
                    className="rounded-md bg-muted/20 p-3"
                  >
                    <summary className="cursor-pointer text-sm font-medium">
                      {DOCUMENT_REVIEW_RESULTS[review.result]} ·{" "}
                      {legalDate(review.created_at, true)}
                    </summary>
                    <div className="mt-3 space-y-2 text-sm">
                      <p className="whitespace-pre-wrap break-words">
                        {review.review_note}
                      </p>
                      {Object.entries(review.checks).map(([key, value]) => (
                        <p key={key}>
                          {DOCUMENT_CHECKS[key as keyof typeof DOCUMENT_CHECKS]}
                          : {CHECK_RESULTS[value]}
                        </p>
                      ))}
                      {review.metadata.issuer_name ? (
                        <p>Emissor: {review.metadata.issuer_name}</p>
                      ) : null}
                      {review.metadata.professional_registration ? (
                        <p>
                          Registro profissional:{" "}
                          {review.metadata.professional_registration}
                        </p>
                      ) : null}
                      <p>
                        Natureza:{" "}
                        {review.metadata.document_nature === "official"
                          ? "Serviço oficial"
                          : review.metadata.document_nature === "private"
                            ? "Particular"
                            : "Ainda não confirmada"}
                      </p>
                      <p>
                        Emissão indicada:{" "}
                        {review.metadata.issued_on
                          ? legalDate(`${review.metadata.issued_on}T12:00:00`)
                          : "Não informada"}
                      </p>
                      {document.category === "medical" ? (
                        <p>
                          Início da doença indicado:{" "}
                          {review.metadata.reported_onset_on
                            ? legalDate(
                                `${review.metadata.reported_onset_on}T12:00:00`,
                              )
                            : "Não informado"}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {personName(props, review.reviewer_id)}
                      </p>
                    </div>
                  </details>
                ))}
            </div>
          ))}
        </OperationRecords>
      </OperationPanel>
      {creating ? (
        <EvidenceDialog
          key={`${props.ir.can_medical}:${props.ir.can_fiscal}`}
          props={props}
          documents={(documents.data ?? []).filter((document) =>
            irCategoryAllowed(props, document.category),
          )}
          events={(events.data ?? []).filter((event) =>
            irCategoryAllowed(props, event.category),
          )}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {reviewing && irCategoryAllowed(props, reviewing.category) ? (
        <DocumentReviewDialog
          document={reviewing}
          onClose={() => setReviewing(null)}
        />
      ) : null}
    </div>
  );
}
