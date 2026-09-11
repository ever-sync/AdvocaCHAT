import { useExpansionSources } from "./expansion-sources";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  readDiligence,
  reviewDiligence,
  createDiligenceInvite,
  reviewDiligenceInvite,
  revokeDiligenceInvite,
  reviewDiligenceDelivery,
  issueDiligenceLink,
  readDiligenceDocument,
} from "@/lib/api/legal-expansion";
import type {
  ExpansionMetadata,
  ExpansionDiligenceInvite,
  ExpansionDiligenceInviteInput,
  ExpansionDiligenceScope,
  ExpansionDiligenceDelivery,
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
import ExpansionDiligenceForm from "./ExpansionDiligenceForm";
const SCOPE_LABELS: Record<ExpansionDiligenceScope, string> = {
  "instruction:read": "Ler as instruções desta diligência",
  "files:read": "Baixar os arquivos individuais liberados",
  "delivery:upload": "Entregar arquivos para revisão",
  "message:write": "Enviar mensagem sobre esta diligência",
};
const INVITE_STATES: Record<string, string> = {
  draft: "Identidade pendente de conferência",
  approved: "Identidade conferida",
  rejected: "Convite rejeitado",
  issued: "Link emitido; aceite pendente",
  accepted: "Convite aceito",
  revoked: "Convite revogado",
};
export default function ExpansionDiligences(props: ExpansionProps) {
  const list = useExpansionList(props, "diligences");
  const [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<ExpansionMetadata | null>(null);
  if (!expansionCaseAccess(props)) return <ExpansionAccessNotice />;
  return (
    <OperationPanel
      title="Diligências e correspondentes"
      description="Prepare uma tarefa externa com instruções, arquivos e acesso individual limitado. A identidade do correspondente não recebe acesso ao caso inteiro."
      actions={
        props.context.can_edit && (
          <Button size="sm" onClick={() => setCreating(true)}>
            Preparar diligência
          </Button>
        )
      }
    >
      <OperationRecords
        pending={list.query.isPending}
        error={list.query.error}
        retry={() => void list.query.refetch()}
        empty="Nenhuma diligência preparada neste caso"
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
              variant="outline"
              size="sm"
              onClick={() => setSelected(row)}
            >
              Conferir diligência
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
        <ExpansionDiligenceForm
          props={props}
          onClose={() => setCreating(false)}
        />
      )}{" "}
      {selected && list.rows.some((r) => r.id === selected.id) && (
        <DiligenceReader
          props={props}
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </OperationPanel>
  );
}
function DiligenceReader({
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
    queryKey: expansionKey(props, "diligence-" + row.id),
    queryFn: ({ signal }) => readDiligence(row.id, signal),
    enabled: allowed,
    retry: false,
    gcTime: 0,
    refetchInterval: 15000,
  });
  const action = useLegalAction();
  const [copy, setCopy] = useState(false),
    [decision, setDecision] = useState<
      "approved" | "returned" | "revoked" | "completed" | null
    >(null),
    [invite, setInvite] = useState(false),
    [reviewInvite, setReviewInvite] = useState<ExpansionDiligenceInvite | null>(
      null,
    ),
    [revoke, setRevoke] = useState<ExpansionDiligenceInvite | null>(null),
    [delivery, setDelivery] = useState<{
      row: ExpansionDiligenceDelivery;
      decision: "reviewed" | "returned";
    } | null>(null),
    [link, setLink] = useState<{
      inviteId: string;
      url: string;
      expires_at: string;
    } | null>(null);
  const live = useRef(false);
  const readable = useRef(false);
  useEffect(
    () => () => {
      live.current = false;
      readable.current = false;
    },
    [],
  );
  const linkKeys = useRef(new Map<string, string>());
  const data = query.isError ? undefined : query.data,
    v = data?.version;
  const sourceFiles = useExpansionSources(
    props,
    allowed && Boolean(data?.version.source_document_ids.length),
  );
  const owner = props.context.can_review;
  readable.current = allowed && !query.isError && Boolean(data);
  live.current =
    allowed &&
    owner &&
    !query.isError &&
    data?.is_current === true &&
    v?.state === "approved";
  if (!allowed) return null;
  async function download(documentId: string) {
    await action.run(async () => {
      const result = await readDiligenceDocument(row.id, documentId);
      if (!readable.current) return;
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.file_name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "Arquivo liberado para conferência");
  }
  async function issue(i: ExpansionDiligenceInvite) {
    let key = linkKeys.current.get(i.id);
    if (!key) {
      key = crypto.randomUUID();
      linkKeys.current.set(i.id, key);
    }
    await action.run(async () => {
      const result = await issueDiligenceLink(i.id, key!, i.state === "issued");
      if (!live.current) return;
      const url = new URL(result.activation_path, window.location.origin);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== "/portal/diligencias/ativar" ||
        !/^#invite=[a-f0-9]{64}$/.test(url.hash)
      )
        throw new Error(
          "O link retornado não corresponde à área de diligências.",
        );
      setLink({ inviteId: i.id, url: url.href, expires_at: result.expires_at });
    }, "Link preparado para cópia manual");
  }
  return (
    <ExpansionDialog
      title="Conferência da diligência"
      description="Instruções, acesso, entrega e conclusão possuem conferências próprias. Nenhuma mensagem ou convite é enviado automaticamente."
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
              {data.is_current ? "Versão atual" : "Versão ou fontes alteradas"}
            </Badge>
          </div>
          <ExpansionFacts
            items={[
              ["Título externo", v.title],
              ["Instruções", v.instructions],
              ["Data operacional", expansionDate(v.due_at)],
              ["Expiração de acesso", expansionDate(v.expires_at)],
              [
                "Supervisor",
                props.workspace.collaborators.find(
                  (u) => u.id === v.supervisor_id,
                )?.nome ?? "Responsável interno",
              ],
              [
                "Substituto",
                props.workspace.collaborators.find(
                  (u) => u.id === v.substitute_id,
                )?.nome,
              ],
              ["Revisão", v.review_note],
            ]}
          />
          <ExpansionNotice>
            Arquivos selecionados para esta versão:{" "}
            {v.source_document_ids.length}. Uma nova versão invalida o acesso
            anterior. O correspondente não recebe uma concessão para o caso
            completo.
          </ExpansionNotice>
          {v.source_document_ids.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-medium">Arquivos individuais desta versão</h3>
              {v.source_document_ids.map((id, index) => (
                <div
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <span className="min-w-0 break-words">
                    {sourceFiles.docs.find((doc) => doc.id === id)
                      ?.display_name ?? `Arquivo selecionado ${index + 1}`}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.pending}
                    onClick={() => void download(id)}
                  >
                    Baixar arquivo para conferir
                  </Button>
                </div>
              ))}
            </section>
          )}
          {!data.is_current && (
            <ExpansionNotice error>
              As fontes ou a versão mudaram. Prepare e confira nova versão antes
              de emitir acesso.
            </ExpansionNotice>
          )}
          <div className="flex flex-wrap gap-2">
            {props.context.can_edit && (
              <Button variant="outline" onClick={() => setCopy(true)}>
                Criar nova versão
              </Button>
            )}
            {owner &&
              data.is_current &&
              ["draft", "returned"].includes(v.state) && (
                <>
                  <Button onClick={() => setDecision("approved")}>
                    Revisar liberação da diligência
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDecision("returned")}
                  >
                    Devolver instruções
                  </Button>
                </>
              )}
            {owner && v.state === "approved" && (
              <Button variant="outline" onClick={() => setDecision("revoked")}>
                Revogar diligência
              </Button>
            )}
            {owner && v.state === "approved" && data.is_current && (
              <Button variant="outline" onClick={() => setInvite(true)}>
                Preparar convite individual
              </Button>
            )}
            {owner &&
              v.state === "approved" &&
              data.deliveries.some((d) => d.state === "reviewed") && (
                <Button onClick={() => setDecision("completed")}>
                  Concluir e encerrar acesso
                </Button>
              )}
          </div>
          {owner && (
            <section className="space-y-3">
              <h3 className="font-medium">Identidade e convite</h3>
              {data.invites.length ? (
                data.invites.map((i) => (
                  <article
                    key={i.id}
                    className="space-y-2 rounded-lg border p-3 text-sm"
                  >
                    <p className="break-all font-medium">
                      {i.email ?? "Identidade externa individual"}
                    </p>
                    <p>
                      {INVITE_STATES[i.state]} · expira{" "}
                      {expansionDate(i.expires_at)}
                    </p>
                    <ul className="ml-4 list-disc">
                      {i.scopes.map((s) => (
                        <li key={s}>{SCOPE_LABELS[s]}</li>
                      ))}
                    </ul>
                    {i.identity_note && (
                      <p className="whitespace-pre-wrap break-words">
                        {i.identity_note}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {i.state === "draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReviewInvite(i)}
                        >
                          Conferir identidade e contato
                        </Button>
                      )}
                      {data.is_current &&
                        v.state === "approved" &&
                        ["approved", "issued"].includes(i.state) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={action.pending}
                            onClick={() => void issue(i)}
                          >
                            {i.state === "issued"
                              ? "Substituir link de acesso"
                              : "Gerar link de acesso"}
                          </Button>
                        )}
                      {i.state !== "revoked" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRevoke(i)}
                        >
                          Revogar convite e acesso
                        </Button>
                      )}
                    </div>
                    {link?.inviteId === i.id &&
                      data.is_current &&
                      v.state === "approved" &&
                      i.state === "issued" && (
                        <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                          <p>
                            Copie e entregue o link pelo canal de contato
                            conferido. O destinatário entra com sua própria
                            senha ou solicita seu código.
                          </p>
                          <p className="break-all select-all">{link.url}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void action.run(
                                () => navigator.clipboard.writeText(link.url),
                                "Link copiado",
                              )
                            }
                          >
                            Copiar link
                          </Button>
                        </div>
                      )}
                  </article>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum convite preparado.
                </p>
              )}
            </section>
          )}
          <section className="space-y-3">
            <h3 className="font-medium">Acessos individuais concedidos</h3>
            {data.grants.length ? (
              data.grants.map((grant) => (
                <article
                  key={grant.id}
                  className="space-y-2 rounded-lg border p-3 text-sm"
                >
                  <p className="font-medium">
                    {grant.state === "active"
                      ? "Acesso individual ativo"
                      : grant.state === "completed"
                        ? "Acesso encerrado pela conclusão"
                        : "Acesso revogado"}
                  </p>
                  <p>
                    Aceito em {expansionDate(grant.accepted_at)} · expira{" "}
                    {expansionDate(grant.expires_at)}
                  </p>
                  <ul className="ml-4 list-disc">
                    {grant.scopes.map((scope) => (
                      <li key={scope}>{SCOPE_LABELS[scope]}</li>
                    ))}
                  </ul>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum acesso aceito pelo destinatário.
              </p>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="font-medium">Entregas e revisão</h3>
            {data.deliveries.length ? (
              data.deliveries.map((d) => (
                <article
                  key={d.id}
                  className="space-y-2 rounded-lg border p-3 text-sm"
                >
                  <p className="whitespace-pre-wrap break-words">
                    {d.description}
                  </p>
                  {["submitted", "reviewed", "returned"].includes(d.state) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={action.pending}
                      onClick={() => void download(d.document_id)}
                    >
                      Baixar entrega para conferir
                    </Button>
                  )}
                  <p>
                    {d.state === "submitted"
                      ? "Arquivo recebido; conferência pendente"
                      : d.state === "reviewed"
                        ? "Entrega conferida"
                        : d.state === "returned"
                          ? "Entrega devolvida para ajuste"
                          : d.state === "abandoned"
                            ? "Preparação abandonada"
                            : "Upload em preparação"}
                  </p>
                  {d.note && <p>{d.note}</p>}
                  {owner && d.state === "submitted" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDelivery({ row: d, decision: "reviewed" })
                        }
                      >
                        Revisar entrega
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDelivery({ row: d, decision: "returned" })
                        }
                      >
                        Devolver entrega
                      </Button>
                    </div>
                  )}
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma entrega recebida.
              </p>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="font-medium">Mensagens desta diligência</h3>
            {data.messages.length ? (
              data.messages.map((m) => (
                <article key={m.id} className="rounded-lg border p-3 text-sm">
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {expansionDate(m.created_at)}
                  </p>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma mensagem recebida.
              </p>
            )}
          </section>
          {copy && (
            <ExpansionDiligenceForm
              props={props}
              previous={v}
              onClose={() => setCopy(false)}
            />
          )}{" "}
          {decision &&
            owner &&
            (decision !== "approved" ||
              (data.is_current && ["draft", "returned"].includes(v.state))) && (
              <OperationReasonDialog
                open
                title={
                  decision === "approved"
                    ? "Conferir instruções e arquivos para liberação"
                    : decision === "completed"
                      ? "Concluir diligência e encerrar acesso"
                      : "Registrar decisão sobre a diligência"
                }
                description="A decisão fica identificada no histórico. Conclusão exige entrega revisada e encerra o acesso externo."
                actionLabel={
                  decision === "approved"
                    ? "Confirmar diligência aprovada"
                    : decision === "completed"
                      ? "Concluir e encerrar acesso"
                      : decision === "revoked"
                        ? "Confirmar revogação"
                        : "Devolver para ajuste"
                }
                pending={action.pending}
                onClose={() => setDecision(null)}
                onSave={(note) =>
                  action.run(
                    () => reviewDiligence(v.id, decision, note),
                    "Decisão registrada",
                  )
                }
              />
            )}{" "}
          {invite && owner && data.is_current && v.state === "approved" && (
            <InviteForm
              props={props}
              versionId={v.id}
              expiresAt={v.expires_at}
              onClose={() => setInvite(false)}
            />
          )}{" "}
          {reviewInvite &&
            owner &&
            data.invites.some(
              (i) => i.id === reviewInvite.id && i.state === "draft",
            ) && (
              <InviteReview
                props={props}
                invite={reviewInvite}
                onClose={() => setReviewInvite(null)}
              />
            )}{" "}
          {revoke && owner && (
            <OperationReasonDialog
              open
              title="Revogar convite e acesso"
              description="O link e a concessão individual deixarão de autorizar leitura, envio ou download. O histórico permanece."
              actionLabel="Confirmar revogação"
              pending={action.pending}
              onClose={() => setRevoke(null)}
              onSave={(note) =>
                action.run(
                  () => revokeDiligenceInvite(revoke.id, note),
                  "Convite e acesso revogados",
                )
              }
            />
          )}{" "}
          {delivery &&
            owner &&
            data.deliveries.some(
              (d) => d.id === delivery.row.id && d.state === "submitted",
            ) && (
              <OperationReasonDialog
                open
                title={
                  delivery.decision === "reviewed"
                    ? "Conferir entrega do correspondente"
                    : "Devolver entrega para ajuste"
                }
                description="Baixe e examine o documento original desta diligência antes de decidir. Conferir a entrega não conclui automaticamente a diligência nem comprova um ato judicial."
                actionLabel={
                  delivery.decision === "reviewed"
                    ? "Confirmar entrega conferida"
                    : "Devolver entrega"
                }
                pending={action.pending}
                onClose={() => setDelivery(null)}
                onSave={(note) =>
                  action.run(
                    () =>
                      reviewDiligenceDelivery(
                        delivery.row.id,
                        delivery.decision,
                        note,
                      ),
                    "Entrega revisada",
                  )
                }
              />
            )}
        </>
      ) : null}
    </ExpansionDialog>
  );
}
function InviteForm({
  props,
  versionId,
  expiresAt,
  onClose,
}: {
  props: ExpansionProps;
  versionId: string;
  expiresAt: string;
  onClose(): void;
}) {
  const action = useLegalAction();
  const [email, setEmail] = useState(""),
    [expires, setExpires] = useState(""),
    [scopes, setScopes] = useState<ExpansionDiligenceScope[]>([]);
  return (
    <ExpansionDialog
      title="Preparar convite individual"
      description="O convite começa pendente de conferência de identidade e contato. Nenhum e-mail é enviado."
      onClose={onClose}
      pending={action.pending}
      disabled={!scopes.includes("instruction:read")}
      onSubmit={() =>
        action.run(async () => {
          const expiry = new Date(expires);
          if (Number.isNaN(expiry.getTime()) || expiry > new Date(expiresAt))
            throw new Error(
              "A expiração do convite deve respeitar a expiração da diligência.",
            );
          const payload: ExpansionDiligenceInviteInput = {
            email: email.trim(),
            scopes,
            expires_at: expiry.toISOString(),
          };
          await createDiligenceInvite(versionId, payload);
          onClose();
        }, "Convite preparado para conferência")
      }
    >
      <ExpansionText
        label="E-mail individual do correspondente"
        type="email"
        value={email}
        onChange={setEmail}
        required
        maxLength={254}
      />
      <ExpansionText
        label="Expiração do convite"
        type="datetime-local"
        value={expires}
        onChange={setExpires}
        required
        hint={"Limite da diligência: " + expansionDate(expiresAt)}
      />
      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 font-medium">Permissões específicas</legend>
        {Object.entries(SCOPE_LABELS).map(([key, label]) => (
          <ExpansionCheck
            key={key}
            label={label}
            checked={scopes.includes(key as ExpansionDiligenceScope)}
            onChange={(v) =>
              setScopes((o) =>
                v
                  ? [...o, key as ExpansionDiligenceScope]
                  : o.filter((s) => s !== key),
              )
            }
          />
        ))}
      </fieldset>
    </ExpansionDialog>
  );
}
function InviteReview({
  props,
  invite,
  onClose,
}: {
  props: ExpansionProps;
  invite: ExpansionDiligenceInvite;
  onClose(): void;
}) {
  const sources = useExpansionSources(props),
    action = useLegalAction();
  const [decision, setDecision] = useState<"approved" | "rejected">("rejected"),
    [proof, setProof] = useState(""),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <ExpansionDialog
      title="Conferir identidade e contato"
      description="O e-mail informado pelo escritório não prova identidade. Registre a evidência e a conferência nominal do destinatário."
      onClose={onClose}
      pending={action.pending}
      disabled={!proof || (decision === "approved" && !confirmed)}
      actionLabel={
        decision === "approved"
          ? "Confirmar identidade e contato"
          : "Rejeitar convite"
      }
      onSubmit={() =>
        action.run(async () => {
          await reviewDiligenceInvite(invite.id, decision, proof, note);
          onClose();
        }, "Decisão sobre identidade registrada")
      }
    >
      <ExpansionSelect
        label="Decisão sobre o convite"
        value={decision}
        onChange={(v) => setDecision(v as typeof decision)}
      >
        <option value="rejected">Rejeitar enquanto não comprovado</option>
        <option value="approved">Identidade e contato conferidos</option>
      </ExpansionSelect>
      <ExpansionDocumentField
        label="Prova geral de identidade e contato"
        docs={sources.docs.filter((d) => d.category === "general")}
        value={proof}
        onChange={setProof}
        required
      />
      <ExpansionText
        label="Fundamento da conferência de identidade"
        value={note}
        onChange={setNote}
        required
        multiline
        maxLength={4000}
      />
      <ExpansionCheck
        label="Conferi a identidade individual, o contato e as permissões deste destinatário"
        checked={confirmed}
        onChange={setConfirmed}
      />
    </ExpansionDialog>
  );
}
