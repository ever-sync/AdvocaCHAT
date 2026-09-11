import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments, listLegalEvents } from "@/lib/api/legal";
import { LegalEmpty, LegalField } from "../LegalShared";
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
  careLocalDateTime,
  careMemberAllows,
  careMemberLabel,
  careOwner,
  type CareProps,
} from "./client-care-ui";
import {
  createCareCommunication,
  queueCareCommunication,
  reviewCareCommunication,
} from "./api";
import type {
  CareCommunication,
  CareCommunicationInput,
  PortalCategory,
} from "./types";
const CHANNELS = {
  portal: "Portal do cliente",
  email: "E-mail",
  whatsapp: "WhatsApp",
};
const JOB_STATES = {
  queued: "Na fila de envio",
  sending: "Tentativa em andamento",
  provider_accepted: "Aceito pelo provedor; entrega não confirmada",
  delivered: "Entrega confirmada",
  read: "Leitura confirmada",
  failed: "Falha registrada",
  unknown: "Resultado desconhecido; requer conferência",
  cancelled: "Envio cancelado",
};
const GENERIC_TITLE = "Nova atualização no portal";
const GENERIC_BODY =
  "Há uma atualização disponível no portal do seu atendimento. Acesse sua conta para consultar.";
export function CareCommunications(props: CareProps) {
  const [draft, setDraft] = useState<CareCommunication | "new" | null>(null);
  const [review, setReview] = useState<{
    row: CareCommunication;
    decision: "approved" | "cancelled";
  } | null>(null);
  const action = useLegalAction();
  const keys = useRef(new Map<string, string>());
  const rows = props.context.communications.filter((c) =>
    careCategoryAllowed(props, c.category),
  );
  const received = props.context.messages.filter((m) =>
    careCategoryAllowed(props, m.category),
  );
  const queue = (row: CareCommunication) =>
    action.run(
      async () => {
        let key = keys.current.get(row.id);
        if (!key) {
          key = crypto.randomUUID();
          keys.current.set(row.id, key);
        }
        await queueCareCommunication(row.id, key);
      },
      row.channel === "portal"
        ? "Mensagem disponibilizada no portal"
        : "Solicitação de envio registrada; consulte o resultado na fila",
    );
  return (
    <div className="space-y-4">
      <OperationPanel
        title="Comunicação revisada com o cliente"
        description="O conteúdo completo fica no portal. Avisos externos usam uma mensagem genérica, exigem destino revisado e conexão própria. Criar ou aprovar o texto não envia a comunicação."
        actions={
          props.canEdit && (
            <Button size="sm" onClick={() => setDraft("new")}>
              Preparar comunicação
            </Button>
          )
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(["email", "whatsapp"] as const).map((channel) => {
            const connection = props.context.connections?.find(
              (c) => c.channel === channel && c.enabled,
            );
            return (
              <div
                className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm"
                key={channel}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{CHANNELS[channel]}</span>
                  <Badge variant="secondary">
                    {connection ? "Conexão cadastrada" : "Não configurado"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {channel === "whatsapp"
                    ? "O envio jurídico por WhatsApp depende de um adaptador homologado. A configuração não comprova envio."
                    : "O envio exige habilitação no servidor e confirmação do provedor. A fila não comprova entrega."}
                </p>
              </div>
            );
          })}
        </div>
        {rows.length ? (
          rows.map((row) => {
            const job = props.context.jobs.find(
              (j) => j.communication_id === row.id,
            );
            const receipts = props.context.receipts.filter(
              (r) => r.job_id === job?.id,
            );
            const configured =
              row.channel === "portal" ||
              Boolean(
                props.context.connections?.some(
                  (c) => c.channel === row.channel && c.enabled,
                ),
              );
            return (
              <article key={row.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="break-words font-semibold">{row.title}</h3>
                  <Badge variant="secondary">{CARE_STATES[row.state]}</Badge>
                </div>
                <p className="break-words text-xs text-muted-foreground">
                  {CHANNELS[row.channel]} · {DOCUMENT_CATEGORIES[row.category]}{" "}
                  ·{" "}
                  {careMemberLabel(
                    props.context.memberships.find(
                      (m) => m.id === row.membership_id,
                    ),
                  )}
                </p>
                <p className="break-all text-sm">
                  Destino revisado: {row.recipient}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {row.body}
                </p>
                <p className="text-xs text-muted-foreground">
                  Válido até {legalDate(row.expires_at)}
                  {row.origin_event_id &&
                    " · Vinculado a evento interno do caso"}
                </p>
                {row.review_note && (
                  <p className="whitespace-pre-wrap text-sm">
                    Revisão: {row.review_note}
                  </p>
                )}
                {job && (
                  <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
                    <p className="font-medium">
                      {row.channel === "portal" && job.state === "delivered"
                        ? "Disponível no portal; leitura ainda não confirmada"
                        : JOB_STATES[job.state]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {job.attempts} tentativa(s) · Atualizado em{" "}
                      {legalDate(job.updated_at)}
                    </p>
                    {job.error_code && (
                      <p className="text-xs">
                        Código de retorno: {job.error_code}
                      </p>
                    )}
                    {receipts.map((r) => (
                      <p key={r.id} className="text-xs">
                        Recibo {r.provider}:{" "}
                        {r.status === "delivered"
                          ? "entrega"
                          : r.status === "read"
                            ? "leitura"
                            : "falha"}{" "}
                        em {legalDate(r.occurred_at)}
                      </p>
                    ))}
                    {job.state === "unknown" && (
                      <p className="text-xs">
                        Confira o resultado com o provedor antes de preparar
                        outro envio. Não há reenvio automático desta tentativa.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {props.canEdit && row.state !== "superseded" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDraft(row)}
                    >
                      Preparar nova versão
                    </Button>
                  )}
                  {careOwner(props) && row.state === "draft" && (
                    <Button
                      size="sm"
                      onClick={() => setReview({ row, decision: "approved" })}
                    >
                      Revisar conteúdo e destino
                    </Button>
                  )}
                  {careOwner(props) && row.state === "approved" && !job && (
                    <Button
                      size="sm"
                      disabled={
                        action.pending ||
                        !configured ||
                        row.channel === "whatsapp"
                      }
                      onClick={() => void queue(row)}
                    >
                      {row.channel === "portal"
                        ? "Disponibilizar no portal"
                        : configured
                          ? "Solicitar envio do aviso"
                          : "Canal não configurado"}
                    </Button>
                  )}
                  {careOwner(props) &&
                    ["draft", "approved"].includes(row.state) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setReview({ row, decision: "cancelled" })
                        }
                      >
                        Cancelar comunicação
                      </Button>
                    )}
                </div>
              </article>
            );
          })
        ) : (
          <LegalEmpty title="Nenhuma comunicação preparada" />
        )}
      </OperationPanel>
      <OperationPanel
        title="Mensagens recebidas no portal"
        description="Mensagens autenticadas dos destinatários, preservadas na categoria informada. Para responder, prepare e revise uma comunicação para o portal."
      >
        {received.length ? (
          received.map((message) => (
            <article
              key={message.id}
              className="space-y-2 rounded-lg border p-4"
            >
              <p className="break-words text-xs text-muted-foreground">
                {careMemberLabel(
                  props.context.memberships.find(
                    (m) => m.id === message.membership_id,
                  ),
                )}{" "}
                · {DOCUMENT_CATEGORIES[message.category]} ·{" "}
                {legalDate(message.created_at)}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {message.body}
              </p>
            </article>
          ))
        ) : (
          <LegalEmpty title="Nenhuma mensagem recebida" />
        )}
      </OperationPanel>
      {draft &&
        props.canEdit &&
        (draft === "new" || careCategoryAllowed(props, draft.category)) && (
          <CommunicationDialog
            props={props}
            previous={draft === "new" ? undefined : draft}
            close={() => setDraft(null)}
          />
        )}
      {review &&
        careOwner(props) &&
        careCategoryAllowed(props, review.row.category) && (
          <OperationReasonDialog
            open
            title={
              review.decision === "approved"
                ? "Revisar comunicação e destinatário"
                : "Cancelar comunicação"
            }
            description={
              review.decision === "approved"
                ? `Confira o texto integral acima, o canal ${CHANNELS[review.row.channel]}, o destino ${review.row.recipient}, a categoria e a validade. A aprovação não encaminha o envio.`
                : "O conteúdo será cancelado e tentativas ainda na fila serão encerradas. Uma entrega já realizada não pode ser retirada do destinatário."
            }
            onClose={() => setReview(null)}
            pending={action.pending}
            actionLabel="Registrar decisão"
            onSave={(note) =>
              action.run(
                () =>
                  reviewCareCommunication(review.row.id, review.decision, note),
                "Decisão registrada",
              )
            }
          />
        )}
    </div>
  );
}
function CommunicationDialog({
  props,
  previous,
  close,
}: {
  props: CareProps;
  previous?: CareCommunication;
  close(): void;
}) {
  const [form, setForm] = useState<CareCommunicationInput>({
    membership_id: previous?.membership_id ?? "",
    channel: previous?.channel ?? "portal",
    category: previous?.category ?? "general",
    title: previous?.title ?? "",
    body: previous?.body ?? "",
    expires_at: careLocalDateTime(previous?.expires_at ?? null),
    previous_version_id: previous?.id ?? null,
    recipient_phone: previous?.channel === "whatsapp" ? previous.recipient : "",
    contact_evidence_id: previous?.contact_evidence_id ?? null,
    origin_event_id: previous?.origin_event_id ?? null,
  });
  const action = useLegalAction();
  const documents = useQuery({
    queryKey: careKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
  });
  const events = useQuery({
    queryKey: careKey(props, "events"),
    queryFn: () => listLegalEvents(props.legalCase.id),
  });
  const members = props.context.memberships.filter(
    (m) =>
      m.state === "active" &&
      m.scopes.includes("messages:read") &&
      m.access_kind !== "accountant",
  );
  const member = members.find((m) => m.id === form.membership_id);
  const categories = (
    Object.keys(DOCUMENT_CATEGORIES) as PortalCategory[]
  ).filter((c) => careCategoryAllowed(props, c) && careMemberAllows(member, c));
  return (
    <CareDialog
      title="Preparar versão da comunicação"
      description="Escreva para uma pessoa autorizada. A versão será revisada antes de qualquer disponibilização ou tentativa de envio."
      close={close}
      pending={action.pending}
      disabled={!member || !categories.includes(form.category)}
      submit={async () => {
        if (
          await action.run(
            () =>
              createCareCommunication(props.legalCase.id, {
                ...form,
                title: form.channel === "portal" ? form.title : GENERIC_TITLE,
                body: form.channel === "portal" ? form.body : GENERIC_BODY,
                expires_at: careTimestamp(form.expires_at),
                recipient_phone:
                  form.channel === "whatsapp"
                    ? form.recipient_phone
                    : undefined,
                contact_evidence_id:
                  form.channel === "whatsapp" ? form.contact_evidence_id : null,
              }),
            "Comunicação preparada para revisão",
          )
        )
          close();
      }}
    >
      <fieldset disabled={Boolean(previous)} className="space-y-4">
        <CareMemberField
          members={members}
          value={form.membership_id}
          change={(membership_id) => setForm({ ...form, membership_id })}
        />
        <CareCategoryField
          value={form.category}
          categories={categories}
          change={(category) => setForm({ ...form, category })}
        />
      </fieldset>
      <LegalField label="Canal">
        {(id) => (
          <select
            id={id}
            className={selectClassName}
            value={form.channel}
            onChange={(e) =>
              setForm({
                ...form,
                channel: e.target.value as CareCommunicationInput["channel"],
              })
            }
          >
            {Object.entries(CHANNELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </LegalField>
      {form.channel === "portal" ? (
        <>
          <LegalField label="Título da mensagem">
            {(id) => (
              <Input
                id={id}
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            )}
          </LegalField>
          <LegalField label="Texto completo no portal">
            {(id) => (
              <Textarea
                id={id}
                required
                rows={5}
                maxLength={6000}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            )}
          </LegalField>
        </>
      ) : (
        <div className="space-y-2 rounded-lg border p-4 text-sm">
          <p className="font-medium">Aviso externo padronizado</p>
          <p>{GENERIC_TITLE}</p>
          <p>{GENERIC_BODY}</p>
          <p className="text-xs text-muted-foreground">
            Sem dados do processo, valores, diagnóstico ou anexos. O
            destinatário consulta o conteúdo completo autenticado no portal.
          </p>
        </div>
      )}
      {form.channel === "whatsapp" && (
        <>
          <LegalField
            label="Telefone individual confirmado"
            hint="Formato internacional, por exemplo +5511999999999."
          >
            {(id) => (
              <Input
                id={id}
                type="tel"
                pattern="\+[1-9][0-9]{7,14}"
                required
                value={form.recipient_phone}
                onChange={(e) =>
                  setForm({ ...form, recipient_phone: e.target.value })
                }
              />
            )}
          </LegalField>
          <LegalField label="Evidência geral da confirmação deste telefone">
            {(id) => (
              <select
                id={id}
                className={selectClassName}
                required
                value={form.contact_evidence_id ?? ""}
                onChange={(e) =>
                  setForm({ ...form, contact_evidence_id: e.target.value })
                }
              >
                <option value="">Selecione o documento</option>
                {documents.data
                  ?.filter((d) => d.category === "general")
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.display_name}
                    </option>
                  ))}
              </select>
            )}
          </LegalField>
        </>
      )}
      <LegalField label="Comunicação válida até">
        {(id) => (
          <Input
            id={id}
            type="datetime-local"
            required
            value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
          />
        )}
      </LegalField>
      <LegalField
        label="Evento interno de origem (opcional)"
        hint="O evento não publica seu conteúdo. Revise o texto desta comunicação separadamente."
      >
        {(id) => (
          <select
            id={id}
            className={selectClassName}
            value={form.origin_event_id ?? ""}
            onChange={(e) =>
              setForm({ ...form, origin_event_id: e.target.value || null })
            }
          >
            <option value="">Sem vínculo</option>
            {events.data?.map((event) => (
              <option key={event.id} value={event.id}>
                {legalDate(event.created_at)} · {event.description}
              </option>
            ))}
          </select>
        )}
      </LegalField>
    </CareDialog>
  );
}
export default CareCommunications;
