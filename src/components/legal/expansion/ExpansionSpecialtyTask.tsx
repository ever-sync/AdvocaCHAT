import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { ExpansionSpecialtyItem } from "@/types/legal-expansion";
import { createSpecialtyTask } from "@/lib/api/legal-expansion";
import { LegalField } from "../LegalShared";
import { useLegalAction } from "../legal-ui";
import { ExpansionDialog } from "./ExpansionShared";
import { type ExpansionProps } from "./expansion-ui";
import {
  SuccessionCheck,
  SuccessionNotice,
  SuccessionSelect,
} from "./ExpansionSuccessionFields";
export function ExpansionSpecialtyTask({
  props,
  item,
  onClose,
}: {
  props: ExpansionProps;
  item: ExpansionSpecialtyItem;
  onClose(): void;
}) {
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [substitute, setSubstitute] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const action = useLegalAction();
  const available = props.workspace.collaborators.filter(
    (person) =>
      person.id === props.legalCase.owner_id ||
      (props.members ?? []).some(
        (member) =>
          member.profile_id === person.id &&
          (item.category === "general" ||
            (item.category === "medical" && member.can_view_medical) ||
            (item.category === "fiscal" && member.can_view_fiscal) ||
            (item.category === "restricted" &&
              member.can_view_medical &&
              member.can_view_fiscal)),
      ),
  );
  const date = new Date(due);
  const ready =
    confirmed &&
    Number.isFinite(date.getTime()) &&
    available.some((person) => person.id === assignee) &&
    (!substitute ||
      (substitute !== assignee &&
        available.some((person) => person.id === substitute)));
  return (
    <ExpansionDialog
      title="Criar tarefa operacional"
      description="Escolha uma data de organização do trabalho. Nenhuma contagem ou prazo jurídico é inferido pelo pacote."
      onClose={onClose}
      pending={action.pending}
      disabled={!ready}
      actionLabel="Criar tarefa operacional"
      onSubmit={async () => {
        if (
          ready &&
          (await action.run(
            () =>
              createSpecialtyTask(item.id, {
                due_at: date.toISOString(),
                assignee_id: assignee,
                substitute_id: substitute || null,
              }),
            "Tarefa operacional vinculada ao item",
          ))
        )
          onClose();
      }}
    >
      <SuccessionNotice>
        {"title" in item.payload ? item.payload.title : item.payload.label}
      </SuccessionNotice>
      <LegalField
        label="Data e hora operacional escolhidas"
        hint="Horário local do dispositivo; o registro inclui o fuso."
      >
        {(id) => (
          <Input
            id={id}
            type="datetime-local"
            value={due}
            required
            onChange={(event) => {
              setDue(event.target.value);
              setConfirmed(false);
            }}
          />
        )}
      </LegalField>
      <SuccessionSelect
        label="Responsável pela tarefa"
        value={assignee}
        required
        onChange={(id) => {
          setAssignee(id);
          setConfirmed(false);
        }}
      >
        <option value="">Selecione um participante autorizado</option>
        {available.map((person) => (
          <option key={person.id} value={person.id}>
            {person.nome}
          </option>
        ))}
      </SuccessionSelect>
      <SuccessionSelect
        label="Substituto da tarefa"
        value={substitute}
        onChange={(id) => {
          setSubstitute(id);
          setConfirmed(false);
        }}
      >
        <option value="">Sem substituto</option>
        {available
          .filter((person) => person.id !== assignee)
          .map((person) => (
            <option key={person.id} value={person.id}>
              {person.nome}
            </option>
          ))}
      </SuccessionSelect>
      <SuccessionCheck
        label="Conferi a atribuição e escolhi esta data operacional, sem tratá-la como prazo judicial calculado"
        checked={confirmed}
        onChange={setConfirmed}
      />
    </ExpansionDialog>
  );
}
