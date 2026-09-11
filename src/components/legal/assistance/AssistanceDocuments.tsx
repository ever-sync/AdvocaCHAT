import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments } from "@/lib/api/legal";
import {
  cancelAssistanceOcr,
  enqueueAssistanceOcr,
} from "@/lib/api/legal-assistance";
import type {
  AssistanceOcrJob,
  AssistanceTextVersion,
} from "@/types/legal-assistance";
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
  ASSISTANCE_TEXT_STATES,
  assistanceCaseAccess,
  assistanceCategoryAccess,
  assistanceDate,
  assistanceKey,
  assistanceOcrReason,
  type AssistanceProps,
} from "./assistance-ui";
import { useAssistanceList } from "./assistance-hooks";
import {
  AssistanceTextReader,
  AssistanceTranscriptionDialog,
} from "./AssistanceTextReader";
const jobStates: Record<AssistanceOcrJob["state"], string> = {
  queued: "Na fila",
  running: "Em processamento",
  succeeded: "Reconhecimento concluído; revisão pendente",
  partial: "Resultado parcial; revisão pendente",
  failed: "Falha no processamento",
  cancelled: "Cancelado",
  authorization_revoked: "Autorização revogada",
  unknown: "Resultado não confirmado",
};
export default function AssistanceDocuments(props: AssistanceProps) {
  const documents = useQuery({
    queryKey: assistanceKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
    enabled: assistanceCaseAccess(props),
    retry: false,
  });
  const versions = useAssistanceList(props, "text_versions"),
    jobs = useAssistanceList(props, "ocr_jobs");
  const [selected, setSelected] = useState(""),
    [reader, setReader] = useState<AssistanceTextVersion | null>(null),
    [manual, setManual] = useState(false);
  const [enqueue, setEnqueue] = useState<{
      documentId: string;
      previousJobId?: string;
      key: string;
    } | null>(null),
    [cancel, setCancel] = useState<AssistanceOcrJob | null>(null);
  const action = useLegalAction();
  const docs = documents.isError
      ? []
      : (documents.data ?? []).filter(
          (doc) =>
            doc.case_id === props.legalCase.id &&
            assistanceCategoryAccess(props, doc.category),
        ),
    chosen = docs.find((row) => row.id === selected);
  const readerCurrent =
    reader && versions.rows.find((row) => row.id === reader.id);
  if (!assistanceCaseAccess(props)) return <AssistanceAccessNotice />;
  return (
    <div className="space-y-5">
      <OperationPanel
        title="Documentos e reconhecimento"
        description="O original fica preservado. Reconhecimento, transcrição e revisão são etapas separadas; páginas não conferidas não entram na pesquisa."
      >
        <AssistanceNotice>
          {props.context.settings.ocr_enabled
            ? `OCR habilitado: até ${props.context.settings.ocr_max_pages} páginas por documento. Consumo reservado ou confirmado: ${props.context.ocr_usage.charged_pages} de ${props.context.ocr_usage.monthly_limit} páginas no mês.`
            : "OCR não habilitado neste escritório. A transcrição manual continua disponível para documentos autorizados."}
        </AssistanceNotice>
        <OperationRecords
          pending={documents.isPending}
          error={documents.error}
          retry={() => void documents.refetch()}
          empty="Nenhum documento pronto e autorizado"
          count={docs.length}
        >
          <AssistanceSelect
            label="Documento de origem"
            value={selected}
            onChange={setSelected}
            hint="Os arquivos são enviados na aba Documentos do caso. O reconhecimento local aceita PDF e PNG."
          >
            <option value="">Selecione o documento</option>
            {docs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.display_name} · {ASSISTANCE_CATEGORIES[doc.category]}
              </option>
            ))}
          </AssistanceSelect>
          {chosen && props.context.can_edit && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={
                  jobs.query.isPending ||
                  jobs.rows.some((job) => job.document_id === chosen.id) ||
                  !props.context.settings.ocr_enabled ||
                  !["application/pdf", "image/png"].includes(chosen.mime_type)
                }
                onClick={() =>
                  setEnqueue({
                    documentId: chosen.id,
                    key: crypto.randomUUID(),
                  })
                }
              >
                Solicitar reconhecimento
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setManual(true)}
              >
                Transcrever manualmente
              </Button>
            </div>
          )}
        </OperationRecords>
        {chosen && jobs.rows.some((job) => job.document_id === chosen.id) && (
          <p className="text-sm text-muted-foreground">
            Este documento já possui solicitação de reconhecimento. Acompanhe a
            fila abaixo; após a tentativa terminar, use a ação explícita de novo
            processamento, se necessário.
          </p>
        )}
        <h3 className="font-semibold">Versões de texto</h3>
        <OperationRecords
          pending={versions.query.isPending}
          error={versions.query.error}
          retry={() => void versions.query.refetch()}
          empty="Nenhuma versão de texto disponível"
          count={versions.rows.length}
        >
          {versions.rows.map((version) => (
            <article
              className="space-y-3 rounded-lg border p-4"
              key={version.id}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <h4 className="break-words font-medium">
                  {docs.find((doc) => doc.id === version.document_id)
                    ?.display_name ?? "Documento autorizado"}{" "}
                  · versão {version.version_number}
                </h4>
                <Badge variant="outline">
                  {ASSISTANCE_TEXT_STATES[version.state]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {version.mode === "ocr"
                  ? "Reconhecimento local"
                  : version.mode === "manual"
                    ? "Transcrição manual"
                    : "Correção do texto"}{" "}
                · {version.pages_total ?? "Total não determinado"}
                {version.pages_total !== null && " páginas"} ·{" "}
                {version.completeness === "complete"
                  ? "Cobertura completa de páginas"
                  : version.completeness === "partial"
                    ? "Cobertura parcial de páginas"
                    : "Cobertura não determinada"}
              </p>
              <p className="text-xs text-muted-foreground">
                Criada em {assistanceDate(version.created_at)}. Cobertura não
                substitui conferência.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReader(version)}
              >
                Abrir texto para conferência
              </Button>
            </article>
          ))}
        </OperationRecords>
        <AssistancePagination
          offset={versions.offset}
          limit={versions.limit}
          hasMore={versions.hasMore}
          pending={versions.query.isFetching}
          onChange={versions.setOffset}
        />
      </OperationPanel>
      <OperationPanel
        title="Fila e consumo de OCR"
        description="Uma falha com processamento iniciado pode conservar a reserva. Reprocessar exige nova solicitação explícita e não apaga o consumo anterior."
      >
        <OperationRecords
          pending={jobs.query.isPending}
          error={jobs.query.error}
          retry={() => void jobs.query.refetch()}
          empty="Nenhuma solicitação de reconhecimento"
          count={jobs.rows.length}
        >
          {jobs.rows.map((job) => (
            <article key={job.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap gap-2 justify-between">
                <h3 className="font-medium break-words">
                  {docs.find((doc) => doc.id === job.document_id)
                    ?.display_name ?? "Documento autorizado"}
                </h3>
                <Badge variant="outline">{jobStates[job.state]}</Badge>
              </div>
              <p className="text-sm">
                Reserva/consumo: {job.quota_pages} páginas · processadas:{" "}
                {job.processed_pages ?? "não confirmado"} · total do original:{" "}
                {job.pages_total ?? "não determinado"}.
              </p>
              {job.error_code && (
                <AssistanceNotice error>
                  {assistanceOcrReason(job.error_code)}
                </AssistanceNotice>
              )}
              <p className="text-xs text-muted-foreground">
                Solicitado em {assistanceDate(job.created_at)}.
              </p>
              {props.context.can_edit && (
                <div className="flex flex-wrap gap-2">
                  {["queued", "running"].includes(job.state) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCancel(job)}
                    >
                      Cancelar solicitação
                    </Button>
                  ) : (
                    docs.some((doc) => doc.id === job.document_id) &&
                    props.context.settings.ocr_enabled && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEnqueue({
                            documentId: job.document_id,
                            previousJobId: job.id,
                            key: crypto.randomUUID(),
                          })
                        }
                      >
                        Solicitar novo processamento
                      </Button>
                    )
                  )}
                </div>
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
      {enqueue &&
        docs.some((doc) => doc.id === enqueue.documentId) &&
        props.context.can_edit && (
          <AssistanceDialog
            title={
              enqueue.previousJobId
                ? "Solicitar novo processamento"
                : "Solicitar reconhecimento local"
            }
            description="O arquivo será processado pela fila privada. A solicitação reserva páginas e o resultado permanecerá não revisado."
            onClose={() => setEnqueue(null)}
            pending={action.pending}
            actionLabel="Confirmar solicitação de OCR"
            onSubmit={async () => {
              if (
                await action.run(
                  () =>
                    enqueueAssistanceOcr(
                      enqueue.documentId,
                      enqueue.key,
                      enqueue.previousJobId,
                    ),
                  "Solicitação de reconhecimento registrada",
                )
              )
                setEnqueue(null);
            }}
          >
            <p className="text-sm">
              {docs.find((doc) => doc.id === enqueue.documentId)?.display_name}{" "}
              · até {props.context.settings.ocr_max_pages} páginas.{" "}
              {enqueue.previousJobId
                ? "Nova tentativa vinculada ao processamento anterior."
                : "Se já existe processamento deste arquivo, atualize a fila para acompanhar ou solicitar explicitamente nova tentativa."}
            </p>
          </AssistanceDialog>
        )}
      {cancel &&
        props.context.can_edit &&
        assistanceCategoryAccess(props, cancel.category) &&
        jobs.rows.some(
          (job) =>
            job.id === cancel.id && ["queued", "running"].includes(job.state),
        ) && (
          <OperationReasonDialog
            open
            onClose={() => setCancel(null)}
            title="Cancelar solicitação de OCR"
            description="O cancelamento impede aceitar o resultado. Consumo incerto permanece reservado até a reconciliação."
            pending={action.pending}
            actionLabel="Confirmar cancelamento"
            onSave={(note) =>
              action.run(
                () => cancelAssistanceOcr(cancel.id, note),
                "Solicitação cancelada",
              )
            }
          />
        )}
      {manual && chosen && props.context.can_edit && (
        <AssistanceTranscriptionDialog
          props={props}
          document={chosen}
          onClose={() => setManual(false)}
        />
      )}
      {readerCurrent && (
        <AssistanceTextReader
          props={props}
          version={readerCurrent}
          document={docs.find((doc) => doc.id === readerCurrent.document_id)}
          onClose={() => setReader(null)}
        />
      )}
    </div>
  );
}
