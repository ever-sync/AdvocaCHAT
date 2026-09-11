import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { listIrIncomeSources, listIrPayers } from "@/lib/api/legal-ir";
import { LegalEmpty, LegalField } from "../LegalShared";
import { selectClassName, useLegalAction } from "../legal-ui";
import {
  INCOME_KINDS,
  PRODUCT_TYPES,
  PENSION_KINDS,
  INCOME_EVENTS,
} from "../ir/ir-ui";
import { OperationPanel } from "../operations/OperationPanel";
import { CareDialog } from "./CareShared";
import { careCategoryAllowed, careKey, type CareProps } from "./client-care-ui";
import { runCareFollowups, saveCareFollowup } from "./api";
import type { CareFollowup, CareFollowupInput } from "./types";
export function CareFollowups(props: CareProps) {
  const [editing, setEditing] = useState<CareFollowup | "new" | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const action = useLegalAction();
  const allowed = careCategoryAllowed(props, "fiscal");
  if (!allowed)
    return (
      <LegalEmpty title="Acompanhamento com acesso fiscal">
        As regras de acompanhamento anual exigem acesso fiscal ao caso.
      </LegalEmpty>
    );
  const name = (id: string | null | undefined) =>
    props.workspace.collaborators.find((p) => p.id === id)?.nome ??
    "Participante do caso";
  return (
    <OperationPanel
      title="Acompanhamento anual e providências"
      description="Programe tarefas internas para revisar documentos, retenções ou o atendimento. Cada ocorrência gera uma tarefa única, sem enviar mensagens ao cliente."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/juridico/meu-dia">Abrir Meu dia</Link>
          </Button>
          {props.canEdit && (
            <Button size="sm" onClick={() => setEditing("new")}>
              Criar acompanhamento
            </Button>
          )}
        </div>
      }
    >
      {props.canEdit && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Button
            size="sm"
            variant="outline"
            disabled={action.pending}
            onClick={() =>
              void action.run(
                async () =>
                  setCreated(await runCareFollowups(props.legalCase.id)),
                "Ocorrências conferidas",
              )
            }
          >
            Gerar tarefas que já venceram
          </Button>
          <p className="text-xs text-muted-foreground">
            Executar novamente preserva as tarefas já criadas para a mesma
            ocorrência. Regras pausadas não geram tarefas.
          </p>
          {created !== null && (
            <p role="status" className="text-sm">
              {created} nova(s) tarefa(s) gerada(s) nesta conferência.
            </p>
          )}
        </div>
      )}
      {props.context.followup_rules.length ? (
        props.context.followup_rules.map((rule) => (
          <article key={rule.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="break-words font-medium">{rule.title}</h3>
              <Badge variant="secondary">
                {rule.state === "active" ? "Ativo" : "Pausado"}
              </Badge>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">
              {rule.purpose}
            </p>
            <p className="text-sm">
              {rule.cadence === "annual" ? "Anual" : "Uma ocorrência"} · Próxima
              data: {rule.next_occurrence} (Brasília)
            </p>
            <p className="text-xs text-muted-foreground">
              Responsável: {name(rule.assignee_id)}
              {rule.substitute_id &&
                ` · Substituto: ${name(rule.substitute_id)}`}
              {rule.valid_until && ` · Válido até ${rule.valid_until}`}
            </p>
            {props.canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(rule)}
              >
                Revisar datas, equipe ou pausa
              </Button>
            )}
          </article>
        ))
      ) : (
        <LegalEmpty title="Nenhum acompanhamento programado" />
      )}
      {editing && props.canEdit && (
        <FollowupDialog
          props={props}
          previous={editing === "new" ? undefined : editing}
          close={() => setEditing(null)}
        />
      )}
    </OperationPanel>
  );
}
function FollowupDialog({
  props,
  previous,
  close,
}: {
  props: CareProps;
  previous?: CareFollowup;
  close(): void;
}) {
  const action = useLegalAction();
  const [form, setForm] = useState<CareFollowupInput>({
    title: previous?.title ?? "",
    purpose: previous?.purpose ?? "",
    source_id: previous?.source_id ?? null,
    assignee_id: previous?.assignee_id ?? "",
    substitute_id: previous?.substitute_id ?? null,
    next_occurrence: previous?.next_occurrence ?? "",
    cadence: previous?.cadence ?? "annual",
    state: previous?.state ?? "active",
    valid_until: previous?.valid_until ?? null,
  });
  const sources = useQuery({
    queryKey: careKey(props, "sources"),
    queryFn: () => listIrIncomeSources(props.legalCase.id),
  });
  const payers = useQuery({
    queryKey: careKey(props, "payers"),
    queryFn: () => listIrPayers(props.legalCase.id),
  });
  const people = props.workspace.collaborators.filter(
    (p) =>
      p.id === props.legalCase.owner_id ||
      props.members?.some((m) => m.profile_id === p.id),
  );
  return (
    <CareDialog
      title={previous ? "Revisar acompanhamento" : "Programar acompanhamento"}
      description="Defina finalidade, data e responsabilidade. Use uma descrição de trabalho sem diagnóstico ou conteúdo clínico na tarefa geral."
      close={close}
      pending={action.pending}
      label="Salvar acompanhamento"
      submit={async () => {
        if (
          await action.run(
            () => saveCareFollowup(props.legalCase.id, form, previous?.id),
            "Acompanhamento salvo",
          )
        )
          close();
      }}
    >
      <LegalField label="Título da tarefa interna">
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
      <LegalField label="Finalidade do acompanhamento">
        {(id) => (
          <Textarea
            id={id}
            required
            maxLength={2000}
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          />
        )}
      </LegalField>
      <LegalField label="Rendimento relacionado (opcional)">
        {(id) => (
          <select
            id={id}
            className={selectClassName}
            value={form.source_id ?? ""}
            onChange={(e) =>
              setForm({ ...form, source_id: e.target.value || null })
            }
          >
            <option value="">Acompanhamento do caso</option>
            {sources.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {payers.data?.find((p) => p.id === s.payer_id)?.name ??
                  "Fonte pagadora"}{" "}
                · {INCOME_KINDS[s.income_kind]} ·{" "}
                {PRODUCT_TYPES[s.product_type]} ·{" "}
                {PENSION_KINDS[s.pension_kind]} ·{" "}
                {INCOME_EVENTS[s.income_event]}
                {s.benefit_number && ` · ${s.benefit_number}`}
              </option>
            ))}
          </select>
        )}
      </LegalField>
      <div className="grid gap-4 sm:grid-cols-2">
        <LegalField label="Responsável pela tarefa">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              required
              value={form.assignee_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  assignee_id: e.target.value,
                  substitute_id:
                    form.substitute_id === e.target.value
                      ? null
                      : form.substitute_id,
                })
              }
            >
              <option value="">Selecione</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        <LegalField label="Substituto (opcional)">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.substitute_id ?? ""}
              onChange={(e) =>
                setForm({ ...form, substitute_id: e.target.value || null })
              }
            >
              <option value="">Sem substituto</option>
              {people
                .filter((p) => p.id !== form.assignee_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
            </select>
          )}
        </LegalField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <LegalField label="Próxima ocorrência">
          {(id) => (
            <Input
              id={id}
              type="date"
              required
              value={form.next_occurrence}
              onChange={(e) =>
                setForm({ ...form, next_occurrence: e.target.value })
              }
            />
          )}
        </LegalField>
        <LegalField label="Frequência">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.cadence}
              onChange={(e) =>
                setForm({
                  ...form,
                  cadence: e.target.value as CareFollowupInput["cadence"],
                })
              }
            >
              <option value="annual">Anual</option>
              <option value="once">Uma ocorrência</option>
            </select>
          )}
        </LegalField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <LegalField label="Programação válida até (opcional)">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={form.valid_until ?? ""}
              onChange={(e) =>
                setForm({ ...form, valid_until: e.target.value || null })
              }
            />
          )}
        </LegalField>
        <LegalField label="Situação">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.state}
              onChange={(e) =>
                setForm({
                  ...form,
                  state: e.target.value as CareFollowupInput["state"],
                })
              }
            >
              <option value="active">Ativo</option>
              <option value="paused">Pausado</option>
            </select>
          )}
        </LegalField>
      </div>
    </CareDialog>
  );
}
export default CareFollowups;
