import { useEffect, useRef, useState } from "react";
import { downloadJudicialDeadlineReport } from "@/lib/legal-judicial-report";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments, listLegalProceedings } from "@/lib/api/legal";
import {
  createJudicialCheckTask,
  createJudicialDeadline,
  readJudicialDeadlineReport,
  reviewJudicialDeadline,
  submitJudicialDeadline,
} from "@/lib/api/legal-judicial";
import type {
  JudicialDeadlineInput,
  JudicialDeadlineReport,
  JudicialDeadlineVersion,
  JudicialScope,
} from "@/types/legal-judicial";
import {
  LegalEmpty,
  LegalError,
  LegalLoading,
  LegalField,
} from "../LegalShared";
import { useLegalAction } from "../legal-ui";
import {
  OperationPanel,
  OperationReasonDialog,
} from "../operations/OperationPanel";
import {
  JudicialAccessNotice,
  JudicialCheck,
  JudicialDialog,
  JudicialSelect,
  JudicialText,
} from "./JudicialShared";
import {
  blankJudicialScope,
  JUDICIAL_STATES,
  JUDICIAL_ANCHORS,
  judicialAssignees,
  judicialApprovedHeads,
  judicialCategoryAccess,
  judicialDate,
  judicialKey,
  judicialName,
  type JudicialProps,
} from "./judicial-ui";

export default function JudicialDeadlines(props: JudicialProps) {
  const [creating, setCreating] = useState(false),
    [previous, setPrevious] = useState<JudicialDeadlineVersion | undefined>(),
    [report, setReport] = useState<string | null>(null),
    [review, setReview] = useState<{
      row: JudicialDeadlineVersion;
      decision: "reviewed" | "returned";
    } | null>(null),
    [check, setCheck] = useState<JudicialDeadlineVersion | null>(null);
  const action = useLegalAction();
  if (!judicialCategoryAccess(props, "restricted"))
    return (
      <JudicialAccessNotice>
        Os prazos assistidos exigem acesso conjunto às informações médicas e
        fiscais do caso.
      </JudicialAccessNotice>
    );
  const rows = props.context.deadlines;
  const selectedReview = review && rows.find((row) => row.id === review.row.id);
  const current = (id: string) =>
    props.context.deadline_states.find((state) => state.id === id)
      ?.is_current === true;
  return (
    <OperationPanel
      title="Prazos assistidos"
      description="Prepare uma proposta com regra, calendário e prova do marco. O sistema apresenta os dias considerados e as pendências; somente a revisão do responsável registra um prazo revisado."
      actions={
        props.context.can_edit_case && (
          <Button
            size="sm"
            onClick={() => {
              setPrevious(undefined);
              setCreating(true);
            }}
          >
            Preparar contagem
          </Button>
        )
      }
    >
      {!rows.length ? (
        <LegalEmpty title="Nenhuma contagem preparada">
          Cadastre e revise as regras e o calendário aplicáveis antes de
          concluir uma contagem. Sem elementos suficientes, a proposta registra
          as recusas.
        </LegalEmpty>
      ) : (
        rows.map((row) => (
          <article key={row.id} className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="break-words font-semibold">
                {row.input.title} · versão {row.version_number}
              </h3>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={row.state === "reviewed" ? "secondary" : "outline"}
                >
                  {JUDICIAL_STATES[row.state]}
                </Badge>
                {!current(row.id) && (
                  <Badge variant="outline">
                    Elementos alterados: reexaminar
                  </Badge>
                )}
              </div>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Marco inicial formado</dt>
                <dd>{judicialDate(row.result.start_marker_on)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Primeiro dia contado</dt>
                <dd>{judicialDate(row.result.first_counted_on)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {row.state === "reviewed"
                    ? "Data revisada nesta versão"
                    : "Vencimento proposto"}
                </dt>
                <dd className="font-semibold">
                  {row.result.proposed_due_on
                    ? judicialDate(row.result.proposed_due_on)
                    : "Não determinado"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Horário e fuso da proposta
                </dt>
                <dd>
                  {row.result.due_at && row.result.timezone
                    ? judicialDate(row.result.due_at, row.result.timezone!)
                    : "Não determinados"}
                  {row.result.timezone && ` · ${row.result.timezone}`}
                </dd>
              </div>
            </dl>
            {row.result.refusals.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/40 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
                <p className="font-medium">A contagem não está concluída</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {row.result.refusals.map((refusal, index) => (
                    <li
                      key={`${refusal.code}-${index}`}
                      className="break-words"
                    >
                      {refusal.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!current(row.id) && (
              <p className="text-sm text-muted-foreground">
                A prova, associação, atribuição ou versão do catálogo mudou.
                Esta data permanece no histórico e exige nova conferência antes
                de uso.
              </p>
            )}
            <p className="text-sm">
              Responsável: {judicialName(props, row.input.assignee_id)} ·
              Substituto: {judicialName(props, row.input.substitute_id ?? null)}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">
              {row.review_note ||
                "Revisão do responsável ainda não registrada."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReport(row.id)}
              >
                Conferir memória
              </Button>
              {props.context.can_edit_case && (
                <>
                  {!rows.some(
                    (next) =>
                      next.deadline_key === row.deadline_key &&
                      next.version_number > row.version_number,
                  ) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPrevious(row);
                        setCreating(true);
                      }}
                    >
                      Nova versão
                    </Button>
                  )}
                  {row.state === "draft" &&
                    current(row.id) &&
                    !row.result.refusals.length && (
                      <Button
                        size="sm"
                        disabled={action.pending}
                        onClick={() =>
                          void action.run(
                            () => submitJudicialDeadline(row.id),
                            "Proposta enviada para revisão",
                          )
                        }
                      >
                        Enviar para revisão
                      </Button>
                    )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCheck(row)}
                  >
                    Agendar conferência
                  </Button>
                </>
              )}
              {props.context.can_review_case &&
                row.state === "in_review" &&
                current(row.id) &&
                !row.result.refusals.length && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setReview({ row, decision: "reviewed" })}
                    >
                      Registrar prazo revisado
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReview({ row, decision: "returned" })}
                    >
                      Devolver para ajuste
                    </Button>
                  </>
                )}
            </div>
          </article>
        ))
      )}
      {creating && props.context.can_edit_case && (
        <DeadlineDialog
          props={props}
          previous={previous}
          onClose={() => setCreating(false)}
        />
      )}
      {report && rows.some((row) => row.id === report) && (
        <DeadlineReport
          props={props}
          id={report}
          onClose={() => setReport(null)}
        />
      )}
      {selectedReview &&
        review &&
        props.context.can_review_case &&
        current(selectedReview.id) &&
        selectedReview.state === "in_review" &&
        !selectedReview.result.refusals.length && (
          <OperationReasonDialog
            open
            onClose={() => setReview(null)}
            title={
              review.decision === "reviewed"
                ? "Registrar prazo após conferência"
                : "Devolver contagem para ajuste"
            }
            description="Confira o marco, o primeiro dia, a duração, cada exclusão, o fuso e a cobertura. O servidor revalida as provas antes de registrar a revisão e a tarefa."
            pending={action.pending}
            actionLabel={
              review.decision === "reviewed"
                ? "Confirmar prazo revisado"
                : "Devolver para ajuste"
            }
            onSave={(note) =>
              action.run(
                () =>
                  reviewJudicialDeadline(
                    selectedReview.id,
                    review.decision,
                    note,
                  ),
                "Revisão da contagem registrada",
              )
            }
          />
        )}
      {check &&
        rows.some((row) => row.id === check.id) &&
        props.context.can_edit_case && (
          <CheckDialog row={check} onClose={() => setCheck(null)} />
        )}
    </OperationPanel>
  );
}
function DeadlineDialog({
  props,
  previous,
  onClose,
}: {
  props: JudicialProps;
  previous?: JudicialDeadlineVersion;
  onClose(): void;
}) {
  const [form, setForm] = useState<JudicialDeadlineInput>(
    previous
      ? {
          ...previous.input,
          conditions_confirmed: false,
          coverage_confirmed: false,
          supersedes_version_id: previous.id,
        }
      : {
          deadline_key: "",
          title: "",
          proceeding_id: "",
          quantity: 0,
          unit: "" as JudicialDeadlineInput["unit"],
          anchor_kind: "",
          duration_basis: "",
          conditions_confirmed: false,
          coverage_confirmed: false,
          conflict_detected: false,
          scope: blankJudicialScope(),
          assignee_id: "",
          note: "",
        },
  );
  const action = useLegalAction();
  const [quantity, setQuantity] = useState(
    previous ? String(previous.input.quantity) : "",
  );
  const docs = useQuery({
      queryKey: judicialKey(props, "documents"),
      queryFn: () => listLegalDocuments(props.legalCase.id),
      enabled: judicialCategoryAccess(props, "restricted"),
    }),
    proceedings = useQuery({
      queryKey: judicialKey(props, "proceedings"),
      queryFn: () => listLegalProceedings(props.legalCase.id),
      enabled: judicialCategoryAccess(props, "restricted"),
    });
  const patch = (key: keyof JudicialDeadlineInput, value: unknown) =>
    setForm({ ...form, [key]: value });
  const rule = props.context.rules.find(
      (row) => row.id === form.rule_version_id,
    ),
    calendar = props.context.calendars.find(
      (row) => row.id === form.calendar_version_id,
    );
  const approvedRules = judicialApprovedHeads(
    props.context.rules,
    (row) => row.rule_key,
  );
  const approvedCalendars = judicialApprovedHeads(
    props.context.calendars,
    (row) => row.calendar_key,
  );
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const ruleIds = new Set(
      judicialApprovedHeads(props.context.rules, (row) => row.rule_key).map(
        (row) => row.id,
      ),
    );
    const calendarIds = new Set(
      judicialApprovedHeads(
        props.context.calendars,
        (row) => row.calendar_key,
      ).map((row) => row.id),
    );
    const people = new Set(
      judicialAssignees(props, "restricted").map((row) => row.id),
    );
    const availableEvents = new Set(
      props.context.inbox
        .filter(
          (row) =>
            row.association_state === "confirmed" &&
            row.proceeding_id === form.proceeding_id,
        )
        .map((row) => row.id),
    );
    setForm((old) => {
      const next = { ...old };
      let removed = false;
      for (const [key, valid] of [
        ["rule_version_id", ruleIds],
        ["calendar_version_id", calendarIds],
        ["inbox_id", availableEvents],
        ["assignee_id", people],
        ["substitute_id", people],
      ] as const) {
        if (old[key] && !valid.has(old[key]!)) {
          delete (next as Partial<JudicialDeadlineInput>)[key];
          removed = true;
        }
      }
      if (
        docs.isSuccess &&
        old.evidence_document_id &&
        !docs.data.some(
          (doc) =>
            doc.id === old.evidence_document_id &&
            judicialCategoryAccess(props, doc.category),
        )
      ) {
        delete next.evidence_document_id;
        removed = true;
      }
      if (removed) {
        setUnavailable(true);
        return {
          ...next,
          assignee_id: next.assignee_id ?? "",
          conditions_confirmed: false,
          coverage_confirmed: false,
        };
      }
      return old;
    });
  }, [props, form.proceeding_id, docs.isSuccess, docs.data]);
  const assignees = judicialAssignees(props, "restricted").map((p) => ({
    value: p.id,
    label: p.nome,
  }));
  return (
    <JudicialDialog
      title={
        previous
          ? "Preparar nova versão da contagem"
          : "Preparar contagem assistida"
      }
      description="Preencha somente fatos e documentos conferidos. A proposta não constitui prazo revisado e pode retornar incompleta quando faltar prova, cobertura ou regra suportada."
      onClose={onClose}
      pending={action.pending}
      actionLabel="Gerar proposta e memória"
      onSubmit={async () => {
        const payload = { ...form, quantity: Number(quantity) };
        if (
          await action.run(
            () =>
              createJudicialDeadline(
                props.legalCase.id,
                Object.fromEntries(
                  Object.entries(payload).filter(([, value]) => value !== ""),
                ) as unknown as JudicialDeadlineInput,
              ),
            "Proposta de contagem registrada",
          )
        )
          onClose();
      }}
    >
      {unavailable && (
        <JudicialAccessNotice>
          Uma seleção anterior deixou de estar disponível ou foi substituída.
          Confira novamente regra, calendário, prova, vínculo e atribuição;
          nenhum novo elemento foi escolhido automaticamente.
        </JudicialAccessNotice>
      )}
      {previous && (
        <JudicialAccessNotice>
          Os dados da versão anterior foram copiados para revisão. As
          confirmações de condições e cobertura precisam ser feitas novamente; a
          versão anterior permanece preservada.
        </JudicialAccessNotice>
      )}
      <JudicialText
        label="Identificador estável deste prazo"
        value={form.deadline_key}
        readOnly={Boolean(previous)}
        hint={
          previous
            ? "O identificador é preservado para manter o histórico deste prazo."
            : undefined
        }
        onChange={(value) => patch("deadline_key", value)}
        required
        maxLength={80}
      />
      <JudicialText
        label="Título da providência"
        value={form.title}
        onChange={(value) => patch("title", value)}
        required
        maxLength={180}
      />
      <JudicialSelect
        label="Processo"
        value={form.proceeding_id}
        onChange={(value) => patch("proceeding_id", value)}
        required
        options={(proceedings.data ?? []).map((p) => ({
          value: p.id,
          label: p.cnj_number,
        }))}
      />
      <JudicialSelect
        label="Publicação com vínculo conferido"
        value={form.inbox_id ?? ""}
        onChange={(value) => patch("inbox_id", value)}
        options={props.context.inbox
          .filter(
            (i) =>
              i.association_state === "confirmed" &&
              i.proceeding_id === form.proceeding_id &&
              judicialCategoryAccess(props, i.category),
          )
          .map((i) => ({
            value: i.id,
            label: `${i.title} · versão ${i.version_number}`,
          }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <JudicialSelect
          label="Versão aprovada da regra"
          value={form.rule_version_id ?? ""}
          onChange={(value) => patch("rule_version_id", value)}
          options={approvedRules.map((r) => ({
            value: r.id,
            label: `${r.title} · versão ${r.version_number}`,
          }))}
        />
        <JudicialSelect
          label="Versão aprovada do calendário"
          value={form.calendar_version_id ?? ""}
          onChange={(value) => patch("calendar_version_id", value)}
          options={approvedCalendars.map((c) => ({
            value: c.id,
            label: `${c.title} · versão ${c.version_number}`,
          }))}
        />
      </div>
      {(rule || calendar) && (
        <div className="rounded-lg border p-3 text-sm">
          {rule && (
            <>
              <p className="font-medium">
                Regra: {rule.title} · versão {rule.version_number}
              </p>
              <p className="whitespace-pre-wrap">
                Condições: {rule.body.conditions}
              </p>
              <p className="whitespace-pre-wrap">
                Exclusões: {rule.body.exclusions}
              </p>
              <p>
                Vigência: {judicialDate(rule.valid_from)} a{" "}
                {judicialDate(rule.valid_until)}
              </p>
            </>
          )}
          {calendar && (
            <p className="mt-2">
              Calendário: {calendar.title} · {judicialDate(calendar.valid_from)}{" "}
              a {judicialDate(calendar.valid_until)} · Fuso {calendar.timezone}
            </p>
          )}
        </div>
      )}
      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">
          Alcance do processo conferido
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["court", "Tribunal"],
            ["degree", "Instância"],
            ["unit", "Unidade"],
            ["territory", "Território"],
          ].map(([key, label]) => (
            <JudicialText
              key={key}
              label={label}
              value={form.scope[key as keyof JudicialScope]}
              onChange={(value) =>
                patch("scope", { ...form.scope, [key]: value })
              }
              required
            />
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <LegalField label="Quantidade estabelecida no ato">
          {(id) => (
            <input
              id={id}
              required
              min={1}
              max={10000}
              step={1}
              type="number"
              className="h-10 w-full rounded-md border bg-background px-3"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          )}
        </LegalField>
        <JudicialSelect
          label="Unidade determinada no ato"
          value={form.unit}
          onChange={(value) => patch("unit", value)}
          required
          options={[
            { value: "business_days", label: "Dias úteis" },
            { value: "calendar_days", label: "Dias corridos" },
            { value: "hours", label: "Horas — análise manual necessária" },
            { value: "months", label: "Meses — análise manual necessária" },
            { value: "years", label: "Anos — análise manual necessária" },
          ]}
        />
      </div>
      <JudicialText
        label="Fundamento da quantidade e da unidade"
        value={form.duration_basis}
        onChange={(value) => patch("duration_basis", value)}
        required
        multiline
      />
      <JudicialSelect
        label="Natureza do marco documental"
        value={form.anchor_kind}
        onChange={(value) => patch("anchor_kind", value)}
        required
        options={Object.entries(JUDICIAL_ANCHORS).map(([value, label]) => ({
          value,
          label,
        }))}
        hint="A data informada será confrontada com o campo correspondente da fonte vinculada. Captura não constitui marco jurídico."
      />
      {form.anchor_kind === "manual_verified" && (
        <JudicialText
          label="Fundamento específico do marco alternativo"
          value={form.manual_anchor_reason ?? ""}
          onChange={(value) => patch("manual_anchor_reason", value)}
          required
          multiline
          hint="Explique por que este marco deve ser adotado e indique a prova documental examinada."
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <JudicialText
          label="Data civil do marco comprovado"
          value={form.anchor_date ?? ""}
          onChange={(value) => patch("anchor_date", value)}
          type="date"
        />
        <JudicialText
          label="Instante do marco com fuso (quando exigido)"
          value={form.anchor_at ?? ""}
          onChange={(value) => patch("anchor_at", value)}
          hint="Formato ISO com Z ou deslocamento, por exemplo 2026-09-11T10:00:00-03:00."
        />
      </div>
      <JudicialSelect
        label="Prova do marco examinada"
        value={form.evidence_document_id ?? ""}
        onChange={(value) => patch("evidence_document_id", value)}
        options={(docs.data ?? [])
          .filter((doc) => judicialCategoryAccess(props, doc.category))
          .map((doc) => ({ value: doc.id, label: doc.display_name }))}
      />
      <JudicialCheck
        label="Conferi a aplicabilidade, as condições e as exclusões desta versão da regra"
        checked={form.conditions_confirmed}
        onChange={(value) => patch("conditions_confirmed", value)}
      />
      <JudicialCheck
        label="Conferi a cobertura do calendário para este tribunal, local e período"
        checked={form.coverage_confirmed}
        onChange={(value) => patch("coverage_confirmed", value)}
      />
      <JudicialCheck
        label="Há conflito de informações ou de marcos a resolver"
        checked={form.conflict_detected}
        onChange={(value) => patch("conflict_detected", value)}
        hint="O conflito impede a conclusão automática desta proposta."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <JudicialSelect
          label="Responsável pela providência"
          value={form.assignee_id}
          onChange={(value) => patch("assignee_id", value)}
          required
          options={assignees}
        />
        <JudicialSelect
          label="Substituto"
          value={form.substitute_id ?? ""}
          onChange={(value) => patch("substitute_id", value)}
          options={assignees.filter((p) => p.value !== form.assignee_id)}
        />
      </div>
      <JudicialText
        label="Fundamento e observações da proposta"
        value={form.note}
        onChange={(value) => patch("note", value)}
        required
        multiline
      />
      {(docs.error || proceedings.error) && (
        <LegalError error={docs.error || proceedings.error} />
      )}
    </JudicialDialog>
  );
}
function CheckDialog({
  row,
  onClose,
}: {
  row: JudicialDeadlineVersion;
  onClose(): void;
}) {
  const [due, setDue] = useState(""),
    [note, setNote] = useState("");
  const action = useLegalAction();
  return (
    <JudicialDialog
      title="Agendar conferência da proposta"
      description="Cria uma tarefa para conferir o prazo. A data desta tarefa é interna e não aprova nem substitui um prazo processual."
      onClose={onClose}
      pending={action.pending}
      actionLabel="Agendar conferência interna"
      onSubmit={async () => {
        if (
          await action.run(
            () => createJudicialCheckTask(row.id, `${due}:00-03:00`, note),
            "Conferência interna agendada",
          )
        )
          onClose();
      }}
    >
      <JudicialText
        label="Conferir até (horário de Brasília)"
        type="datetime-local"
        value={due}
        onChange={setDue}
        required
      />
      <JudicialText
        label="O que precisa ser conferido"
        value={note}
        onChange={setNote}
        required
        multiline
      />
    </JudicialDialog>
  );
}
function DeadlineReport({
  props,
  id,
  onClose,
}: {
  props: JudicialProps;
  id: string;
  onClose(): void;
}) {
  const allowed = judicialCategoryAccess(props, "restricted");
  const alive = useRef(true);
  const access = useRef(allowed);
  access.current = allowed;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const action = useLegalAction();
  const query = useQuery({
    queryKey: judicialKey(props, `deadline-report-${id}`),
    queryFn: ({ signal }) => readJudicialDeadlineReport(id, signal),
    enabled: allowed,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  if (!allowed) return null;
  return (
    <JudicialDialog
      title="Memória da contagem"
      description="Leitura auditada da versão preservada. Cada dia e cada recusa provêm do cálculo executado no servidor."
      onClose={onClose}
      pending={false}
      onSubmit={async () => onClose()}
      actionLabel="Fechar memória"
    >
      {query.isPending ? (
        <LegalLoading />
      ) : query.isError ? (
        <LegalError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <Memory report={query.data} />
          <Button
            type="button"
            variant="outline"
            disabled={action.pending}
            onClick={() =>
              void action.run(async () => {
                const fresh = await readJudicialDeadlineReport(id);
                if (!alive.current || !access.current)
                  throw new Error(
                    "O acesso mudou durante a consulta. Reabra a memória com sua permissão atual.",
                  );
                downloadJudicialDeadlineReport(fresh);
              }, "Memória baixada")
            }
          >
            Baixar memória para impressão
          </Button>
        </>
      )}
    </JudicialDialog>
  );
}
function Memory({ report }: { report: JudicialDeadlineReport }) {
  const row = report.calculation;
  return (
    <div className="space-y-4 text-sm">
      <p className="font-semibold">
        {row.input.title} · versão {row.version_number}
      </p>
      <p>
        Estado: {JUDICIAL_STATES[row.state]} ·{" "}
        {report.is_current
          ? "Elementos atuais conferidos pelo servidor"
          : "Elementos alterados: histórico para reexaminar"}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt>Marco inicial</dt>
          <dd className="font-medium">
            {judicialDate(row.result.start_marker_on)}
          </dd>
        </div>
        <div>
          <dt>Primeiro dia contado</dt>
          <dd className="font-medium">
            {judicialDate(row.result.first_counted_on)}
          </dd>
        </div>
        <div>
          <dt>Vencimento proposto</dt>
          <dd className="font-medium">
            {row.result.proposed_due_on
              ? judicialDate(row.result.proposed_due_on)
              : "Não determinado"}
          </dd>
        </div>
        <div>
          <dt>Fuso do calendário</dt>
          <dd>{row.result.timezone || "Não informado"}</dd>
        </div>
      </dl>
      <p className="whitespace-pre-wrap break-words">
        Quantidade e fundamento: {row.input.quantity}{" "}
        {row.input.unit === "business_days"
          ? "dias úteis"
          : row.input.unit === "calendar_days"
            ? "dias corridos"
            : row.input.unit}{" "}
        · {row.input.duration_basis}
      </p>
      <p className="whitespace-pre-wrap break-words">{row.input.note}</p>
      <div className="space-y-1 break-all text-xs text-muted-foreground">
        <p>Motor: {row.engine_version}</p>
        <p>Regra preservada: {row.rule_version_id || "Não definida"}</p>
        <p>
          Calendário preservado: {row.calendar_version_id || "Não definido"}
        </p>
        <p>Integridade da memória: {row.snapshot_hash}</p>
      </div>
      {row.result.refusals.length > 0 && (
        <section>
          <h3 className="font-medium">Pendências que impediram a conclusão</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {row.result.refusals.map((reason, index) => (
              <li key={index}>{reason.message}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="space-y-3">
        <h3 className="font-medium">Dias examinados</h3>
        {!row.result.memory.length ? (
          <p>Nenhum dia contado antes da resolução das pendências.</p>
        ) : (
          row.result.memory.map((day, index) => (
            <div
              key={`${day.on}-${day.stage}-${index}`}
              className="space-y-1 rounded border p-3"
            >
              <p className="font-medium">
                {judicialDate(day.on)} ·{" "}
                {day.eligible
                  ? `Contabilizado: ${day.index}`
                  : "Não contabilizado"}
              </p>
              <p>
                {day.working_day
                  ? "Dia útil no calendário"
                  : "Dia não útil no calendário"}
                {day.suspended ? " · Contagem suspensa" : ""}
              </p>
              <p className="break-words">{day.reason}</p>
              <p className="text-xs text-muted-foreground">
                Etapa:{" "}
                {(
                  {
                    marker: "Formação do marco",
                    marker_offset: "Deslocamento do marco",
                    count: "Contagem",
                    due_adjustment: "Ajuste de vencimento",
                    marker_adjustment: "Ajuste do marco",
                  } as Record<string, string>
                )[day.stage] ?? day.stage}
              </p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
