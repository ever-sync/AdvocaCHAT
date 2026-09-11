import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments } from "@/lib/api/legal";
import {
  readAssistanceKnowledge,
  reviewAssistanceKnowledge,
} from "@/lib/api/legal-assistance";
import type {
  AssistanceCatalogState,
  AssistanceKnowledgeRead,
} from "@/types/legal-assistance";
import { useLegalAction } from "../legal-ui";
import { OperationPanel, OperationRecords } from "../operations/OperationPanel";
import {
  AssistanceAccessNotice,
  AssistanceDialog,
  AssistanceNotice,
  AssistancePagination,
} from "./AssistanceShared";
import {
  AssistanceCatalogCheck,
  AssistanceCatalogText,
  AssistanceSourceLink,
} from "./AssistanceKnowledgeFields";
import { AssistanceKnowledgeForm } from "./AssistanceKnowledgeForm";
import { assistancePolicyUrl } from "./AssistanceSettingsValidation";
import { useAssistanceList } from "./assistance-hooks";
import {
  assistanceCaseAccess,
  assistanceDate,
  assistanceKey,
  type AssistanceProps,
} from "./assistance-ui";

const states: Record<AssistanceCatalogState, string> = {
  draft: "Rascunho",
  approved: "Referência conferida",
  rejected: "Rascunho rejeitado",
  revoked: "Revogada",
};
const kinds = {
  template: "Modelo",
  jurisprudence: "Jurisprudência",
  note: "Nota técnica",
};
export function AssistanceKnowledge(props: AssistanceProps) {
  const access =
    assistanceCaseAccess(props) &&
    props.context.tenant_id === props.workspace.tenant_id &&
    props.context.user_id === props.workspace.user_id;
  const canCreate = access && props.workspace.can_create;
  const list = useAssistanceList(props, "knowledge", access);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | "copy" | null>(null);
  const row = list.rows.find((item) => item.id === selected);
  const details = useQuery({
    queryKey: [...assistanceKey(props, "knowledge-read"), selected, row?.state],
    queryFn: ({ signal }) => readAssistanceKnowledge(selected!, signal),
    enabled: access && Boolean(row) && row?.state !== "revoked",
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchInterval: 15000,
  });
  const full =
    access &&
    row &&
    details.isFetchedAfterMount &&
    !details.isError &&
    details.data?.version.id === row.id &&
    details.data.version.tenant_id === props.workspace.tenant_id
      ? details.data
      : null;
  const docs = useQuery({
    queryKey: assistanceKey(props, "knowledge-documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
    enabled: canCreate,
    retry: false,
  });
  const documents =
    !docs.isError && access
      ? (docs.data ?? []).filter(
          (doc) =>
            doc.case_id === props.legalCase.id &&
            doc.category === "general" &&
            doc.status === "ready",
        )
      : [];
  const dialogKey = `${props.workspace.user_id}:${props.workspace.tenant_id}:${props.legalCase.id}:${canCreate}:${props.context.can_manage}`;
  if (!access) return <AssistanceAccessNotice />;
  return (
    <OperationPanel
      title="Biblioteca do escritório"
      description="Modelos, notas e jurisprudência versionados, com origem e conferência nominal."
      actions={
        canCreate && (
          <Button onClick={() => setEditing("new")}>Nova referência</Button>
        )
      }
    >
      <AssistanceNotice>
        A aprovação registra a conferência desta versão. A pertinência ao caso e
        o sentido de cada citação continuam sujeitos à revisão do advogado.
      </AssistanceNotice>
      <OperationRecords
        pending={list.query.isPending}
        error={list.query.error}
        retry={() => void list.query.refetch()}
        count={list.rows.length}
        empty="Nenhuma referência cadastrada."
      >
        {list.rows.map((item) => (
          <article key={item.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words font-medium">{item.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {kinds[item.kind]} · Versão {item.version_number} · Consulta{" "}
                  {assistanceDate(item.checked_on)}
                </p>
              </div>
              <Badge variant="outline">{states[item.state]}</Badge>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">
              {item.scope}
            </p>
            {item.state !== "revoked" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setSelected(item.id);
                }}
              >
                Examinar referência
              </Button>
            )}
          </article>
        ))}
      </OperationRecords>
      <AssistancePagination
        {...list}
        pending={list.query.isFetching}
        onChange={list.setOffset}
      />
      {selected && !editing && row && row.state !== "revoked" && (
        <AssistanceDialog
          title="Conferência da referência"
          description="Leitura auditada da versão e da origem atualmente autorizadas."
          onClose={() => setSelected(null)}
        >
          {details.isError ? (
            <AssistanceAccessNotice />
          ) : !full ? (
            <AssistanceNotice>Conferindo acesso e versão…</AssistanceNotice>
          ) : (
            <KnowledgeDetails
              key={`${dialogKey}:${row.id}:${row.state}`}
              data={full}
              canCreate={canCreate}
              canReview={props.context.can_manage}
              onCopy={() => setEditing("copy")}
              onClose={() => setSelected(null)}
            />
          )}
        </AssistanceDialog>
      )}
      {canCreate && editing === "new" && (
        <AssistanceKnowledgeForm
          key={`${dialogKey}:new`}
          documents={documents}
          onClose={() => setEditing(null)}
        />
      )}
      {canCreate && editing === "copy" && full && (
        <AssistanceKnowledgeForm
          key={`${dialogKey}:${full.version.id}:copy`}
          original={full.version}
          documents={documents}
          onClose={() => setEditing(null)}
        />
      )}
    </OperationPanel>
  );
}

function KnowledgeDetails({
  data,
  canCreate,
  canReview,
  onCopy,
  onClose,
}: {
  data: AssistanceKnowledgeRead;
  canCreate: boolean;
  canReview: boolean;
  onCopy(): void;
  onClose(): void;
}) {
  const action = useLegalAction();
  const [decision, setDecision] = useState<
    "approved" | "rejected" | "revoked" | null
  >(null);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  function chooseDecision(next: "approved" | "rejected" | "revoked") {
    setDecision(next);
    setConfirmed(false);
    setNote("");
  }
  const row = data.version;
  const sourceReady = Boolean(
    row.checked_on &&
    (row.source_document_id || assistancePolicyUrl(row.source_url)),
  );
  const ready =
    canReview &&
    decision &&
    note.trim().length >= 3 &&
    confirmed &&
    (decision !== "approved" || sourceReady);
  async function review() {
    if (!ready || !decision) return;
    if (
      await action.run(
        () => reviewAssistanceKnowledge(row.id, decision, note.trim()),
        "Revisão da referência registrada",
      )
    )
      onClose();
  }
  return (
    <div className="space-y-4">
      <h3 className="break-words font-medium">
        {row.title} · versão {row.version_number}
      </h3>
      <p className="whitespace-pre-wrap text-sm">{row.scope}</p>
      <p className="text-sm">
        Consulta: {assistanceDate(row.checked_on)}.{" "}
        {row.source_document_id
          ? "Prova documental vinculada e acesso conferido."
          : "Origem externa registrada."}
      </p>
      <AssistanceSourceLink url={row.source_url} />
      <p className="whitespace-pre-wrap text-sm">{row.version_note}</p>
      {row.state === "approved" && !data.is_current && (
        <AssistanceNotice error>
          Esta referência não está disponível para novos usos como versão atual.
          Examine sua origem e as versões seguintes.
        </AssistanceNotice>
      )}
      <pre className="max-h-[26rem] overflow-y-auto whitespace-pre-wrap break-words rounded border p-3 font-sans text-sm">
        {row.text}
      </pre>
      {row.reviewed_at && (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
          Conferência registrada em {assistanceDate(row.reviewed_at)}.{" "}
          {row.review_note}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canCreate && (
          <Button type="button" variant="outline" onClick={onCopy}>
            Criar nova versão
          </Button>
        )}
        {canReview && row.state === "draft" && (
          <>
            <Button type="button" onClick={() => chooseDecision("approved")}>
              Revisar e aprovar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => chooseDecision("rejected")}
            >
              Rejeitar rascunho
            </Button>
          </>
        )}
        {canReview && row.state === "approved" && (
          <Button
            type="button"
            variant="outline"
            onClick={() => chooseDecision("revoked")}
          >
            Revogar referência
          </Button>
        )}
      </div>
      {canReview && decision && (
        <div className="space-y-3 rounded border p-3">
          {decision === "approved" && !sourceReady && (
            <AssistanceNotice error>
              Faltam origem ou data de consulta; crie uma versão completa antes
              de aprovar.
            </AssistanceNotice>
          )}
          <AssistanceCatalogText
            label="Justificativa da revisão"
            value={note}
            onChange={setNote}
            multiline
            required
          />
          <AssistanceCatalogCheck
            label="Examinei o texto, a origem, o escopo e as limitações desta versão"
            checked={confirmed}
            onChange={setConfirmed}
          />
          <Button
            type="button"
            disabled={!ready || action.pending}
            onClick={() => void review()}
          >
            {decision === "approved"
              ? "Confirmar aprovação"
              : decision === "rejected"
                ? "Confirmar rejeição"
                : "Confirmar revogação"}
          </Button>
        </div>
      )}
    </div>
  );
}
export default AssistanceKnowledge;
