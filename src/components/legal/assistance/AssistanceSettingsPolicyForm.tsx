import { useState } from "react";
import type { LegalCaseDocument } from "@/types/legal";
import type {
  AssistancePolicy,
  AssistancePolicyInput,
} from "@/types/legal-assistance";
import { createAssistancePolicy } from "@/lib/api/legal-assistance";
import { useLegalAction } from "../legal-ui";
import {
  AssistanceDialog,
  AssistanceNotice,
  AssistanceSelect,
} from "./AssistanceShared";
import {
  AssistanceCatalogCheck,
  AssistanceCatalogText,
} from "./AssistanceKnowledgeFields";
import {
  assistancePolicyDecimal,
  assistancePolicyUrl,
} from "./AssistanceSettingsValidation";

export function AssistanceSettingsPolicyForm({
  original,
  documents,
  onClose,
}: {
  original?: AssistancePolicy;
  documents: LegalCaseDocument[];
  onClose(): void;
}) {
  const action = useLegalAction();
  const [value, setValue] = useState(() => ({
    policy_key: original?.policy_key ?? "",
    title: original?.title ?? "",
    model: original?.model ?? "",
    purpose_note: original?.purpose_note ?? "",
    retention_note: original?.retention_note ?? "",
    source_document_id:
      original?.source_document_id &&
      documents.some((doc) => doc.id === original.source_document_id)
        ? original.source_document_id
        : "",
    source_url: original?.source_url ?? "",
    checked_on: "",
    valid_from: original?.valid_from ?? "",
    valid_until: original?.valid_until ?? "",
    allow_medical: false,
    allow_fiscal: false,
    input_rate: original?.input_rate ?? "",
    output_rate: original?.output_rate ?? "",
    monthly_budget: original?.monthly_budget ?? "",
    max_input_tokens: original ? String(original.max_input_tokens) : "",
    max_output_tokens: original ? String(original.max_output_tokens) : "",
  }));
  const [confirmed, setConfirmed] = useState(false);
  const set = <K extends keyof typeof value>(key: K, next: (typeof value)[K]) =>
    setValue((old) => ({ ...old, [key]: next }));
  const inputRate = assistancePolicyDecimal(value.input_rate, 8, 6),
    outputRate = assistancePolicyDecimal(value.output_rate, 8, 6),
    budget = assistancePolicyDecimal(value.monthly_budget, 6, 9);
  const inputTokens = /^[0-9]{3,5}$/.test(value.max_input_tokens)
    ? Number(value.max_input_tokens)
    : 0;
  const outputTokens = /^[0-9]{3,4}$/.test(value.max_output_tokens)
    ? Number(value.max_output_tokens)
    : 0;
  const ready =
    confirmed &&
    inputRate &&
    outputRate &&
    budget &&
    inputTokens >= 256 &&
    inputTokens <= 50000 &&
    outputTokens >= 256 &&
    outputTokens <= 4000 &&
    value.policy_key.trim() &&
    value.title.trim() &&
    /^[a-zA-Z0-9._:-]{1,150}$/.test(value.model) &&
    value.purpose_note.trim() &&
    value.retention_note.trim() &&
    value.valid_from &&
    value.valid_until &&
    value.valid_from <= value.valid_until &&
    assistancePolicyUrl(value.source_url) &&
    (!value.source_document_id ||
      documents.some((doc) => doc.id === value.source_document_id));
  async function save() {
    if (!ready || !inputRate || !outputRate || !budget) return;
    const payload: AssistancePolicyInput = {
      ...value,
      source_document_id: value.source_document_id || null,
      checked_on: value.checked_on || null,
      currency: "USD",
      rate_unit: "per_million_tokens",
      input_rate: inputRate,
      output_rate: outputRate,
      monthly_budget: budget,
      max_input_tokens: inputTokens,
      max_output_tokens: outputTokens,
    };
    if (
      await action.run(
        () => createAssistancePolicy(payload),
        "Rascunho da política criado",
      )
    )
      onClose();
  }
  return (
    <AssistanceDialog
      title={original ? "Nova versão da política de IA" : "Nova política de IA"}
      description="Registre a finalidade, os limites, a retenção e as tarifas conferidas. Salvar não aprova nem habilita o provedor."
      onClose={onClose}
      onSubmit={save}
      pending={action.pending}
      disabled={!ready}
    >
      <AssistanceNotice>
        Não há modelo ou preço presumido. Informe as condições do provedor
        contratado e a política do escritório. Desabilitar armazenamento na
        requisição não garante retenção zero pelo provedor.
      </AssistanceNotice>
      <div className="grid gap-4 sm:grid-cols-2">
        <AssistanceCatalogText
          label="Identificador da política"
          value={value.policy_key}
          onChange={(next) => set("policy_key", next)}
          maxLength={80}
          required
        />
        <AssistanceCatalogText
          label="Título da política"
          value={value.title}
          onChange={(next) => set("title", next)}
          maxLength={200}
          required
        />
        <AssistanceCatalogText
          label="Identificador exato do modelo"
          value={value.model}
          onChange={(next) => set("model", next)}
          maxLength={150}
          required
          hint="Deve corresponder ao modelo configurado no servidor."
        />
        <AssistanceCatalogText
          label="Data de consulta das condições"
          type="date"
          value={value.checked_on}
          onChange={(next) => set("checked_on", next)}
        />
        <AssistanceCatalogText
          label="Vigência inicial"
          type="date"
          value={value.valid_from}
          onChange={(next) => set("valid_from", next)}
          required
        />
        <AssistanceCatalogText
          label="Vigência final"
          type="date"
          value={value.valid_until}
          onChange={(next) => set("valid_until", next)}
          required
        />
      </div>
      <AssistanceCatalogText
        label="Finalidade permitida e restrições de uso"
        value={value.purpose_note}
        onChange={(next) => set("purpose_note", next)}
        multiline
        required
      />
      <AssistanceCatalogText
        label="Retenção, tratamento e condições do provedor"
        value={value.retention_note}
        onChange={(next) => set("retention_note", next)}
        multiline
        required
      />
      <AssistanceCatalogText
        label="Fonte das condições e tarifas"
        type="url"
        value={value.source_url}
        onChange={(next) => set("source_url", next)}
        maxLength={2000}
        required
      />
      <AssistanceSelect
        label="Prova geral da política"
        value={value.source_document_id}
        onChange={(next) => set("source_document_id", next)}
        hint="Documento geral pronto. A aprovação exige prova e consulta documentadas."
      >
        <option value="">Prova ainda não vinculada</option>
        {documents.map((doc) => (
          <option key={doc.id} value={doc.id}>
            {doc.display_name}
          </option>
        ))}
      </AssistanceSelect>
      {original?.source_document_id && !value.source_document_id && (
        <AssistanceNotice>
          A prova anterior não foi copiada porque não está disponível nesta
          seleção. Vincule uma prova geral atual antes da aprovação.
        </AssistanceNotice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <AssistanceCatalogText
          label="Tarifa de entrada — USD por milhão de tokens"
          value={value.input_rate}
          onChange={(next) => set("input_rate", next)}
          maxLength={16}
          required
          hint="Decimal positivo, até 8 casas; sem separador de milhares."
        />
        <AssistanceCatalogText
          label="Tarifa de saída — USD por milhão de tokens"
          value={value.output_rate}
          onChange={(next) => set("output_rate", next)}
          maxLength={16}
          required
        />
        <AssistanceCatalogText
          label="Limite mensal — USD"
          value={value.monthly_budget}
          onChange={(next) => set("monthly_budget", next)}
          maxLength={17}
          required
          hint="Até 6 casas decimais. Reservas e consumo incerto também ocupam o limite."
        />
        <AssistanceCatalogText
          label="Máximo de tokens de entrada por solicitação"
          value={value.max_input_tokens}
          onChange={(next) => set("max_input_tokens", next)}
          maxLength={5}
          required
          hint="De 256 a 50.000."
        />
        <AssistanceCatalogText
          label="Máximo de tokens de saída por solicitação"
          value={value.max_output_tokens}
          onChange={(next) => set("max_output_tokens", next)}
          maxLength={4}
          required
          hint="De 256 a 4.000."
        />
      </div>
      <AssistanceCatalogCheck
        label="Esta política admite envio de dados de saúde ao provedor, dentro das condições registradas"
        checked={value.allow_medical}
        onChange={(next) => set("allow_medical", next)}
      />
      <AssistanceCatalogCheck
        label="Esta política admite envio de dados fiscais ao provedor, dentro das condições registradas"
        checked={value.allow_fiscal}
        onChange={(next) => set("allow_fiscal", next)}
      />
      <AssistanceCatalogCheck
        label="Conferi as tarifas e os limites propostos; esta versão será salva para revisão"
        checked={confirmed}
        onChange={setConfirmed}
      />
    </AssistanceDialog>
  );
}
