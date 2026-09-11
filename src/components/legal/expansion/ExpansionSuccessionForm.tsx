import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  LegalCaseDocument,
  LegalCaseParty,
  LegalProceeding,
} from "@/types/legal";
import type { LegalRepresentation } from "@/types/legal-ir";
import { AssistanceDialog } from "../assistance/AssistanceShared";
import {
  SuccessionCheck,
  SuccessionEvidence,
  SuccessionNotice,
  SuccessionSelect,
  SuccessionText,
} from "./ExpansionSuccessionFields";

export interface SuccessionPersonInput {
  party_id: string;
  claimed_capacity:
    | "spouse"
    | "partner"
    | "heir"
    | "legatee"
    | "dependent"
    | "estate_representative"
    | "other"
    | "unknown";
  capacity_note: string;
  evidence_document_ids: string[];
  representation_id: string | null;
  pending_note: string;
}
export interface SuccessionVersionInput {
  succession_key: string;
  title: string;
  previous_version_id: string | null;
  category: "restricted";
  deceased_party_id: string;
  death_on: string | null;
  death_document_id: string | null;
  assets_status: "unknown" | "declared_present" | "declared_absent";
  dependency_status: "unknown" | "reported" | "documented";
  payment_location:
    | "unknown"
    | "not_released"
    | "available_at_bank"
    | "credited"
    | "returned_to_revenue";
  proceeding_id: string | null;
  notes: string;
  persons: SuccessionPersonInput[];
}

export function ExpansionSuccessionForm({
  original,
  parties,
  documents,
  proceedings,
  representations,
  pending,
  onClose,
  onSave,
}: {
  original?: SuccessionVersionInput & { id: string };
  parties: LegalCaseParty[];
  documents: LegalCaseDocument[];
  proceedings: LegalProceeding[];
  representations: LegalRepresentation[];
  pending: boolean;
  onClose(): void;
  onSave(payload: SuccessionVersionInput): Promise<void>;
}) {
  const [value, setValue] = useState<SuccessionVersionInput>(() =>
    original
      ? {
          succession_key: original.succession_key,
          title: original.title,
          category: "restricted",
          previous_version_id: original.id,
          deceased_party_id: original.deceased_party_id,
          death_on: original.death_on,
          death_document_id: original.death_document_id,
          assets_status: original.assets_status,
          dependency_status: original.dependency_status,
          payment_location: original.payment_location,
          proceeding_id: original.proceeding_id,
          notes: original.notes,
          persons: original.persons.map((person) => ({
            party_id: person.party_id,
            claimed_capacity: person.claimed_capacity,
            capacity_note: person.capacity_note,
            evidence_document_ids: [...person.evidence_document_ids],
            representation_id: person.representation_id,
            pending_note: person.pending_note,
          })),
        }
      : {
          succession_key: "",
          title: "",
          category: "restricted",
          previous_version_id: null,
          deceased_party_id: "",
          death_on: null,
          death_document_id: null,
          assets_status: "unknown",
          dependency_status: "unknown",
          payment_location: "unknown",
          proceeding_id: null,
          notes: "",
          persons: [],
        },
  );
  const [confirmed, setConfirmed] = useState(false);
  const set = <K extends keyof SuccessionVersionInput>(
    key: K,
    next: SuccessionVersionInput[K],
  ) => {
    setValue((old) => ({ ...old, [key]: next }));
    setConfirmed(false);
  };
  const hasDocument = (id: string | null) =>
    !id || documents.some((document) => document.id === id);
  const personsValid =
    value.persons.every(
      (person) =>
        person.party_id !== value.deceased_party_id &&
        parties.some((party) => party.id === person.party_id) &&
        person.evidence_document_ids.every(hasDocument) &&
        (!person.representation_id ||
          representations.some(
            (representation) =>
              representation.id === person.representation_id &&
              representation.representative_party_id === person.party_id,
          )),
    ) &&
    new Set(value.persons.map((person) => person.party_id)).size ===
      value.persons.length;
  const refsValid =
    parties.some((party) => party.id === value.deceased_party_id) &&
    hasDocument(value.death_document_id) &&
    (!value.proceeding_id ||
      proceedings.some(
        (proceeding) => proceeding.id === value.proceeding_id,
      )) &&
    personsValid;
  const ready =
    confirmed && refsValid && value.succession_key.trim() && value.title.trim();
  const setPerson = (index: number, patch: Partial<SuccessionPersonInput>) =>
    set(
      "persons",
      value.persons.map((person, at) =>
        at === index ? { ...person, ...patch } : person,
      ),
    );
  return (
    <AssistanceDialog
      title={
        original ? "Nova versão do dossiê sucessório" : "Novo dossiê sucessório"
      }
      description="Organize fatos, pessoas e provas para revisão. Este cadastro não habilita sucessores nem concede poderes ou acesso a valores."
      onClose={onClose}
      onSubmit={async () => {
        if (ready) await onSave(value);
      }}
      pending={pending}
      disabled={!ready}
    >
      <SuccessionNotice>
        Saúde e fiscal: este dossiê exige acesso conjunto. Dados desconhecidos
        permanecem desconhecidos; parentesco ou certidão não determinam
        legitimidade, representação ou percentuais.
      </SuccessionNotice>
      <div className="grid gap-4 sm:grid-cols-2">
        <SuccessionText
          label="Identificador do dossiê"
          value={value.succession_key}
          onChange={(next) => set("succession_key", next)}
          required
          maxLength={80}
          disabled={Boolean(original)}
        />
        <SuccessionText
          label="Título do dossiê"
          value={value.title}
          onChange={(next) => set("title", next)}
          required
          maxLength={200}
        />
        <SuccessionSelect
          label="Pessoa falecida informada"
          value={value.deceased_party_id}
          onChange={(next) => set("deceased_party_id", next)}
          required
        >
          <option value="">Selecione uma parte do caso</option>
          {parties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name}
            </option>
          ))}
        </SuccessionSelect>
        <SuccessionText
          label="Data do falecimento informada"
          type="date"
          value={value.death_on ?? ""}
          onChange={(next) => set("death_on", next || null)}
          hint="Deixe em branco quando desconhecida; conferir com a prova."
        />
      </div>
      <SuccessionSelect
        label="Certidão ou prova do falecimento"
        value={value.death_document_id ?? ""}
        onChange={(next) => set("death_document_id", next || null)}
      >
        <option value="">Ainda não disponível</option>
        {documents.map((document) => (
          <option key={document.id} value={document.id}>
            {document.display_name}
          </option>
        ))}
      </SuccessionSelect>
      <div className="grid gap-4 sm:grid-cols-3">
        <SuccessionSelect
          label="Bens a inventariar"
          value={value.assets_status}
          onChange={(next) =>
            set(
              "assets_status",
              next as SuccessionVersionInput["assets_status"],
            )
          }
        >
          <option value="unknown">Desconhecido</option>
          <option value="declared_present">Existência declarada</option>
          <option value="declared_absent">Inexistência declarada</option>
        </SuccessionSelect>
        <SuccessionSelect
          label="Dependência previdenciária ou militar"
          value={value.dependency_status}
          onChange={(next) =>
            set(
              "dependency_status",
              next as SuccessionVersionInput["dependency_status"],
            )
          }
        >
          <option value="unknown">Desconhecida</option>
          <option value="reported">Relatada</option>
          <option value="documented">Documentação indicada</option>
        </SuccessionSelect>
        <SuccessionSelect
          label="Situação informada do pagamento"
          value={value.payment_location}
          onChange={(next) =>
            set(
              "payment_location",
              next as SuccessionVersionInput["payment_location"],
            )
          }
        >
          <option value="unknown">Desconhecida</option>
          <option value="not_released">Ainda não liberado</option>
          <option value="available_at_bank">
            Disponível para resgate no banco
          </option>
          <option value="credited">Crédito informado em conta</option>
          <option value="returned_to_revenue">Devolvido à Receita</option>
        </SuccessionSelect>
      </div>
      <SuccessionSelect
        label="Processo relacionado"
        value={value.proceeding_id ?? ""}
        onChange={(next) => set("proceeding_id", next || null)}
      >
        <option value="">Sem processo vinculado</option>
        {proceedings.map((proceeding) => (
          <option key={proceeding.id} value={proceeding.id}>
            {proceeding.cnj_number} · {proceeding.court}
          </option>
        ))}
      </SuccessionSelect>
      <section className="space-y-4">
        <h3 className="font-medium">Pessoas interessadas</h3>
        {value.persons.map((person, index) => (
          <section key={index} className="space-y-3 rounded border p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-medium">Pessoa {index + 1}</h4>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  set(
                    "persons",
                    value.persons.filter((_, at) => at !== index),
                  )
                }
              >
                Remover pessoa {index + 1}
              </Button>
            </div>
            <SuccessionSelect
              label={`Parte interessada ${index + 1}`}
              value={person.party_id}
              onChange={(next) =>
                setPerson(index, { party_id: next, representation_id: null })
              }
              required
            >
              <option value="">Selecione a parte</option>
              {parties
                .filter((party) => party.id !== value.deceased_party_id)
                .map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
            </SuccessionSelect>
            <SuccessionSelect
              label={`Qualidade declarada da pessoa ${index + 1}`}
              value={person.claimed_capacity}
              onChange={(next) =>
                setPerson(index, {
                  claimed_capacity:
                    next as SuccessionPersonInput["claimed_capacity"],
                })
              }
            >
              <option value="unknown">Ainda desconhecida</option>
              <option value="spouse">Cônjuge</option>
              <option value="partner">Companheiro(a)</option>
              <option value="heir">Herdeiro(a) declarado(a)</option>
              <option value="legatee">Legatário(a) declarado(a)</option>
              <option value="dependent">Dependente declarado(a)</option>
              <option value="estate_representative">
                Representante do espólio informado
              </option>
              <option value="other">Outra qualidade declarada</option>
            </SuccessionSelect>
            <SuccessionText
              label={`Fundamento declarado da pessoa ${index + 1}`}
              value={person.capacity_note}
              onChange={(next) => setPerson(index, { capacity_note: next })}
              multiline
            />
            <SuccessionEvidence
              label={`Provas da pessoa ${index + 1}`}
              ids={person.evidence_document_ids}
              documents={documents}
              onChange={(next) =>
                setPerson(index, { evidence_document_ids: next })
              }
            />
            <SuccessionSelect
              label={`Representação cadastrada da pessoa ${index + 1}`}
              value={person.representation_id ?? ""}
              onChange={(next) =>
                setPerson(index, { representation_id: next || null })
              }
              hint="O cadastro F3 é específico de coleta documental. Outros atos exigem exame próprio dos poderes."
            >
              <option value="">Ainda não vinculada</option>
              {representations
                .filter(
                  (representation) =>
                    representation.representative_party_id === person.party_id,
                )
                .map((representation, at) => (
                  <option key={representation.id} value={representation.id}>
                    Representação {at + 1} ·{" "}
                    {representation.status === "active"
                      ? "cadastro ativo; conferir vigência"
                      : representation.status === "revoked"
                        ? "revogada"
                        : "em rascunho"}
                  </option>
                ))}
            </SuccessionSelect>
            <SuccessionText
              label={`Pendências da pessoa ${index + 1}`}
              value={person.pending_note}
              onChange={(next) => setPerson(index, { pending_note: next })}
              multiline
            />
          </section>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={value.persons.length >= 50}
          onClick={() =>
            set("persons", [
              ...value.persons,
              {
                party_id: "",
                claimed_capacity: "unknown",
                capacity_note: "",
                evidence_document_ids: [],
                representation_id: null,
                pending_note: "",
              },
            ])
          }
        >
          Adicionar pessoa interessada
        </Button>
      </section>
      <SuccessionText
        label="Notas, dúvidas e limitações do dossiê"
        value={value.notes}
        onChange={(next) => set("notes", next)}
        multiline
        required
      />
      {!refsValid && (
        <SuccessionNotice>
          Selecione partes e provas atualmente disponíveis. Pessoas repetidas ou
          a pessoa falecida como interessada precisam ser corrigidas antes de
          salvar.
        </SuccessionNotice>
      )}
      <SuccessionCheck
        label="Conferi os fatos declarados e as pendências; o cadastro será salvo como rascunho"
        checked={confirmed}
        onChange={setConfirmed}
      />
    </AssistanceDialog>
  );
}
