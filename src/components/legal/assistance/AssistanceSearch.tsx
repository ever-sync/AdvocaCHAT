import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listLegalDocuments } from "@/lib/api/legal";
import { searchAssistance } from "@/lib/api/legal-assistance";
import type {
  AssistanceCitation,
  AssistanceSearchSource,
} from "@/types/legal-assistance";
import { LegalError, LegalField, LegalLoading } from "../LegalShared";
import { OperationPanel } from "../operations/OperationPanel";
import {
  AssistanceAccessNotice,
  AssistanceNotice,
  AssistancePagination,
} from "./AssistanceShared";
import { AssistanceCitationView } from "./AssistanceCitationView";
import {
  assistanceCaseAccess,
  assistanceCategoryAccess,
  assistanceChoice,
  assistanceKey,
  type AssistanceProps,
} from "./assistance-ui";
import { useAssistanceList } from "./assistance-hooks";
export default function AssistanceSearch({
  props,
  onCompose,
}: {
  props: AssistanceProps;
  onCompose(citations: AssistanceCitation[]): void;
}) {
  const texts = useAssistanceList(props, "text_versions"),
    knowledge = useAssistanceList(props, "knowledge");
  const documents = useQuery({
    queryKey: assistanceKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
    enabled: assistanceCaseAccess(props),
    retry: false,
  });
  const [query, setQuery] = useState(""),
    [sources, setSources] = useState<AssistanceSearchSource[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<{
    query: string;
    sources: AssistanceSearchSource[];
    request: string;
  } | null>(null);
  const textOptions = texts.rows.filter(
      (row) =>
        ["in_review", "approved", "returned"].includes(row.state) &&
        row.is_current !== false &&
        !texts.rows.some(
          (newer) =>
            newer.document_id === row.document_id &&
            newer.version_number > row.version_number,
        ),
    ),
    knowledgeOptions = knowledge.rows.filter(
      (row) => row.state === "approved" && row.is_current !== false,
    );
  const sourcesAvailable = (chosen: AssistanceSearchSource[]) =>
    chosen.every((source) =>
      source.kind === "text_page"
        ? textOptions.some((row) => row.id === source.version_id)
        : knowledgeOptions.some((row) => row.id === source.version_id),
    );
  const authorizedSearch =
    assistanceCaseAccess(props) &&
    submitted !== null &&
    sourcesAvailable(submitted.sources);
  const results = useQuery({
    queryKey: [...assistanceKey(props, "literal-search"), submitted],
    queryFn: ({ signal }) =>
      searchAssistance(
        props.legalCase.id,
        submitted!.query,
        submitted!.sources,
        10,
        signal,
      ),
    enabled: authorizedSearch,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  if (!assistanceCaseAccess(props)) return <AssistanceAccessNotice />;
  const rows =
    authorizedSearch && !results.isError
      ? (results.data?.citations ?? []).filter(
          (row) =>
            row.case_id === props.legalCase.id &&
            assistanceCategoryAccess(props, row.category),
        )
      : [];
  const selectedRows = rows.filter((row) => selected.includes(row.id));
  function toggle(
    kind: AssistanceSearchSource["kind"],
    id: string,
    checked: boolean,
  ) {
    setSources((old) =>
      checked
        ? [...old, { kind, version_id: id }]
        : old.filter(
            (source) => source.kind !== kind || source.version_id !== id,
          ),
    );
  }
  return (
    <OperationPanel
      title="Pesquisa nas fontes selecionadas"
      description="Busca literal nas páginas explicitamente conferidas deste caso e na biblioteca autorizada do escritório. Cada resultado conserva página, versão, posição e trecho exato."
    >
      <AssistanceNotice>
        Selecione as fontes e informe palavras do trecho procurado. Esta
        pesquisa não procura em outros casos nem completa lacunas com conteúdo
        externo.
      </AssistanceNotice>
      {(texts.query.isError || knowledge.query.isError) && (
        <LegalError
          error={texts.query.error ?? knowledge.query.error}
          retry={() => {
            void texts.query.refetch();
            void knowledge.query.refetch();
          }}
        />
      )}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSelected([]);
          setSubmitted({
            query: query.trim(),
            sources: [...sources],
            request: crypto.randomUUID(),
          });
        }}
      >
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 font-medium">
              Textos com páginas para pesquisa
            </legend>
            {texts.query.isPending ? (
              <LegalLoading />
            ) : !textOptions.length ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma versão enviada para revisão nesta página de resultados.
              </p>
            ) : (
              textOptions.map((row) => (
                <label className="flex items-start gap-2 text-sm" key={row.id}>
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    checked={sources.some(
                      (source) =>
                        source.kind === "text_page" &&
                        source.version_id === row.id,
                    )}
                    onChange={(event) =>
                      toggle("text_page", row.id, event.target.checked)
                    }
                  />
                  <span className="break-words">
                    {documents.data?.find(
                      (doc) =>
                        doc.id === row.document_id &&
                        assistanceCategoryAccess(props, doc.category),
                    )?.display_name ?? "Documento autorizado"}{" "}
                    · versão {row.version_number}
                    {row.completeness !== "complete" &&
                      " · cobertura parcial ou desconhecida"}
                  </span>
                </label>
              ))
            )}
            <AssistancePagination
              offset={texts.offset}
              limit={texts.limit}
              hasMore={texts.hasMore}
              pending={texts.query.isFetching}
              onChange={(offset) => {
                setSources((old) =>
                  old.filter((source) => source.kind !== "text_page"),
                );
                texts.setOffset(offset);
              }}
            />
          </fieldset>
          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 font-medium">Biblioteca revisada</legend>
            {knowledge.query.isPending ? (
              <LegalLoading />
            ) : !knowledgeOptions.length ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma fonte revisada nesta página de resultados.
              </p>
            ) : (
              knowledgeOptions.map((row) => (
                <label className="flex items-start gap-2 text-sm" key={row.id}>
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    checked={sources.some(
                      (source) =>
                        source.kind === "knowledge" &&
                        source.version_id === row.id,
                    )}
                    onChange={(event) =>
                      toggle("knowledge", row.id, event.target.checked)
                    }
                  />
                  <span className="break-words">
                    {row.title} · versão {row.version_number}
                  </span>
                </label>
              ))
            )}
            <AssistancePagination
              offset={knowledge.offset}
              limit={knowledge.limit}
              hasMore={knowledge.hasMore}
              pending={knowledge.query.isFetching}
              onChange={(offset) => {
                setSources((old) =>
                  old.filter((source) => source.kind !== "knowledge"),
                );
                knowledge.setOffset(offset);
              }}
            />
          </fieldset>
        </div>
        {sources.length > 0 && !sourcesAvailable(sources) && (
          <AssistanceNotice error>
            Uma fonte selecionada deixou de estar disponível nesta consulta.
            Selecione novamente as fontes autorizadas.
          </AssistanceNotice>
        )}
        <LegalField
          label="Palavras ou trecho literal"
          hint="De 2 a 200 caracteres; até 20 fontes selecionadas e 10 trechos por busca."
        >
          {(id) => (
            <Input
              id={id}
              required
              minLength={2}
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
        </LegalField>
        <Button
          type="submit"
          disabled={
            query.trim().length < 2 ||
            sources.length < 1 ||
            sources.length > 20 ||
            !sourcesAvailable(sources) ||
            results.isFetching
          }
        >
          Pesquisar fontes selecionadas
        </Button>
      </form>
      {submitted &&
        (!authorizedSearch ? (
          <AssistanceAccessNotice />
        ) : results.isPending ? (
          <LegalLoading />
        ) : results.isError ? (
          <LegalError
            error={results.error}
            retry={() => void results.refetch()}
          />
        ) : (
          <div className="space-y-3">
            <h3 className="font-semibold">Trechos localizados</h3>
            {!rows.length && (
              <p className="text-sm text-muted-foreground">
                Nenhum trecho literal localizado nas fontes selecionadas. A
                ausência de resultado não comprova a inexistência do fato.
              </p>
            )}
            {rows.map((row) => (
              <div className="space-y-2" key={row.id}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    checked={selected.includes(row.id)}
                    onChange={(event) =>
                      setSelected((old) =>
                        event.target.checked
                          ? [...old, row.id]
                          : old.filter((id) => id !== row.id),
                      )
                    }
                  />
                  <span className="break-words">
                    Selecionar trecho de {row.source_label}
                    {row.page_number !== null && ` · página ${row.page_number}`}
                  </span>
                </label>
                <AssistanceCitationView choice={assistanceChoice(row)} />
              </div>
            ))}
            {results.data?.has_more && (
              <AssistanceNotice>
                Há outros resultados. Refine as palavras ou reduza as fontes
                para localizar o trecho desejado.
              </AssistanceNotice>
            )}
            {props.context.can_edit && selectedRows.length > 0 && (
              <Button type="button" onClick={() => onCompose(selectedRows)}>
                Preparar rascunho com {selectedRows.length} referência(s)
              </Button>
            )}
          </div>
        ))}
    </OperationPanel>
  );
}
