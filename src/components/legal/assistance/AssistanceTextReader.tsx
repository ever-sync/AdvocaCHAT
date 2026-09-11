import { AssistanceOcrWords } from "./AssistanceOcrReview";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAssistanceTextVersion,
  listAssistanceTextPages,
  readAssistanceOriginal,
  readAssistanceTextPage,
  reviewAssistanceTextPages,
  revokeAssistanceText,
  submitAssistanceText,
} from "@/lib/api/legal-assistance";
import type {
  AssistanceTextInput,
  AssistanceTextVersion,
} from "@/types/legal-assistance";
import type { LegalCaseDocument } from "@/types/legal";
import { LegalError, LegalField, LegalLoading } from "../LegalShared";
import { useLegalAction } from "../legal-ui";
import { OperationReasonDialog } from "../operations/OperationPanel";
import {
  AssistanceAccessNotice,
  AssistanceDialog,
  AssistanceNotice,
  AssistancePagination,
} from "./AssistanceShared";
import {
  ASSISTANCE_TEXT_STATES,
  OCR_PAGE_LABELS,
  assistanceCategoryAccess,
  assistanceConfidence,
  assistanceDate,
  assistanceKey,
  type AssistanceProps,
} from "./assistance-ui";
export function AssistanceTextReader({
  props,
  version,
  document: original,
  onClose,
}: {
  props: AssistanceProps;
  version: AssistanceTextVersion;
  document?: LegalCaseDocument;
  onClose(): void;
}) {
  const [selected, setSelected] = useState<number | null>(null),
    [offset, setOffset] = useState(0),
    [decision, setDecision] = useState<
      "approved" | "returned" | "revoked" | null
    >(null),
    [correction, setCorrection] = useState(false);
  const action = useLegalAction(),
    allowed = assistanceCategoryAccess(props, version.category);
  const live = useRef(false);
  live.current =
    allowed && Boolean(original) && original?.sha256 === version.source_sha256;
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const pages = useQuery({
    queryKey: [...assistanceKey(props, "text-pages"), version.id, offset],
    queryFn: ({ signal }) =>
      listAssistanceTextPages(version.id, 20, offset, signal),
    enabled: allowed,
    retry: false,
    refetchInterval: 15000,
  });
  const read = useQuery({
    queryKey: [...assistanceKey(props, "text-page"), version.id, selected],
    queryFn: ({ signal }) =>
      readAssistanceTextPage(version.id, selected!, signal),
    enabled: allowed && selected !== null,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 15000,
  });
  if (!allowed) return <AssistanceAccessNotice />;
  const data = read.isError ? undefined : read.data;
  const current = data?.is_current === true,
    canReview =
      props.context.can_review &&
      current &&
      data?.version.state === "in_review" &&
      data.page.page_status !== "not_processed";
  const metadata = pages.isError ? [] : (pages.data?.items ?? []);
  async function openOriginal() {
    if (!original || !live.current) return;
    await action.run(async () => {
      const blob = await readAssistanceOriginal(original!.id);
      if (!live.current) return;
      const url = URL.createObjectURL(blob),
        anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = original!.file_name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "Leitura do original registrada");
  }
  return (
    <AssistanceDialog
      title="Conferência do texto por página"
      description="Leia o original, confira cada página e registre a decisão. Uma versão parcial permanece parcial mesmo quando as páginas disponíveis são revisadas."
      onClose={onClose}
    >
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">Versão {version.version_number}</Badge>
        <Badge variant="outline">
          {ASSISTANCE_TEXT_STATES[data?.version.state ?? version.state]}
        </Badge>
        <Badge variant="outline">
          {version.completeness === "complete"
            ? "Cobertura completa"
            : version.completeness === "partial"
              ? "Cobertura parcial"
              : "Cobertura desconhecida"}
        </Badge>
      </div>
      <p className="break-words text-sm">
        {original?.display_name ?? "Documento autorizado"} ·{" "}
        {version.pages_total === null
          ? "Total de páginas não determinado"
          : `${version.pages_total} páginas no original`}
        .
      </p>
      {version.completeness !== "complete" && (
        <AssistanceNotice error>
          Páginas ausentes, ilegíveis ou não processadas continuam identificadas
          como lacunas. A conferência não preenche essas páginas
          automaticamente.
        </AssistanceNotice>
      )}
      {pages.isPending ? (
        <LegalLoading />
      ) : pages.isError ? (
        <LegalError error={pages.error} retry={() => void pages.refetch()} />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[12rem_1fr]">
          <nav
            aria-label="Páginas desta versão"
            className="flex flex-wrap content-start gap-2 lg:flex-col"
          >
            {metadata.map((page) => (
              <Button
                className="h-auto min-h-10 justify-start whitespace-normal text-left"
                type="button"
                key={page.id}
                variant={selected === page.page_number ? "default" : "outline"}
                onClick={() => setSelected(page.page_number)}
              >
                <span>
                  Página {page.page_number}
                  <span className="block text-xs font-normal">
                    {page.page_status === "manual"
                      ? "Transcrição manual"
                      : OCR_PAGE_LABELS[page.page_status]}{" "}
                    ·{" "}
                    {page.review_state === "approved"
                      ? "conferida"
                      : page.review_state === "returned"
                        ? "devolvida"
                        : "não conferida"}
                  </span>
                </span>
              </Button>
            ))}
          </nav>
          <section className="min-w-0 space-y-4">
            {selected === null ? (
              <AssistanceNotice>
                Selecione uma página para realizar a leitura autorizada.
              </AssistanceNotice>
            ) : read.isPending ? (
              <LegalLoading />
            ) : read.isError ? (
              <LegalError
                error={read.error}
                retry={() => void read.refetch()}
              />
            ) : data ? (
              <>
                {!current && (
                  <AssistanceNotice error>
                    Esta versão foi substituída ou sua origem mudou. O conteúdo
                    é histórico e precisa ser reexaminado.
                  </AssistanceNotice>
                )}
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">
                    Página {data.page.page_number}
                  </h3>
                  {original && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={action.pending}
                      onClick={() => void openOriginal()}
                    >
                      Baixar original para conferir
                    </Button>
                  )}
                </div>
                {data.page.page_status === "not_processed" ? (
                  <AssistanceNotice error>
                    Esta página não foi processada. Ausência de texto
                    reconhecido não indica página em branco.
                  </AssistanceNotice>
                ) : data.page.page_status === "no_text_recognized" ? (
                  <AssistanceNotice>
                    Nenhum texto foi reconhecido. Examine o original antes de
                    registrar uma transcrição ou confirmar a página.
                  </AssistanceNotice>
                ) : (
                  <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border p-4 font-sans text-sm">
                    {data.page.text}
                  </pre>
                )}
                {data.page.page_status !== "manual" && (
                  <p className="text-xs text-muted-foreground">
                    Confiança do reconhecimento:{" "}
                    {assistanceConfidence(data.page.confidence_mean)}. Não mede
                    a veracidade do conteúdo.
                  </p>
                )}
                {data.page.words.length > 0 && (
                  <details className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Palavras e localização no original
                    </summary>
                    <AssistanceOcrWords
                      key={data.page.id}
                      words={data.page.words}
                    />
                  </details>
                )}
                <p className="text-xs text-muted-foreground">
                  Revisão da página:{" "}
                  {data.page.review_state === "approved"
                    ? "conferida"
                    : data.page.review_state === "returned"
                      ? "devolvida para ajuste"
                      : "não conferida"}
                  {data.page.reviewed_at &&
                    ` · ${assistanceDate(data.page.reviewed_at)}`}
                  . {data.page.review_note}
                </p>
                <div className="flex flex-wrap gap-2">
                  {props.context.can_edit && current && original && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setCorrection(true)}
                    >
                      Corrigir em nova versão
                    </Button>
                  )}
                  {props.context.can_edit &&
                    current &&
                    ["draft", "returned"].includes(data.version.state) && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={action.pending}
                        onClick={() =>
                          void action.run(
                            () => submitAssistanceText(version.id),
                            "Versão enviada para revisão",
                          )
                        }
                      >
                        Enviar versão para revisão
                      </Button>
                    )}
                  {canReview && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setDecision("approved")}
                      >
                        Confirmar revisão desta página
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDecision("returned")}
                      >
                        Devolver esta página
                      </Button>
                    </>
                  )}
                  {props.context.can_review &&
                    current &&
                    data.version.state !== "revoked" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDecision("revoked")}
                      >
                        Revogar uso da versão
                      </Button>
                    )}
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
      <AssistancePagination
        offset={offset}
        limit={20}
        hasMore={pages.data?.has_more === true}
        pending={pages.isFetching}
        onChange={setOffset}
      />
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Integridade do original</summary>
        <p className="mt-2 break-all">SHA-256: {version.source_sha256}</p>
      </details>
      {decision &&
        data &&
        current &&
        props.context.can_review &&
        (decision === "revoked" || canReview) && (
          <OperationReasonDialog
            open
            onClose={() => setDecision(null)}
            title={
              decision === "revoked"
                ? "Revogar o uso desta versão"
                : `Conferência explícita da página ${data.page.page_number}`
            }
            description={
              decision === "revoked"
                ? "A revogação impede novos usos e leituras dependentes. O histórico permanece preservado."
                : "A decisão vale apenas para a página identificada e não confirma automaticamente valores, datas ou conclusões jurídicas."
            }
            pending={action.pending}
            actionLabel={
              decision === "approved"
                ? "Confirmar página conferida"
                : decision === "returned"
                  ? "Devolver para ajuste"
                  : "Confirmar revogação"
            }
            onSave={(note) =>
              action.run(
                () =>
                  decision === "revoked"
                    ? revokeAssistanceText(version.id, note)
                    : reviewAssistanceTextPages(
                        version.id,
                        [data.page.page_number],
                        decision,
                        note,
                      ),
                "Decisão registrada",
              )
            }
          />
        )}
      {correction && original && props.context.can_edit && current && (
        <AssistanceTranscriptionDialog
          props={props}
          document={original}
          previous={data.version}
          onClose={() => setCorrection(false)}
        />
      )}
    </AssistanceDialog>
  );
}
export function AssistanceTranscriptionDialog({
  props,
  document: original,
  previous,
  onClose,
}: {
  props: AssistanceProps;
  document: LegalCaseDocument;
  previous?: AssistanceTextVersion;
  onClose(): void;
}) {
  const allowed = assistanceCategoryAccess(props, original.category),
    action = useLegalAction();
  const [total, setTotal] = useState(previous?.pages_total?.toString() ?? ""),
    [note, setNote] = useState("");
  const [manual, setManual] = useState<{ page_number: number; text: string }[]>(
    previous ? [] : [{ page_number: 1, text: "" }],
  );
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const existing = useQuery({
    queryKey: [...assistanceKey(props, "correction-pages"), previous?.id],
    enabled: allowed && Boolean(previous),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const metadata = await listAssistanceTextPages(
        previous!.id,
        20,
        0,
        signal,
      );
      if (metadata.has_more)
        throw new Error(
          "A versão ultrapassa o limite de edição de 20 páginas.",
        );
      const pages = await Promise.all(
        metadata.items
          .filter((page) =>
            ["recognized", "low_confidence", "manual"].includes(
              page.page_status,
            ),
          )
          .map((page) =>
            readAssistanceTextPage(previous!.id, page.page_number, signal),
          ),
      );
      if (pages.some((read) => !read.is_current))
        throw new Error(
          "A versão mudou. Atualize os dados antes de propor correção.",
        );
      if (pages.some((read) => read.page.text === null))
        throw new Error(
          "Uma página transcrita não pôde ser recuperada. Atualize a leitura antes de corrigir.",
        );
      return pages.map((read) => ({
        page_number: read.page.page_number,
        text: read.page.text!,
      }));
    },
  });
  if (!allowed || !props.context.can_edit) return <AssistanceAccessNotice />;
  const sourcePages = existing.isError ? [] : (existing.data ?? []);
  const pages = [
    ...sourcePages.map((page) => ({
      ...page,
      text: overrides[page.page_number] ?? page.text,
    })),
    ...manual,
  ];
  const invalid =
    !note.trim() ||
    pages.length === 0 ||
    pages.length > 20 ||
    pages.some(
      (page) =>
        !Number.isInteger(page.page_number) ||
        page.page_number < 1 ||
        (total && page.page_number > Number(total)),
    ) ||
    new Set(pages.map((page) => page.page_number)).size !== pages.length ||
    new TextEncoder().encode(pages.map((page) => page.text).join("")).length >
      2 * 1024 * 1024 ||
    (previous && (existing.isPending || existing.isError));
  return (
    <AssistanceDialog
      title={
        previous ? "Correção em nova versão" : "Transcrição manual do documento"
      }
      description="Registre apenas o texto conferido no original. Toda página já transcrita é preservada na nova versão; páginas não informadas continuam ausentes."
      onClose={onClose}
      pending={action.pending}
      disabled={Boolean(invalid)}
      actionLabel="Salvar nova versão não revisada"
      onSubmit={async () => {
        const payload: AssistanceTextInput = {
          mode: previous ? "correction" : "manual",
          previous_version_id: previous?.id,
          ...(total ? { pages_total: Number(total) } : {}),
          note: note.trim(),
          pages,
        };
        if (
          await action.run(
            () => createAssistanceTextVersion(original.id, payload),
            "Nova versão de texto registrada",
          )
        )
          onClose();
      }}
    >
      <p className="break-words font-medium">{original.display_name}</p>
      <AssistanceNotice>
        O original e as versões anteriores permanecem preservados. O texto salvo
        precisa ser enviado para revisão; correções não aprovam o conteúdo
        automaticamente.
      </AssistanceNotice>
      {previous && existing.isPending ? (
        <LegalLoading />
      ) : previous && existing.isError ? (
        <LegalError
          error={existing.error}
          retry={() => void existing.refetch()}
        />
      ) : (
        <>
          <LegalField
            label="Total de páginas do original, quando conferido"
            hint="Deixe em branco se ainda não foi possível determinar. Até 20 páginas de texto por versão."
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={1000}
                step={1}
                readOnly={previous?.pages_total != null}
                value={total}
                onChange={(event) => setTotal(event.target.value)}
              />
            )}
          </LegalField>
          {pages.map((page, index) => (
            <section
              className="space-y-3 rounded-lg border p-3"
              key={`${index}-${index < sourcePages.length ? "source" : "manual"}`}
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <LegalField label={`Página original do trecho ${index + 1}`}>
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        min={1}
                        max={total ? Number(total) : 1000}
                        step={1}
                        readOnly={index < sourcePages.length}
                        value={page.page_number || ""}
                        onChange={(event) =>
                          setManual((rows) =>
                            rows.map((row, at) =>
                              at === index - sourcePages.length
                                ? {
                                    ...row,
                                    page_number: Number(event.target.value),
                                  }
                                : row,
                            ),
                          )
                        }
                      />
                    )}
                  </LegalField>
                </div>
                {index >= sourcePages.length && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setManual((rows) =>
                        rows.filter(
                          (_, at) => at !== index - sourcePages.length,
                        ),
                      )
                    }
                  >
                    Remover trecho novo
                  </Button>
                )}
              </div>
              <LegalField
                label={`Texto da página ${page.page_number || "não informada"}`}
              >
                {(id) => (
                  <Textarea
                    id={id}
                    rows={8}
                    value={page.text}
                    onChange={(event) =>
                      index < sourcePages.length
                        ? setOverrides((old) => ({
                            ...old,
                            [page.page_number]: event.target.value,
                          }))
                        : setManual((rows) =>
                            rows.map((row, at) =>
                              at === index - sourcePages.length
                                ? { ...row, text: event.target.value }
                                : row,
                            ),
                          )
                    }
                  />
                )}
              </LegalField>
            </section>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pages.length >= 20}
            onClick={() =>
              setManual((rows) => [...rows, { page_number: 0, text: "" }])
            }
          >
            Adicionar página transcrita
          </Button>
          <LegalField label="Fundamento da transcrição ou correção">
            {(id) => (
              <Textarea
                id={id}
                required
                minLength={3}
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            )}
          </LegalField>
          {pages.length > 0 &&
            new Set(pages.map((page) => page.page_number)).size !==
              pages.length && (
              <AssistanceNotice error>
                Há páginas repetidas. Cada página original deve aparecer apenas
                uma vez.
              </AssistanceNotice>
            )}
        </>
      )}
    </AssistanceDialog>
  );
}
