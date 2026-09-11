import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LegalField } from "../LegalShared";
import type {
  AssistanceCitationChoice,
  AssistanceDraftBody,
  AssistanceDraftSection,
} from "@/types/legal-assistance";
import {
  AssistanceAccessNotice,
  AssistanceNotice,
  AssistanceSingleLine,
  AssistanceStringList,
} from "./AssistanceShared";
import { AssistanceCitationView } from "./AssistanceCitationView";
import { inspectAssistanceDraft } from "./assistance-ui";
export interface AssistanceDraftEditorProps {
  canRead: boolean;
  canEdit: boolean;
  value: AssistanceDraftBody;
  citations: AssistanceCitationChoice[];
  onChange(value: AssistanceDraftBody): void;
  busy?: boolean;
}
/** Controlled authoring only. It never generates references, approves or publishes. */
export function AssistanceDraftEditor({
  canRead,
  canEdit,
  value,
  citations,
  onChange,
  busy = false,
}: AssistanceDraftEditorProps) {
  const inspection = inspectAssistanceDraft(value, citations);
  if (!canRead || inspection.unavailable_citation_ids.length > 0)
    return <AssistanceAccessNotice />;
  const disabled = !canEdit || busy;
  const updateSection = (
    index: number,
    patch: Partial<AssistanceDraftSection>,
  ) =>
    onChange({
      ...value,
      sections: value.sections.map((section, at) =>
        at === index ? { ...section, ...patch } : section,
      ),
    });
  return (
    <div className="min-w-0 space-y-5">
      <AssistanceNotice>
        Rascunho interno. Confira as afirmações, as citações e o que ainda falta
        comprovar antes de solicitar revisão.
      </AssistanceNotice>
      {inspection.stale_citation_ids.length > 0 && (
        <AssistanceNotice error>
          Há referências a versões anteriores. Elas permanecem identificadas no
          rascunho e exigem nova conferência.
        </AssistanceNotice>
      )}
      <fieldset disabled={disabled} className="min-w-0 space-y-5">
        <AssistanceSingleLine
          label="Título do rascunho"
          value={value.title}
          onChange={(title) => onChange({ ...value, title })}
          disabled={disabled}
        />
        {value.sections.map((section, index) => (
          <section
            key={index}
            className="min-w-0 space-y-4 rounded-lg border p-4"
            aria-label={`Seção ${index + 1} do rascunho`}
          >
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-semibold">Seção {index + 1}</h3>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...value,
                    sections: value.sections.filter((_, at) => at !== index),
                  })
                }
                aria-label={`Remover seção ${index + 1}`}
              >
                Remover seção
              </Button>
            </div>
            <AssistanceSingleLine
              label={`Título da seção ${index + 1}`}
              value={section.heading}
              onChange={(heading) => updateSection(index, { heading })}
              disabled={disabled}
            />
            <LegalField label={`Texto da seção ${index + 1}`}>
              {(id) => (
                <Textarea
                  id={id}
                  rows={6}
                  maxLength={6000}
                  value={section.text}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSection(index, { text: event.target.value })
                  }
                />
              )}
            </LegalField>
            {!section.citation_ids.length && (
              <AssistanceNotice error>
                Esta seção não tem citação vinculada. Suas afirmações permanecem
                sem comprovação pelas fontes selecionadas.
              </AssistanceNotice>
            )}
            <details className="min-w-0 rounded-lg bg-muted/30 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Vincular e conferir referências desta seção (
                {section.citation_ids.length})
              </summary>
              <div className="mt-4 space-y-3">
                {!citations.length ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma referência autorizada foi selecionada para este
                    rascunho.
                  </p>
                ) : (
                  citations.map((choice) => {
                    const checked = section.citation_ids.includes(
                      choice.citation.id,
                    );
                    if (!choice.readable) return null;
                    return (
                      <div key={choice.citation.id} className="space-y-2">
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 shrink-0"
                            checked={checked}
                            disabled={disabled || (!choice.current && !checked)}
                            onChange={(event) =>
                              updateSection(index, {
                                citation_ids: event.target.checked
                                  ? [
                                      ...section.citation_ids,
                                      choice.citation.id,
                                    ]
                                  : section.citation_ids.filter(
                                      (id) => id !== choice.citation.id,
                                    ),
                              })
                            }
                          />
                          <span className="break-words">
                            Usar {choice.label}
                            {choice.citation.page_number != null
                              ? ` · página ${choice.citation.page_number}`
                              : ""}
                            {!choice.current ? " (versão anterior)" : ""}
                          </span>
                        </label>
                        <AssistanceCitationView choice={choice} />
                      </div>
                    );
                  })
                )}
              </div>
            </details>
          </section>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={disabled || value.sections.length >= 12}
          onClick={() =>
            onChange({
              ...value,
              sections: [
                ...value.sections,
                { heading: "", text: "", citation_ids: [] },
              ],
            })
          }
        >
          Adicionar seção
        </Button>
        <AssistanceStringList
          title="Fatos e documentos ainda ausentes"
          description="Registre o que falta obter ou comprovar. Um campo ausente deve continuar identificado como pendência."
          values={value.missing_facts}
          onChange={(missing_facts) => onChange({ ...value, missing_facts })}
          disabled={disabled}
          itemLabel="Pendência"
          addLabel="Adicionar pendência"
        />
        <AssistanceStringList
          title="Divergências para conferência"
          description="Preserve as versões conflitantes e indique o que precisa ser confrontado nas fontes."
          values={value.divergences}
          onChange={(divergences) => onChange({ ...value, divergences })}
          disabled={disabled}
          itemLabel="Divergência"
          addLabel="Adicionar divergência"
        />
      </fieldset>
      {!canEdit && (
        <p className="text-sm text-muted-foreground">
          Seu acesso atual permite somente a leitura deste rascunho.
        </p>
      )}
    </div>
  );
}
export default AssistanceDraftEditor;
