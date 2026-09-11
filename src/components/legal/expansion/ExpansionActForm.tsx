import { ACT_KIND_LABELS, ACT_CHECK_LABELS } from "./expansion-labels";
import { useExpansionSources, expansionCompatible } from "./expansion-sources";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createExternalAct,
  listExpansionInstrumentOptions,
  listExpansionRepresentationOptions,
  readSuccession,
} from "@/lib/api/legal-expansion";
import { listLegalParties } from "@/lib/api/legal";
import type {
  ExpansionAct,
  ExpansionActInput,
  ExpansionActChecks,
  ExpansionCategory,
} from "@/types/legal-expansion";
import { useLegalAction } from "../legal-ui";
import {
  ExpansionDialog,
  ExpansionSelect,
  ExpansionCategoryField,
  ExpansionNotice,
} from "./ExpansionShared";
import {
  ExpansionCheck,
  ExpansionText,
  ExpansionDocumentField,
  ExpansionDocuments,
} from "./ExpansionFields";
import { useExpansionList } from "./expansion-hooks";
import {
  expansionCaseAccess,
  expansionCategoryAccess,
  expansionKey,
  type ExpansionProps,
} from "./expansion-ui";
const blankChecks = (): ExpansionActChecks => ({
  documents_complete: false,
  recipient_verified: false,
  representation_reviewed: false,
  signature_checked: false,
  channel_authorized: false,
  legal_consequences_reviewed: false,
});
export default function ExpansionActForm({
  props,
  previous,
  onClose,
}: {
  props: ExpansionProps;
  previous?: ExpansionAct;
  onClose(): void;
}) {
  const action = useLegalAction(),
    sources = useExpansionSources(props),
    coverage = useExpansionList(props, "coverages");
  const [form, setForm] = useState<ExpansionActInput>(() =>
    previous
      ? {
          act_key: previous.act_key,
          previous_version_id: previous.id,
          category: previous.category,
          title: previous.title,
          act_kind: previous.act_kind,
          proceeding_id: previous.proceeding_id,
          coverage_version_id: previous.coverage_version_id,
          recipient: previous.recipient,
          channel: previous.channel,
          representation_id: previous.representation_id,
          succession_authority_id: previous.succession_authority_id,
          instrument_version_id: previous.instrument_version_id,
          final_document_id: previous.final_document_id,
          signature_evidence_document_id:
            previous.signature_evidence_document_id,
          source_document_ids: previous.source_document_ids,
          purpose: previous.purpose,
          authority_basis: previous.authority_basis,
          checks: blankChecks(),
        }
      : {
          act_key: "",
          category: "restricted",
          title: "",
          act_kind: "other",
          recipient: "",
          channel: "",
          purpose: "",
          authority_basis: "",
          source_document_ids: [],
          checks: blankChecks(),
        },
  );
  const [successionId, setSuccessionId] = useState("");
  const allowed =
      expansionCaseAccess(props) &&
      expansionCategoryAccess(props, form.category),
    dual = expansionCategoryAccess(props, "restricted");
  const representations = useQuery({
      queryKey: expansionKey(props, "representation-options"),
      queryFn: () => listExpansionRepresentationOptions(props.legalCase.id),
      enabled: allowed,
      retry: false,
    }),
    instruments = useQuery({
      queryKey: expansionKey(props, "instrument-options"),
      queryFn: () => listExpansionInstrumentOptions(props.legalCase.id),
      enabled: allowed,
      retry: false,
    }),
    parties = useQuery({
      queryKey: expansionKey(props, "party-options"),
      queryFn: () => listLegalParties(props.legalCase.id),
      enabled: allowed,
      retry: false,
    });
  const succession = useExpansionList(props, "succession", dual);
  const authority = useQuery({
    queryKey: expansionKey(
      props,
      "succession-authority-options-" + successionId,
    ),
    queryFn: ({ signal }) => readSuccession(successionId, signal),
    enabled: allowed && dual && Boolean(successionId),
    retry: false,
    gcTime: 0,
    refetchInterval: 15000,
  });
  const docs = sources.docs.filter((d) =>
    expansionCompatible(form.category, d.category),
  );
  const set = <K extends keyof ExpansionActInput>(
    k: K,
    v: ExpansionActInput[K],
  ) => setForm((o) => ({ ...o, [k]: v }));
  const docIds = [
    ...form.source_document_ids,
    form.final_document_id,
    form.signature_evidence_document_id,
  ].filter((v): v is string => Boolean(v));
  const missingSelection = docIds.some((id) => !docs.some((d) => d.id === id));
  if (
    !props.context.can_edit ||
    !expansionCaseAccess(props) ||
    (previous && !allowed)
  )
    return null;
  return (
    <ExpansionDialog
      title={previous ? "Nova versão do ato" : "Preparar ato"}
      description="Prepare documentos, destinatário e poderes. Salvar ou revisar não transmite o ato nem registra ciência."
      onClose={onClose}
      pending={action.pending}
      disabled={!allowed || missingSelection}
      onSubmit={() =>
        action.run(async () => {
          await createExternalAct(props.legalCase.id, form);
          onClose();
        }, "Ato preparado como rascunho")
      }
    >
      <ExpansionNotice>
        Os campos de assinatura, poderes e canal são conferidos separadamente.
        Não há envio judicial habilitado nesta etapa.
      </ExpansionNotice>
      <div className="grid gap-4 sm:grid-cols-2">
        <ExpansionText
          label="Identificador do ato"
          value={form.act_key}
          onChange={(v) => set("act_key", v)}
          required
          disabled={Boolean(previous)}
        />
        <ExpansionText
          label="Título interno do ato"
          value={form.title}
          onChange={(v) => set("title", v)}
          required
        />
        <ExpansionSelect
          label="Tipo de ato"
          value={form.act_kind}
          onChange={(v) => set("act_kind", v as ExpansionActInput["act_kind"])}
        >
          {Object.entries(ACT_KIND_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </ExpansionSelect>
        <ExpansionCategoryField
          props={props}
          value={form.category}
          onChange={(v) => set("category", v as ExpansionCategory)}
          disabled={Boolean(previous)}
        />
        <ExpansionText
          label="Destinatário exato"
          value={form.recipient}
          onChange={(v) => set("recipient", v)}
          required
        />
        <ExpansionText
          label="Canal do ato"
          value={form.channel}
          onChange={(v) => set("channel", v)}
          required
        />
        <ExpansionSelect
          label="Processo vinculado"
          value={form.proceeding_id ?? ""}
          onChange={(v) => set("proceeding_id", v || null)}
        >
          <option value="">Sem processo selecionado</option>
          {sources.proceedings.map((p) => (
            <option key={p.id} value={p.id}>
              {p.cnj_number} · {p.court}
            </option>
          ))}
        </ExpansionSelect>
        <ExpansionSelect
          label="Versão da cobertura institucional"
          value={form.coverage_version_id ?? ""}
          onChange={(v) => set("coverage_version_id", v || null)}
        >
          <option value="">Ainda não selecionada</option>
          {coverage.rows
            .filter((c) => c.state === "reviewed")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} · versão {c.version_number}
              </option>
            ))}
        </ExpansionSelect>
      </div>
      {allowed ? (
        <>
          <ExpansionText
            label="Finalidade e limites do ato"
            value={form.purpose}
            onChange={(v) => set("purpose", v)}
            required
            multiline
            maxLength={4000}
          />
          <ExpansionText
            label="Fundamento dos poderes para esta operação"
            value={form.authority_basis}
            onChange={(v) => set("authority_basis", v)}
            required
            multiline
            maxLength={4000}
          />
          <details className="space-y-4 rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">
              Representação e instrumento
            </summary>
            <ExpansionNotice>
              Uma representação para coleta documental não comprova poderes de
              peticionar, dar ciência ou receber valores. Registre a conferência
              específica.
            </ExpansionNotice>
            <ExpansionSelect
              label="Representação documental de origem"
              value={form.representation_id ?? ""}
              onChange={(v) => set("representation_id", v || null)}
            >
              <option value="">Não selecionada</option>
              {!representations.isError &&
                (representations.data ?? [])
                  .filter(
                    (r) =>
                      expansionCategoryAccess(props, r.category) &&
                      expansionCompatible(form.category, r.category),
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {parties.data?.find(
                        (p) => p.id === r.representative_party_id,
                      )?.name ?? "Representante autorizado"}{" "}
                      · {r.status === "active" ? "ativa" : r.status}
                    </option>
                  ))}
            </ExpansionSelect>
            <ExpansionSelect
              label="Versão aprovada do instrumento"
              value={form.instrument_version_id ?? ""}
              onChange={(v) => set("instrument_version_id", v || null)}
            >
              <option value="">Não selecionada</option>
              {!instruments.isError &&
                (instruments.data ?? [])
                  .filter(
                    (i) =>
                      expansionCategoryAccess(props, i.category) &&
                      expansionCompatible(form.category, i.category),
                  )
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title} · versão {i.version_number}
                    </option>
                  ))}
            </ExpansionSelect>
            {dual && form.category === "restricted" && (
              <>
                <ExpansionSelect
                  label="Dossiê sucessório para examinar poderes"
                  value={successionId}
                  onChange={setSuccessionId}
                >
                  <option value="">Nenhum dossiê selecionado</option>
                  {succession.rows.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} · versão {s.version_number}
                    </option>
                  ))}
                </ExpansionSelect>
                <ExpansionSelect
                  label="Conferência de poder sucessório"
                  value={form.succession_authority_id ?? ""}
                  onChange={(v) => set("succession_authority_id", v || null)}
                >
                  <option value="">Nenhuma selecionada</option>
                  {!authority.isError &&
                    authority.data?.is_current &&
                    authority.data.authorities
                      .filter(
                        (a) =>
                          a.decision === "reviewed" && a.is_current === true,
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.scope_note}
                        </option>
                      ))}
                </ExpansionSelect>
              </>
            )}
          </details>
          <div className="grid gap-4 sm:grid-cols-2">
            <ExpansionDocumentField
              label="Arquivo final do ato"
              docs={docs}
              value={form.final_document_id ?? ""}
              onChange={(v) => set("final_document_id", v || null)}
            />
            <ExpansionDocumentField
              label="Prova da assinatura"
              docs={docs}
              value={form.signature_evidence_document_id ?? ""}
              onChange={(v) => set("signature_evidence_document_id", v || null)}
            />
          </div>
          <ExpansionDocuments
            label="Provas e documentos de origem"
            docs={docs}
            values={form.source_document_ids}
            onChange={(v) => set("source_document_ids", v)}
          />
          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 font-medium">
              Conferências explícitas do preparo
            </legend>
            {Object.entries(ACT_CHECK_LABELS).map(([key, label]) => (
              <ExpansionCheck
                key={key}
                label={label}
                checked={form.checks[key as keyof ExpansionActChecks]}
                onChange={(v) => set("checks", { ...form.checks, [key]: v })}
              />
            ))}
          </fieldset>
          {missingSelection && (
            <ExpansionNotice error>
              Um documento selecionado não está disponível na categoria atual.
              Reexamine a seleção.
            </ExpansionNotice>
          )}
        </>
      ) : (
        <ExpansionNotice>
          Selecione uma categoria autorizada para preparar o conteúdo.
        </ExpansionNotice>
      )}
    </ExpansionDialog>
  );
}
