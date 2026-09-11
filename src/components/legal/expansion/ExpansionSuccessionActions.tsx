import { useState } from "react";
import type { LegalCaseDocument } from "@/types/legal";
import { AssistanceDialog } from "../assistance/AssistanceShared";
import {
  SuccessionCheck,
  SuccessionNotice,
  SuccessionSelect,
  SuccessionText,
} from "./ExpansionSuccessionFields";

export function SuccessionReviewDialog({
  title,
  description,
  actionLabel,
  pending,
  missing = [],
  blocked = false,
  onSave,
  onClose,
}: {
  title: string;
  description: string;
  actionLabel: string;
  pending: boolean;
  missing?: string[];
  blocked?: boolean;
  onSave(note: string): Promise<void>;
  onClose(): void;
}) {
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const ready =
    !blocked && missing.length === 0 && confirmed && note.trim().length >= 3;
  return (
    <AssistanceDialog
      title={title}
      description={description}
      onClose={onClose}
      onSubmit={async () => {
        if (ready) await onSave(note.trim());
      }}
      actionLabel={actionLabel}
      pending={pending}
      disabled={!ready}
    >
      {missing.length > 0 && (
        <SuccessionNotice error>
          Existem pendências: {missing.join("; ")}. Corrija a versão antes de
          concluir esta revisão.
        </SuccessionNotice>
      )}
      {blocked && (
        <SuccessionNotice error>
          A versão perdeu atualidade ou autorização. Atualize a consulta antes
          de continuar.
        </SuccessionNotice>
      )}
      <SuccessionText
        label="Fundamento da revisão"
        value={note}
        onChange={(next) => {
          setNote(next);
          setConfirmed(false);
        }}
        multiline
        required
      />
      <SuccessionCheck
        label="Examinei esta versão, suas provas, limitações e pendências"
        checked={confirmed}
        onChange={setConfirmed}
      />
    </AssistanceDialog>
  );
}

export interface SuccessionEventInput {
  event_kind:
    | "death_reported"
    | "estate_filing"
    | "appointment"
    | "habilitation_requested"
    | "habilitation_decided"
    | "document_received"
    | "payment_authority_recorded"
    | "note";
  occurred_on: string;
  document_id: string | null;
  description: string;
  previous_event_id: string | null;
}
export function ExpansionSuccessionEventForm({
  events,
  documents,
  pending,
  onSave,
  onClose,
}: {
  events: { id: string; description: string; occurred_on: string }[];
  documents: LegalCaseDocument[];
  pending: boolean;
  onSave(value: SuccessionEventInput): Promise<void>;
  onClose(): void;
}) {
  const [value, setValue] = useState<SuccessionEventInput>({
    event_kind: "note",
    occurred_on: "",
    document_id: null,
    description: "",
    previous_event_id: null,
  });
  const [confirmed, setConfirmed] = useState(false);
  const set = <K extends keyof SuccessionEventInput>(
    key: K,
    next: SuccessionEventInput[K],
  ) => {
    setValue((old) => ({ ...old, [key]: next }));
    setConfirmed(false);
  };
  const proofRequired = [
    "appointment",
    "habilitation_decided",
    "payment_authority_recorded",
  ].includes(value.event_kind);
  const proofValid = value.document_id
    ? documents.some((document) => document.id === value.document_id)
    : !proofRequired;
  const ready =
    confirmed &&
    value.occurred_on &&
    value.description.trim() &&
    proofValid &&
    (!value.previous_event_id ||
      events.some((event) => event.id === value.previous_event_id));
  return (
    <AssistanceDialog
      title="Registrar ocorrência documentada"
      description="O registro descreve um fato externo. Ele não altera automaticamente partes, poderes, prazos ou valores do caso."
      onClose={onClose}
      onSubmit={async () => {
        if (ready) await onSave(value);
      }}
      pending={pending}
      disabled={!ready}
      actionLabel="Registrar ocorrência"
    >
      <SuccessionSelect
        label="Tipo de ocorrência"
        value={value.event_kind}
        onChange={(next) =>
          set("event_kind", next as SuccessionEventInput["event_kind"])
        }
      >
        <option value="note">Nota de acompanhamento</option>
        <option value="death_reported">Falecimento relatado</option>
        <option value="estate_filing">Abertura de inventário informada</option>
        <option value="appointment">Nomeação documentada</option>
        <option value="habilitation_requested">
          Pedido de habilitação informado
        </option>
        <option value="habilitation_decided">
          Decisão de habilitação documentada
        </option>
        <option value="document_received">Documento recebido</option>
        <option value="payment_authority_recorded">
          Autorização de pagamento documentada
        </option>
      </SuccessionSelect>
      <SuccessionText
        label="Data efetiva da ocorrência"
        type="date"
        value={value.occurred_on}
        onChange={(next) => set("occurred_on", next)}
        required
        hint="Informe a data do fato; registrar hoje não significa que ocorreu hoje."
      />
      <SuccessionSelect
        label="Prova desta ocorrência"
        value={value.document_id ?? ""}
        onChange={(next) => set("document_id", next || null)}
        required={proofRequired}
      >
        <option value="">Selecione quando disponível</option>
        {documents.map((document) => (
          <option key={document.id} value={document.id}>
            {document.display_name}
          </option>
        ))}
      </SuccessionSelect>
      {proofRequired && (
        <SuccessionNotice>
          A nomeação, decisão ou autorização exige prova pronta conferida. O
          upload por si só não prova o ato.
        </SuccessionNotice>
      )}
      <SuccessionSelect
        label="Corrigir ocorrência anterior"
        value={value.previous_event_id ?? ""}
        onChange={(next) => set("previous_event_id", next || null)}
        hint="A correção preserva o registro anterior e não o sobrescreve."
      >
        <option value="">É uma nova ocorrência</option>
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.occurred_on} · {event.description.slice(0, 100)}
          </option>
        ))}
      </SuccessionSelect>
      <SuccessionText
        label="Descrição factual e limitações"
        value={value.description}
        onChange={(next) => set("description", next)}
        multiline
        required
      />
      <SuccessionCheck
        label="Conferi a ocorrência e distingui o fato externo da revisão interna"
        checked={confirmed}
        onChange={setConfirmed}
      />
    </AssistanceDialog>
  );
}
