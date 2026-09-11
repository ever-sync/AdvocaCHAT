import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import {
  activateLegalRepresentation,
  createLegalRepresentation,
  listLegalRepresentations,
  listLegalRepresentedDocumentRequests,
  revokeLegalRepresentation,
  setLegalRequestRepresentation,
} from "@/lib/api/legal-ir";
import {
  downloadLegalDocument,
  listLegalDocuments,
  listLegalParties,
} from "@/lib/api/legal";
import {
  listLegalInstruments,
  listLegalInstrumentVersions,
} from "@/lib/api/legal-operations";
import type {
  LegalRepresentation,
  LegalRepresentationPayload,
} from "@/types/legal-ir";
import type { LegalCaseDocument, LegalCaseParty } from "@/types/legal";
import { LegalError, LegalField } from "../LegalShared";
import {
  DOCUMENT_CATEGORIES,
  legalDate,
  localDateTime,
  selectClassName,
  useLegalAction,
} from "../legal-ui";
import {
  OperationPanel,
  OperationReasonDialog,
  OperationRecords,
} from "../operations/OperationPanel";
import { IrDialog } from "./IrShared";
import {
  REPRESENTATION_BASIS,
  REPRESENTATION_STATUS,
  irCategoryAllowed,
  irKey,
  isIrOwner,
  personName,
  type IrPanelProps,
} from "./ir-ui";

function RepresentationDialog({
  props,
  parties,
  documents,
  onClose,
}: {
  props: IrPanelProps;
  parties: LegalCaseParty[];
  documents: LegalCaseDocument[];
  onClose: () => void;
}) {
  const [party, setParty] = useState("");
  const [basis, setBasis] =
    useState<LegalRepresentationPayload["basis"]>("power_of_attorney");
  const [documentId, setDocumentId] = useState("");
  const [instrumentId, setInstrumentId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [from, setFrom] = useState(localDateTime(new Date().toISOString()));
  const [until, setUntil] = useState("");
  const instruments = useQuery({
    queryKey: irKey(props, "representation-instruments"),
    queryFn: () => listLegalInstruments(props.legalCase.id),
  });
  const versions = useQuery({
    queryKey: irKey(props, `representation-versions-${instrumentId}`),
    queryFn: () => listLegalInstrumentVersions(instrumentId),
    enabled: Boolean(instrumentId),
  });
  const category = documents.find(
    (document) => document.id === documentId,
  )?.category;
  const action = useLegalAction();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      await action.run(
        () =>
          createLegalRepresentation(props.legalCase.id, {
            representative_party_id: party,
            basis,
            scopes: ["document_upload"],
            evidence_document_id: documentId,
            instrument_version_id:
              basis === "power_of_attorney" ? versionId || null : null,
            valid_from: new Date(from).toISOString(),
            valid_until: until ? new Date(until).toISOString() : null,
          }),
        "Representação registrada para revisão",
      )
    )
      onClose();
  }
  return (
    <IrDialog
      title="Registrar representação"
      description="O vínculo será revisado pelo responsável. Seu alcance nesta etapa é o envio de documentos pela coleta autorizada."
      onClose={onClose}
      pending={action.pending}
    >
      <form className="space-y-4" onSubmit={(event) => void save(event)}>
        <LegalField label="Representante cadastrado nas partes">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              required
              value={party}
              onChange={(event) => setParty(event.target.value)}
            >
              <option value="">Selecione a pessoa</option>
              {parties.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        <LegalField label="Fundamento da representação">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={basis}
              onChange={(event) => {
                setBasis(
                  event.target.value as LegalRepresentationPayload["basis"],
                );
                setInstrumentId("");
                setVersionId("");
              }}
            >
              {Object.entries(REPRESENTATION_BASIS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        <LegalField label="Documento que comprova os poderes">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              required
              value={documentId}
              onChange={(event) => {
                setDocumentId(event.target.value);
                setInstrumentId("");
                setVersionId("");
              }}
            >
              <option value="">Selecione o arquivo original</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.display_name} ·{" "}
                  {DOCUMENT_CATEGORIES[document.category]}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        {basis === "power_of_attorney" ? (
          <>
            <LegalField label="Procuração preparada no sistema (opcional)">
              {(id) => (
                <select
                  id={id}
                  className={selectClassName}
                  value={instrumentId}
                  onChange={(event) => {
                    setInstrumentId(event.target.value);
                    setVersionId("");
                  }}
                >
                  <option value="">
                    Instrumento externo, comprovado pelo documento
                  </option>
                  {instruments.data
                    ?.filter(
                      (instrument) =>
                        instrument.instrument_type === "power_of_attorney" &&
                        instrument.category === category,
                    )
                    .map((instrument) => (
                      <option key={instrument.id} value={instrument.id}>
                        {instrument.title}
                      </option>
                    ))}
                </select>
              )}
            </LegalField>
            {instrumentId ? (
              versions.error ? (
                <LegalError
                  error={versions.error}
                  retry={() => void versions.refetch()}
                />
              ) : (
                <LegalField label="Versão atual aprovada da procuração">
                  {(id) => (
                    <select
                      id={id}
                      className={selectClassName}
                      required
                      value={versionId}
                      onChange={(event) => setVersionId(event.target.value)}
                    >
                      <option value="">Selecione a versão</option>
                      {versions.data
                        ?.filter(
                          (version) =>
                            version.status === "approved" &&
                            !version.superseded_at &&
                            version.category === category,
                        )
                        .map((version) => (
                          <option key={version.id} value={version.id}>
                            Versão {version.version_number}
                          </option>
                        ))}
                    </select>
                  )}
                </LegalField>
              )
            ) : null}
          </>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <LegalField label="Início dos poderes">
            {(id) => (
              <Input
                id={id}
                type="datetime-local"
                required
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            )}
          </LegalField>
          <LegalField
            label="Fim dos poderes"
            hint="Deixe vazio apenas se não houver término indicado."
          >
            {(id) => (
              <Input
                id={id}
                type="datetime-local"
                min={from || undefined}
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            )}
          </LegalField>
        </div>
        <p className="rounded-lg border bg-muted/20 p-3 text-sm">
          Escopo registrado: envio de documentos. Este cadastro não cria uma
          conta, não concede acesso interno e não comprova sozinho a identidade
          de quem abrir um link.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              action.pending ||
              !party ||
              !documentId ||
              !from ||
              (Boolean(instrumentId) && !versionId) ||
              (Boolean(until) && new Date(until) <= new Date(from))
            }
          >
            Salvar representação
          </Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}

export function IrRepresentations(props: IrPanelProps) {
  const representations = useQuery({
    queryKey: irKey(props, "representations"),
    queryFn: () => listLegalRepresentations(props.legalCase.id),
  });
  const parties = useQuery({
    queryKey: irKey(props, "representation-parties"),
    queryFn: () => listLegalParties(props.legalCase.id),
  });
  const documents = useQuery({
    queryKey: irKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
  });
  const requests = useQuery({
    queryKey: irKey(props, "represented-requests"),
    queryFn: () => listLegalRepresentedDocumentRequests(props.legalCase.id),
  });
  const [creating, setCreating] = useState(false);
  const [review, setReview] = useState<{
    representation: LegalRepresentation;
    revoke: boolean;
  } | null>(null);
  const [linking, setLinking] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [representationId, setRepresentationId] = useState("");
  const action = useLegalAction();
  const stateFor = (representation: LegalRepresentation) =>
    props.ir.representation_states.find(
      (state) => state.id === representation.id,
    )?.effective_status ?? representation.status;
  const visible = (representations.data ?? []).filter((representation) =>
    irCategoryAllowed(props, representation.category),
  );
  const visibleDocuments = (documents.data ?? []).filter((document) =>
    irCategoryAllowed(props, document.category),
  );
  const relatedRequests = (requests.data ?? []).filter((request) =>
    irCategoryAllowed(props, request.category),
  );
  const inputError = parties.error ?? documents.error;
  return (
    <OperationPanel
      title="Representantes e poderes"
      description="Registre o documento de origem, a validade e a aprovação. Revogação ou perda de validade bloqueia novas utilizações das coletas associadas."
      actions={
        props.canEdit ? (
          <div className="flex flex-wrap gap-2">
            {isIrOwner(props) ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setLinking(true);
                  setRequestId("");
                  setRepresentationId("");
                }}
              >
                Associar coleta ao representante
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={
                !parties.data?.length ||
                !visibleDocuments.length ||
                Boolean(inputError)
              }
              onClick={() => setCreating(true)}
            >
              Nova representação
            </Button>
          </div>
        ) : null
      }
    >
      {inputError ? (
        <LegalError
          error={inputError}
          retry={() => {
            void parties.refetch();
            void documents.refetch();
          }}
        />
      ) : null}
      {!parties.isPending && !parties.error && !parties.data?.length ? (
        <p className="text-sm text-muted-foreground">
          Cadastre a pessoa na aba Partes antes de registrar a representação.
        </p>
      ) : null}
      {!documents.isPending && !documents.error && !visibleDocuments.length ? (
        <p className="text-sm text-muted-foreground">
          Guarde o documento de representação na aba Documentos para permitir a
          conferência.
        </p>
      ) : null}
      <OperationRecords
        pending={representations.isPending}
        error={representations.error}
        retry={() => void representations.refetch()}
        empty="Nenhuma representação registrada"
        count={visible.length}
      >
        {visible.map((representation) => {
          const document = visibleDocuments.find(
            (item) => item.id === representation.evidence_document_id,
          );
          return (
            <div
              key={representation.id}
              className="space-y-3 rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="break-words font-medium">
                  {parties.data?.find(
                    (party) =>
                      party.id === representation.representative_party_id,
                  )?.name ?? "Representante do caso"}
                </p>
                <Badge variant="outline">
                  {REPRESENTATION_STATUS[stateFor(representation)]}
                </Badge>
              </div>
              <p className="text-sm">
                {REPRESENTATION_BASIS[representation.basis]} · Envio de
                documentos
              </p>
              <p className="text-xs text-muted-foreground">
                De {legalDate(representation.valid_from, true)} até{" "}
                {representation.valid_until
                  ? legalDate(representation.valid_until, true)
                  : "término não indicado"}
              </p>
              {representation.approval_note ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  Aprovação: {representation.approval_note} ·{" "}
                  {personName(props, representation.approved_by)}
                </p>
              ) : null}
              {representation.revocation_reason ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  Revogação: {representation.revocation_reason} ·{" "}
                  {personName(props, representation.revoked_by)}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {document ? (
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
                    Consultar documento de poderes
                  </Button>
                ) : null}
                {isIrOwner(props) && representation.status === "draft" ? (
                  <Button
                    size="sm"
                    onClick={() => setReview({ representation, revoke: false })}
                  >
                    Aprovar poderes de coleta
                  </Button>
                ) : null}
                {isIrOwner(props) && representation.status !== "revoked" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReview({ representation, revoke: true })}
                  >
                    Revogar representação
                  </Button>
                ) : null}
              </div>
              {relatedRequests
                .filter(
                  (request) => request.representation_id === representation.id,
                )
                .map((request) => (
                  <p
                    key={request.id}
                    className="break-words text-xs text-muted-foreground"
                  >
                    Coleta associada: {request.title}
                  </p>
                ))}
            </div>
          );
        })}
      </OperationRecords>
      {creating ? (
        <RepresentationDialog
          key={`${props.ir.can_medical}:${props.ir.can_fiscal}`}
          props={props}
          parties={parties.data ?? []}
          documents={visibleDocuments}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {linking ? (
        <IrDialog
          title="Associar coleta ao representante"
          description="Escolha a solicitação e a representação aprovada. A associação não envia o link; compartilhe-o manualmente após conferir o destinatário."
          onClose={() => setLinking(false)}
          pending={action.pending}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void action
                .run(
                  () =>
                    setLegalRequestRepresentation(
                      requestId,
                      representationId || null,
                    ),
                  "Associação da coleta atualizada",
                )
                .then((saved) => {
                  if (saved) setLinking(false);
                });
            }}
          >
            {requests.error ? (
              <LegalError
                error={requests.error}
                retry={() => void requests.refetch()}
              />
            ) : (
              <LegalField label="Solicitação de documento">
                {(id) => (
                  <select
                    id={id}
                    className={selectClassName}
                    required
                    value={requestId}
                    onChange={(event) => {
                      setRequestId(event.target.value);
                      setRepresentationId(
                        relatedRequests.find(
                          (request) => request.id === event.target.value,
                        )?.representation_id ?? "",
                      );
                    }}
                  >
                    <option value="">Selecione a solicitação</option>
                    {relatedRequests
                      .filter((request) =>
                        ["open", "rejected"].includes(request.status),
                      )
                      .map((request) => (
                        <option key={request.id} value={request.id}>
                          {request.title}
                        </option>
                      ))}
                  </select>
                )}
              </LegalField>
            )}
            <LegalField label="Representação autorizada">
              {(id) => (
                <select
                  id={id}
                  className={selectClassName}
                  value={representationId}
                  onChange={(event) => setRepresentationId(event.target.value)}
                >
                  <option value="">Coleta sem representação associada</option>
                  {visible
                    .filter(
                      (representation) =>
                        stateFor(representation) === "active" ||
                        representation.id === representationId,
                    )
                    .map((representation) => (
                      <option
                        key={representation.id}
                        value={representation.id}
                        disabled={stateFor(representation) !== "active"}
                      >
                        {parties.data?.find(
                          (party) =>
                            party.id === representation.representative_party_id,
                        )?.name ?? "Representante"}{" "}
                        · {REPRESENTATION_STATUS[stateFor(representation)]}
                      </option>
                    ))}
                </select>
              )}
            </LegalField>
            <p className="text-xs text-muted-foreground">
              Ao alterar o vínculo, gere um novo link da solicitação em
              Atendimento e trabalho → Documentos solicitados.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLinking(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={action.pending || !requestId}>
                Salvar associação
              </Button>
            </DialogFooter>
          </form>
        </IrDialog>
      ) : null}
      <OperationReasonDialog
        key={review?.representation.id + ":" + review?.revoke}
        open={Boolean(
          review && irCategoryAllowed(props, review.representation.category),
        )}
        onClose={() => setReview(null)}
        title={
          review?.revoke
            ? "Revogar poderes de representação"
            : "Aprovar poderes para coleta"
        }
        description={
          review?.revoke
            ? "O histórico será preservado e novas utilizações das coletas associadas serão bloqueadas. Registre o motivo."
            : "Confira identidade, documento, alcance e validade. Registre a conferência feita pelo responsável do caso."
        }
        pending={action.pending}
        destructive={review?.revoke}
        onSave={(note) =>
          review
            ? action.run(
                () =>
                  review.revoke
                    ? revokeLegalRepresentation(review.representation.id, note)
                    : activateLegalRepresentation(
                        review.representation.id,
                        note,
                      ),
                "Revisão da representação registrada",
              )
            : Promise.resolve(false)
        }
      />
    </OperationPanel>
  );
}
