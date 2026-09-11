import { useState } from "react";
import { JudicialProviderScopeFields } from "./JudicialProviderScopeFields";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments, listLegalProceedings } from "@/lib/api/legal";
import {
  cancelJudicialJob,
  configureJudicialConnection,
  createJudicialSource,
  enqueueJudicialJob,
  getJudicialContext,
  retryJudicialJob,
  reviewJudicialSource,
  saveJudicialCoverage,
} from "@/lib/api/legal-judicial";
import type {
  JudicialCoverage,
  JudicialCoverageInput,
  JudicialJob,
  JudicialOperation,
  JudicialProvider,
  JudicialSourceInput,
  JudicialSourceVersion,
} from "@/types/legal-judicial";
import { LegalEmpty, LegalError, LegalField } from "../LegalShared";
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
  JUDICIAL_OPERATIONS,
  JUDICIAL_STATES,
  judicialCaseAccess,
  judicialContinuation,
  judicialCategoryAccess,
  judicialDate,
  judicialKey,
  type JudicialProps,
} from "./judicial-ui";

export default function JudicialMonitoring(props: JudicialProps) {
  const [dialog, setDialog] = useState<
      "source" | "configure" | "coverage" | "job" | null
    >(null),
    [source, setSource] = useState<JudicialSourceVersion | undefined>(),
    [coverage, setCoverage] = useState<JudicialCoverage | undefined>();
  const [continuation, setContinuation] = useState<JudicialJob | null>(null);
  const [review, setReview] = useState<{
    kind: "source" | "job";
    id: string;
    decision: "approved" | "rejected" | "revoked" | "retry" | "cancel";
  } | null>(null);
  const action = useLegalAction();
  const global = useQuery({
    queryKey: judicialKey(props, "discovery"),
    queryFn: ({ signal }) => getJudicialContext(undefined, signal),
    enabled:
      judicialCaseAccess(props) &&
      judicialCategoryAccess(props, "restricted") &&
      props.context.can_manage_sources,
    retry: false,
  });
  if (!judicialCaseAccess(props)) return <JudicialAccessNotice />;
  const dual = judicialCategoryAccess(props, "restricted");
  const jobs = dual
    ? [
        ...props.context.jobs,
        ...(props.context.can_manage_sources
          ? (global.data?.jobs.filter((job) => !job.case_id) ?? [])
          : []),
      ]
    : [];
  const currentReview =
    review &&
    (review.kind === "source"
      ? props.context.sources.some((s) => s.id === review.id)
      : dual && jobs.some((j) => j.id === review.id));
  return (
    <div className="space-y-5">
      <OperationPanel
        title="Fontes e cobertura"
        description="Permissão contratual, conexão técnica e cobertura são conferências separadas. Cadastros e consultas não produzem petição, intimação pessoal ou ciência."
        actions={
          props.context.can_manage_sources && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSource(undefined);
                  setDialog("source");
                }}
              >
                Cadastrar fonte
              </Button>
              <Button size="sm" onClick={() => setDialog("configure")}>
                Configurar conexão
              </Button>
            </div>
          )
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4 text-sm">
            <p className="font-medium">
              DataJud · consumo comercial indisponível
            </p>
            <p className="mt-2 text-muted-foreground">
              A API pública restringe exploração comercial. O consumo permanece
              bloqueado nesta fase; uma chave pública não comprova autorização
              para este produto.
            </p>
          </div>
          <div className="rounded-lg border p-4 text-sm">
            <p className="font-medium">
              Escavador · configuração e piloto necessários
            </p>
            <p className="mt-2 text-muted-foreground">
              Contrato, conta vinculada, orçamento e cobertura precisam ser
              conferidos antes de habilitar uma consulta externa.
            </p>
          </div>
        </div>
        {!props.context.connections.length ? (
          <LegalEmpty title="Nenhuma conexão configurada">
            A equipe pode manter cadastro manual e conferência documental
            enquanto a integração não estiver disponível.
          </LegalEmpty>
        ) : (
          props.context.connections.map((connection) => (
            <article
              className="space-y-3 rounded-lg border p-4"
              key={connection.id}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-semibold">
                  {connection.provider === "escavador"
                    ? "Escavador"
                    : "DataJud"}
                </h3>
                <Badge variant="secondary">
                  {JUDICIAL_STATES[connection.state]}
                </Badge>
              </div>
              <p className="text-sm">
                Última consulta concluída:{" "}
                {judicialDate(connection.last_success_at)}
              </p>
              <p className="text-sm text-muted-foreground">
                Limites: {connection.limits.requests_per_minute}{" "}
                consultas/minuto · {connection.limits.requests_per_day}/dia
              </p>
              {connection.last_error_code && (
                <p className="break-words text-sm">
                  Motivo técnico informado: {connection.last_error_code}
                </p>
              )}
              {props.context.can_manage_sources && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCoverage(undefined);
                    setDialog("coverage");
                  }}
                >
                  Conferir cobertura
                </Button>
              )}
              {props.context.coverages
                .filter((c) => c.connection_id === connection.id)
                .map((c) => (
                  <div
                    key={c.id}
                    className="space-y-2 rounded-lg bg-muted/30 p-3 text-sm"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="break-words font-medium">
                        {JUDICIAL_OPERATIONS[c.capability] ?? c.capability}
                      </p>
                      <Badge variant="outline">
                        {JUDICIAL_STATES[c.state]}
                      </Badge>
                    </div>
                    <p className="break-words">
                      {Object.entries(c.scope)
                        .filter(([, value]) => typeof value === "string")
                        .map(([, value]) => value as string)
                        .join(" · ")}
                    </p>
                    <p>
                      Início da cobertura: {judicialDate(c.coverage_start_on)}
                    </p>
                    <p>
                      Intervalo esperado: {c.expected_interval_minutes} min ·
                      Atraso tolerado: {c.tolerated_delay_minutes} min
                    </p>
                    <p>Última captura: {judicialDate(c.last_capture_at)}</p>
                    {c.is_late && (
                      <p className="font-medium text-amber-800 dark:text-amber-300">
                        Captura ausente ou fora do intervalo esperado: conferir
                        a fonte manualmente.
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">
                      {c.review_note}
                    </p>
                    {props.context.can_manage_sources && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCoverage(c);
                          setDialog("coverage");
                        }}
                      >
                        Atualizar conferência
                      </Button>
                    )}
                  </div>
                ))}
            </article>
          ))
        )}
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer font-medium">
            Versões da documentação e autorização (
            {props.context.sources.length})
          </summary>
          <div className="mt-4 space-y-3">
            {!props.context.sources.length && (
              <p className="text-sm text-muted-foreground">
                Nenhuma fonte cadastrada. Não há autorização aprovada de
                fábrica.
              </p>
            )}
            {props.context.sources.map((s) => (
              <article key={s.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="break-words font-medium">
                    {s.title} · versão {s.version_number}
                  </h3>
                  <Badge variant="secondary">{JUDICIAL_STATES[s.state]}</Badge>
                </div>
                <p className="text-sm">
                  Vigência: {judicialDate(s.valid_from)} a{" "}
                  {judicialDate(s.valid_until)} · Consulta em{" "}
                  {judicialDate(s.checked_on)}
                </p>
                <p className="break-words text-sm">
                  API {s.api_version} · Termos {s.terms_version}
                </p>
                <a
                  href={
                    s.documentation_url.startsWith("https://")
                      ? s.documentation_url
                      : undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-sm underline"
                >
                  Documentação da fonte
                </a>
                <p className="text-sm">
                  Operações:{" "}
                  {s.allowed_operations
                    .map((o) => JUDICIAL_OPERATIONS[o])
                    .join(", ") || "Não informadas"}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {s.limitations}
                </p>
                <p className="text-sm">
                  Revisão: {s.review_note || "Pendente"}
                </p>
                {props.context.can_manage_sources && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSource(s);
                        setDialog("source");
                      }}
                    >
                      Nova versão
                    </Button>
                    {s.state === "draft" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            setReview({
                              kind: "source",
                              id: s.id,
                              decision: "approved",
                            })
                          }
                        >
                          Aprovar autorização
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setReview({
                              kind: "source",
                              id: s.id,
                              decision: "rejected",
                            })
                          }
                        >
                          Rejeitar
                        </Button>
                      </>
                    )}
                    {s.state === "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setReview({
                            kind: "source",
                            id: s.id,
                            decision: "revoked",
                          })
                        }
                      >
                        Revogar autorização
                      </Button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </details>
      </OperationPanel>
      <OperationPanel
        title="Consultas e monitoramento"
        description="Cada solicitação tem operação, limite de consumo e justificativa explícitos. Consulta concluída não comprova cobertura integral nem ausência de intimações."
        actions={
          props.context.can_review_case &&
          dual && (
            <Button size="sm" onClick={() => setDialog("job")}>
              Solicitar consulta ou monitor
            </Button>
          )
        }
      >
        {!dual ? (
          <JudicialAccessNotice />
        ) : !jobs.length ? (
          <LegalEmpty title="Nenhuma consulta solicitada" />
        ) : (
          jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              canReview={props.context.can_review_case}
              onContinue={() => setContinuation(job)}
              onAction={(decision) =>
                setReview({ kind: "job", id: job.id, decision })
              }
            />
          ))
        )}
      </OperationPanel>
      {continuation &&
        dual &&
        props.context.can_review_case &&
        jobs.some((job) => job.id === continuation.id) && (
          <ContinueDialog
            job={continuation}
            onClose={() => setContinuation(null)}
          />
        )}
      {props.context.can_manage_sources && dialog === "source" && (
        <SourceDialog
          props={props}
          previous={source}
          onClose={() => setDialog(null)}
        />
      )}
      {props.context.can_manage_sources && dialog === "configure" && (
        <ConnectionDialog props={props} onClose={() => setDialog(null)} />
      )}
      {props.context.can_manage_sources && dialog === "coverage" && (
        <CoverageDialog
          props={props}
          previous={coverage}
          onClose={() => setDialog(null)}
        />
      )}
      {props.context.can_review_case && dual && dialog === "job" && (
        <JobDialog props={props} onClose={() => setDialog(null)} />
      )}
      {currentReview && review && (
        <OperationReasonDialog
          open
          onClose={() => setReview(null)}
          pending={action.pending}
          title={
            review.kind === "source"
              ? "Revisar documentação e autorização"
              : "Revisar operação da fila"
          }
          description={
            review.kind === "source"
              ? "Confira versão, prova contratual, escopo, vigência e operações. Aprovar um cadastro não configura credenciais nem libera o DataJud para uso comercial."
              : "Não repita a criação de monitor com resultado desconhecido. Nessa situação, concilie o identificador junto ao fornecedor."
          }
          actionLabel={
            review.decision === "approved"
              ? "Aprovar versão"
              : review.decision === "revoked"
                ? "Revogar versão"
                : review.decision === "rejected"
                  ? "Rejeitar versão"
                  : review.decision === "retry"
                    ? "Solicitar nova tentativa"
                    : "Cancelar solicitação"
          }
          onSave={(note) =>
            action.run(
              () =>
                review.kind === "source"
                  ? reviewJudicialSource(
                      review.id,
                      review.decision as "approved" | "rejected" | "revoked",
                      note,
                    )
                  : review.decision === "retry"
                    ? retryJudicialJob(review.id, note)
                    : cancelJudicialJob(review.id, note),
              "Decisão registrada",
            )
          }
        />
      )}
    </div>
  );
}
function JobCard({
  job,
  canReview,
  onAction,
  onContinue,
}: {
  job: JudicialJob;
  canReview: boolean;
  onContinue(): void;
  onAction(value: "retry" | "cancel"): void;
}) {
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">{JUDICIAL_OPERATIONS[job.operation]}</h3>
        <Badge variant="secondary">{JUDICIAL_STATES[job.state]}</Badge>
      </div>
      <p className="break-words text-sm">
        {[
          job.query.cnj,
          job.query.oab_number &&
            `OAB ${job.query.oab_number}/${job.query.oab_state}`,
          job.query.term,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="text-sm">
        {job.request_count} de {job.max_requests} requisições · {job.attempts}{" "}
        tentativas · Orçamento autorizado {job.budget_units} unidades
      </p>
      <p className="whitespace-pre-wrap break-words text-sm">
        {job.authorization_note}
      </p>
      <p className="text-xs text-muted-foreground">
        Próxima tentativa: {judicialDate(job.next_attempt_at)}
      </p>
      {job.provider_monitor_id && (
        <p className="break-all text-xs">
          Monitor no fornecedor: {job.provider_monitor_id}
        </p>
      )}
      {job.state === "unknown" && (
        <JudicialAccessNotice>
          O resultado da criação não foi confirmado. Consulte e concilie o
          monitor antes de qualquer nova solicitação.
        </JudicialAccessNotice>
      )}
      {judicialContinuation(job) && (
        <p className="text-sm">
          Há páginas adicionais na fonte. Esta consulta preservou o ponto de
          continuação; o resultado ainda é parcial.
        </p>
      )}
      {canReview && (
        <div className="flex flex-wrap gap-2">
          {judicialContinuation(job) && (
            <Button size="sm" variant="outline" onClick={onContinue}>
              Consultar próxima página
            </Button>
          )}
          {[
            "consult_cnj",
            "discover_oab",
            "read_updates",
            "reconcile_monitor",
          ].includes(job.operation) &&
            ["failed", "retry_wait"].includes(job.state) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction("retry")}
              >
                Revisar nova tentativa
              </Button>
            )}
          {[
            "queued",
            "retry_wait",
            "not_configured",
            "permission_pending",
            "quota_exhausted",
          ].includes(job.state) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("cancel")}
            >
              Cancelar solicitação
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
function SourceDialog({
  props,
  previous,
  onClose,
}: {
  props: JudicialProps;
  previous?: JudicialSourceVersion;
  onClose(): void;
}) {
  const [form, setForm] = useState<JudicialSourceInput>(
    previous
      ? { ...previous }
      : {
          provider: "escavador",
          source_key: "",
          title: "",
          api_version: "",
          documentation_url: "",
          checked_on: "",
          terms_version: "",
          permission_document_id: "",
          allowed_operations: [],
          valid_from: "",
          valid_until: "",
          scope: { court: "", oab_state: "", origins_ids: [], note: "" },
          limitations: "",
        },
  );
  const action = useLegalAction();
  const docs = useQuery({
    queryKey: judicialKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
    enabled: judicialCaseAccess(props),
  });
  const patch = (key: keyof JudicialSourceInput, value: unknown) =>
    setForm({ ...form, [key]: value });
  return (
    <JudicialDialog
      title={
        previous ? "Nova versão da fonte" : "Cadastrar documentação da fonte"
      }
      description="Descreva o alcance da autorização e anexe a prova geral. O cadastro será um rascunho para revisão nominal."
      onClose={onClose}
      pending={action.pending}
      onSubmit={async () => {
        const {
          provider,
          source_key,
          title,
          api_version,
          documentation_url,
          checked_on,
          terms_version,
          permission_document_id,
          allowed_operations,
          valid_from,
          valid_until,
          scope,
          limitations,
        } = form;
        if (
          await action.run(
            () =>
              createJudicialSource({
                provider,
                source_key,
                title,
                api_version,
                documentation_url,
                checked_on,
                terms_version,
                permission_document_id: permission_document_id || null,
                allowed_operations,
                valid_from,
                valid_until,
                scope,
                limitations,
              }),
            "Rascunho de fonte criado",
          )
        )
          onClose();
      }}
    >
      <JudicialSelect
        label="Fornecedor"
        value={form.provider}
        onChange={(value) => patch("provider", value as JudicialProvider)}
        required
        options={[
          { value: "escavador", label: "Escavador" },
          { value: "datajud", label: "DataJud — consumo comercial bloqueado" },
        ]}
      />
      <JudicialText
        label="Identificador estável desta fonte"
        value={form.source_key}
        onChange={(value) => patch("source_key", value)}
        required
        maxLength={80}
      />
      <JudicialText
        label="Título da documentação"
        value={form.title}
        onChange={(value) => patch("title", value)}
        required
        maxLength={180}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ["api_version", "Versão da API"],
          ["terms_version", "Versão dos termos"],
        ].map(([key, label]) => (
          <JudicialText
            key={key}
            label={label}
            value={form[key as "api_version" | "terms_version"]}
            onChange={(value) => patch(key as keyof JudicialSourceInput, value)}
            required
            maxLength={key === "api_version" ? 100 : 300}
          />
        ))}
      </div>
      <JudicialText
        label="Documentação oficial (https)"
        type="url"
        value={form.documentation_url}
        onChange={(value) => patch("documentation_url", value)}
        required
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["checked_on", "Consultada em"],
          ["valid_from", "Vigente desde"],
          ["valid_until", "Vigente até"],
        ].map(([key, label]) => (
          <JudicialText
            key={key}
            label={label}
            type="date"
            value={form[key as "checked_on" | "valid_from" | "valid_until"]}
            onChange={(value) => patch(key as keyof JudicialSourceInput, value)}
            required
          />
        ))}
      </div>
      <JudicialSelect
        label="Prova geral da autorização contratual"
        value={form.permission_document_id ?? ""}
        onChange={(value) => patch("permission_document_id", value)}
        options={(docs.data ?? [])
          .filter((doc) => doc.category === "general")
          .map((doc) => ({ value: doc.id, label: doc.display_name }))}
      />
      {docs.error && <LegalError error={docs.error} />}
      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">
          Operações expressamente autorizadas
        </legend>
        {Object.entries(JUDICIAL_OPERATIONS).map(([key, label]) => (
          <JudicialCheck
            key={key}
            label={label}
            checked={form.allowed_operations.includes(key as JudicialOperation)}
            onChange={(checked) =>
              patch(
                "allowed_operations",
                checked
                  ? [...form.allowed_operations, key]
                  : form.allowed_operations.filter((op) => op !== key),
              )
            }
          />
        ))}
      </fieldset>
      <JudicialProviderScopeFields
        value={form.scope}
        onChange={(scope) => patch("scope", scope)}
      />
      <JudicialText
        label="Limitações, exclusões e cuidados"
        value={form.limitations}
        onChange={(value) => patch("limitations", value)}
        required
        multiline
      />
    </JudicialDialog>
  );
}
function ConnectionDialog({
  props,
  onClose,
}: {
  props: JudicialProps;
  onClose(): void;
}) {
  const [source, setSource] = useState(""),
    [minute, setMinute] = useState(""),
    [day, setDay] = useState(""),
    [enabled, setEnabled] = useState(false);
  const action = useLegalAction();
  const current = props.context.sources.find(
    (row) => row.id === source && row.state === "approved",
  );
  return (
    <JudicialDialog
      title="Configurar conexão judicial"
      description="A conta e a credencial devem estar vinculadas no ambiente pelo administrador da infraestrutura. Esta tela registra a intenção e os limites; não recebe chaves de acesso."
      onClose={onClose}
      pending={action.pending}
      actionLabel="Salvar configuração"
      onSubmit={async () => {
        if (!current) return;
        if (
          await action.run(
            () =>
              configureJudicialConnection(
                current.provider,
                current.id,
                enabled,
                {
                  environment: "production",
                  requests_per_minute: Number(minute),
                  requests_per_day: Number(day),
                },
              ),
            "Configuração registrada",
          )
        )
          onClose();
      }}
      disabled={!current}
    >
      <JudicialSelect
        label="Fonte e autorização aprovada"
        value={source}
        onChange={setSource}
        required
        options={props.context.sources
          .filter((row) => row.state === "approved")
          .map((row) => ({
            value: row.id,
            label: `${row.title} · versão ${row.version_number}`,
          }))}
      />
      <NumberField
        label="Requisições por minuto"
        value={minute}
        set={setMinute}
        min={1}
        max={120}
      />
      <NumberField
        label="Requisições por dia"
        value={day}
        set={setDay}
        min={1}
        max={10000}
      />
      <JudicialCheck
        label="Habilitar consultas dentro dos limites e da autorização conferidos"
        checked={enabled}
        onChange={setEnabled}
      />
      <JudicialAccessNotice>
        Sem conta e credencial vinculadas, a conexão permanece não configurada.
        DataJud não é habilitado nesta fase.
      </JudicialAccessNotice>
    </JudicialDialog>
  );
}
function CoverageDialog({
  props,
  previous,
  onClose,
}: {
  props: JudicialProps;
  previous?: JudicialCoverage;
  onClose(): void;
}) {
  const [connection, setConnection] = useState(previous?.connection_id ?? ""),
    [form, setForm] = useState<JudicialCoverageInput>(
      previous
        ? { ...previous }
        : {
            scope: { court: "", oab_state: "", origins_ids: [], note: "" },
            capability: "",
            coverage_start_on: "",
            expected_interval_minutes: 0,
            tolerated_delay_minutes: 0,
            state: "unknown",
            review_note: "",
          },
    );
  const action = useLegalAction();
  const patch = (key: keyof JudicialCoverageInput, value: unknown) =>
    setForm({ ...form, [key]: value });
  return (
    <JudicialDialog
      title="Conferir cobertura da fonte"
      description="Registre o tribunal, o alcance documentado e a expectativa de captura. Falhas e atrasos devem permanecer visíveis."
      onClose={onClose}
      pending={action.pending}
      actionLabel="Registrar cobertura"
      onSubmit={async () => {
        const {
          scope,
          capability,
          coverage_start_on,
          expected_interval_minutes,
          tolerated_delay_minutes,
          state,
          review_note,
        } = form;
        if (
          await action.run(
            () =>
              saveJudicialCoverage(
                connection,
                {
                  scope,
                  capability,
                  coverage_start_on,
                  expected_interval_minutes,
                  tolerated_delay_minutes,
                  state,
                  review_note,
                },
                previous?.id,
              ),
            "Cobertura registrada",
          )
        )
          onClose();
      }}
    >
      <JudicialSelect
        label="Conexão"
        value={connection}
        onChange={setConnection}
        required
        options={props.context.connections.map((row) => ({
          value: row.id,
          label: row.provider,
        }))}
      />
      <JudicialSelect
        label="Recurso e canal cobertos"
        value={form.capability}
        onChange={(value) => patch("capability", value)}
        required
        options={Object.entries(JUDICIAL_OPERATIONS).map(([value, label]) => ({
          value,
          label,
        }))}
      />
      <JudicialProviderScopeFields
        value={form.scope}
        onChange={(scope) => patch("scope", scope)}
      />
      <JudicialText
        label="Cobertura iniciada em"
        type="date"
        value={form.coverage_start_on}
        onChange={(value) => patch("coverage_start_on", value)}
        required
      />
      <NumberField
        label="Intervalo esperado em minutos"
        value={
          form.expected_interval_minutes
            ? String(form.expected_interval_minutes)
            : ""
        }
        set={(value) => patch("expected_interval_minutes", Number(value))}
        min={1}
        max={525600}
      />
      <NumberField
        label="Atraso tolerado em minutos"
        value={String(form.tolerated_delay_minutes)}
        set={(value) => patch("tolerated_delay_minutes", Number(value))}
        min={0}
        max={525600}
      />
      <JudicialSelect
        label="Situação conferida"
        value={form.state}
        onChange={(value) => patch("state", value)}
        required
        options={["unknown", "verified", "degraded", "interrupted"].map(
          (state) => ({ value: state, label: JUDICIAL_STATES[state] }),
        )}
      />
      <JudicialText
        label="Fundamento da cobertura e ação necessária"
        value={form.review_note}
        onChange={(value) => patch("review_note", value)}
        required
        multiline
      />
    </JudicialDialog>
  );
}
function NumberField({
  label,
  value,
  set,
  min,
  max,
}: {
  label: string;
  value: string;
  set(value: string): void;
  min: number;
  max: number;
}) {
  return (
    <LegalField label={label}>
      {(id) => (
        <input
          id={id}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          type="number"
          step="1"
          required
          min={min}
          max={max}
          value={value}
          onChange={(event) => set(event.target.value)}
        />
      )}
    </LegalField>
  );
}
function JobDialog({
  props,
  onClose,
}: {
  props: JudicialProps;
  onClose(): void;
}) {
  const [connection, setConnection] = useState(""),
    [operation, setOperation] = useState<JudicialOperation | "">(""),
    [proceeding, setProceeding] = useState(""),
    [oab, setOab] = useState(""),
    [uf, setUf] = useState(""),
    [oabType, setOabType] = useState(""),
    [term, setTerm] = useState(""),
    [origins, setOrigins] = useState(""),
    [appearances, setAppearances] = useState(""),
    [monitor, setMonitor] = useState(""),
    [kind, setKind] = useState(""),
    [max, setMax] = useState(""),
    [budget, setBudget] = useState(""),
    [note, setNote] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  const action = useLegalAction();
  const proceedings = useQuery({
    queryKey: judicialKey(props, "proceedings"),
    queryFn: () => listLegalProceedings(props.legalCase.id),
    enabled: judicialCaseAccess(props),
  });
  const cnj = proceedings.data?.find((p) => p.id === proceeding)?.cnj_number;
  const options = props.context.connections.filter(
    (c) =>
      c.provider === "escavador" &&
      c.enabled &&
      !["permission_pending", "disabled"].includes(c.state),
  );
  const monetary = ["monitor_process", "monitor_diary"].includes(operation);
  const originParts = origins
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const originsValid =
    operation !== "monitor_diary" ||
    (originParts.length > 0 &&
      originParts.length <= 20 &&
      originParts.every((x) => /^[1-9][0-9]{0,9}$/.test(x)));
  return (
    <JudicialDialog
      title="Solicitar operação judicial"
      description="Confira a operação e o consumo autorizado. Criar um monitor pode gerar cobrança no fornecedor; a solicitação não produz ciência nem associa candidatos automaticamente."
      onClose={onClose}
      pending={action.pending}
      actionLabel="Autorizar esta solicitação"
      disabled={!operation || !originsValid}
      onSubmit={async () => {
        if (!operation) return;
        const discovery = operation === "discover_oab";
        const payload = {
          ...(discovery
            ? {}
            : { case_id: props.legalCase.id, proceeding_id: proceeding }),
          operation,
          query: discovery
            ? { oab_number: oab, oab_state: uf, oab_type: oabType }
            : {
                ...(cnj ? { cnj } : {}),
                ...(operation === "monitor_diary"
                  ? {
                      limit_appearances: Number(appearances),
                      ...(term
                        ? { term, origins_ids: originParts.map(Number) }
                        : {}),
                    }
                  : {}),
                ...(operation === "reconcile_monitor"
                  ? {
                      provider_monitor_id: monitor,
                      monitor_kind: kind as "process" | "diary",
                    }
                  : {}),
              },
          max_requests: Number(max),
          budget_units: monetary ? Number(budget) : 0,
          authorization_note: note,
          idempotency_key: key,
        };
        if (
          await action.run(
            () => enqueueJudicialJob(connection, payload),
            "Solicitação registrada na fila",
          )
        )
          onClose();
      }}
    >
      <JudicialSelect
        label="Conexão autorizada"
        value={connection}
        onChange={setConnection}
        required
        options={options.map((c) => ({
          value: c.id,
          label: `${c.provider} · ${JUDICIAL_STATES[c.state]}`,
        }))}
      />
      <JudicialAccessNotice>
        O servidor confere autorização, credencial, cota e vínculo antes de cada
        consulta. Uma solicitação na fila pode permanecer sem envio até resolver
        a configuração.
      </JudicialAccessNotice>
      <JudicialSelect
        label="Operação"
        value={operation}
        onChange={(value) => setOperation(value as JudicialOperation)}
        required
        options={Object.entries(JUDICIAL_OPERATIONS)
          .filter(
            ([value]) =>
              value !== "discover_oab" || props.context.can_manage_sources,
          )
          .map(([value, label]) => ({ value, label }))}
      />
      {operation === "discover_oab" ? (
        <>
          <JudicialAccessNotice>
            A descoberta pertence ao escritório e retorna candidatos sem vínculo
            com este caso. Cada associação exige revisão posterior.
          </JudicialAccessNotice>
          <div className="grid gap-4 sm:grid-cols-2">
            <JudicialText
              label="Número da OAB"
              value={oab}
              onChange={setOab}
              required
              maxLength={15}
            />
            <JudicialSelect
              label="UF da OAB"
              value={uf}
              onChange={setUf}
              required
              options={"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
                .split(" ")
                .map((value) => ({ value, label: value }))}
            />
          </div>
          <JudicialSelect
            label="Tipo de inscrição conforme cadastro do fornecedor"
            value={oabType}
            onChange={setOabType}
            required
            options={Object.entries({
              ADVOGADO: "Advogado",
              ESTAGIARIO: "Estagiário",
              SUPLEMENTAR: "Inscrição suplementar",
              CONSULTOR_ESTRANGEIRO: "Consultor estrangeiro",
            }).map(([value, label]) => ({ value, label }))}
          />
        </>
      ) : (
        <JudicialSelect
          label="Processo do caso"
          value={proceeding}
          onChange={setProceeding}
          required
          options={(proceedings.data ?? []).map((p) => ({
            value: p.id,
            label: p.cnj_number,
          }))}
        />
      )}
      {operation === "monitor_diary" && (
        <>
          <NumberField
            label="Máximo de aparições autorizado no diário"
            value={appearances}
            set={setAppearances}
            min={1}
            max={10000}
          />
          <JudicialText
            label="Termo literal do diário autorizado"
            value={term}
            onChange={setTerm}
            maxLength={200}
            required
            hint="O monitor de diário utiliza o termo e as origens expressamente autorizados."
          />
          {term && (
            <JudicialText
              label="Identificadores dos diários de origem"
              value={origins}
              onChange={setOrigins}
              required
              hint="IDs numéricos confirmados no fornecedor, separados por vírgula; até20. Não informe URLs."
            />
          )}
          {!originsValid && (
            <p role="alert" className="text-sm text-destructive">
              Confira os identificadores numéricos das origens.
            </p>
          )}
        </>
      )}
      {operation === "reconcile_monitor" && (
        <>
          <JudicialText
            label="Identificador do monitor já conferido"
            value={monitor}
            onChange={setMonitor}
            required
            maxLength={120}
          />
          <JudicialSelect
            label="Tipo do monitor"
            value={kind}
            onChange={setKind}
            required
            options={[
              { value: "process", label: "Processo" },
              { value: "diary", label: "Diário" },
            ]}
          />
        </>
      )}
      <NumberField
        label="Máximo de requisições desta operação"
        value={max}
        set={setMax}
        min={1}
        max={5}
      />
      {monetary && (
        <NumberField
          label="Unidades de consumo expressamente autorizadas"
          value={budget}
          set={setBudget}
          min={1}
          max={100000}
        />
      )}
      <JudicialText
        label="Finalidade e autorização de consumo"
        value={note}
        onChange={setNote}
        required
        multiline
      />
      {proceedings.error && <LegalError error={proceedings.error} />}
    </JudicialDialog>
  );
}

function ContinueDialog({
  job,
  onClose,
}: {
  job: JudicialJob;
  onClose(): void;
}) {
  const [max, setMax] = useState("");
  const [note, setNote] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const action = useLegalAction();
  const cursor = judicialContinuation(job);
  return (
    <JudicialDialog
      title="Continuar consulta paginada"
      description="Autorize o próximo trecho da mesma consulta. O servidor revalida escopo, credenciais e cota antes do envio."
      onClose={onClose}
      pending={action.pending}
      disabled={!cursor}
      actionLabel="Solicitar próxima página"
      onSubmit={async () => {
        if (!cursor) return;
        if (
          await action.run(
            () =>
              enqueueJudicialJob(job.connection_id, {
                ...(job.case_id ? { case_id: job.case_id } : {}),
                ...(job.proceeding_id
                  ? { proceeding_id: job.proceeding_id }
                  : {}),
                operation: job.operation,
                query: { ...job.query, cursor },
                max_requests: Number(max),
                budget_units: 0,
                authorization_note: note,
                idempotency_key: key,
              }),
            "Continuação registrada na fila",
          )
        )
          onClose();
      }}
    >
      <p className="text-sm">{JUDICIAL_OPERATIONS[job.operation]}</p>
      <NumberField
        label="Máximo de requisições adicionais"
        value={max}
        set={setMax}
        min={1}
        max={5}
      />
      <JudicialText
        label="Finalidade e autorização da continuação"
        value={note}
        onChange={setNote}
        required
        multiline
      />
    </JudicialDialog>
  );
}
