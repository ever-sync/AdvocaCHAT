import { useExpansionSources, expansionCompatible } from "./expansion-sources";
import { useState } from "react";
import { createDiligence } from "@/lib/api/legal-expansion";
import type {
  ExpansionDiligence,
  ExpansionDiligenceInput,
} from "@/types/legal-expansion";
import { useLegalAction } from "../legal-ui";
import {
  ExpansionDialog,
  ExpansionCategoryField,
  ExpansionSelect,
  ExpansionNotice,
} from "./ExpansionShared";
import { ExpansionText, ExpansionDocuments } from "./ExpansionFields";
import {
  expansionCaseAccess,
  expansionCategoryAccess,
  type ExpansionProps,
} from "./expansion-ui";
function localInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
}
export default function ExpansionDiligenceForm({
  props,
  previous,
  onClose,
}: {
  props: ExpansionProps;
  previous?: ExpansionDiligence;
  onClose(): void;
}) {
  const action = useLegalAction(),
    sources = useExpansionSources(props);
  const [form, setForm] = useState<ExpansionDiligenceInput>(() =>
    previous
      ? {
          diligence_key: previous.diligence_key,
          previous_version_id: previous.id,
          category: previous.category,
          title: previous.title,
          instructions: previous.instructions,
          proceeding_id: previous.proceeding_id,
          supervisor_id: previous.supervisor_id,
          substitute_id: previous.substitute_id,
          due_at: previous.due_at,
          expires_at: previous.expires_at,
          source_document_ids: previous.source_document_ids,
        }
      : {
          diligence_key: "",
          category: "restricted",
          title: "",
          instructions: "",
          supervisor_id: "",
          expires_at: "",
          source_document_ids: [],
        },
  );
  const [due, setDue] = useState(localInput(previous?.due_at)),
    [expires, setExpires] = useState(localInput(previous?.expires_at));
  const set = <K extends keyof ExpansionDiligenceInput>(
    k: K,
    v: ExpansionDiligenceInput[K],
  ) => setForm((o) => ({ ...o, [k]: v }));
  const allowed = expansionCategoryAccess(props, form.category);
  const docs = sources.docs.filter((d) =>
    expansionCompatible(form.category, d.category),
  );
  const users = props.workspace.collaborators.filter(
    (p) =>
      p.id === props.legalCase.owner_id ||
      props.members?.some(
        (m) =>
          m.profile_id === p.id &&
          m.can_edit &&
          (form.category === "general" ||
            (form.category === "medical" && m.can_view_medical) ||
            (form.category === "fiscal" && m.can_view_fiscal) ||
            (form.category === "restricted" &&
              m.can_view_medical &&
              m.can_view_fiscal)),
      ),
  );
  const unavailable = form.source_document_ids.some(
    (id) => !docs.some((d) => d.id === id),
  );
  if (
    !props.context.can_edit ||
    !expansionCaseAccess(props) ||
    (previous && !allowed)
  )
    return null;
  return (
    <ExpansionDialog
      title={previous ? "Nova versão da diligência" : "Preparar diligência"}
      description="Defina instruções, supervisão, expiração e arquivos individuais. A aprovação e a identidade do destinatário serão conferidas separadamente."
      onClose={onClose}
      pending={action.pending}
      disabled={
        !allowed ||
        unavailable ||
        !users.some((u) => u.id === form.supervisor_id)
      }
      onSubmit={() =>
        action.run(async () => {
          const expiry = new Date(expires),
            dueDate = due ? new Date(due) : null;
          if (
            Number.isNaN(expiry.getTime()) ||
            (dueDate && Number.isNaN(dueDate.getTime()))
          )
            throw new Error("Confira os horários informados.");
          await createDiligence(props.legalCase.id, {
            ...form,
            expires_at: expiry.toISOString(),
            due_at: dueDate?.toISOString() ?? null,
          });
          onClose();
        }, "Diligência preparada para revisão")
      }
    >
      <ExpansionNotice>
        O correspondente verá apenas as instruções e os arquivos aprovados desta
        diligência. Entregar um documento não conclui um ato judicial nem
        movimenta valores.
      </ExpansionNotice>
      <div className="grid gap-4 sm:grid-cols-2">
        <ExpansionText
          label="Identificador da diligência"
          maxLength={80}
          value={form.diligence_key}
          onChange={(v) => set("diligence_key", v)}
          disabled={Boolean(previous)}
          required
        />
        <ExpansionText
          label="Título apresentado ao correspondente"
          value={form.title}
          onChange={(v) => set("title", v)}
          required
        />
        <ExpansionCategoryField
          props={props}
          value={form.category}
          onChange={(v) => set("category", v)}
          disabled={Boolean(previous)}
        />
        <ExpansionSelect
          label="Processo relacionado"
          value={form.proceeding_id ?? ""}
          onChange={(v) => set("proceeding_id", v || null)}
        >
          <option value="">Sem processo selecionado</option>
          {sources.proceedings.map((p) => (
            <option value={p.id} key={p.id}>
              {p.cnj_number} · {p.court}
            </option>
          ))}
        </ExpansionSelect>
        <ExpansionSelect
          label="Supervisor interno"
          value={form.supervisor_id}
          onChange={(v) => set("supervisor_id", v)}
          required
        >
          <option value="">Selecione o responsável</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </ExpansionSelect>
        <ExpansionSelect
          label="Substituto interno"
          value={form.substitute_id ?? ""}
          onChange={(v) => set("substitute_id", v || null)}
        >
          <option value="">Sem substituto</option>
          {users
            .filter((u) => u.id !== form.supervisor_id)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
        </ExpansionSelect>
        <ExpansionText
          label="Data e hora operacionais da entrega"
          type="datetime-local"
          value={due}
          onChange={setDue}
          hint={
            "Horário de " +
            Intl.DateTimeFormat().resolvedOptions().timeZone +
            ". Não é prazo judicial calculado."
          }
        />
        <ExpansionText
          label="Expiração do acesso externo"
          type="datetime-local"
          value={expires}
          onChange={setExpires}
          required
          hint="O acesso expira mesmo sem execução de rotinas de encerramento."
        />
      </div>
      {allowed && (
        <>
          <ExpansionText
            label="Instruções específicas ao correspondente"
            value={form.instructions}
            onChange={(v) => set("instructions", v)}
            required
            multiline
            maxLength={12000}
          />
          <ExpansionDocuments
            label="Arquivos individuais para liberar"
            docs={docs}
            values={form.source_document_ids}
            onChange={(v) => set("source_document_ids", v)}
          />
        </>
      )}
    </ExpansionDialog>
  );
}
