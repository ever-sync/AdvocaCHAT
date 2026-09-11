import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  cancelAssistanceAi,
  readAssistanceDraft,
  reviewAssistanceDraft,
  submitAssistanceDraft,
  transferAssistanceDraft,
} from "@/lib/api/legal-assistance";
import { getClientCareContext } from "../client-care/api";
import type {
  AssistanceAiJob,
  AssistanceDraftRead,
  AssistanceDraftVersion,
  AssistanceTransferInput,
} from "@/types/legal-assistance";
import { LegalError, LegalField, LegalLoading } from "../LegalShared";
import { useLegalAction } from "../legal-ui";
import {
  OperationPanel,
  OperationReasonDialog,
  OperationRecords,
} from "../operations/OperationPanel";
import {
  AssistanceAccessNotice,
  AssistanceDialog,
  AssistanceNotice,
  AssistancePagination,
  AssistanceSelect,
} from "./AssistanceShared";
import {
  ASSISTANCE_CATEGORIES,
  ASSISTANCE_DRAFT_KINDS,
  assistanceCaseAccess,
  assistanceCategoryAccess,
  assistanceChoice,
  assistanceDate,
  assistanceKey,
  type AssistanceProps,
} from "./assistance-ui";
import { useAssistanceList } from "./assistance-hooks";
import { AssistanceDraftPreview } from "./AssistanceDraftPreview";
import { AssistanceDraftComposer } from "./AssistanceDraftComposer";
const draftStates: Record<AssistanceDraftVersion["state"], string> = {
  draft: "Rascunho",
  in_review: "Em revisão",
  reviewed: "Revisado",
  returned: "Devolvido para ajuste",
  revoked: "Revogado",
};
const aiStates: Record<AssistanceAiJob["state"], string> = {
  queued: "Na fila",
  running: "Em processamento",
  succeeded: "Rascunho gerado; revisão pendente",
  failed: "Falha na geração",
  cancelled: "Cancelado",
  authorization_revoked: "Autorização revogada",
  not_configured: "Não configurado",
  quota_exhausted: "Limite de consumo atingido",
  unknown: "Resultado não confirmado",
};
export default function AssistanceDrafts(props: AssistanceProps) {
  const list = useAssistanceList(props, "drafts"),
    jobs = useAssistanceList(props, "ai_jobs");
  const [selected, setSelected] = useState<string | null>(null),
    [creating, setCreating] = useState(false),
    [cancel, setCancel] = useState<AssistanceAiJob | null>(null);
  const action = useLegalAction();
  if (!assistanceCaseAccess(props)) return <AssistanceAccessNotice />;
  const row = list.rows.find((item) => item.id === selected);
  return (
    <div className="space-y-5">
      <OperationPanel
        title="Rascunhos e versões"
        description="Leia as fontes, as lacunas e as divergências antes da revisão. Um texto gerado permanece interno até decisões explícitas nas etapas de destino."
        actions={
          props.context.can_edit && (
            <Button size="sm" onClick={() => setCreating(true)}>
              Novo rascunho manual
            </Button>
          )
        }
      >
        <OperationRecords
          pending={list.query.isPending}
          error={list.query.error}
          retry={() => void list.query.refetch()}
          empty="Nenhum rascunho disponível"
          count={list.rows.length}
        >
          {list.rows.map((item) => (
            <article key={item.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap gap-2 justify-between">
                <h3 className="break-words font-medium">
                  {item.title || `${ASSISTANCE_DRAFT_KINDS[item.kind]} · ${item.draft_key}`} ·
                  versão {item.version_number}
                </h3>
                <Badge variant="outline">{draftStates[item.state]}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {ASSISTANCE_CATEGORIES[item.category]} ·{" "}
                {item.mode === "ai"
                  ? "Gerado por IA; exige conferência"
                  : "Redação manual"}{" "}
                · {assistanceDate(item.created_at)}.
              </p>
              {!item.is_current && (
                <AssistanceNotice error>
                  Fontes ou versões alteradas. O registro histórico exige nova
                  conferência antes de uso.
                </AssistanceNotice>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelected(item.id)}
              >
                Ler rascunho e referências
              </Button>
            </article>
          ))}
        </OperationRecords>
        <AssistancePagination
          offset={list.offset}
          limit={list.limit}
          hasMore={list.hasMore}
          pending={list.query.isFetching}
          onChange={list.setOffset}
        />
      </OperationPanel>
      <OperationPanel
        title="Solicitações de geração"
        description="Consumo confirmado e reservado aparecem separados. Falha, cancelamento ou tempo esgotado não significam custo zero de uma chamada iniciada."
      >
        <OperationRecords
          pending={jobs.query.isPending}
          error={jobs.query.error}
          retry={() => void jobs.query.refetch()}
          empty="Nenhuma geração solicitada"
          count={jobs.rows.length}
        >
          {jobs.rows.map((job) => (
            <article className="space-y-3 rounded-lg border p-4" key={job.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="break-words font-medium">
                  {ASSISTANCE_DRAFT_KINDS[job.kind]} · {job.draft_key}
                </h3>
                <Badge variant="outline">{aiStates[job.state]}</Badge>
              </div>
              <p className="text-sm">
                Tokens medidos: entrada {job.input_tokens ?? "não informada"},
                saída {job.output_tokens ?? "não informada"}. Limite de saída:{" "}
                {job.max_output_tokens}.
              </p>
              <p className="text-sm">
                Custo medido:{" "}
                {job.measured_cost === null
                  ? "não confirmado"
                  : `USD ${job.measured_cost}`}{" "}
                · Consumo/reserva na quota: USD {job.quota_cost}.
              </p>
              <p className="text-xs text-muted-foreground">
                Medição:{" "}
                {job.consumption === "not_sent"
                  ? "não enviado ao provedor"
                  : job.consumption === "reported"
                    ? "consumo informado pelo provedor"
                    : job.consumption === "uncertain"
                      ? "consumo incerto; reserva preservada"
                      : "consumo reservado"}{" "}
                · {assistanceDate(job.created_at)}.
              </p>
              {job.error_code && (
                <AssistanceNotice error>
                  A geração não foi concluída ou não pôde ser confirmada.
                  Examine a política, o orçamento e a disponibilidade antes de
                  uma nova solicitação explícita.
                </AssistanceNotice>
              )}
              {props.context.can_edit &&
                ["queued", "running", "not_configured"].includes(job.state) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCancel(job)}
                  >
                    Cancelar solicitação de geração
                  </Button>
                )}
            </article>
          ))}
        </OperationRecords>
        <AssistancePagination
          offset={jobs.offset}
          limit={jobs.limit}
          hasMore={jobs.hasMore}
          pending={jobs.query.isFetching}
          onChange={jobs.setOffset}
        />
      </OperationPanel>
      {row && (
        <DraftReader
          props={props}
          row={row}
          onClose={() => setSelected(null)}
        />
      )}
      {creating && props.context.can_edit && (
        <AssistanceDraftComposer
          props={props}
          citations={[]}
          onClose={() => setCreating(false)}
        />
      )}
      {cancel &&
        props.context.can_edit &&
        assistanceCategoryAccess(props, cancel.category) &&
        jobs.rows.some(
          (row) =>
            row.id === cancel.id &&
            ["queued", "running", "not_configured"].includes(row.state),
        ) && (
          <OperationReasonDialog
            open
            onClose={() => setCancel(null)}
            title="Cancelar solicitação de geração"
            description="O resultado não será aceito após o cancelamento. O consumo de uma chamada iniciada pode permanecer reservado até medição."
            pending={action.pending}
            actionLabel="Confirmar cancelamento"
            onSave={(note) =>
              action.run(
                () => cancelAssistanceAi(cancel.id, note),
                "Cancelamento registrado",
              )
            }
          />
        )}
    </div>
  );
}
function DraftReader({
  props,
  row,
  onClose,
}: {
  props: AssistanceProps;
  row: AssistanceDraftVersion;
  onClose(): void;
}) {
  const allowed = assistanceCategoryAccess(props, row.category),
    action = useLegalAction();
  const [decision, setDecision] = useState<
      "reviewed" | "returned" | "revoked" | null
    >(null),
    [copy, setCopy] = useState(false),
    [transfer, setTransfer] = useState(false);
  const read = useQuery({
    queryKey: [...assistanceKey(props, "read-draft"), row.id],
    queryFn: ({ signal }) => readAssistanceDraft(row.id, signal),
    enabled: allowed,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 15000,
  });
  if (!allowed) return <AssistanceAccessNotice />;
  const data = read.isError ? undefined : read.data;
  const accessible =
    data &&
    data.citations.every(
      (citation) =>
        citation.case_id === props.legalCase.id &&
        assistanceCategoryAccess(props, citation.category),
    );
  const current =
    row.is_current && data?.is_current === true && row.state !== "revoked";
  return (
    <AssistanceDialog
      title="Conferência do rascunho"
      description="A leitura revalida as referências. O registro de revisão identifica quem conferiu a versão e não comprova automaticamente a conclusão jurídica."
      onClose={onClose}
    >
      {read.isPending ? (
        <LegalLoading />
      ) : read.isError ? (
        <LegalError error={read.error} retry={() => void read.refetch()} />
      ) : !accessible ? (
        <AssistanceAccessNotice />
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-sm">
            <strong>Finalidade:</strong> {data.version.purpose}
          </p>
          <AssistanceDraftPreview
            canRead
            body={data.version.body}
            citations={data.citations.map((citation) =>
              assistanceChoice(citation, current),
            )}
            state={data.version.state}
            isCurrent={current}
          />
          <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
            Revisão:{" "}
            {data.version.reviewed_at
              ? assistanceDate(data.version.reviewed_at)
              : "ainda não registrada"}
            . {data.version.review_note}
          </p>
          <div className="flex flex-wrap gap-2">
            {props.context.can_edit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCopy(true)}
              >
                Preparar nova versão
              </Button>
            )}
            {props.context.can_edit &&
              current &&
              ["draft", "returned"].includes(data.version.state) && (
                <Button
                  type="button"
                  size="sm"
                  disabled={action.pending}
                  onClick={() =>
                    void action.run(
                      () => submitAssistanceDraft(row.id),
                      "Rascunho enviado para revisão",
                    )
                  }
                >
                  Enviar rascunho para revisão
                </Button>
              )}
            {props.context.can_review &&
              current &&
              data.version.state === "in_review" && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setDecision("reviewed")}
                  >
                    Registrar revisão do responsável
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDecision("returned")}
                  >
                    Devolver rascunho para ajuste
                  </Button>
                </>
              )}
            {props.context.can_review &&
              current &&
              data.version.state !== "revoked" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDecision("revoked")}
                >
                  Revogar uso do rascunho
                </Button>
              )}
            {props.context.can_edit &&
              current &&
              data.version.state === "reviewed" &&
              data.version.category !== "restricted" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setTransfer(true)}
                >
                  Preparar instrumento ou publicação
                </Button>
              )}
          </div>
          {data.version.category === "restricted" && (
            <AssistanceNotice>
              Este conteúdo reúne informações médicas e fiscais e permanece na
              área interna. Não pode ser convertido para uma categoria de acesso
              menor.
            </AssistanceNotice>
          )}
          {decision &&
            props.context.can_review &&
            current &&
            (decision === "revoked" || data.version.state === "in_review") && (
              <OperationReasonDialog
                open
                onClose={() => setDecision(null)}
                title={
                  decision === "reviewed"
                    ? "Registrar conferência nominal do rascunho"
                    : decision === "returned"
                      ? "Devolver rascunho para ajuste"
                      : "Revogar uso do rascunho"
                }
                description="Confira se os trechos sustentam cada afirmação, se as lacunas estão explícitas e se as divergências foram tratadas. Essa decisão não envia nem publica o texto."
                pending={action.pending}
                actionLabel={
                  decision === "reviewed"
                    ? "Confirmar versão revisada"
                    : decision === "returned"
                      ? "Confirmar devolução"
                      : "Confirmar revogação"
                }
                onSave={(note) =>
                  action.run(
                    () => reviewAssistanceDraft(row.id, decision, note),
                    "Decisão sobre o rascunho registrada",
                  )
                }
              />
            )}
          {copy && props.context.can_edit && (
            <AssistanceDraftComposer
              props={props}
              citations={data.citations}
              previous={{ ...data, is_current: current }}
              onClose={() => setCopy(false)}
            />
          )}
          {transfer &&
            props.context.can_edit &&
            current &&
            data.version.state === "reviewed" &&
            data.version.category !== "restricted" && (
              <TransferDialog
                props={props}
                data={data}
                onClose={() => setTransfer(false)}
              />
            )}
        </>
      )}
    </AssistanceDialog>
  );
}
function TransferDialog({
  props,
  data,
  onClose,
}: {
  props: AssistanceProps;
  data: AssistanceDraftRead;
  onClose(): void;
}) {
  const [target, setTarget] = useState<"instrument" | "publication">(
      "instrument",
    ),
    [title, setTitle] = useState(data.version.body.title),
    [instrument, setInstrument] = useState<
      "proposal" | "contract" | "power_of_attorney"
    >("proposal"),
    [membership, setMembership] = useState(""),
    [publication, setPublication] = useState<"summary" | "update">("update");
  const action = useLegalAction();
  const care = useQuery({
    queryKey: assistanceKey(props, "transfer-memberships"),
    queryFn: () => getClientCareContext(props.legalCase.id),
    enabled:
      target === "publication" &&
      props.context.can_edit &&
      assistanceCategoryAccess(props, data.version.category),
    retry: false,
    refetchInterval: 15000,
  });
  const memberships = care.isError
    ? []
    : (care.data?.memberships ?? []).filter(
        (member) =>
          member.case_id === props.legalCase.id &&
          member.state === "active" &&
          member.scopes.includes("case_summary:read") &&
          (!member.expires_at ||
            new Date(member.expires_at).getTime() > Date.now()) &&
          (data.version.category !== "medical" || member.allow_medical) &&
          (data.version.category !== "fiscal" || member.allow_fiscal),
      );
  return (
    <AssistanceDialog
      title="Preparar etapa de destino"
      description="Será criado apenas um rascunho no fluxo escolhido, com vínculo à versão revisada. Assinatura, publicação e liberação ao destinatário continuam dependendo das etapas próprias."
      onClose={onClose}
      pending={action.pending}
      disabled={
        !title.trim() ||
        (target === "publication" &&
          !memberships.some((row) => row.id === membership))
      }
      actionLabel="Criar rascunho no destino"
      onSubmit={async () => {
        const input: AssistanceTransferInput =
          target === "instrument"
            ? {
                target_kind: "instrument",
                payload: { instrument_type: instrument, title: title.trim() },
              }
            : {
                target_kind: "publication",
                payload: {
                  membership_id: membership,
                  title: title.trim(),
                  publication_kind: publication,
                },
              };
        if (
          await action.run(
            () => transferAssistanceDraft(data.version.id, input),
            "Rascunho criado na etapa de destino",
          )
        )
          onClose();
      }}
    >
      <AssistanceSelect
        label="Destino"
        value={target}
        onChange={(value) => setTarget(value as "instrument" | "publication")}
      >
        <option value="instrument">Instrumento do caso</option>
        <option value="publication">
          Publicação para destinatário do portal
        </option>
      </AssistanceSelect>
      <LegalField label="Título no destino">
        {(id) => (
          <Input
            id={id}
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        )}
      </LegalField>
      {target === "instrument" ? (
        <AssistanceSelect
          label="Tipo de instrumento"
          value={instrument}
          onChange={(value) => setInstrument(value as typeof instrument)}
        >
          <option value="proposal">Proposta</option>
          <option value="contract">Contrato</option>
          <option value="power_of_attorney">Procuração</option>
        </AssistanceSelect>
      ) : (
        <>
          {care.isPending ? (
            <LegalLoading />
          ) : care.isError ? (
            <LegalError error={care.error} retry={() => void care.refetch()} />
          ) : (
            <AssistanceSelect
              label="Destinatário autorizado"
              value={membership}
              onChange={setMembership}
              required
            >
              <option value="">Selecione o acesso individual</option>
              {memberships.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.public_title}
                </option>
              ))}
            </AssistanceSelect>
          )}
          <AssistanceSelect
            label="Tipo de publicação"
            value={publication}
            onChange={(value) => setPublication(value as typeof publication)}
          >
            <option value="summary">Resumo</option>
            <option value="update">Atualização</option>
          </AssistanceSelect>
        </>
      )}
    </AssistanceDialog>
  );
}
