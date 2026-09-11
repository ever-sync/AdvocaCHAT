import { useExpansionSources, expansionCompatible } from "./expansion-sources";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  readExternalAct,
  submitExternalAct,
  reviewExternalAct,
  prepareExternalAttempt,
  reportExternalAttempt,
  recordExternalReceipt,
  reconcileExternalReceipt,
} from "@/lib/api/legal-expansion";
import type {
  ExpansionActRead,
  ExpansionMetadata,
  ExpansionAttempt,
  ExpansionReceipt,
  ExpansionReceiptInput,
  ExpansionReceiptChecks,
} from "@/types/legal-expansion";
import { LegalError, LegalLoading } from "../LegalShared";
import { useLegalAction } from "../legal-ui";
import {
  OperationPanel,
  OperationRecords,
  OperationReasonDialog,
} from "../operations/OperationPanel";
import {
  ExpansionAccessNotice,
  ExpansionDialog,
  ExpansionNotice,
  ExpansionPagination,
  ExpansionSelect,
} from "./ExpansionShared";
import {
  ExpansionFacts,
  ExpansionCheck,
  ExpansionDocumentField,
  ExpansionText,
} from "./ExpansionFields";
import { useExpansionList } from "./expansion-hooks";
import {
  EXPANSION_STATES,
  expansionCaseAccess,
  expansionCategoryAccess,
  expansionDate,
  expansionKey,
  type ExpansionProps,
} from "./expansion-ui";
import ExpansionActForm from "./ExpansionActForm";
import {
  ACT_KIND_LABELS,
  ACT_CHECK_LABELS,
  expansionActMissing,
} from "./expansion-labels";
const ATTEMPT_STATES: Record<string, string> = {
  prepared: "Tentativa manual preparada",
  reported_external: "Realização externa informada; conferir recibo",
  unknown: "Resultado desconhecido; exige reconciliação",
  not_sent: "Declarada não enviada",
  reconciled: "Ocorrência externa conferida",
};
const OUTCOMES: Record<ExpansionReceiptInput["outcome"], string> = {
  protocol: "Protocolo externo",
  awareness: "Ciência externa",
  rejected: "Rejeição externa",
  not_sent: "Não enviado",
};
export default function ExpansionActs(props: ExpansionProps) {
  const list = useExpansionList(props, "acts");
  const [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<ExpansionMetadata | null>(null);
  if (!expansionCaseAccess(props)) return <ExpansionAccessNotice />;
  return (
    <OperationPanel
      title="Atos e recibos"
      description="Prepare documentos e poderes, registre a tentativa realizada pelo canal autorizado e confira sua prova. O preparo interno não executa atos."
      actions={
        props.context.can_edit && (
          <Button size="sm" onClick={() => setCreating(true)}>
            Preparar ato
          </Button>
        )
      }
    >
      <ExpansionNotice>
        Ciência, peticionamento e requerimentos não são enviados por esta
        plataforma nesta etapa. Uma tentativa com resultado desconhecido exige
        conferência antes de nova ação.
      </ExpansionNotice>
      <OperationRecords
        pending={list.query.isPending}
        error={list.query.error}
        retry={() => void list.query.refetch()}
        empty="Nenhum ato preparado neste caso"
        count={list.rows.length}
      >
        {list.rows.map((row) => (
          <article key={row.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="break-words font-medium">
                {row.title} · versão {row.version_number}
              </h3>
              <Badge variant="outline">
                {EXPANSION_STATES[row.state] ?? row.state}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelected(row)}
            >
              Conferir ato e recibos
            </Button>
          </article>
        ))}
      </OperationRecords>
      <ExpansionPagination
        offset={list.offset}
        limit={list.limit}
        hasMore={list.hasMore}
        pending={list.query.isFetching}
        onChange={list.setOffset}
      />
      {creating && (
        <ExpansionActForm props={props} onClose={() => setCreating(false)} />
      )}{" "}
      {selected && list.rows.some((r) => r.id === selected.id) && (
        <ActReader
          props={props}
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </OperationPanel>
  );
}
function ActReader({
  props,
  row,
  onClose,
}: {
  props: ExpansionProps;
  row: ExpansionMetadata;
  onClose(): void;
}) {
  const allowed =
    expansionCaseAccess(props) &&
    expansionCategoryAccess(props, row.category ?? "restricted");
  const query = useQuery({
    queryKey: expansionKey(props, "act-" + row.id),
    queryFn: ({ signal }) => readExternalAct(row.id, signal),
    enabled: allowed,
    retry: false,
    gcTime: 0,
    refetchInterval: 15000,
  });
  const action = useLegalAction();
  const [copy, setCopy] = useState(false),
    [decision, setDecision] = useState<"ready" | "returned" | "revoked" | null>(
      null,
    ),
    [prepare, setPrepare] = useState<string | null>(null),
    [report, setReport] = useState<{
      attempt: ExpansionAttempt;
      state: "reported_external" | "unknown" | "not_sent";
    } | null>(null),
    [receipt, setReceipt] = useState<ExpansionAttempt | null>(null),
    [reconcile, setReconcile] = useState<ExpansionReceipt | null>(null);
  const data = query.isError ? undefined : query.data;
  const v = data?.version;
  if (!allowed) return null;
  const owner = props.context.can_review;
  const hasConfirmedReceipt =
    data?.attempt_blockers?.includes("confirmed_receipt") ||
    data?.receipts.some(
      (r) =>
        r.state === "reviewed" && ["protocol", "awareness"].includes(r.outcome),
    );
  const canPrepare =
    data?.can_prepare_attempt ??
    Boolean(
      data?.is_current &&
      v?.state === "ready" &&
      !hasConfirmedReceipt &&
      !data.attempts.some((a) =>
        ["prepared", "reported_external", "unknown"].includes(a.state),
      ),
    );

  return (
    <ExpansionDialog
      title="Conferência do ato e dos recibos"
      description="O histórico preserva preparo, tentativa e prova. A revisão interna não significa transmissão ao destinatário."
      onClose={onClose}
    >
      {query.isPending ? (
        <LegalLoading />
      ) : query.isError ? (
        <LegalError error={query.error} retry={() => void query.refetch()} />
      ) : v && data && expansionCategoryAccess(props, v.category) ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{EXPANSION_STATES[v.state]}</Badge>
            <Badge variant="outline">
              {data.is_current ? "Fontes atuais" : "Fontes ou versão alteradas"}
            </Badge>
          </div>
          <ExpansionFacts
            items={[
              ["Título", v.title],
              ["Tipo", ACT_KIND_LABELS[v.act_kind]],
              ["Destinatário", v.recipient],
              ["Canal", v.channel],
              ["Finalidade", v.purpose],
              ["Fundamento dos poderes", v.authority_basis],
              ["Revisão nominal", v.review_note],
            ]}
          />
          <section className="space-y-2">
            <h3 className="font-medium">Conferências do preparo</h3>
            {Object.entries(ACT_CHECK_LABELS).map(([key, label]) => (
              <p key={key} className="text-sm">
                {v.checks[key as keyof typeof v.checks]
                  ? "Conferido"
                  : "Pendente"}{" "}
                · {label}
              </p>
            ))}
          </section>
          {data.missing.length > 0 && (
            <ExpansionNotice error>
              <p className="font-medium">Preparo incompleto</p>
              <ul className="ml-4 list-disc">
                {data.missing.map((m, i) => (
                  <li key={i}>{expansionActMissing(m)}</li>
                ))}
              </ul>
            </ExpansionNotice>
          )}
          {!data.is_current && (
            <ExpansionNotice error>
              Uma prova, autorização ou versão mudou. Preserve o histórico e
              prepare nova versão antes de autorizar outro ato.
            </ExpansionNotice>
          )}
          <div className="flex flex-wrap gap-2">
            {props.context.can_edit && (
              <Button variant="outline" onClick={() => setCopy(true)}>
                Criar nova versão
              </Button>
            )}
            {props.context.can_edit &&
              data.is_current &&
              ["draft", "returned"].includes(v.state) && (
                <Button
                  disabled={action.pending}
                  onClick={() =>
                    void action.run(
                      () => submitExternalAct(v.id),
                      "Preparo enviado para conferência",
                    )
                  }
                >
                  Enviar preparo para revisão
                </Button>
              )}
            {owner && v.state === "in_review" && data.is_current && (
              <>
                <Button
                  disabled={data.missing.length > 0}
                  onClick={() => setDecision("ready")}
                >
                  Revisar preparo interno
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDecision("returned")}
                >
                  Devolver preparo
                </Button>
              </>
            )}
            {owner && v.state !== "revoked" && (
              <Button variant="outline" onClick={() => setDecision("revoked")}>
                Revogar preparo
              </Button>
            )}
            {owner &&
              canPrepare &&
              data.is_current &&
              v.state === "ready" &&
              !data.attempts.some((a) =>
                ["prepared", "reported_external", "unknown"].includes(a.state),
              ) && (
                <Button onClick={() => setPrepare(crypto.randomUUID())}>
                  Preparar tentativa manual
                </Button>
              )}
          </div>
          {data.attempt_blockers?.includes("pending_attempt") && (
            <ExpansionNotice error>
              Há uma tentativa desta série que ainda exige reconciliação.
              Confira a versão em que ela foi registrada antes de preparar
              outra.
            </ExpansionNotice>
          )}
          {hasConfirmedReceipt && (
            <ExpansionNotice>
              A ocorrência deste ato já possui protocolo ou ciência conferidos.
              Um ato distinto exige uma série própria e nova revisão.
            </ExpansionNotice>
          )}
          <section className="space-y-3">
            <h3 className="font-medium">Tentativas e provas externas</h3>
            {!data.attempts.length && (
              <p className="text-sm text-muted-foreground">
                Nenhuma tentativa registrada.
              </p>
            )}
            {data.attempts.map((a) => (
              <article key={a.id} className="space-y-3 rounded-lg border p-4">
                <p className="font-medium">{ATTEMPT_STATES[a.state]}</p>
                <p className="text-sm">{expansionDate(a.created_at)}</p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {a.note}
                </p>
                {Boolean(a.reports?.length) && (
                  <details className="rounded-lg border p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Histórico dos relatos e conferências
                    </summary>
                    <ol className="mt-3 space-y-3">
                      {a.reports?.map((report) => (
                        <li key={report.id}>
                          <p>
                            {ATTEMPT_STATES[report.state] ??
                              "Relato registrado"}{" "}
                            · {expansionDate(report.created_at)}
                          </p>
                          <p className="whitespace-pre-wrap break-words">
                            {report.note}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                {owner && a.state !== "reconciled" && (
                  <div className="flex flex-wrap gap-2">
                    {["prepared", "reported_external", "unknown"].includes(
                      a.state,
                    ) && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setReport({
                              attempt: a,
                              state: "reported_external",
                            })
                          }
                        >
                          Informar realização externa
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setReport({ attempt: a, state: "unknown" })
                          }
                        >
                          Registrar resultado desconhecido
                        </Button>
                        {a.state !== "unknown" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setReport({ attempt: a, state: "not_sent" })
                            }
                          >
                            Declarar não enviado
                          </Button>
                        )}
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReceipt(a)}
                    >
                      Juntar recibo externo
                    </Button>
                  </div>
                )}
                {data.receipts
                  .filter((r) => r.attempt_id === a.id)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="space-y-2 rounded-lg border p-3 text-sm"
                    >
                      <p className="font-medium">
                        {OUTCOMES[r.outcome]} · {r.external_reference}
                      </p>
                      <p>
                        {r.recipient} · {r.channel} ·{" "}
                        {expansionDate(r.occurred_on)}
                      </p>
                      <p className="whitespace-pre-wrap break-words">
                        {r.description}
                      </p>
                      <p>
                        {r.state === "reviewed"
                          ? "Recibo conferido"
                          : r.state === "returned"
                            ? "Recibo devolvido"
                            : "Recibo recebido; conferência pendente"}
                      </p>
                      {r.review_note && <p>{r.review_note}</p>}
                      {owner && r.state === "submitted" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReconcile(r)}
                        >
                          Conferir recibo
                        </Button>
                      )}
                    </div>
                  ))}
              </article>
            ))}
          </section>
          {copy && (
            <ExpansionActForm
              props={props}
              previous={v}
              onClose={() => setCopy(false)}
            />
          )}{" "}
          {decision &&
            owner &&
            (decision !== "ready" ||
              (data.is_current &&
                v.state === "in_review" &&
                !data.missing.length)) && (
              <OperationReasonDialog
                open
                title={
                  decision === "ready"
                    ? "Conferir preparo interno"
                    : "Registrar decisão sobre o preparo"
                }
                description="Revise documentos, poderes, assinatura, destinatário, canal e consequências. A decisão não executa o ato."
                actionLabel={
                  decision === "ready"
                    ? "Confirmar preparo conferido"
                    : decision === "revoked"
                      ? "Confirmar revogação"
                      : "Devolver para ajuste"
                }
                pending={action.pending}
                onClose={() => setDecision(null)}
                onSave={(note) =>
                  action.run(
                    () => reviewExternalAct(v.id, decision, note),
                    "Decisão registrada",
                  )
                }
              />
            )}{" "}
          {prepare &&
            owner &&
            canPrepare &&
            data.is_current &&
            v.state === "ready" &&
            !data.attempts.some((a) =>
              ["prepared", "reported_external", "unknown"].includes(a.state),
            ) && (
              <OperationReasonDialog
                open
                title="Preparar tentativa manual"
                description="Este registro organiza uma tentativa pelo canal externo autorizado. Nenhum envio ocorrerá pela plataforma."
                actionLabel="Registrar tentativa manual"
                pending={action.pending}
                onClose={() => setPrepare(null)}
                onSave={(note) =>
                  action.run(
                    () => prepareExternalAttempt(v.id, prepare, note),
                    "Tentativa manual registrada",
                  )
                }
              />
            )}{" "}
          {report &&
            owner &&
            data.attempts.some(
              (a) =>
                a.id === report.attempt.id &&
                ["prepared", "reported_external", "unknown"].includes(
                  a.state,
                ) &&
                !(a.state === "unknown" && report.state === "not_sent"),
            ) && (
              <OperationReasonDialog
                open
                title={ATTEMPT_STATES[report.state]}
                description="Relate apenas o que ocorreu no canal externo. Resultado desconhecido impede repetir o ato sem conferência."
                actionLabel="Registrar relato"
                pending={action.pending}
                onClose={() => setReport(null)}
                onSave={(note) =>
                  action.run(
                    () =>
                      reportExternalAttempt(
                        report.attempt.id,
                        report.state,
                        note,
                      ),
                    "Relato registrado",
                  )
                }
              />
            )}{" "}
          {receipt && owner && (
            <ReceiptForm
              props={props}
              data={data}
              attempt={receipt}
              onClose={() => setReceipt(null)}
            />
          )}{" "}
          {reconcile &&
            owner &&
            data.receipts.some(
              (r) => r.id === reconcile.id && r.state === "submitted",
            ) && (
              <ReceiptReview
                receipt={reconcile}
                onClose={() => setReconcile(null)}
              />
            )}
        </>
      ) : null}
    </ExpansionDialog>
  );
}
function ReceiptForm({
  props,
  data,
  attempt,
  onClose,
}: {
  props: ExpansionProps;
  data: ExpansionActRead;
  attempt: ExpansionAttempt;
  onClose(): void;
}) {
  const sources = useExpansionSources(props),
    action = useLegalAction();
  const [form, setForm] = useState<
    Omit<ExpansionReceiptInput, "outcome"> & {
      outcome: "" | ExpansionReceiptInput["outcome"];
    }
  >({
    document_id: "",
    external_reference: "",
    recipient: "",
    channel: "",
    occurred_on: "",
    outcome: "",
    description: "",
  });
  const set = (k: string, v: string | null) =>
    setForm((o) => ({ ...o, [k]: v }));
  const docs = sources.docs.filter((d) =>
    expansionCompatible(data.version.category, d.category),
  );
  return (
    <ExpansionDialog
      title="Juntar recibo de ocorrência externa"
      description="Transcreva os identificadores da prova recebida. Ela ficará pendente de revisão nominal e não autoriza outro ato."
      onClose={onClose}
      pending={action.pending}
      disabled={!form.outcome}
      onSubmit={() =>
        action.run(async () => {
          await recordExternalReceipt(attempt.id, {
            ...form,
            outcome: form.outcome as ExpansionReceiptInput["outcome"],
          });
          onClose();
        }, "Recibo recebido para conferência")
      }
    >
      <ExpansionDocumentField
        label="Documento do recibo"
        docs={docs}
        value={form.document_id}
        onChange={(v) => set("document_id", v)}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ExpansionText
          label="Referência externa constante no recibo"
          value={form.external_reference}
          onChange={(v) => set("external_reference", v)}
          required
        />
        <ExpansionText
          label="Destinatário constante no recibo"
          value={form.recipient}
          onChange={(v) => set("recipient", v)}
          required
        />
        <ExpansionText
          label="Canal constante no recibo"
          value={form.channel}
          onChange={(v) => set("channel", v)}
          required
        />
        <ExpansionText
          label="Data da ocorrência externa"
          type="date"
          value={form.occurred_on}
          onChange={(v) => set("occurred_on", v)}
          required
        />
        <ExpansionSelect
          label="Processo constante no recibo"
          value={form.proceeding_id ?? ""}
          onChange={(v) => set("proceeding_id", v || null)}
        >
          <option value="">Sem processo selecionado</option>
          {sources.proceedings.map((p) => (
            <option key={p.id} value={p.id}>
              {p.cnj_number}
            </option>
          ))}
        </ExpansionSelect>
        <ExpansionSelect
          label="Ocorrência comprovada pelo documento"
          value={form.outcome}
          onChange={(v) => set("outcome", v)}
          required
        >
          <option value="">Selecione após examinar a prova</option>
          {Object.entries(OUTCOMES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </ExpansionSelect>
      </div>
      <ExpansionText
        label="Descrição do recibo e limites da prova"
        value={form.description}
        onChange={(v) => set("description", v)}
        required
        multiline
        maxLength={4000}
      />
    </ExpansionDialog>
  );
}
function ReceiptReview({
  receipt,
  onClose,
}: {
  receipt: ExpansionReceipt;
  onClose(): void;
}) {
  const action = useLegalAction();
  const [decision, setDecision] = useState<"reviewed" | "returned">("returned"),
    [note, setNote] = useState(""),
    [checks, setChecks] = useState<ExpansionReceiptChecks>({
      reference_matches: false,
      recipient_matches: false,
      channel_matches: false,
      document_compared: false,
      occurrence_confirmed: false,
    });
  const labels: Record<keyof ExpansionReceiptChecks, string> = {
    reference_matches: "A referência externa coincide com a tentativa",
    recipient_matches: "O destinatário e o processo coincidem",
    channel_matches: "O canal coincide com o preparo",
    document_compared: "Comparei o documento original do recibo",
    occurrence_confirmed: "A ocorrência e a data estão comprovadas",
  };
  return (
    <ExpansionDialog
      title="Conferência nominal do recibo"
      description="Confirme a prova da ocorrência externa ou devolva para esclarecimento. O histórico da versão permanece preservado."
      onClose={onClose}
      pending={action.pending}
      disabled={
        decision === "reviewed" && !Object.values(checks).every(Boolean)
      }
      actionLabel={
        decision === "reviewed"
          ? "Confirmar recibo conferido"
          : "Devolver recibo"
      }
      onSubmit={() =>
        action.run(async () => {
          await reconcileExternalReceipt(receipt.id, decision, checks, note);
          onClose();
        }, "Conferência do recibo registrada")
      }
    >
      <ExpansionSelect
        label="Decisão sobre o recibo"
        value={decision}
        onChange={(v) => setDecision(v as typeof decision)}
      >
        <option value="returned">Devolver para esclarecimento</option>
        <option value="reviewed">Registrar ocorrência conferida</option>
      </ExpansionSelect>
      {Object.entries(labels).map(([key, label]) => (
        <ExpansionCheck
          key={key}
          label={label}
          checked={checks[key as keyof ExpansionReceiptChecks]}
          onChange={(v) => setChecks((o) => ({ ...o, [key]: v }))}
        />
      ))}
      <ExpansionText
        label="Fundamento da conferência do recibo"
        value={note}
        onChange={setNote}
        required
        multiline
        maxLength={4000}
      />
    </ExpansionDialog>
  );
}
