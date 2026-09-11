import type {
  ExpansionSpecialtyBody,
  ExpansionSpecialtyRead,
} from "@/types/legal-expansion";
import { AssistanceSourceLink } from "../assistance/AssistanceKnowledgeFields";
import { EXPANSION_CATEGORIES, expansionDate } from "./expansion-ui";
import { SuccessionNotice } from "./ExpansionSuccessionFields";
export function ExpansionSpecialtyBodyView({
  body,
}: {
  body: ExpansionSpecialtyBody;
}) {
  return (
    <div className="space-y-4">
      <section>
        <h4 className="font-medium">Etapas ({body.stages.length})</h4>
        <ul className="list-inside list-disc text-sm">
          {body.stages.map((stage) => (
            <li key={stage.key} className="break-words">
              {stage.label}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h4 className="font-medium">Verificações ({body.checklist.length})</h4>
        {body.checklist.map((item) => (
          <article
            key={item.key}
            className="space-y-1 rounded border p-3 text-sm"
          >
            <p className="break-words font-medium">{item.title}</p>
            <p>
              {EXPANSION_CATEGORIES[item.category]} ·{" "}
              {item.required
                ? "Necessária no fluxo organizacional"
                : "Opcional no fluxo organizacional"}
            </p>
            <p className="whitespace-pre-wrap break-words">
              {item.description}
            </p>
          </article>
        ))}
      </section>
      <section className="space-y-2">
        <h4 className="font-medium">
          Modelos de tarefa ({body.task_templates.length})
        </h4>
        {body.task_templates.map((item) => (
          <article
            key={item.key}
            className="space-y-1 rounded border p-3 text-sm"
          >
            <p className="break-words font-medium">{item.title}</p>
            <p>{EXPANSION_CATEGORIES[item.category]}</p>
            <p className="whitespace-pre-wrap break-words">
              {item.description}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
export function ExpansionSpecialtyDetails({
  data,
}: {
  data: ExpansionSpecialtyRead;
}) {
  const value = data.version;
  return (
    <div className="space-y-4">
      <h3 className="break-words font-medium">
        {value.title} · versão {value.version_number}
      </h3>
      <p className="text-sm">
        Especialidade declarada: {value.specialty}. Consulta:{" "}
        {expansionDate(value.checked_on)}.
      </p>
      {value.state === "reviewed" && !data.is_current && (
        <SuccessionNotice error>
          Esta versão não está atual para nova instalação. Revise as referências
          e versões posteriores.
        </SuccessionNotice>
      )}
      <p className="whitespace-pre-wrap break-words text-sm">{value.purpose}</p>
      <p className="whitespace-pre-wrap break-words text-sm">
        Escopo: {value.scope}
      </p>
      <p className="whitespace-pre-wrap break-words text-sm">
        Vigência e condições: {value.validity_note}
      </p>
      <p className="whitespace-pre-wrap break-words text-sm">
        Limitações: {value.limitations}
      </p>
      <AssistanceSourceLink url={value.source_url} />
      <ExpansionSpecialtyBodyView body={value.body} />
    </div>
  );
}
