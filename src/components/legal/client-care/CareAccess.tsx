import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Copy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listLegalDocuments, listLegalParties } from "@/lib/api/legal";
import { listLegalRepresentations } from "@/lib/api/legal-ir";
import { LegalEmpty, LegalError, LegalField } from "../LegalShared";
import { legalDate, selectClassName, useLegalAction } from "../legal-ui";
import {
  OperationPanel,
  OperationReasonDialog,
} from "../operations/OperationPanel";
import { CareDialog, CareScopeChecklist } from "./CareShared";
import {
  CARE_KINDS,
  CARE_SCOPES,
  CARE_STATES,
  careKey,
  careTimestamp,
  careOwner,
  careScopesFor,
  type CareProps,
} from "./client-care-ui";
import {
  createPortalInvite,
  grantPortalRepresentation,
  issuePortalInvite,
  provisionPortalInvite,
  reviewPortalInvite,
  revokePortalAccess,
} from "./api";
import type { CareInvite, CareInviteInput, PortalScope } from "./types";

export function CareAccess(props: CareProps) {
  const owner = careOwner(props);
  const action = useLegalAction();
  const [creating, setCreating] = useState(false);
  const [review, setReview] = useState<CareInvite | null>(null);
  const [powers, setPowers] = useState(false);
  const [revoke, setRevoke] = useState<{
    invite_id?: string;
    membership_id?: string;
    label: string;
  } | null>(null);
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const live = useRef(true);
  const keys = useRef(new Map<string, string>());
  useEffect(() => {
    live.current = owner;
    return () => {
      live.current = false;
    };
  }, [owner, props.workspace.user_id, props.legalCase.id]);
  const parties = useQuery({
    queryKey: careKey(props, "parties"),
    queryFn: () => listLegalParties(props.legalCase.id),
    enabled: owner,
  });
  const documents = useQuery({
    queryKey: careKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
    enabled: owner,
  });
  const representations = useQuery({
    queryKey: careKey(props, "representations"),
    queryFn: () => listLegalRepresentations(props.legalCase.id),
    enabled: owner,
  });
  if (!owner)
    return (
      <LegalEmpty title="Acessos administrados pelo responsável">
        Somente o responsável pelo caso pode revisar a identidade de
        destinatários e conceder acesso externo.
      </LegalEmpty>
    );
  const name = (id: string) =>
    parties.data?.find((p) => p.id === id)?.name ?? "Parte do caso";
  const emit = (invite: CareInvite) =>
    action.run(async () => {
      let key = keys.current.get(invite.id);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(invite.id, key);
      }
      if (!invite.identity_id) await provisionPortalInvite(invite.id, key);
      const result = await issuePortalInvite(
        invite.id,
        invite.state === "issued",
      );
      if (!/^\/portal\/ativar#/.test(result.activation_path))
        throw new Error("O servidor não retornou um convite válido.");
      if (live.current) {
        setCopied(false);
        setLink({
          url: `${window.location.origin}${result.activation_path}`,
          expires_at: result.expires_at,
        });
      }
    }, "Convite preparado para compartilhamento manual");
  return (
    <div className="space-y-4">
      <OperationPanel
        title="Acessos individuais ao portal"
        description="Revise a pessoa, o contato, a finalidade e cada permissão. O convite é copiado manualmente; criar um acesso não envia e-mail ou WhatsApp."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Preparar convite
          </Button>
        }
      >
        {parties.error && (
          <LegalError
            error={parties.error}
            retry={() => void parties.refetch()}
          />
        )}
        {documents.error && (
          <LegalError
            error={documents.error}
            retry={() => void documents.refetch()}
          />
        )}
        {!props.context.memberships.length && !props.context.invites.length && (
          <LegalEmpty title="Nenhum acesso externo preparado" />
        )}
        {props.context.memberships.map((member) => (
          <article key={member.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-medium">
                {name(member.party_id)} · {CARE_KINDS[member.access_kind]}
              </p>
              <Badge
                variant={member.state === "active" ? "default" : "secondary"}
              >
                {CARE_STATES[member.state]}
              </Badge>
            </div>
            <p className="break-all text-sm">{member.verified_email}</p>
            <p className="text-sm">Título público: {member.public_title}</p>
            <ul className="list-inside list-disc text-xs text-muted-foreground">
              {member.scopes.map((s) => (
                <li key={s}>{CARE_SCOPES[s]}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Saúde: {member.allow_medical ? "autorizada" : "sem acesso"} ·
              Fiscal: {member.allow_fiscal ? "autorizado" : "sem acesso"} ·
              Validade: {legalDate(member.expires_at)}
            </p>
            {member.revocation_reason && (
              <p className="whitespace-pre-wrap text-sm">
                Revogação: {member.revocation_reason}
              </p>
            )}
            {member.state !== "revoked" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setRevoke({
                    membership_id: member.id,
                    label: name(member.party_id),
                  })
                }
              >
                Revogar este acesso
              </Button>
            )}
          </article>
        ))}
        {props.context.invites.map((invite) => (
          <article key={invite.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-medium">
                Convite de {name(invite.party_id)} ·{" "}
                {CARE_KINDS[invite.access_kind]}
              </p>
              <Badge variant="secondary">{CARE_STATES[invite.state]}</Badge>
            </div>
            <p className="break-all text-sm">{invite.email}</p>
            <p className="text-sm">Título público: {invite.public_title}</p>
            <p className="whitespace-pre-wrap break-words text-sm">
              Finalidade: {invite.purpose}
            </p>
            <ul className="list-inside list-disc text-xs text-muted-foreground">
              {invite.scopes.map((s) => (
                <li key={s}>{CARE_SCOPES[s]}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Saúde: {invite.allow_medical ? "autorizada" : "sem acesso"} ·
              Fiscal: {invite.allow_fiscal ? "autorizado" : "sem acesso"} ·
              Validade: {legalDate(invite.expires_at)}
            </p>
            {invite.identity_note && (
              <p className="whitespace-pre-wrap break-words text-sm">
                Revisão de identidade e contato: {invite.identity_note}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {invite.state === "draft" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReview(invite)}
                >
                  Revisar identidade e permissões
                </Button>
              )}
              {(invite.state === "approved" || invite.state === "issued") && (
                <Button
                  size="sm"
                  disabled={
                    action.pending ||
                    Date.parse(invite.expires_at) <= Date.now()
                  }
                  onClick={() => void emit(invite)}
                >
                  {invite.state === "issued"
                    ? "Gerar novo link e invalidar anterior"
                    : "Preparar link de ativação"}
                </Button>
              )}
              {!["revoked", "accepted", "rejected"].includes(invite.state) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRevoke({
                      invite_id: invite.id,
                      label: name(invite.party_id),
                    })
                  }
                >
                  Revogar convite
                </Button>
              )}
            </div>
          </article>
        ))}
      </OperationPanel>
      <OperationPanel
        title="Poderes de representantes no portal"
        description="A autorização de enviar documentos de uma procuração anterior não concede consulta a mensagens, dados ou arquivos. Revise poderes específicos antes de aprovar o convite."
        actions={
          <Button size="sm" variant="outline" onClick={() => setPowers(true)}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Revisar poderes
          </Button>
        }
      >
        {props.context.representation_grants.length ? (
          props.context.representation_grants.map((grant) => {
            const representation = representations.data?.find(
              (r) => r.id === grant.representation_id,
            );
            return (
              <article
                key={grant.id}
                className="space-y-2 rounded-lg border p-4"
              >
                <p className="font-medium">
                  {representation
                    ? name(representation.representative_party_id)
                    : "Representação do caso"}
                </p>
                <ul className="list-inside list-disc text-sm">
                  {grant.scopes.map((s) => (
                    <li key={s}>{CARE_SCOPES[s]}</li>
                  ))}
                </ul>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {grant.review_note}
                </p>
                <p className="text-xs text-muted-foreground">
                  Revisado em {legalDate(grant.approved_at)}. A validade
                  continua vinculada à representação.
                </p>
              </article>
            );
          })
        ) : (
          <LegalEmpty title="Nenhum poder adicional revisado" />
        )}
      </OperationPanel>
      {creating && (
        <InviteDialog
          props={props}
          close={() => setCreating(false)}
          parties={parties.data ?? []}
          representations={representations.data ?? []}
        />
      )}
      {review &&
        props.context.invites.some(
          (i) => i.id === review.id && i.state === "draft",
        ) && (
          <InviteReview
            invite={review}
            name={name(review.party_id)}
            documents={(documents.data ?? []).filter(
              (d) => d.category === "general",
            )}
            close={() => setReview(null)}
          />
        )}
      {powers && (
        <RepresentationPowers
          props={props}
          representations={representations.data ?? []}
          partyName={name}
          close={() => setPowers(false)}
        />
      )}
      <OperationReasonDialog
        open={Boolean(revoke)}
        onClose={() => setRevoke(null)}
        title="Revogar acesso externo"
        description={`${revoke?.label ?? "O destinatário"} deixará de acessar os conteúdos e links deste caso. O histórico permanece guardado.`}
        pending={action.pending}
        actionLabel="Revogar acesso"
        destructive
        onSave={(reason) =>
          action.run(
            () =>
              revokePortalAccess({
                invite_id: revoke?.invite_id,
                membership_id: revoke?.membership_id,
                reason,
              }),
            "Acesso externo revogado",
          )
        }
      />
      <Dialog
        open={Boolean(link)}
        onOpenChange={(open) => {
          if (!open) {
            setLink(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convite pronto para copiar</DialogTitle>
            <DialogDescription>
              Compartilhe somente com o destinatário que você revisou, pelo
              canal confirmado. O link permite ativar o acesso e não será
              guardado nesta tela depois de fechá-la.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Link individual de ativação"
            readOnly
            value={link?.url ?? ""}
            className="text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Validade: {legalDate(link?.expires_at)}
          </p>
          <Button
            onClick={async () => {
              if (link) {
                try {
                  await navigator.clipboard.writeText(link.url);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {copied ? "Link copiado" : "Copiar convite"}
          </Button>
          <p className="text-xs text-muted-foreground">
            A emissão do link não comprova recebimento de e-mail.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function InviteDialog({
  props,
  close,
  parties,
  representations,
}: {
  props: CareProps;
  close(): void;
  parties: Awaited<ReturnType<typeof listLegalParties>>;
  representations: Awaited<ReturnType<typeof listLegalRepresentations>>;
}) {
  const action = useLegalAction();
  const [form, setForm] = useState<CareInviteInput>({
    party_id: "",
    email: "",
    access_kind: "client",
    scopes: [],
    allow_medical: false,
    allow_fiscal: false,
    representation_id: null,
    public_title: "",
    expires_at: "",
    purpose: "",
  });
  const reps = representations.filter(
    (r) => r.representative_party_id === form.party_id && r.status === "active",
  );
  return (
    <CareDialog
      title="Preparar convite individual"
      description="Escolha permissões mínimas para esta pessoa e este caso. Nenhuma permissão vem marcada. O convite será um rascunho até a revisão do responsável."
      close={close}
      pending={action.pending}
      disabled={
        !form.scopes.length ||
        (form.access_kind === "accountant" && !form.allow_fiscal)
      }
      submit={async () => {
        if (
          await action.run(
            () =>
              createPortalInvite(props.legalCase.id, {
                ...form,
                email: form.email.trim(),
                expires_at: careTimestamp(form.expires_at),
              }),
            "Rascunho de convite criado",
          )
        )
          close();
      }}
    >
      <LegalField label="Pessoa relacionada ao caso">
        {(id) => (
          <select
            id={id}
            className={selectClassName}
            required
            value={form.party_id}
            onChange={(e) =>
              setForm({
                ...form,
                party_id: e.target.value,
                representation_id: null,
              })
            }
          >
            <option value="">Selecione uma parte</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.party_role}
              </option>
            ))}
          </select>
        )}
      </LegalField>
      <LegalField label="E-mail individual do destinatário">
        {(id) => (
          <Input
            id={id}
            type="email"
            maxLength={254}
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        )}
      </LegalField>
      <LegalField label="Tipo de acesso">
        {(id) => (
          <select
            id={id}
            className={selectClassName}
            value={form.access_kind}
            onChange={(e) =>
              setForm({
                ...form,
                access_kind: e.target.value as CareInviteInput["access_kind"],
                scopes: [],
                allow_medical: false,
                allow_fiscal: false,
                representation_id: null,
              })
            }
          >
            {Object.entries(CARE_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </LegalField>
      {form.access_kind === "representative" && (
        <LegalField
          label="Representação revisada"
          hint="Revise os poderes do portal no painel de representantes antes de aprovar este convite."
        >
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.representation_id ?? ""}
              onChange={(e) =>
                setForm({ ...form, representation_id: e.target.value })
              }
              required
            >
              <option value="">Selecione a representação</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.basis === "power_of_attorney"
                    ? "Procuração"
                    : "Representação"}{" "}
                  · {legalDate(r.valid_from)} · {r.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
        </LegalField>
      )}
      <LegalField
        label="Título que esta pessoa verá no portal"
        hint="Escreva um título claro e adequado ao destinatário. Ele não é copiado do título interno."
      >
        {(id) => (
          <Input
            id={id}
            value={form.public_title}
            maxLength={150}
            required
            onChange={(e) => setForm({ ...form, public_title: e.target.value })}
          />
        )}
      </LegalField>
      <LegalField label="Finalidade deste acesso">
        {(id) => (
          <Textarea
            id={id}
            value={form.purpose}
            maxLength={2000}
            required
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          />
        )}
      </LegalField>
      <LegalField
        label="Acesso válido até"
        hint="Escolha uma data futura de até um ano."
      >
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
      <CareScopeChecklist
        value={form.scopes}
        options={careScopesFor(form.access_kind)}
        change={(scopes) => setForm({ ...form, scopes })}
      />
      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">
          Categorias adicionais
        </legend>
        {form.access_kind !== "accountant" && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allow_medical}
              onChange={(e) =>
                setForm({ ...form, allow_medical: e.target.checked })
              }
            />
            Autorizar conteúdos de saúde que forem liberados individualmente
          </label>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.allow_fiscal}
            onChange={(e) =>
              setForm({ ...form, allow_fiscal: e.target.checked })
            }
          />
          Autorizar conteúdos fiscais que forem liberados individualmente
        </label>
      </fieldset>
    </CareDialog>
  );
}
function InviteReview({
  invite,
  name,
  documents,
  close,
}: {
  invite: CareInvite;
  name: string;
  documents: Awaited<ReturnType<typeof listLegalDocuments>>;
  close(): void;
}) {
  const action = useLegalAction();
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<
    "documented_review" | "verified_channel"
  >("documented_review");
  const [evidence, setEvidence] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return (
    <CareDialog
      title="Revisar identidade, contato e acesso"
      description="A revisão precisa ser feita por uma pessoa do escritório. Abrir um link ou informá-lo ao cliente não comprova o contato."
      close={close}
      pending={action.pending}
      disabled={!confirmed}
      label="Registrar revisão"
      submit={async () => {
        if (
          await action.run(
            () =>
              reviewPortalInvite(invite.id, decision, note, method, evidence),
            "Revisão registrada",
          )
        )
          close();
      }}
    >
      <div className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
        <p className="font-semibold">
          {name} · {CARE_KINDS[invite.access_kind]}
        </p>
        <p className="break-all">{invite.email}</p>
        <p>Título público: {invite.public_title}</p>
        <ul className="list-inside list-disc">
          {invite.scopes.map((s) => (
            <li key={s}>{CARE_SCOPES[s]}</li>
          ))}
        </ul>
        <p>
          Saúde: {invite.allow_medical ? "autorizada" : "sem acesso"} · Fiscal:{" "}
          {invite.allow_fiscal ? "autorizado" : "sem acesso"}
        </p>
        <p>Finalidade: {invite.purpose}</p>
        <p>Validade: {legalDate(invite.expires_at)}</p>
      </div>
      <LegalField label="Como identidade e contato foram conferidos">
        {(id) => (
          <select
            id={id}
            className={selectClassName}
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="documented_review">Revisão documentada</option>
            <option value="verified_channel">
              Canal previamente confirmado
            </option>
          </select>
        )}
      </LegalField>
      <LegalField label="Documento geral que sustenta a conferência">
        {(id) => (
          <select
            id={id}
            className={selectClassName}
            required
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          >
            <option value="">Selecione a evidência</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name}
              </option>
            ))}
          </select>
        )}
      </LegalField>
      <LegalField
        label="Registro da conferência"
        hint="Registre o método e o resultado. Não copie laudos ou informações médicas nesta anotação."
      >
        {(id) => (
          <Textarea
            id={id}
            required
            maxLength={4000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </LegalField>
      <LegalField label="Decisão">
        {(id) => (
          <select
            id={id}
            className={selectClassName}
            value={decision}
            onChange={(e) => setDecision(e.target.value as typeof decision)}
          >
            <option value="approved">Aprovar permissões apresentadas</option>
            <option value="rejected">Não aprovar o convite</option>
          </select>
        )}
      </LegalField>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Conferi a pessoa, o contato, as categorias e todas as permissões
        apresentadas.
      </label>
    </CareDialog>
  );
}
function RepresentationPowers({
  props,
  representations,
  partyName,
  close,
}: {
  props: CareProps;
  representations: Awaited<ReturnType<typeof listLegalRepresentations>>;
  partyName(id: string): string;
  close(): void;
}) {
  const [id, setId] = useState("");
  const [scopes, setScopes] = useState<PortalScope[]>([]);
  const [note, setNote] = useState("");
  const action = useLegalAction();
  return (
    <CareDialog
      title="Revisar poderes para o portal"
      description="Examine a representação e a autorização concreta para cada tipo de acesso. Os poderes não são inferidos da simples existência de procuração."
      close={close}
      pending={action.pending}
      disabled={!scopes.length}
      label="Aprovar poderes examinados"
      submit={async () => {
        if (
          await action.run(
            () => grantPortalRepresentation(id, scopes, note),
            "Poderes do portal revisados",
          )
        )
          close();
      }}
    >
      <LegalField label="Representação">
        {(field) => (
          <select
            id={field}
            className={selectClassName}
            required
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            <option value="">Selecione uma representação vigente</option>
            {representations
              .filter(
                (r) =>
                  r.status === "active" &&
                  Date.parse(r.valid_from) <= Date.now() &&
                  (!r.valid_until || Date.parse(r.valid_until) > Date.now()),
              )
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {partyName(r.representative_party_id)} · {r.id.slice(0, 8)}
                </option>
              ))}
          </select>
        )}
      </LegalField>
      <CareScopeChecklist
        value={scopes}
        options={Object.keys(CARE_SCOPES) as PortalScope[]}
        change={setScopes}
      />
      <LegalField label="Fundamento da revisão dos poderes">
        {(field) => (
          <Textarea
            id={field}
            required
            maxLength={4000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </LegalField>
    </CareDialog>
  );
}
export default CareAccess;
