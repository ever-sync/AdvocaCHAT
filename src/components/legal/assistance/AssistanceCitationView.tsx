import type { AssistanceCitationChoice } from "@/types/legal-assistance";
import { AssistanceNotice } from "./AssistanceShared";
export function AssistanceCitationView({
  choice,
}: {
  choice: AssistanceCitationChoice;
}) {
  if (!choice.readable)
    return (
      <AssistanceNotice error>
        Referência indisponível com o acesso atual. O conteúdo anterior não será
        exibido.
      </AssistanceNotice>
    );
  return (
    <details className="min-w-0 rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer break-words font-medium">
        {choice.label}
        {choice.citation.page_number != null
          ? ` · página ${choice.citation.page_number}`
          : ""}
        {!choice.current ? " · fonte desatualizada" : ""}
      </summary>
      <div className="mt-3 space-y-3">
        {!choice.current && (
          <AssistanceNotice error>
            Esta referência pertence a uma versão anterior. Confira uma fonte
            atual antes de utilizá-la em nova conclusão.
          </AssistanceNotice>
        )}
        <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3">
          {choice.citation.quote}
        </blockquote>
        <p className="text-xs text-muted-foreground">
          O trecho literal precisa sustentar a afirmação correspondente; a
          presença de uma referência não comprova essa relação.
        </p>
        <dl className="space-y-1 break-all text-xs text-muted-foreground">
          <div>
            <dt className="inline">Referência: </dt>
            <dd className="inline">{choice.citation.id}</dd>
          </div>
          <div>
            <dt className="inline">Versão da fonte: </dt>
            <dd className="inline">{choice.citation.source_version_id}</dd>
          </div>
          <div>
            <dt className="inline">Posição inicial do trecho: </dt>
            <dd className="inline">
              {choice.citation.start_offset} (contagem a partir de 1)
            </dd>
          </div>
          <div>
            <dt className="inline">Integridade da fonte: </dt>
            <dd className="inline">{choice.citation.source_sha256}</dd>
          </div>
        </dl>
      </div>
    </details>
  );
}
