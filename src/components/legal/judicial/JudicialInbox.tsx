import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments, listLegalProceedings } from "@/lib/api/legal";
import {
  acceptJudicialAssignment,
  assignJudicialItem,
  getJudicialContext,
  readJudicialOriginal,
  recordJudicialManualEvent,
  reviewJudicialAssociation,
  updateJudicialTaskStatus,
} from "@/lib/api/legal-judicial";
import type {
  JudicialInbox as Inbox,
  JudicialManualEventInput,
  JudicialTriage,
} from "@/types/legal-judicial";
import { LegalEmpty, LegalError, LegalLoading } from "../LegalShared";
import { useLegalAction } from "../legal-ui";
import { OperationPanel } from "../operations/OperationPanel";
import {
  JudicialAccessNotice,
  JudicialCategoryField,
  JudicialDialog,
  JudicialSelect,
  JudicialText,
} from "./JudicialShared";
import {
  JUDICIAL_CATEGORIES,
  JUDICIAL_STATES,
  judicialAssignees,
  judicialCaseAccess,
  judicialCategoryAccess,
  judicialDate,
  judicialKey,
  judicialName,
  type JudicialProps,
} from "./judicial-ui";

const dates: {
  key: keyof JudicialManualEventInput;
  label: string;
  civil?: boolean;
}[] = [
  { key: "decision_signed_at", label: "Assinatura da decisão" },
  {
    key: "made_available_on",
    label: "Disponibilização no diário",
    civil: true,
  },
  { key: "published_on", label: "Publicação", civil: true },
  { key: "communication_sent_at", label: "Envio da comunicação" },
  { key: "provider_received_at", label: "Recebimento pelo fornecedor" },
  { key: "source_consulted_at", label: "Consulta à fonte" },
  {
    key: "awareness_effective_on",
    label: "Ciência jurídica comprovada",
    civil: true,
  },
  { key: "source_updated_at", label: "Última alteração na origem" },
];
export function JudicialInbox(props: JudicialProps) {
  const allowed = judicialCaseAccess(props),
    dual = judicialCategoryAccess(props, "restricted");
  const discovery = useQuery({
    queryKey: judicialKey(props, "discovery"),
    queryFn: ({ signal }) => getJudicialContext(undefined, signal),
    enabled: allowed && dual && props.context.can_manage_sources,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const [extractFrom, setExtractFrom] = useState<string | undefined>();
  const [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<{
      item: Inbox;
      mode: "original" | "association" | "assign";
    } | null>(null),
    [triageAction, setTriageAction] = useState<{
      row: JudicialTriage;
      mode: "accept" | "completed" | "cancelled";
    } | null>(null),
    [filter, setFilter] = useState("all");
  const action = useLegalAction();
  if (!allowed) return <JudicialAccessNotice />;
  const rows = [
    ...props.context.inbox,
    ...(dual && props.context.can_manage_sources
      ? (discovery.data?.inbox.filter((row) => !row.case_id) ?? [])
      : []),
  ].filter(
    (row, index, array) =>
      array.findIndex((x) => x.id === row.id) === index &&
      judicialCategoryAccess(props, row.category),
  );
  const currentSelected =
    selected && rows.find((row) => row.id === selected.item.id);
  const currentTriage =
    triageAction &&
    props.context.triage.find((row) => row.id === triageAction.row.id);
  return (
    <OperationPanel
      title="Publicações para conferir"
      description="Examine a origem, as datas e o vínculo com o processo. Assumir o tratamento é um registro do escritório; não produz ciência jurídica nem prazo automático."
      actions={
        props.context.can_review_case && (
          <Button
            size="sm"
            onClick={() => {
              setExtractFrom(undefined);
              setCreating(true);
            }}
          >
            Registrar publicação manual
          </Button>
        )
      }
    >
      <JudicialSelect
        label="Exibir publicações"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Todas as autorizadas" },
          { value: "unmatched", label: "Sem vínculo ou com dúvida" },
          { value: "confirmed", label: "Vínculo conferido" },
        ]}
      />
      {discovery.isError && props.context.can_manage_sources && dual && (
        <LegalError
          error={discovery.error}
          retry={() => void discovery.refetch()}
        />
      )}
      {!rows.length ? (
        <LegalEmpty title="Nenhuma publicação disponível">
          Cadastre uma ocorrência com prova ou configure uma fonte autorizada.
          Ausência de registros não comprova cobertura do tribunal.
        </LegalEmpty>
      ) : (
        rows
          .filter(
            (row) =>
              filter === "all" ||
              (filter === "confirmed" &&
                row.association_state === "confirmed") ||
              (filter === "unmatched" && row.association_state !== "confirmed"),
          )
          .map((item) => (
            <article key={item.id} className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="min-w-0 break-words font-semibold">
                  {item.title}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {JUDICIAL_CATEGORIES[item.category]}
                  </Badge>
                  <Badge variant="secondary">
                    {JUDICIAL_STATES[item.association_state]}
                  </Badge>
                </div>
              </div>
              <p className="break-words text-xs text-muted-foreground">
                Origem {item.provider} · versão {item.version_number} ·
                Capturada em {judicialDate(item.captured_at)}
              </p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Disponibilização</dt>
                  <dd>{judicialDate(item.made_available_on)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Publicação</dt>
                  <dd>{judicialDate(item.published_on)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Ciência jurídica comprovada
                  </dt>
                  <dd>{judicialDate(item.awareness_effective_on)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Última alteração na origem
                  </dt>
                  <dd>{judicialDate(item.source_updated_at)}</dd>
                </div>
              </dl>
              <details className="text-sm">
                <summary className="cursor-pointer">
                  Conferir datas e candidatos da origem
                </summary>
                <div className="mt-3 space-y-2">
                  {dates
                    .filter(
                      (field) =>
                        ![
                          "made_available_on",
                          "published_on",
                          "awareness_effective_on",
                          "source_updated_at",
                        ].includes(field.key),
                    )
                    .map((field) => (
                      <p key={field.key}>
                        {field.label}:{" "}
                        {judicialDate(
                          item[field.key as keyof typeof item] as string | null,
                        )}
                      </p>
                    ))}
                  <p className="whitespace-pre-wrap break-words">
                    {item.temporal_notes ||
                      "Nenhuma observação temporal informada."}
                  </p>
                  {item.candidates.map((candidate, index) => (
                    <p key={index} className="break-words">
                      {[
                        candidate.cnj,
                        candidate.oab_number &&
                          `OAB ${candidate.oab_number}/${candidate.oab_state || "UF não informada"}`,
                        candidate.title,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ))}
                  <p className="break-all text-xs text-muted-foreground">
                    SHA-256: {item.original_sha256}
                  </p>
                  <p className="break-words">
                    Conferência do vínculo: {item.review_note || "Pendente"}
                  </p>
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelected({ item, mode: "original" })}
                >
                  Consultar original
                </Button>
                {props.context.can_review_case && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected({ item, mode: "association" })}
                  >
                    Conferir vínculo
                  </Button>
                )}
                {props.context.can_review_case && !item.case_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setExtractFrom(item.id);
                      setCreating(true);
                    }}
                  >
                    Registrar recorte deste caso
                  </Button>
                )}
                {props.context.can_review_case &&
                  item.case_id === props.legalCase.id &&
                  item.association_state === "confirmed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelected({ item, mode: "assign" })}
                    >
                      Atribuir tratamento
                    </Button>
                  )}
              </div>
              {props.context.triage
                .filter((row) => row.inbox_id === item.id)
                .map((row) => (
                  <div
                    className="space-y-2 rounded-lg bg-muted/30 p-3 text-sm"
                    key={row.id}
                  >
                    <p className="font-medium">{JUDICIAL_STATES[row.state]}</p>
                    <p>
                      Responsável: {judicialName(props, row.assignee_id)} ·
                      Substituto: {judicialName(props, row.substitute_id)}
                    </p>
                    <p>Conferência interna até: {judicialDate(row.due_at)}</p>
                    <p className="whitespace-pre-wrap break-words">
                      {row.note}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {row.state === "pending" &&
                        [row.assignee_id, row.substitute_id].includes(
                          props.workspace.user_id,
                        ) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setTriageAction({ row, mode: "accept" })
                            }
                          >
                            Assumir tratamento
                          </Button>
                        )}
                      {!["completed", "cancelled"].includes(row.state) &&
                        (props.context.can_review_case ||
                          [row.assignee_id, row.substitute_id].includes(
                            props.workspace.user_id,
                          )) && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setTriageAction({ row, mode: "completed" })
                              }
                            >
                              Conferido no escritório
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setTriageAction({ row, mode: "cancelled" })
                              }
                            >
                              Cancelar tratamento
                            </Button>
                          </>
                        )}
                    </div>
                  </div>
                ))}
            </article>
          ))
      )}
      {creating && props.context.can_review_case && (
        <ManualDialog
          props={props}
          extractedFrom={extractFrom}
          onClose={() => setCreating(false)}
        />
      )}
      {currentSelected && selected?.mode === "original" && (
        <OriginalDialog
          props={props}
          item={currentSelected}
          onClose={() => setSelected(null)}
        />
      )}
      {currentSelected &&
        selected?.mode === "association" &&
        props.context.can_review_case && (
          <AssociationDialog
            props={props}
            item={currentSelected}
            onClose={() => setSelected(null)}
          />
        )}
      {currentSelected &&
        selected?.mode === "assign" &&
        props.context.can_review_case && (
          <AssignmentDialog
            props={props}
            item={currentSelected}
            onClose={() => setSelected(null)}
          />
        )}
      {currentTriage && triageAction && (
        <ReasonDialog
          title={
            triageAction.mode === "accept"
              ? "Assumir tratamento no escritório"
              : triageAction.mode === "completed"
                ? "Registrar conferência interna"
                : "Cancelar tratamento interno"
          }
          onClose={() => setTriageAction(null)}
          pending={action.pending}
          onSave={async (note) => {
            const mode = triageAction.mode;
            if (
              await action.run(
                () =>
                  mode === "accept"
                    ? acceptJudicialAssignment(currentTriage.id, note)
                    : updateJudicialTaskStatus(
                        currentTriage.task_id,
                        mode,
                        note,
                      ),
                "Tratamento interno atualizado",
              )
            )
              setTriageAction(null);
          }}
        />
      )}
    </OperationPanel>
  );
}
function ReasonDialog({
  title,
  onClose,
  pending,
  onSave,
}: {
  title: string;
  onClose(): void;
  pending: boolean;
  onSave(note: string): Promise<void>;
}) {
  const [note, setNote] = useState("");
  return (
    <JudicialDialog
      title={title}
      description="Registre a providência interna. Este registro não altera ciência jurídica, publicação ou vencimento."
      onClose={onClose}
      onSubmit={() => onSave(note.trim())}
      pending={pending}
      actionLabel="Registrar conferência"
      disabled={note.trim().length < 3}
    >
      <JudicialText
        label="Providência e justificativa"
        value={note}
        onChange={setNote}
        required
        multiline
        maxLength={2000}
      />
    </JudicialDialog>
  );
}
function OriginalDialog({
  props,
  item,
  onClose,
}: {
  props: JudicialProps;
  item: Inbox;
  onClose(): void;
}) {
  const allowed = judicialCategoryAccess(props, item.category);
  const query = useQuery({
    queryKey: judicialKey(props, `original-${item.id}-${item.revision}`),
    queryFn: ({ signal }) => readJudicialOriginal(item.id, signal),
    enabled: allowed,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  if (!allowed) return null;
  return (
    <JudicialDialog
      title="Original preservado"
      description="Consulta auditada do conteúdo textual da fonte. Links e marcações do original não são executados."
      onClose={onClose}
      onSubmit={async () => onClose()}
      pending={false}
      actionLabel="Fechar original"
    >
      {query.isPending ? (
        <LegalLoading />
      ) : query.isError ? (
        <LegalError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <p className="break-all text-xs text-muted-foreground">
            SHA-256: {query.data.sha256}
          </p>
          <pre className="max-h-[55dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-4 font-sans text-sm">
            {query.data.original_text}
          </pre>
        </>
      )}
    </JudicialDialog>
  );
}
function ManualDialog({
  props,
  onClose,
  extractedFrom,
}: {
  props: JudicialProps;
  onClose(): void;
  extractedFrom?: string;
}) {
  const [form, setForm] = useState<JudicialManualEventInput>({
    ...(extractedFrom ? { extracted_from_inbox_id: extractedFrom } : {}),
    title: "",
    event_type: "",
    category: "restricted",
    original_text: "",
    evidence_document_id: "",
    temporal_notes: "",
  });
  const action = useLegalAction();
  const documents = useQuery({
      queryKey: judicialKey(props, "documents"),
      queryFn: () => listLegalDocuments(props.legalCase.id),
      enabled: judicialCaseAccess(props),
    }),
    proceedings = useQuery({
      queryKey: judicialKey(props, "proceedings"),
      queryFn: () => listLegalProceedings(props.legalCase.id),
      enabled: judicialCaseAccess(props),
    });
  const patch = (key: keyof JudicialManualEventInput, value: string) =>
    setForm({ ...form, [key]: value });
  if (!judicialCategoryAccess(props, form.category))
    return <JudicialAccessNotice />;
  return (
    <JudicialDialog
      title="Registrar publicação manual"
      description="Transcreva a ocorrência e associe sua prova. Datas desconhecidas permanecem vazias; captura e consulta não substituem ciência jurídica."
      onClose={onClose}
      pending={action.pending}
      actionLabel="Registrar com prova"
      onSubmit={async () => {
        if (
          await action.run(
            () =>
              recordJudicialManualEvent(
                props.legalCase.id,
                Object.fromEntries(
                  Object.entries(form).filter(([, value]) => value !== ""),
                ) as unknown as JudicialManualEventInput,
              ),
            "Publicação manual registrada",
          )
        )
          onClose();
      }}
    >
      <JudicialText
        label="Título da ocorrência"
        value={form.title}
        onChange={(value) => patch("title", value)}
        required
        maxLength={180}
      />
      <JudicialText
        label="Tipo de ocorrência na fonte"
        value={form.event_type}
        onChange={(value) => patch("event_type", value)}
        required
        maxLength={80}
        hint="Classifique conforme o documento, por exemplo publicação de decisão."
      />
      {extractedFrom ? (
        <JudicialAccessNotice>
          Recorte vinculado ao original de origem. A categoria permanece
          restrita a saúde e fiscal; transcreva somente o trecho deste caso e
          anexe sua prova.
        </JudicialAccessNotice>
      ) : (
        <JudicialCategoryField
          props={props}
          value={form.category}
          onChange={(value) => patch("category", value)}
        />
      )}
      <JudicialSelect
        label="Processo conferido"
        required
        value={form.proceeding_id ?? ""}
        onChange={(value) => patch("proceeding_id", value)}
        options={(proceedings.data ?? []).map((row) => ({
          value: row.id,
          label: row.cnj_number,
        }))}
      />
      <JudicialSelect
        label="Documento que comprova a ocorrência"
        value={form.evidence_document_id}
        onChange={(value) => patch("evidence_document_id", value)}
        required
        options={(documents.data ?? [])
          .filter(
            (doc) =>
              judicialCategoryAccess(props, doc.category) &&
              (form.category === "restricted" ||
                doc.category === "general" ||
                doc.category === form.category),
          )
          .map((doc) => ({
            value: doc.id,
            label: `${doc.display_name} · ${JUDICIAL_CATEGORIES[doc.category]}`,
          }))}
      />
      {(documents.error || proceedings.error) && (
        <LegalError error={documents.error || proceedings.error} />
      )}
      <JudicialText
        label="Original textual preservado"
        value={form.original_text}
        onChange={(value) => patch("original_text", value)}
        required
        multiline
        maxLength={500000}
      />
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Datas da origem e observações temporais
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {dates.map((field) => (
            <JudicialText
              key={field.key}
              label={field.label}
              value={(form[field.key] as string) ?? ""}
              onChange={(value) => patch(field.key, value)}
              type={field.civil ? "date" : "text"}
              hint={
                field.civil
                  ? "Informe somente se comprovada."
                  : "Formato ISO com fuso, ex.: 2026-09-11T10:00:00-03:00. Se desconhecido, descreva abaixo."
              }
            />
          ))}
        </div>
        <div className="mt-4">
          <JudicialText
            label="Notas sobre datas e fuso da origem"
            value={form.temporal_notes ?? ""}
            onChange={(value) => patch("temporal_notes", value)}
            multiline
          />
        </div>
      </details>
    </JudicialDialog>
  );
}
function AssociationDialog({
  props,
  item,
  onClose,
}: {
  props: JudicialProps;
  item: Inbox;
  onClose(): void;
}) {
  const [proceeding, setProceeding] = useState(item.proceeding_id ?? ""),
    [document, setDocument] = useState(""),
    [decision, setDecision] = useState(""),
    [note, setNote] = useState("");
  const action = useLegalAction();
  const documents = useQuery({
      queryKey: judicialKey(props, "documents"),
      queryFn: () => listLegalDocuments(props.legalCase.id),
      enabled: judicialCaseAccess(props),
    }),
    proceedings = useQuery({
      queryKey: judicialKey(props, "proceedings"),
      queryFn: () => listLegalProceedings(props.legalCase.id),
      enabled: judicialCaseAccess(props),
    });
  return (
    <JudicialDialog
      title="Conferir vínculo com este caso"
      description="Examine número CNJ, partes e documento. A seleção não é preenchida pela OAB nem confirma vínculos com outros casos."
      onClose={onClose}
      pending={action.pending}
      actionLabel="Registrar revisão do vínculo"
      onSubmit={async () => {
        if (
          await action.run(
            () =>
              reviewJudicialAssociation(
                item.id,
                props.legalCase.id,
                proceeding,
                decision as "confirmed" | "rejected",
                document,
                note,
              ),
            "Vínculo revisado",
          )
        )
          onClose();
      }}
    >
      <p className="break-words font-medium">{item.title}</p>
      <JudicialSelect
        label="Processo deste caso"
        value={proceeding}
        onChange={setProceeding}
        required
        options={(proceedings.data ?? []).map((row) => ({
          value: row.id,
          label: row.cnj_number,
        }))}
      />
      <JudicialSelect
        label="Prova examinada"
        value={document}
        onChange={setDocument}
        required
        options={(documents.data ?? [])
          .filter(
            (doc) =>
              judicialCategoryAccess(props, doc.category) &&
              (item.category === "restricted" ||
                doc.category === "general" ||
                doc.category === item.category),
          )
          .map((doc) => ({ value: doc.id, label: doc.display_name }))}
      />
      <JudicialSelect
        label="Resultado da revisão"
        value={decision}
        onChange={setDecision}
        required
        options={[
          ...(item.candidates.length > 1
            ? []
            : [
                {
                  value: "confirmed",
                  label: "Confirmar vínculo com este processo",
                },
              ]),
          { value: "rejected", label: "Rejeitar vínculo proposto" },
        ]}
      />
      <JudicialText
        label="Fundamento da associação ou rejeição"
        value={note}
        onChange={setNote}
        required
        multiline
      />
      {(documents.error || proceedings.error) && (
        <LegalError error={documents.error || proceedings.error} />
      )}
    </JudicialDialog>
  );
}
function AssignmentDialog({
  props,
  item,
  onClose,
}: {
  props: JudicialProps;
  item: Inbox;
  onClose(): void;
}) {
  const [assignee, setAssignee] = useState(""),
    [substitute, setSubstitute] = useState(""),
    [due, setDue] = useState(""),
    [note, setNote] = useState("");
  const action = useLegalAction();
  const options = judicialAssignees(props, item.category).map((p) => ({
    value: p.id,
    label: p.nome,
  }));
  return (
    <JudicialDialog
      title="Atribuir tratamento da publicação"
      description="Gera uma providência interna vinculada, com acesso ao conteúdo restrito aos integrantes autorizados."
      onClose={onClose}
      pending={action.pending}
      actionLabel="Atribuir tratamento"
      onSubmit={async () => {
        if (
          await action.run(
            () =>
              assignJudicialItem(
                item.id,
                assignee,
                substitute || null,
                due ? `${due}:00-03:00` : null,
                note,
              ),
            "Tratamento atribuído",
          )
        )
          onClose();
      }}
    >
      <JudicialSelect
        label="Responsável"
        value={assignee}
        onChange={setAssignee}
        required
        options={options}
      />
      <JudicialSelect
        label="Substituto"
        value={substitute}
        onChange={setSubstitute}
        options={options.filter((p) => p.value !== assignee)}
      />
      <JudicialText
        label="Conferir até (horário de Brasília)"
        value={due}
        onChange={setDue}
        type="datetime-local"
      />
      <JudicialText
        label="Providência interna"
        value={note}
        onChange={setNote}
        required
        multiline
      />
    </JudicialDialog>
  );
}
export default JudicialInbox;
