import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments } from "@/lib/api/legal";
import { listLegalAppointments } from "@/lib/api/legal-operations";
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
import { createPortalPublication, reviewPortalPublication } from "./api";
import type {
  CarePublication,
  CarePublicationInput,
  PortalCategory,
} from "./types";
const KINDS = {
  summary: "Resumo do atendimento",
  update: "Atualização",
  agenda: "Compromisso na agenda",
};
export function CarePublications(props: CareProps) {
  const [draft, setDraft] = useState<CarePublication | "new" | null>(null);
  const [review, setReview] = useState<{
    row: CarePublication;
    decision: "approved" | "revoked";
  } | null>(null);
  const action = useLegalAction();
  const rows = props.context.publications.filter((p) =>
    careCategoryAllowed(props, p.category),
  );
  return (
    <OperationPanel
      title="Publicações e agenda do cliente"
      description="Prepare textos próprios para cada destinatário. Atualizações, resumos e compromissos só aparecem no portal após revisão; nenhuma mudança interna publica conteúdo automaticamente."
      actions={
        props.canEdit && (
          <Button size="sm" onClick={() => setDraft("new")}>
            Preparar publicação
          </Button>
        )
      }
    >
      {rows.length ? (
        rows.map((row) => (
          <article className="space-y-3 rounded-lg border p-4" key={row.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="break-words font-semibold">{row.title}</h3>
              <Badge variant="secondary">{CARE_STATES[row.state]}</Badge>
            </div>
            <p className="break-words text-xs text-muted-foreground">
              {KINDS[row.publication_kind]} ·{" "}
              {DOCUMENT_CATEGORIES[row.category]} ·{" "}
              {careMemberLabel(
                props.context.memberships.find(
                  (m) => m.id === row.membership_id,
                ),
              )}
            </p>
            {row.publication_kind === "agenda" && (
              <p className="text-sm font-medium">
                {legalDate(row.starts_at)} até {legalDate(row.ends_at)}
              </p>
            )}
            <p className="whitespace-pre-wrap break-words text-sm">
              {row.body}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.source_document_ids.length} documento(s) de origem · Criado
              em {legalDate(row.created_at)}
              {row.previous_version_id &&
                " · Nova versão de publicação anterior"}
            </p>
            {row.review_note && (
              <p className="whitespace-pre-wrap break-words text-sm">
                Revisão: {row.review_note}
              </p>
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
                  Revisar e publicar
                </Button>
              )}
              {careOwner(props) &&
                ["draft", "approved"].includes(row.state) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setReview({ row, decision: "revoked" })}
                  >
                    Retirar publicação
                  </Button>
                )}
            </div>
          </article>
        ))
      ) : (
        <LegalEmpty title="Nenhuma publicação preparada" />
      )}
      {draft &&
        props.canEdit &&
        (draft === "new" || careCategoryAllowed(props, draft.category)) && (
          <PublicationDialog
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
            onClose={() => setReview(null)}
            title={
              review.decision === "approved"
                ? "Revisar e publicar conteúdo"
                : "Retirar publicação do portal"
            }
            description={
              review.decision === "approved"
                ? `O texto “${review.row.title}” ficará visível exclusivamente para ${careMemberLabel(props.context.memberships.find((m) => m.id === review.row.membership_id))}. Confira o conteúdo integral, a categoria e a finalidade.`
                : "A publicação deixa de aparecer no portal. O histórico da versão e da revisão permanece no caso."
            }
            pending={action.pending}
            actionLabel={
              review.decision === "approved"
                ? "Aprovar e publicar"
                : "Retirar do portal"
            }
            onSave={(note) =>
              action.run(
                () =>
                  reviewPortalPublication(review.row.id, review.decision, note),
                review.decision === "approved"
                  ? "Publicação revisada e liberada"
                  : "Publicação retirada",
              )
            }
          />
        )}
    </OperationPanel>
  );
}
function PublicationDialog({
  props,
  previous,
  close,
}: {
  props: CareProps;
  previous?: CarePublication;
  close(): void;
}) {
  const action = useLegalAction();
  const [form, setForm] = useState<CarePublicationInput>({
    membership_id: previous?.membership_id ?? "",
    category: previous?.category ?? "general",
    publication_kind: previous?.publication_kind ?? "update",
    title: previous?.title ?? "",
    body: previous?.body ?? "",
    source_document_ids: previous?.source_document_ids ?? [],
    source_appointment_id: previous?.source_appointment_id ?? null,
    starts_at: careLocalDateTime(previous?.starts_at ?? null),
    ends_at: careLocalDateTime(previous?.ends_at ?? null),
    previous_version_id: previous?.id ?? null,
  });
  const documents = useQuery({
    queryKey: careKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
  });
  const appointments = useQuery({
    queryKey: careKey(props, "appointments"),
    queryFn: () => listLegalAppointments(props.legalCase.id),
  });
  const scope =
    form.publication_kind === "agenda" ? "agenda:read" : "case_summary:read";
  const members = props.context.memberships.filter(
    (m) =>
      m.state === "active" &&
      m.scopes.includes(scope) &&
      m.access_kind !== "accountant",
  );
  const member = members.find((m) => m.id === form.membership_id);
  const categories = (
    Object.keys(DOCUMENT_CATEGORIES) as PortalCategory[]
  ).filter((c) => careCategoryAllowed(props, c) && careMemberAllows(member, c));
  const docs = (documents.data ?? []).filter(
    (d) =>
      d.category === form.category && careCategoryAllowed(props, d.category),
  );
  return (
    <CareDialog
      title={
        previous ? "Preparar nova versão pública" : "Preparar conteúdo público"
      }
      description="Escreva a mensagem que será vista pelo destinatário. Não copie estratégia, laudos ou informações fiscais para uma categoria geral."
      close={close}
      pending={action.pending}
      disabled={!member || !categories.includes(form.category)}
      submit={async () => {
        if (
          await action.run(
            () =>
              createPortalPublication(props.legalCase.id, {
                ...form,
                source_document_ids: form.source_document_ids.filter((id) =>
                  docs.some((d) => d.id === id),
                ),
                starts_at:
                  form.publication_kind === "agenda" && form.starts_at
                    ? careTimestamp(form.starts_at)
                    : null,
                ends_at:
                  form.publication_kind === "agenda" && form.ends_at
                    ? careTimestamp(form.ends_at)
                    : null,
              }),
            "Versão pública preparada para revisão",
          )
        )
          close();
      }}
    >
      <fieldset disabled={Boolean(previous)} className="space-y-4">
        <LegalField label="Tipo de publicação">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.publication_kind}
              onChange={(e) =>
                setForm({
                  ...form,
                  publication_kind: e.target
                    .value as CarePublicationInput["publication_kind"],
                  membership_id: "",
                  source_document_ids: [],
                })
              }
            >
              {Object.entries(KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        <CareMemberField
          members={members}
          value={form.membership_id}
          change={(membership_id) =>
            setForm({ ...form, membership_id, source_document_ids: [] })
          }
        />
        <CareCategoryField
          value={form.category}
          categories={categories}
          change={(category) =>
            setForm({ ...form, category, source_document_ids: [] })
          }
        />
      </fieldset>
      <LegalField label="Título público">
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
      <LegalField label="Texto completo que o destinatário verá">
        {(id) => (
          <Textarea
            id={id}
            required
            maxLength={12000}
            rows={6}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        )}
      </LegalField>
      {form.publication_kind === "agenda" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <LegalField label="Início do compromisso">
              {(id) => (
                <Input
                  id={id}
                  required
                  type="datetime-local"
                  value={form.starts_at ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, starts_at: e.target.value })
                  }
                />
              )}
            </LegalField>
            <LegalField label="Fim do compromisso">
              {(id) => (
                <Input
                  id={id}
                  required
                  type="datetime-local"
                  value={form.ends_at ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, ends_at: e.target.value })
                  }
                />
              )}
            </LegalField>
          </div>
          <LegalField
            label="Compromisso interno de origem (opcional)"
            hint="Somente o texto e os horários apresentados acima serão publicados."
          >
            {(id) => (
              <select
                id={id}
                className={selectClassName}
                value={form.source_appointment_id ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    source_appointment_id: e.target.value || null,
                  })
                }
              >
                <option value="">Sem vínculo</option>
                {appointments.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} · {legalDate(a.starts_at)}
                  </option>
                ))}
              </select>
            )}
          </LegalField>
        </>
      )}
      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">
          Documentos de origem da mesma categoria (opcional)
        </legend>
        {docs.length ? (
          docs.map((d) => (
            <label key={d.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.source_document_ids.includes(d.id)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    source_document_ids: e.target.checked
                      ? [...form.source_document_ids, d.id]
                      : form.source_document_ids.filter((id) => id !== d.id),
                  })
                }
              />
              <span>{d.display_name}</span>
            </label>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            Nenhum documento disponível nesta categoria.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Vincular a origem não libera o arquivo. O download exige aprovação
          própria no painel de documentos.
        </p>
      </fieldset>
    </CareDialog>
  );
}
export default CarePublications;
