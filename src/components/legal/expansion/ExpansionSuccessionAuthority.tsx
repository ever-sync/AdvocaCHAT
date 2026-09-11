import { useState } from "react";
import type { LegalCaseDocument, LegalCaseParty } from "@/types/legal";
import type { LegalRepresentation } from "@/types/legal-ir";
import { localDateTime } from "../legal-ui";
import { AssistanceDialog } from "../assistance/AssistanceShared";
import { LegalField } from "../LegalShared";
import { Input } from "@/components/ui/input";
import {
  SuccessionCheck,
  SuccessionEvidence,
  SuccessionNotice,
  SuccessionSelect,
  SuccessionText,
} from "./ExpansionSuccessionFields";

export interface SuccessionAuthorityInput {
  person_id: string;
  representation_id: string | null;
  operation:
    | "document_collection"
    | "portal_access"
    | "administrative_representation"
    | "judicial_representation"
    | "payment_request";
  evidence_document_ids: string[];
  basis_note: string;
  scope_note: string;
  valid_from: string | null;
  valid_until: string | null;
  decision: "reviewed" | "insufficient";
}
export function ExpansionSuccessionAuthority({
  persons,
  parties,
  representations,
  documents,
  pending,
  onSave,
  onClose,
}: {
  persons: { id: string; party_id: string }[];
  parties: LegalCaseParty[];
  representations: LegalRepresentation[];
  documents: LegalCaseDocument[];
  pending: boolean;
  onSave(value: SuccessionAuthorityInput): Promise<void>;
  onClose(): void;
}) {
  const [value, setValue] = useState<SuccessionAuthorityInput>({
    person_id: "",
    representation_id: null,
    operation: "document_collection",
    evidence_document_ids: [],
    basis_note: "",
    scope_note: "",
    valid_from: null,
    valid_until: null,
    decision: "insufficient",
  });
  const [confirmed, setConfirmed] = useState(false);
  const set = <K extends keyof SuccessionAuthorityInput>(
    key: K,
    next: SuccessionAuthorityInput[K],
  ) => {
    setValue((old) => ({ ...old, [key]: next }));
    setConfirmed(false);
  };
  const person = persons.find((entry) => entry.id === value.person_id);
  const available = representations.filter(
    (representation) =>
      representation.representative_party_id === person?.party_id,
  );
  const referencesValid =
    Boolean(person) &&
    (!value.representation_id ||
      available.some(
        (representation) => representation.id === value.representation_id,
      )) &&
    value.evidence_document_ids.every((id) =>
      documents.some((document) => document.id === id),
    );
  const complete = Boolean(
    value.representation_id &&
    value.valid_from &&
    value.valid_until &&
    new Date(value.valid_from).getTime() <
      new Date(value.valid_until).getTime() &&
    value.evidence_document_ids.length,
  );
  const ready =
    confirmed &&
    referencesValid &&
    value.basis_note.trim() &&
    value.scope_note.trim() &&
    (value.decision === "insufficient" || complete);
  return (
    <AssistanceDialog
      title="Conferir representação para uma operação"
      description="A conferência é nominal e específica. Ela não amplia os escopos F3, concede acesso ao portal nem executa atos ou pagamentos."
      onClose={onClose}
      pending={pending}
      disabled={!ready}
      actionLabel="Registrar conferência específica"
      onSubmit={async () => {
        if (ready) await onSave(value);
      }}
    >
      <SuccessionSelect
        label="Pessoa desta conferência"
        value={value.person_id}
        onChange={(id) => {
          setValue((old) => ({
            ...old,
            person_id: id,
            representation_id: null,
          }));
          setConfirmed(false);
        }}
        required
      >
        <option value="">Selecione a pessoa interessada</option>
        {persons.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {parties.find((party) => party.id === entry.party_id)?.name ??
              "Parte não disponível"}
          </option>
        ))}
      </SuccessionSelect>
      <SuccessionSelect
        label="Operação examinada"
        value={value.operation}
        onChange={(next) =>
          set("operation", next as SuccessionAuthorityInput["operation"])
        }
      >
        <option value="document_collection">Coleta documental</option>
        <option value="portal_access">Acesso individual ao portal</option>
        <option value="administrative_representation">
          Representação administrativa
        </option>
        <option value="judicial_representation">Representação judicial</option>
        <option value="payment_request">Pedido de pagamento</option>
      </SuccessionSelect>
      <SuccessionSelect
        label="Representação atualmente ativa"
        value={value.representation_id ?? ""}
        onChange={(next) => set("representation_id", next || null)}
        hint="Somente referências da pessoa selecionada e atualmente disponíveis."
      >
        <option value="">Ainda insuficiente ou não identificada</option>
        {available.map((representation, index) => (
          <option key={representation.id} value={representation.id}>
            Representação {index + 1} · documento e vigência a conferir
          </option>
        ))}
      </SuccessionSelect>
      <SuccessionEvidence
        label="Provas dos poderes para esta operação"
        ids={value.evidence_document_ids}
        documents={documents}
        onChange={(ids) => set("evidence_document_ids", ids)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {(["valid_from", "valid_until"] as const).map((field) => (
          <LegalField
            key={field}
            label={
              field === "valid_from"
                ? "Início dos poderes examinados"
                : "Fim dos poderes examinados"
            }
            hint="Horário local do dispositivo; o registro inclui o fuso."
          >
            {(id) => (
              <Input
                id={id}
                type="datetime-local"
                value={localDateTime(value[field])}
                onChange={(event) => {
                  const date = new Date(event.target.value);
                  set(
                    field,
                    event.target.value && Number.isFinite(date.getTime())
                      ? date.toISOString()
                      : null,
                  );
                }}
              />
            )}
          </LegalField>
        ))}
      </div>
      <SuccessionText
        label="Fundamento documental dos poderes"
        value={value.basis_note}
        onChange={(next) => set("basis_note", next)}
        multiline
        required
      />
      <SuccessionText
        label="Alcance e limitações desta operação"
        value={value.scope_note}
        onChange={(next) => set("scope_note", next)}
        multiline
        required
      />
      <SuccessionSelect
        label="Resultado da conferência específica"
        value={value.decision}
        onChange={(next) =>
          set("decision", next as SuccessionAuthorityInput["decision"])
        }
      >
        <option value="insufficient">Elementos insuficientes</option>
        <option value="reviewed">
          Poderes conferidos para a operação indicada
        </option>
      </SuccessionSelect>
      {value.decision === "reviewed" && !complete && (
        <SuccessionNotice error>
          A conferência exige representação ativa, prova e intervalo de vigência
          explícito.
        </SuccessionNotice>
      )}
      <SuccessionCheck
        label="Conferi os poderes especificamente para esta operação, sem inferi-los do parentesco ou do cadastro"
        checked={confirmed}
        onChange={setConfirmed}
      />
    </AssistanceDialog>
  );
}
