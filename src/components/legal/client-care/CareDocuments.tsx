import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { downloadLegalDocument, listLegalDocuments } from "@/lib/api/legal";
import {
  cancelLegalDocumentRequest,
  reviewLegalDocumentRequest,
} from "@/lib/api/legal-operations";
import { LegalEmpty, LegalError, LegalField } from "../LegalShared";
import {
  DOCUMENT_CATEGORIES,
  legalDate,
  selectClassName,
  useLegalAction,
} from "../legal-ui";
import {
  OperationPanel,
  OperationReasonDialog,
} from "../operations/OperationPanel";
import { CareCategoryField, CareDialog, CareMemberField } from "./CareShared";
import {
  CARE_STATES,
  careCategoryAllowed,
  careKey,
  careTimestamp,
  careMemberAllows,
  careMemberLabel,
  careOwner,
  type CareProps,
} from "./client-care-ui";
import {
  createPortalExport,
  createPortalRequest,
  releasePortalDocument,
  reviewPortalDocumentRelease,
  reviewPortalExport,
} from "./api";
import type { PortalCategory } from "./types";
const REQUEST_STATES: Record<string, string> = {
  open: "Aguardando envio",
  uploading: "Envio em andamento",
  submitted: "Aguardando revisão",
  approved: "Documento conferido",
  rejected: "Não aprovado",
  cancelled: "Cancelado",
};
type Decision = {
  kind: "release" | "export" | "request";
  id: string;
  category: PortalCategory;
  decision: "approved" | "revoked" | "rejected" | "cancelled";
  title: string;
};
export function CareDocuments(props: CareProps) {
  const [form, setForm] = useState<"release" | "request" | "export" | null>(
    null,
  );
  const [review, setReview] = useState<Decision | null>(null);
  const action = useLegalAction();
  const query = useQuery({
    queryKey: careKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
  });
  const documents = (query.data ?? []).filter((d) =>
    careCategoryAllowed(props, d.category),
  );
  const releases = props.context.releases.filter((r) =>
    careCategoryAllowed(props, r.category),
  );
  const requests = props.context.requests.filter((r) =>
    careCategoryAllowed(props, r.category),
  );
  const fiscal = careCategoryAllowed(props, "fiscal");
  const member = (id: string) =>
    careMemberLabel(props.context.memberships.find((m) => m.id === id));
  const doc = (id: string) => documents.find((d) => d.id === id);
  const decision = (reason: string) => {
    if (!review) return Promise.resolve(false);
    return action.run(
      () =>
        review.kind === "release"
          ? reviewPortalDocumentRelease(
              review.id,
              review.decision as "approved" | "revoked",
              reason,
            )
          : review.kind === "export"
            ? reviewPortalExport(
                review.id,
                review.decision as "approved" | "revoked",
                reason,
              )
            : review.decision === "cancelled"
              ? cancelLegalDocumentRequest(review.id, reason)
              : reviewLegalDocumentRequest(
                  review.id,
                  review.decision as "approved" | "rejected",
                  reason,
                ),
      "Revisão registrada",
    );
  };
  return (
    <div className="space-y-4">
      <OperationPanel
        title="Coleta individual de documentos"
        description="O destinatário envia o arquivo autenticado no portal. Recebimento e conferência são etapas distintas. Para substituir um envio rejeitado, prepare uma nova solicitação."
        actions={
          careOwner(props) && (
            <Button size="sm" onClick={() => setForm("request")}>
              Solicitar pelo portal
            </Button>
          )
        }
      >
        {requests.length ? (
          requests.map((row) => (
            <article key={row.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-medium">{row.title}</h3>
                <Badge variant="secondary">
                  {REQUEST_STATES[row.status] ?? "Consulta pendente"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {DOCUMENT_CATEGORIES[row.category]} ·{" "}
                {member(row.membership_id)}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {row.instructions}
              </p>
              <p className="text-xs text-muted-foreground">
                Validade do envio: {legalDate(row.expires_at)}
                {row.due_at && ` · Prazo solicitado: ${legalDate(row.due_at)}`}
              </p>
              <div className="flex flex-wrap gap-2">
                {row.document_id && doc(row.document_id) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.pending}
                    onClick={() =>
                      void action.run(
                        () => downloadLegalDocument(doc(row.document_id!)!),
                        "Download iniciado",
                      )
                    }
                  >
                    Baixar documento recebido
                  </Button>
                )}
                {careOwner(props) && row.status === "submitted" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        setReview({
                          kind: "request",
                          id: row.request_id,
                          category: row.category,
                          decision: "approved",
                          title: row.title,
                        })
                      }
                    >
                      Conferir e aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setReview({
                          kind: "request",
                          id: row.request_id,
                          category: row.category,
                          decision: "rejected",
                          title: row.title,
                        })
                      }
                    >
                      Registrar pendência
                    </Button>
                  </>
                )}
                {props.canEdit &&
                  !["approved", "cancelled"].includes(row.status) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setReview({
                          kind: "request",
                          id: row.request_id,
                          category: row.category,
                          decision: "cancelled",
                          title: row.title,
                        })
                      }
                    >
                      Cancelar solicitação
                    </Button>
                  )}
              </div>
            </article>
          ))
        ) : (
          <LegalEmpty title="Nenhuma coleta pelo portal" />
        )}
      </OperationPanel>
      <OperationPanel
        title="Documentos liberados para consulta"
        description="Cada arquivo precisa de destinatário, finalidade, validade e aprovação. O acesso ao caso não libera automaticamente seus documentos."
        actions={
          props.canEdit && (
            <Button size="sm" onClick={() => setForm("release")}>
              Preparar liberação
            </Button>
          )
        }
      >
        {query.error && (
          <LegalError error={query.error} retry={() => void query.refetch()} />
        )}
        {releases.length ? (
          releases.map((row) => (
            <article key={row.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="break-words font-medium">
                  {doc(row.document_id)?.display_name ??
                    "Documento da categoria autorizada"}
                </h3>
                <Badge variant="secondary">{CARE_STATES[row.state]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {DOCUMENT_CATEGORIES[row.category]} ·{" "}
                {member(row.membership_id)}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                Finalidade: {row.purpose}
              </p>
              <p className="text-xs text-muted-foreground">
                Válido até {legalDate(row.expires_at)}
              </p>
              {row.review_note && (
                <p className="text-sm">Revisão: {row.review_note}</p>
              )}
              {careOwner(props) && (
                <div className="flex flex-wrap gap-2">
                  {row.state === "draft" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        setReview({
                          kind: "release",
                          id: row.id,
                          category: row.category,
                          decision: "approved",
                          title:
                            doc(row.document_id)?.display_name ?? "Documento",
                        })
                      }
                    >
                      Revisar e liberar arquivo
                    </Button>
                  )}
                  {row.state !== "revoked" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setReview({
                          kind: "release",
                          id: row.id,
                          category: row.category,
                          decision: "revoked",
                          title:
                            doc(row.document_id)?.display_name ?? "Documento",
                        })
                      }
                    >
                      Revogar liberação
                    </Button>
                  )}
                </div>
              )}
            </article>
          ))
        ) : (
          <LegalEmpty title="Nenhum arquivo liberado" />
        )}
      </OperationPanel>
      {fiscal && (
        <OperationPanel
          title="Pacotes fiscais para cliente ou contador"
          description="Selecione somente arquivos fiscais já liberados para a mesma pessoa. A aprovação fixa a relação dos arquivos, que continuam sujeitos à validade e à revogação individual."
          actions={
            props.canEdit && (
              <Button size="sm" onClick={() => setForm("export")}>
                Preparar pacote fiscal
              </Button>
            )
          }
        >
          {props.context.exports.length ? (
            props.context.exports.map((row) => (
              <article key={row.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-medium">{row.title}</h3>
                  <Badge variant="secondary">{CARE_STATES[row.state]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {member(row.membership_id)}
                </p>
                <ul className="list-inside list-disc text-sm">
                  {row.release_ids.map((id) => {
                    const release = releases.find((r) => r.id === id);
                    return (
                      <li key={id}>
                        {release
                          ? (doc(release.document_id)?.display_name ??
                            "Documento fiscal")
                          : "Liberação indisponível"}
                      </li>
                    );
                  })}
                </ul>
                {row.review_note && (
                  <p className="whitespace-pre-wrap text-sm">
                    Revisão: {row.review_note}
                  </p>
                )}
                {careOwner(props) && (
                  <div className="flex flex-wrap gap-2">
                    {row.state === "draft" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          setReview({
                            kind: "export",
                            id: row.id,
                            category: "fiscal",
                            decision: "approved",
                            title: row.title,
                          })
                        }
                      >
                        Revisar e liberar pacote
                      </Button>
                    )}
                    {row.state !== "revoked" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setReview({
                            kind: "export",
                            id: row.id,
                            category: "fiscal",
                            decision: "revoked",
                            title: row.title,
                          })
                        }
                      >
                        Revogar pacote
                      </Button>
                    )}
                  </div>
                )}
              </article>
            ))
          ) : (
            <LegalEmpty title="Nenhum pacote fiscal preparado" />
          )}
        </OperationPanel>
      )}
      {form &&
        props.canEdit &&
        (form !== "export" || fiscal) &&
        (form !== "request" || careOwner(props)) && (
          <DocumentDialog
            props={props}
            kind={form}
            documents={documents}
            close={() => setForm(null)}
          />
        )}
      {review &&
        careCategoryAllowed(props, review.category) &&
        (review.decision === "cancelled"
          ? props.canEdit
          : careOwner(props)) && (
          <OperationReasonDialog
            open
            onClose={() => setReview(null)}
            title={
              review.decision === "approved"
                ? `Revisar: ${review.title}`
                : `Registrar decisão: ${review.title}`
            }
            description={
              review.kind === "request"
                ? "Registre a conclusão da conferência. O arquivo recebido e seu histórico serão preservados."
                : "Confira o destinatário, os documentos e a finalidade apresentados no registro. Aprovar permite a consulta no portal dentro da validade."
            }
            pending={action.pending}
            actionLabel={
              review.decision === "approved"
                ? "Aprovar após conferência"
                : "Registrar decisão"
            }
            onSave={decision}
          />
        )}
    </div>
  );
}
function DocumentDialog({
  props,
  kind,
  documents,
  close,
}: {
  props: CareProps;
  kind: "release" | "request" | "export";
  documents: Awaited<ReturnType<typeof listLegalDocuments>>;
  close(): void;
}) {
  const [membershipId, setMembershipId] = useState("");
  const [category, setCategory] = useState<PortalCategory>(
    kind === "export" ? "fiscal" : "general",
  );
  const [documentId, setDocumentId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expires, setExpires] = useState("");
  const [due, setDue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const action = useLegalAction();
  const scope =
    kind === "release"
      ? "documents:read"
      : kind === "request"
        ? "requests:upload"
        : "fiscal_exports:read";
  const members = props.context.memberships.filter(
    (m) => m.state === "active" && m.scopes.includes(scope),
  );
  const member = members.find((m) => m.id === membershipId);
  const categories = (
    Object.keys(DOCUMENT_CATEGORIES) as PortalCategory[]
  ).filter((c) => careCategoryAllowed(props, c) && careMemberAllows(member, c));
  const available = documents.filter(
    (d) => d.category === category && careCategoryAllowed(props, d.category),
  );
  const releases = props.context.releases.filter(
    (r) =>
      r.membership_id === membershipId &&
      r.category === "fiscal" &&
      r.state === "approved" &&
      Date.parse(r.expires_at) > Date.now(),
  );
  return (
    <CareDialog
      title={
        kind === "release"
          ? "Preparar liberação de documento"
          : kind === "request"
            ? "Solicitar documento pelo portal"
            : "Preparar pacote fiscal"
      }
      description={
        kind === "request"
          ? "A solicitação será visível apenas no portal da pessoa selecionada. Nenhum aviso externo será enviado automaticamente."
          : "O registro será um rascunho até a aprovação individual do responsável."
      }
      close={close}
      pending={action.pending}
      disabled={
        !member ||
        !categories.includes(category) ||
        (kind === "export" && !selected.length)
      }
      label={
        kind === "request" ? "Criar solicitação no portal" : "Salvar rascunho"
      }
      submit={async () => {
        if (
          await action.run(
            () =>
              kind === "release"
                ? releasePortalDocument(
                    documentId,
                    membershipId,
                    body,
                    careTimestamp(expires),
                  )
                : kind === "request"
                  ? createPortalRequest(membershipId, {
                      category,
                      title,
                      instructions: body,
                      due_at: due ? careTimestamp(due) : null,
                      expires_at: careTimestamp(expires),
                    })
                  : createPortalExport(membershipId, title, selected),
            kind === "request"
              ? "Solicitação registrada no portal"
              : "Rascunho preparado para revisão",
          )
        )
          close();
      }}
    >
      <CareMemberField
        members={members}
        value={membershipId}
        change={(id) => {
          setMembershipId(id);
          setDocumentId("");
          setSelected([]);
        }}
      />
      {kind !== "export" && (
        <CareCategoryField
          value={category}
          categories={categories}
          change={(c) => {
            setCategory(c);
            setDocumentId("");
          }}
        />
      )}
      {kind !== "release" && (
        <LegalField
          label={
            kind === "request"
              ? "Documento solicitado"
              : "Título do pacote fiscal"
          }
        >
          {(id) => (
            <Input
              id={id}
              required
              maxLength={kind === "request" ? 150 : 200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </LegalField>
      )}
      {kind === "release" && (
        <LegalField label="Arquivo que será liberado">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              required
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
            >
              <option value="">Selecione um documento</option>
              {available.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.display_name}
                </option>
              ))}
            </select>
          )}
        </LegalField>
      )}
      {kind !== "export" && (
        <>
          <LegalField
            label={
              kind === "release"
                ? "Finalidade visível ao destinatário"
                : "Orientações que o destinatário verá"
            }
          >
            {(id) => (
              <Textarea
                id={id}
                required
                maxLength={kind === "release" ? 2000 : 1000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            )}
          </LegalField>
          <LegalField
            label="Disponível até"
            hint={
              member
                ? `A validade deve terminar até ${legalDate(member.expires_at)}.`
                : "Escolha primeiro um destinatário."
            }
          >
            {(id) => (
              <Input
                id={id}
                type="datetime-local"
                required
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            )}
          </LegalField>
        </>
      )}
      {kind === "request" && (
        <LegalField label="Prazo desejado para recebimento (opcional)">
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          )}
        </LegalField>
      )}
      {kind === "export" && (
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">
            Arquivos fiscais aprovados para esta pessoa
          </legend>
          {releases.length ? (
            releases.map((r) => (
              <label key={r.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, r.id]
                        : selected.filter((id) => id !== r.id),
                    )
                  }
                />
                <span>
                  {documents.find((d) => d.id === r.document_id)
                    ?.display_name ?? "Documento fiscal"}{" "}
                  · {legalDate(r.expires_at)}
                </span>
              </label>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Libere e aprove os arquivos para o destinatário antes de preparar
              o pacote.
            </p>
          )}
        </fieldset>
      )}
    </CareDialog>
  );
}
export default CareDocuments;
