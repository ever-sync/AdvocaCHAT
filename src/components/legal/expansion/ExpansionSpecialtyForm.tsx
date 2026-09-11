import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AssistanceDialog } from "../assistance/AssistanceShared";
import {
  SuccessionCheck,
  SuccessionNotice,
  SuccessionSelect,
  SuccessionText,
} from "./ExpansionSuccessionFields";

type Category = "general" | "medical" | "fiscal" | "restricted";
export interface SpecialtyStageInput {
  key: string;
  label: string;
}
export interface SpecialtyChecklistInput {
  key: string;
  title: string;
  description: string;
  category: Category;
  required: boolean;
}
export interface SpecialtyTaskInput {
  key: string;
  title: string;
  description: string;
  category: Category;
}
export interface SpecialtyVersionInput {
  package_key: string;
  previous_version_id: string | null;
  title: string;
  specialty: string;
  purpose: string;
  scope: string;
  source_url: string;
  checked_on: string | null;
  validity_note: string;
  limitations: string;
  body: {
    stages: SpecialtyStageInput[];
    checklist: SpecialtyChecklistInput[];
    task_templates: SpecialtyTaskInput[];
  };
}

export function ExpansionSpecialtyForm({
  original,
  pending,
  onSave,
  onClose,
}: {
  original?: SpecialtyVersionInput & { id: string };
  pending: boolean;
  onSave(value: SpecialtyVersionInput): Promise<void>;
  onClose(): void;
}) {
  const [value, setValue] = useState<SpecialtyVersionInput>(() => ({
    package_key: original?.package_key ?? "",
    previous_version_id: original?.id ?? null,
    title: original?.title ?? "",
    specialty: original?.specialty ?? "",
    purpose: original?.purpose ?? "",
    scope: original?.scope ?? "",
    source_url: original?.source_url ?? "",
    checked_on: null,
    validity_note: original?.validity_note ?? "",
    limitations: original?.limitations ?? "",
    body: {
      stages: original?.body.stages.map((stage) => ({ ...stage })) ?? [],
      checklist: original?.body.checklist.map((item) => ({ ...item })) ?? [],
      task_templates:
        original?.body.task_templates.map((item) => ({ ...item })) ?? [],
    },
  }));
  const [confirmed, setConfirmed] = useState(false);
  const set = <K extends keyof SpecialtyVersionInput>(
    key: K,
    next: SpecialtyVersionInput[K],
  ) => {
    setValue((old) => ({ ...old, [key]: next }));
    setConfirmed(false);
  };
  const setBody = <K extends keyof SpecialtyVersionInput["body"]>(
    key: K,
    next: SpecialtyVersionInput["body"][K],
  ) => set("body", { ...value.body, [key]: next });
  const keys = [
    ...value.body.stages,
    ...value.body.checklist,
    ...value.body.task_templates,
  ].map((item) => item.key.trim());
  const itemsValid =
    keys.length > 0 &&
    keys.every(Boolean) &&
    new Set(keys).size === keys.length &&
    value.body.stages.every((stage) => stage.label.trim()) &&
    [...value.body.checklist, ...value.body.task_templates].every(
      (item) => item.title.trim() && item.description.trim(),
    );
  let sourceValid = !value.source_url.trim();
  try {
    const url = new URL(value.source_url);
    sourceValid = url.protocol === "https:" && !url.username && !url.password;
  } catch {
    /* An incomplete source may remain blank in a draft. */
  }
  const ready =
    confirmed &&
    sourceValid &&
    itemsValid &&
    value.package_key.trim() &&
    value.title.trim() &&
    value.specialty.trim() &&
    value.purpose.trim() &&
    value.scope.trim() &&
    value.validity_note.trim() &&
    value.limitations.trim();
  return (
    <AssistanceDialog
      title={
        original ? "Nova versão do pacote" : "Novo pacote de especialidade"
      }
      description="Crie etapas, verificações e modelos de tarefa para organização. Revisão e instalação são ações posteriores."
      onClose={onClose}
      pending={pending}
      disabled={!ready}
      onSubmit={async () => {
        if (ready) await onSave(value);
      }}
    >
      <SuccessionNotice>
        O pacote não instala teses, cálculos, assinaturas, políticas de IA ou
        prazos jurídicos aprovados. Datas de tarefas são escolhidas
        posteriormente, em cada caso.
      </SuccessionNotice>
      <div className="grid gap-4 sm:grid-cols-2">
        <SuccessionText
          label="Identificador do pacote"
          value={value.package_key}
          onChange={(next) => set("package_key", next)}
          maxLength={80}
          required
          disabled={Boolean(original)}
        />
        <SuccessionText
          label="Título do pacote"
          value={value.title}
          onChange={(next) => set("title", next)}
          maxLength={200}
          required
        />
        <SuccessionText
          label="Especialidade declarada"
          value={value.specialty}
          onChange={(next) => set("specialty", next)}
          maxLength={200}
          required
        />
        <SuccessionText
          label="Data de consulta das referências"
          type="date"
          value={value.checked_on ?? ""}
          onChange={(next) => set("checked_on", next || null)}
        />
      </div>
      <SuccessionText
        label="Finalidade organizacional"
        value={value.purpose}
        onChange={(next) => set("purpose", next)}
        multiline
        required
      />
      <SuccessionText
        label="Escopo de aplicação do pacote"
        value={value.scope}
        onChange={(next) => set("scope", next)}
        multiline
        required
      />
      <SuccessionText
        label="Fonte das referências do pacote"
        type="url"
        value={value.source_url}
        onChange={(next) => set("source_url", next)}
        maxLength={2000}
        hint="HTTPS, sem credenciais. Informar a fonte não significa aprová-la."
      />
      <SuccessionText
        label="Vigência e condições de revisão"
        value={value.validity_note}
        onChange={(next) => set("validity_note", next)}
        multiline
        required
      />
      <SuccessionText
        label="Limitações e assuntos fora do escopo"
        value={value.limitations}
        onChange={(next) => set("limitations", next)}
        multiline
        required
      />
      <section className="space-y-3 rounded border p-4">
        <h3 className="font-medium">Etapas organizacionais</h3>
        {value.body.stages.map((stage, index) => (
          <div key={index} className="space-y-2 rounded border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <SuccessionText
                label={`Chave da etapa ${index + 1}`}
                value={stage.key}
                onChange={(key) =>
                  setBody(
                    "stages",
                    value.body.stages.map((item, at) =>
                      at === index ? { ...item, key } : item,
                    ),
                  )
                }
                maxLength={80}
                required
              />
              <SuccessionText
                label={`Nome da etapa ${index + 1}`}
                value={stage.label}
                onChange={(label) =>
                  setBody(
                    "stages",
                    value.body.stages.map((item, at) =>
                      at === index ? { ...item, label } : item,
                    ),
                  )
                }
                maxLength={200}
                required
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setBody(
                  "stages",
                  value.body.stages.filter((_, at) => at !== index),
                )
              }
            >
              Remover etapa {index + 1}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={value.body.stages.length >= 20}
          onClick={() =>
            setBody("stages", [...value.body.stages, { key: "", label: "" }])
          }
        >
          Adicionar etapa
        </Button>
      </section>
      <section className="space-y-3 rounded border p-4">
        <h3 className="font-medium">Checklist do pacote</h3>
        {value.body.checklist.map((item, index) => (
          <section key={index} className="space-y-3 rounded border p-3">
            <SpecialtyItemFields
              item={item}
              index={index}
              noun="verificação"
              onChange={(patch) =>
                setBody(
                  "checklist",
                  value.body.checklist.map((old, at) =>
                    at === index ? { ...old, ...patch } : old,
                  ),
                )
              }
            />
            <SuccessionCheck
              label={`Verificação ${index + 1} necessária para o fluxo organizacional`}
              checked={item.required}
              onChange={(required) =>
                setBody(
                  "checklist",
                  value.body.checklist.map((old, at) =>
                    at === index ? { ...old, required } : old,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setBody(
                  "checklist",
                  value.body.checklist.filter((_, at) => at !== index),
                )
              }
            >
              Remover verificação {index + 1}
            </Button>
          </section>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={value.body.checklist.length >= 50}
          onClick={() =>
            setBody("checklist", [
              ...value.body.checklist,
              {
                key: "",
                title: "",
                description: "",
                category: "restricted",
                required: false,
              },
            ])
          }
        >
          Adicionar verificação
        </Button>
      </section>
      <section className="space-y-3 rounded border p-4">
        <h3 className="font-medium">Modelos de tarefa</h3>
        <p className="text-sm text-muted-foreground">
          Instalar um modelo não agenda tarefa. Responsável e data operacional
          precisam ser escolhidos posteriormente.
        </p>
        {value.body.task_templates.map((item, index) => (
          <section key={index} className="space-y-3 rounded border p-3">
            <SpecialtyItemFields
              item={item}
              index={index}
              noun="tarefa"
              onChange={(patch) =>
                setBody(
                  "task_templates",
                  value.body.task_templates.map((old, at) =>
                    at === index ? { ...old, ...patch } : old,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setBody(
                  "task_templates",
                  value.body.task_templates.filter((_, at) => at !== index),
                )
              }
            >
              Remover tarefa {index + 1}
            </Button>
          </section>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={value.body.task_templates.length >= 20}
          onClick={() =>
            setBody("task_templates", [
              ...value.body.task_templates,
              { key: "", title: "", description: "", category: "restricted" },
            ])
          }
        >
          Adicionar modelo de tarefa
        </Button>
      </section>
      {!itemsValid && (
        <SuccessionNotice>
          Inclua ao menos um item com título e chave exclusiva. Descreva as
          verificações e os modelos de tarefa.
        </SuccessionNotice>
      )}
      <SuccessionCheck
        label="Conferi a organização proposta; este pacote será salvo como rascunho para revisão"
        checked={confirmed}
        onChange={setConfirmed}
      />
    </AssistanceDialog>
  );
}

function SpecialtyItemFields({
  item,
  index,
  noun,
  onChange,
}: {
  item: SpecialtyTaskInput;
  index: number;
  noun: string;
  onChange(patch: Partial<SpecialtyTaskInput>): void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <SuccessionText
          label={`Chave da ${noun} ${index + 1}`}
          value={item.key}
          onChange={(key) => onChange({ key })}
          maxLength={80}
          required
        />
        <SuccessionText
          label={`Título da ${noun} ${index + 1}`}
          value={item.title}
          onChange={(title) => onChange({ title })}
          maxLength={200}
          required
        />
      </div>
      <SuccessionText
        label={`Descrição da ${noun} ${index + 1}`}
        value={item.description}
        onChange={(description) => onChange({ description })}
        multiline
        required
      />
      <SuccessionSelect
        label={`Categoria da ${noun} ${index + 1}`}
        value={item.category}
        onChange={(category) => onChange({ category: category as Category })}
      >
        <option value="restricted">Saúde e fiscal — acesso conjunto</option>
        <option value="medical">Saúde</option>
        <option value="fiscal">Fiscal</option>
        <option value="general">Geral</option>
      </SuccessionSelect>
    </>
  );
}
