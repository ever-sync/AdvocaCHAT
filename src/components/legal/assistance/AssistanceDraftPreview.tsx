import { Badge } from "@/components/ui/badge";
import type {
  AssistanceCitationChoice,
  AssistanceDraftBody,
  AssistanceDraftState,
} from "@/types/legal-assistance";
import { AssistanceAccessNotice, AssistanceNotice } from "./AssistanceShared";
import { AssistanceCitationView } from "./AssistanceCitationView";
import { inspectAssistanceDraft } from "./assistance-ui";
export function AssistanceDraftPreview({
  canRead,
  body,
  citations,
  state,
  isCurrent,
}: {
  canRead: boolean;
  body: AssistanceDraftBody;
  citations: AssistanceCitationChoice[];
  state: AssistanceDraftState;
  isCurrent: boolean | null;
}) {
  const inspection = inspectAssistanceDraft(body, citations);
  if (!canRead || inspection.unavailable_citation_ids.length > 0)
    return <AssistanceAccessNotice />;
  const labels: Record<AssistanceDraftState, string> = {
    draft: "Rascunho",
    in_review: "Em revisão",
    reviewed: "Versão revisada",
    returned: "Devolvido para ajuste",
    revoked: "Versão revogada",
  };
  return (
    <article className="min-w-0 space-y-5">
      <header className="space-y-2">
        <h2 className="break-words text-xl font-semibold">
          {body.title || "Rascunho sem título"}
        </h2>
        <Badge variant="outline">{labels[state]}</Badge>
      </header>
      {isCurrent !== true || inspection.stale_citation_ids.length > 0 ? (
        <AssistanceNotice error>
          {isCurrent === null
            ? "A validade das fontes ainda não foi confirmada nesta consulta."
            : "As fontes desta versão precisam ser reexaminadas. A revisão histórica não autoriza uso com elementos alterados."}
        </AssistanceNotice>
      ) : null}
      {body.sections.map((section, index) => (
        <section
          className="min-w-0 space-y-3 rounded-lg border p-4"
          key={index}
        >
          <h3 className="break-words font-semibold">
            {section.heading || `Seção ${index + 1} sem título`}
          </h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            {section.text}
          </p>
          {!section.citation_ids.length ? (
            <AssistanceNotice error>
              Seção sem citação: as afirmações não foram comprovadas pelas
              fontes selecionadas.
            </AssistanceNotice>
          ) : (
            section.citation_ids.map((id) => {
              const choice = citations.find((item) => item.citation.id === id);
              return choice ? (
                <AssistanceCitationView key={id} choice={choice} />
              ) : null;
            })
          )}
        </section>
      ))}
      <section className="space-y-2 rounded-lg bg-muted/30 p-4">
        <h3 className="font-semibold">Fatos e documentos ainda ausentes</h3>
        {body.missing_facts.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {body.missing_facts.map((fact, index) => (
              <li key={index} className="whitespace-pre-wrap break-words">
                {fact || "Pendência ainda não descrita"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma pendência registrada no rascunho. Isso não comprova que a
            documentação esteja completa.
          </p>
        )}
      </section>
      <section className="space-y-2 rounded-lg bg-muted/30 p-4">
        <h3 className="font-semibold">Divergências registradas</h3>
        {body.divergences.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {body.divergences.map((item, index) => (
              <li key={index} className="whitespace-pre-wrap break-words">
                {item || "Divergência ainda não descrita"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma divergência registrada nesta versão.
          </p>
        )}
      </section>
    </article>
  );
}
export default AssistanceDraftPreview;
