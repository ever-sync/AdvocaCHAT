import { Button } from "@/components/ui/button";
import type { LegalCaseDocument, LegalCaseParty } from "@/types/legal";
import type { ExpansionSuccessionRead } from "@/types/legal-expansion";
import { expansionDate } from "./expansion-ui";
import { SuccessionNotice } from "./ExpansionSuccessionFields";
import { expansionSuccessionMissingLabel } from "./ExpansionSuccessionLabels";

const assets = {
  unknown: "Desconhecido",
  declared_present: "Existência declarada",
  declared_absent: "Inexistência declarada",
};
const dependency = {
  unknown: "Desconhecida",
  reported: "Relatada",
  documented: "Documentação indicada",
};
const payments = {
  unknown: "Desconhecida",
  not_released: "Ainda não liberado",
  available_at_bank: "Disponível para resgate no banco",
  credited: "Crédito informado em conta",
  returned_to_revenue: "Devolvido à Receita",
};
const capacities = {
  unknown: "Qualidade ainda desconhecida",
  spouse: "Cônjuge declarado",
  partner: "Companheiro(a) declarado(a)",
  heir: "Herdeiro(a) declarado(a)",
  legatee: "Legatário(a) declarado(a)",
  dependent: "Dependente declarado(a)",
  estate_representative: "Representante do espólio informado",
  other: "Outra qualidade declarada",
};
const operations = {
  document_collection: "Coleta documental",
  portal_access: "Acesso individual ao portal",
  administrative_representation: "Representação administrativa",
  judicial_representation: "Representação judicial",
  payment_request: "Pedido de pagamento",
};
const events = {
  death_reported: "Falecimento relatado",
  estate_filing: "Inventário informado",
  appointment: "Nomeação documentada",
  habilitation_requested: "Pedido de habilitação",
  habilitation_decided: "Decisão de habilitação documentada",
  document_received: "Documento recebido",
  payment_authority_recorded: "Autorização de pagamento documentada",
  note: "Nota de acompanhamento",
};
export function ExpansionSuccessionDetails({
  data,
  parties,
  documents,
  onRevokeAuthority,
}: {
  data: ExpansionSuccessionRead;
  parties: LegalCaseParty[];
  documents: LegalCaseDocument[];
  onRevokeAuthority?(id: string): void;
}) {
  const version = data.version;
  const name = (id: string) =>
    parties.find((party) => party.id === id)?.name ??
    "Parte não disponível na consulta atual";
  const proof = (id?: string | null) =>
    id
      ? (documents.find((document) => document.id === id)?.display_name ??
        "Prova não disponível na consulta atual")
      : "Ainda não informada";
  return (
    <div className="space-y-4">
      {!data.is_current && (
        <SuccessionNotice error>
          Esta versão não está atual para novos usos. Revise as provas,
          referências e versões posteriores.
        </SuccessionNotice>
      )}
      {data.missing.length > 0 && (
        <SuccessionNotice>
          Pendências para conferência:{" "}
          {data.missing.map(expansionSuccessionMissingLabel).join("; ")}.
        </SuccessionNotice>
      )}
      <h3 className="break-words font-medium">
        {version.title} · versão {version.version_number}
      </h3>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Pessoa falecida informada</dt>
          <dd className="break-words">{name(version.deceased_party_id)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Falecimento informado</dt>
          <dd>{expansionDate(version.death_on)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Prova do falecimento</dt>
          <dd className="break-words">{proof(version.death_document_id)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Bens a inventariar</dt>
          <dd>{assets[version.assets_status]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dependência</dt>
          <dd>{dependency[version.dependency_status]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pagamento informado</dt>
          <dd>{payments[version.payment_location]}</dd>
        </div>
      </dl>
      <p className="whitespace-pre-wrap break-words text-sm">{version.notes}</p>
      <section className="space-y-3">
        <h3 className="font-medium">Pessoas e provas</h3>
        {data.persons.length === 0 && (
          <SuccessionNotice>
            Nenhuma pessoa interessada foi identificada nesta versão.
          </SuccessionNotice>
        )}
        {data.persons.map((person) => (
          <article key={person.id} className="space-y-2 rounded border p-3">
            <h4 className="break-words font-medium">{name(person.party_id)}</h4>
            <p className="text-sm">{capacities[person.claimed_capacity]}</p>
            <p className="whitespace-pre-wrap break-words text-sm">
              {person.capacity_note}
            </p>
            <ul className="list-inside list-disc text-sm">
              {person.evidence_document_ids.map((id) => (
                <li key={id} className="break-words">
                  {proof(id)}
                </li>
              ))}
            </ul>
            <p className="whitespace-pre-wrap break-words text-sm">
              Pendências:{" "}
              {person.pending_note ||
                "Nenhuma pendência descrita; isso não comprova poderes."}
            </p>
            <p className="text-xs text-muted-foreground">
              {person.representation_id
                ? "Referência de representação vinculada; validade conferida por operação."
                : "Sem representação vinculada."}
            </p>
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h3 className="font-medium">Conferências por operação</h3>
        {data.authorities.length === 0 && (
          <SuccessionNotice>
            Nenhum poder foi conferido para uma operação específica.
          </SuccessionNotice>
        )}
        {data.authorities.map((authority) => (
          <article key={authority.id} className="space-y-2 rounded border p-3">
            <h4 className="font-medium">{operations[authority.operation]}</h4>
            <p className="break-words text-sm">
              {name(
                data.persons.find((person) => person.id === authority.person_id)
                  ?.party_id ?? "",
              )}{" "}
              ·{" "}
              {authority.decision === "reviewed"
                ? "Conferência nominal registrada"
                : authority.decision === "insufficient"
                  ? "Elementos insuficientes"
                  : "Conferência revogada"}
            </p>
            {authority.decision === "reviewed" && (
              <SuccessionNotice error={authority.is_current !== true}>
                {authority.is_current === true
                  ? "Referências e vigência atuais na última consulta, somente para esta operação."
                  : "Esta conferência histórica não está disponível para novos usos. Revise a vigência, as provas e a representação."}
              </SuccessionNotice>
            )}
            {authority.revocation_note && (
              <p className="whitespace-pre-wrap break-words text-sm">
                Revogação: {authority.revocation_note}
              </p>
            )}
            <p className="text-sm">
              Vigência examinada: {expansionDate(authority.valid_from)} até{" "}
              {expansionDate(authority.valid_until)}.
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">
              {authority.basis_note}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">
              {authority.scope_note}
            </p>
            <ul className="list-inside list-disc text-sm">
              {authority.evidence_document_ids.map((id) => (
                <li key={id} className="break-words">
                  {proof(id)}
                </li>
              ))}
            </ul>
            {authority.decision === "reviewed" && onRevokeAuthority && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onRevokeAuthority(authority.id)}
              >
                Revogar esta conferência
              </Button>
            )}
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h3 className="font-medium">Ocorrências registradas</h3>
        {data.events.length === 0 && (
          <SuccessionNotice>
            Nenhuma ocorrência externa registrada nesta versão.
          </SuccessionNotice>
        )}
        {data.events.map((event) => (
          <article key={event.id} className="space-y-2 rounded border p-3">
            <h4 className="font-medium">
              {events[event.event_kind]} · {expansionDate(event.occurred_on)}
            </h4>
            <p className="whitespace-pre-wrap break-words text-sm">
              {event.description}
            </p>
            <p className="break-words text-xs text-muted-foreground">
              Prova: {proof(event.document_id)}.{" "}
              {event.previous_event_id
                ? "Corrige um registro anterior, preservado no histórico."
                : "Ocorrência adicionada ao histórico."}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
