import { useState } from "react";
import type { LegalCaseDocument } from "@/types/legal";
import type {
  AssistanceKnowledgeInput,
  AssistanceKnowledgeRead,
} from "@/types/legal-assistance";
import { createAssistanceKnowledge } from "@/lib/api/legal-assistance";
import { useLegalAction } from "../legal-ui";
import { assistancePolicyUrl } from "./AssistanceSettingsValidation";
import {
  AssistanceDialog,
  AssistanceNotice,
  AssistanceSelect,
} from "./AssistanceShared";
import {
  AssistanceCatalogCheck,
  AssistanceCatalogText,
} from "./AssistanceKnowledgeFields";

export function AssistanceKnowledgeForm({
  original,
  documents,
  onClose,
}: {
  original?: AssistanceKnowledgeRead["version"];
  documents: LegalCaseDocument[];
  onClose(): void;
}) {
  const action = useLegalAction();
  const [value, setValue] = useState<AssistanceKnowledgeInput>(() => ({
    knowledge_key: original?.knowledge_key ?? "",
    title: original?.title ?? "",
    kind: original?.kind ?? "note",
    source_url: original?.source_url ?? "",
    source_document_id:
      original?.source_document_id &&
      documents.some((doc) => doc.id === original.source_document_id)
        ? original.source_document_id
        : null,
    checked_on: null,
    version_note: "",
    scope: original?.scope ?? "",
    text: original?.text ?? "",
  }));
  const [confirmed, setConfirmed] = useState(false);
  const set = <K extends keyof AssistanceKnowledgeInput>(
    key: K,
    next: AssistanceKnowledgeInput[K],
  ) => setValue((old) => ({ ...old, [key]: next }));
  const sourceAvailable =
    !value.source_document_id ||
    documents.some((doc) => doc.id === value.source_document_id);
  const ready =
    confirmed &&
    sourceAvailable &&
    Boolean(
      value.knowledge_key.trim() &&
      value.title.trim() &&
      value.scope.trim() &&
      value.version_note.trim() &&
      value.text.trim(),
    ) &&
    (!value.source_url?.trim() || assistancePolicyUrl(value.source_url)) &&
    !Object.values(value).some(
      (item) => typeof item === "string" && item.includes("\u0000"),
    );
  async function save() {
    if (!ready) return;
    if (
      await action.run(
        () =>
          createAssistanceKnowledge({
            ...value,
            source_url: value.source_url?.trim() ?? "",
            source_document_id: value.source_document_id || null,
            checked_on: value.checked_on || null,
          }),
        "Rascunho da biblioteca criado",
      )
    )
      onClose();
  }
  return (
    <AssistanceDialog
      title={
        original ? "Nova versão da referência" : "Nova referência da biblioteca"
      }
      description="O texto será um rascunho do escritório. A pesquisa assistida só utiliza versões conferidas e fontes selecionadas pelo usuário."
      onClose={onClose}
      onSubmit={save}
      pending={action.pending}
      disabled={!ready}
    >
      <AssistanceNotice>
        Use conteúdo apropriado à biblioteca do escritório. Documentos médicos e
        fiscais de clientes permanecem nos respectivos casos e não podem ser
        usados como origem documental desta biblioteca.
      </AssistanceNotice>
      {original?.source_document_id && !value.source_document_id && (
        <AssistanceNotice>
          A origem documental anterior não foi copiada. Escolha uma prova geral
          atualmente disponível ou registre a fonte externa adequada.
        </AssistanceNotice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <AssistanceCatalogText
          label="Identificador da referência"
          value={value.knowledge_key}
          onChange={(next) => set("knowledge_key", next)}
          maxLength={80}
          required
          hint="Manter o identificador cria outra versão da mesma referência."
        />
        <AssistanceCatalogText
          label="Título"
          value={value.title}
          onChange={(next) => set("title", next)}
          maxLength={200}
          required
        />
        <AssistanceSelect
          label="Tipo de conteúdo"
          value={value.kind}
          onChange={(next) =>
            set("kind", next as AssistanceKnowledgeInput["kind"])
          }
          required
        >
          <option value="note">Nota técnica</option>
          <option value="template">Modelo de documento</option>
          <option value="jurisprudence">Jurisprudência</option>
        </AssistanceSelect>
        <AssistanceCatalogText
          label="Data de consulta da fonte"
          type="date"
          value={value.checked_on ?? ""}
          onChange={(next) => set("checked_on", next || null)}
        />
      </div>
      <AssistanceCatalogText
        label="Endereço oficial ou editorial da fonte"
        type="url"
        value={value.source_url ?? ""}
        onChange={(next) => set("source_url", next)}
        maxLength={2000}
        hint="HTTPS. Informar o endereço não significa que seu conteúdo foi conferido."
      />
      <AssistanceSelect
        label="Prova documental geral"
        value={value.source_document_id ?? ""}
        onChange={(next) => set("source_document_id", next || null)}
        hint="Somente documentos gerais prontos e autorizados deste caso."
      >
        <option value="">Sem documento vinculado</option>
        {documents.map((doc) => (
          <option key={doc.id} value={doc.id}>
            {doc.display_name}
          </option>
        ))}
      </AssistanceSelect>
      {!sourceAvailable && (
        <AssistanceNotice error>
          A origem perdeu disponibilidade. Selecione novamente antes de salvar.
        </AssistanceNotice>
      )}
      <AssistanceCatalogText
        label="Escopo, condições de uso e limitações"
        value={value.scope}
        onChange={(next) => set("scope", next)}
        multiline
        required
      />
      <AssistanceCatalogText
        label="O que foi conferido ou alterado nesta versão"
        value={value.version_note}
        onChange={(next) => set("version_note", next)}
        multiline
        required
      />
      <AssistanceCatalogText
        label="Texto da referência"
        value={value.text}
        onChange={(next) => set("text", next)}
        multiline
        maxLength={200000}
        required
        hint="Texto simples; marque lacunas e limitações. Não há execução de HTML ou instruções da fonte."
      />
      <AssistanceCatalogCheck
        label="Conferi que este conteúdo pode integrar a biblioteca do escritório"
        checked={confirmed}
        onChange={setConfirmed}
      />
    </AssistanceDialog>
  );
}
