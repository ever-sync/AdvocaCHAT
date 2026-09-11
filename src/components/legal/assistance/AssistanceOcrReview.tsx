import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  AssistanceOcrKernelResult,
  AssistanceOcrPage,
  AssistanceOcrWord,
} from "@/types/legal-assistance";
import { AssistanceAccessNotice, AssistanceNotice } from "./AssistanceShared";
import {
  assistanceConfidence,
  assistanceOcrReason,
  OCR_PAGE_LABELS,
  OCR_RESULT_LABELS,
} from "./assistance-ui";
export interface AssistanceOcrReviewProps {
  canRead: boolean;
  documentName: string;
  result: AssistanceOcrKernelResult | null;
  selectedPage: number | null;
  onSelectPage(page: number): void;
  originalPreview?: ReactNode;
  onOpenOriginal?(): void;
  onStartCorrection?(page: AssistanceOcrPage): void;
  onReviewPage?(page: AssistanceOcrPage): void;
  busy?: boolean;
}
/** Pure view: all reads, authorization checks and version writes belong to its caller. */
export function AssistanceOcrReview({
  canRead,
  documentName,
  result,
  selectedPage,
  onSelectPage,
  originalPreview,
  onOpenOriginal,
  onStartCorrection,
  onReviewPage,
  busy = false,
}: AssistanceOcrReviewProps) {
  if (!canRead) return <AssistanceAccessNotice />;
  if (!result)
    return (
      <AssistanceNotice>
        Nenhum resultado de reconhecimento está disponível nesta consulta.
      </AssistanceNotice>
    );
  const page = result.pages.find((item) => item.page === selectedPage);
  const reason = assistanceOcrReason(result.reason);
  return (
    <section className="min-w-0 space-y-5">
      <header className="space-y-2">
        <h2 className="break-words text-lg font-semibold">{documentName}</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{OCR_RESULT_LABELS[result.status]}</Badge>
          <Badge variant="outline">
            {result.pages_total === null
              ? "Total de páginas não determinado"
              : `${result.pages_total} páginas no original`}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Texto reconhecido e confiança de leitura precisam ser conferidos junto
          ao original. Nenhum valor, doença ou data foi confirmado por esse
          processamento.
        </p>
      </header>
      {reason && <AssistanceNotice error>{reason}</AssistanceNotice>}
      {result.status === "partial" && (
        <AssistanceNotice error>
          O documento permanece parcialmente reconhecido. Conferir uma página
          não confirma as demais nem transforma páginas ausentes em páginas
          vazias.
        </AssistanceNotice>
      )}
      {!result.pages.length ? (
        <AssistanceNotice>
          Nenhuma página possui saída para conferência. O original continua
          disponível conforme sua autorização.
        </AssistanceNotice>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[14rem_1fr]">
          <nav
            aria-label="Páginas do documento"
            className="flex max-h-[28rem] flex-wrap content-start gap-2 overflow-y-auto lg:flex-col"
          >
            {result.pages.map((item) => (
              <Button
                key={item.page}
                type="button"
                variant={selectedPage === item.page ? "default" : "outline"}
                aria-current={selectedPage === item.page ? "page" : undefined}
                className="h-auto min-h-10 justify-start whitespace-normal text-left"
                onClick={() => onSelectPage(item.page)}
              >
                <span>
                  Página {item.page}
                  <span className="mt-1 block text-xs font-normal">
                    {OCR_PAGE_LABELS[item.status]}
                  </span>
                </span>
              </Button>
            ))}
          </nav>
          <div className="min-w-0 space-y-4">
            {!page ? (
              <AssistanceNotice>
                Selecione uma página existente para conferir o reconhecimento.
              </AssistanceNotice>
            ) : (
              <>
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">Página {page.page}</h3>
                  <Badge variant="outline">
                    {OCR_PAGE_LABELS[page.status]}
                  </Badge>
                </div>
                <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                  <section
                    className="min-w-0 space-y-3 rounded-lg border p-4"
                    aria-label={`Original da página ${page.page}`}
                  >
                    <h4 className="font-medium">Original para conferência</h4>
                    {originalPreview ?? (
                      <p className="text-sm text-muted-foreground">
                        Abra o arquivo original e confira a página {page.page}.
                        A transcrição mantém sua referência de origem.
                      </p>
                    )}
                    {onOpenOriginal && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={onOpenOriginal}
                      >
                        Abrir original autorizado
                      </Button>
                    )}
                  </section>
                  <section
                    className="min-w-0 space-y-3 rounded-lg border p-4"
                    aria-label={`Texto da página ${page.page}`}
                  >
                    <h4 className="font-medium">Texto reconhecido</h4>
                    {page.status === "not_processed" ? (
                      <AssistanceNotice error>
                        {assistanceOcrReason(page.reason)} Esta página não
                        possui texto reconhecido; isso não indica uma página em
                        branco.
                      </AssistanceNotice>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Confiança média do reconhecimento:{" "}
                          {assistanceConfidence(page.confidence_mean)}. Esse
                          indicador não mede a veracidade do conteúdo.
                        </p>
                        {page.status === "no_text_recognized" ? (
                          <AssistanceNotice>
                            Nenhum texto foi reconhecido. Examine a imagem
                            original antes de registrar uma transcrição manual.
                          </AssistanceNotice>
                        ) : (
                          <pre className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm">
                            {page.text}
                          </pre>
                        )}
                      </>
                    )}
                  </section>
                </div>
                <div className="flex flex-wrap gap-2">
                  {onStartCorrection && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onStartCorrection(page)}
                    >
                      {page.status === "not_processed" ||
                      page.status === "no_text_recognized"
                        ? "Iniciar transcrição manual"
                        : "Propor correção em nova versão"}
                    </Button>
                  )}
                  {onReviewPage && page.status !== "not_processed" && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => onReviewPage(page)}
                    >
                      Conferir esta página
                    </Button>
                  )}
                </div>
                {page.status !== "not_processed" && page.words.length > 0 && (
                  <details className="rounded-lg border p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Palavras reconhecidas e localização na imagem
                    </summary>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Coordenadas em pixels da imagem renderizada ({page.width}{" "}
                      × {page.height}). A localização acompanha o reconhecimento
                      original e não confirma seu significado.
                    </p>
                    <AssistanceOcrWords key={page.page} words={page.words} />
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {!result.pages.length && onOpenOriginal && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onOpenOriginal}
        >
          Abrir original autorizado
        </Button>
      )}
      <details className="rounded-lg border p-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">
          Origem e versão do reconhecimento
        </summary>
        <div className="mt-3 space-y-2 break-words">
          <p>
            Motor: {result.engine.tesseract ?? "Não identificado"} · Kernel:{" "}
            {result.kernel_version}
          </p>
          <p>
            Modelos de idioma:{" "}
            {result.engine.models?.map((model) => model.language).join(", ") ||
              "Não identificados"}
          </p>
          <p className="break-all">
            SHA-256 do original: {result.source_sha256 ?? "Não disponível"}
          </p>
          <p>Estado da revisão do resultado: não revisado.</p>
        </div>
      </details>
    </section>
  );
}
export function AssistanceOcrWords({ words }: { words: AssistanceOcrWord[] }) {
  const [offset, setOffset] = useState(0);
  const end = Math.min(offset + 100, words.length);
  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        Palavras {offset + 1} a {end} de {words.length}
      </p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {words.slice(offset, end).map((word, index) => (
          <li
            key={`${offset + index}`}
            className="min-w-0 space-y-1 rounded border p-2 text-sm"
          >
            <p className="break-words font-medium">{word.text}</p>
            <p className="break-words text-xs text-muted-foreground">
              Confiança de leitura {assistanceConfidence(word.confidence)} · x{" "}
              {word.left}, y {word.top}, largura {word.width}, altura{" "}
              {word.height}
            </p>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          Palavras anteriores
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={end === words.length}
          onClick={() => setOffset(end)}
        >
          Próximas palavras
        </Button>
      </div>
    </div>
  );
}
export default AssistanceOcrReview;
