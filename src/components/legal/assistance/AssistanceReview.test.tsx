import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  AssistanceCitationChoice,
  AssistanceDraftBody,
  AssistanceOcrKernelResult,
  AssistancePageTextEdit,
} from "@/types/legal-assistance";
import { AssistanceOcrReview } from "./AssistanceOcrReview";
import { AssistanceDraftEditor } from "./AssistanceDraftEditor";
import { AssistanceDraftPreview } from "./AssistanceDraftPreview";
import { AssistancePageTextEditor } from "./AssistancePageTextEditor";

afterEach(cleanup);

const recognizedText =
  "<script>conteudoSintetico()</script> Valor lido: R$ 1.001,01";
const result: AssistanceOcrKernelResult = {
  kernel_version: "test-only",
  source_sha256: "a".repeat(64),
  source_bytes: 100,
  mime_type: "application/pdf",
  status: "partial",
  reason: "deadline_exceeded",
  pages_total: 3,
  pages: [
    {
      page: 1,
      status: "recognized",
      text: recognizedText,
      tsv: "",
      confidence_mean: "91.20",
      width: 100,
      height: 200,
      coordinate_system: "rendered_pixels",
      review_status: "unreviewed",
      words: [
        {
          text: "Palavra privada",
          left: 1,
          top: 2,
          width: 3,
          height: 4,
          confidence: "91.20",
          block: 1,
          paragraph: 1,
          line: 1,
        },
      ],
    },
    {
      page: 2,
      status: "not_processed",
      reason: "deadline_exceeded",
      review_status: "unreviewed",
    },
    {
      page: 3,
      status: "no_text_recognized",
      text: "",
      words: [],
      tsv: "",
      confidence_mean: null,
      width: 100,
      height: 200,
      coordinate_system: "rendered_pixels",
      review_status: "unreviewed",
    },
  ],
  engine: {
    tesseract: "synthetic",
    models: [{ language: "por", sha256: "b".repeat(64) }],
    memory_enforcement: "rss_process_group_monitor",
  },
  review_status: "unreviewed",
  elapsed_ms: 123,
};
const citation: AssistanceCitationChoice = {
  label: "Laudo sintético protegido",
  readable: true,
  current: true,
  citation: {
    id: "citation-1",
    case_id: "case-1",
    category: "restricted",
    source_kind: "text_page",
    source_version_id: "version-1",
    document_id: "document-1",
    page_number: 2,
    start_offset: 1,
    source_label: "Laudo sintético protegido",
    quote: "Trecho privado da prova",
    source_sha256: "c".repeat(64),
    created_at: "2026-09-11T12:00:00Z",
  },
};
const body: AssistanceDraftBody = {
  title: "Rascunho privado sintético",
  sections: [
    {
      heading: "Fatos",
      text: "Afirmação privada para conferir",
      citation_ids: [citation.citation.id],
    },
  ],
  missing_facts: ["Obter o documento original"],
  divergences: ["As datas das duas fontes divergem"],
};

it("keeps incomplete OCR distinct from a blank page and only exposes real page outputs", () => {
  const review = vi.fn(),
    correct = vi.fn(),
    select = vi.fn();
  const props = {
    canRead: true,
    documentName: "Documento sintético",
    result,
    selectedPage: 2,
    onSelectPage: select,
    onReviewPage: review,
    onStartCorrection: correct,
  };
  const view = render(<AssistanceOcrReview {...props} />);
  expect(screen.getByText(/isso não indica uma página em branco/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Conferir esta página" }),
  ).toBeNull();
  expect(screen.getByText(/permanece parcialmente reconhecido/)).toBeTruthy();
  expect(review).not.toHaveBeenCalled();
  expect(correct).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Iniciar transcrição manual" }),
  );
  expect(correct).toHaveBeenCalledWith(result.pages[1]);
  fireEvent.click(screen.getByRole("button", { name: /Página 3/ }));
  expect(select).toHaveBeenCalledWith(3);
  view.rerender(<AssistanceOcrReview {...props} selectedPage={3} />);
  expect(screen.getByText(/Nenhum texto foi reconhecido/)).toBeTruthy();
  expect(screen.queryByText(/isso não indica uma página em branco/)).toBeNull();
  view.rerender(
    <AssistanceOcrReview
      {...props}
      selectedPage={null}
      result={{
        ...result,
        status: "refused",
        reason: "page_limit_exceeded",
        pages_total: 21,
        pages: [],
      }}
    />,
  );
  expect(
    screen.queryByRole("navigation", { name: "Páginas do documento" }),
  ).toBeNull();
  expect(screen.getByText("21 páginas no original")).toBeTruthy();
  expect(screen.getByText(/Nenhuma página possui saída/)).toBeTruthy();
});

it("renders OCR markup literally and removes cached original, words and text after known revocation", () => {
  const open = vi.fn(),
    review = vi.fn();
  const props = {
    canRead: true,
    documentName: "Nome do documento reservado",
    result,
    selectedPage: 1,
    onSelectPage: vi.fn(),
    onOpenOriginal: open,
    onReviewPage: review,
    originalPreview: <span>Imagem privada sintética</span>,
  };
  const view = render(<AssistanceOcrReview {...props} />);
  expect(screen.getByText(recognizedText)).toBeTruthy();
  expect(view.container.querySelector("script")).toBeNull();
  expect(
    screen.getByText("Estado da revisão do resultado: não revisado."),
  ).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
  expect(review).not.toHaveBeenCalled();
  view.rerender(<AssistanceOcrReview {...props} canRead={false} />);
  for (const value of [
    recognizedText,
    props.documentName,
    "Imagem privada sintética",
    "Palavra privada",
  ])
    expect(screen.queryByText(value)).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

it("removes both a draft body and citation details when a previously readable source is revoked", () => {
  const props = {
    canRead: true,
    body,
    citations: [citation],
    state: "reviewed" as const,
    isCurrent: true,
  };
  const view = render(<AssistanceDraftPreview {...props} />);
  expect(screen.getByText(body.sections[0].text)).toBeTruthy();
  expect(screen.getByText(citation.citation.quote)).toBeTruthy();
  view.rerender(
    <AssistanceDraftPreview
      {...props}
      citations={[{ ...citation, readable: false }]}
    />,
  );
  for (const text of [
    body.title,
    body.sections[0].text,
    body.divergences[0],
    citation.label,
    citation.citation.quote,
  ])
    expect(screen.queryByText(text)).toBeNull();
});

it("preserves readable historical references with a warning and no approval or publication action", () => {
  const props = {
    canRead: true,
    body,
    citations: [{ ...citation, current: false }],
    state: "reviewed" as const,
    isCurrent: false,
  };
  render(<AssistanceDraftPreview {...props} />);
  expect(screen.getByText(citation.citation.quote)).toBeTruthy();
  expect(screen.getByText(/revisão histórica não autoriza uso/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /aprovar|publicar|enviar/i }),
  ).toBeNull();
});

it("links a reference only on an explicit edit without inserting its quote or mutating the original body", () => {
  const value = {
    ...body,
    sections: [{ ...body.sections[0], citation_ids: [] }],
  };
  const before = structuredClone(value),
    change = vi.fn();
  render(
    <AssistanceDraftEditor
      canRead
      canEdit
      value={value}
      citations={[citation]}
      onChange={change}
    />,
  );
  expect(screen.getByText(/Esta seção não tem citação vinculada/)).toBeTruthy();
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: /Usar Laudo sintético protegido/,
      hidden: true,
    }),
  );
  const edited = change.mock.calls[0][0] as AssistanceDraftBody;
  expect(edited.sections[0].citation_ids).toEqual([citation.citation.id]);
  expect(edited.sections[0].text).toBe(before.sections[0].text);
  expect(edited.sections[0].text).not.toContain(citation.citation.quote);
  expect(edited.missing_facts).toEqual(before.missing_facts);
  expect(edited.divergences).toEqual(before.divergences);
  expect(value).toEqual(before);
});

it("does not expose an editor with missing reference authorization and disables a read-only editor", () => {
  const props = {
    canRead: true,
    canEdit: false,
    value: body,
    citations: [citation],
    onChange: vi.fn(),
  };
  const view = render(<AssistanceDraftEditor {...props} />);
  expect(view.container.querySelector("fieldset")?.disabled).toBe(true);
  view.rerender(<AssistanceDraftEditor {...props} citations={[]} />);
  expect(screen.queryByDisplayValue(body.title)).toBeNull();
  expect(screen.queryByDisplayValue(body.sections[0].text)).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
});

it("keeps correction intent on its original page and removes it after losing read access", () => {
  const value: AssistancePageTextEdit = {
    page: 2,
    text: "Transcrição original privada",
    mode: "correction",
    note: "",
  };
  const before = structuredClone(value),
    change = vi.fn();
  const props = {
    canRead: true,
    canEdit: true,
    documentName: "Documento da correção privada",
    value,
    pagesTotal: 3,
    onChange: change,
  };
  const view = render(<AssistancePageTextEditor {...props} />);
  expect((screen.getByRole("spinbutton") as HTMLInputElement).readOnly).toBe(
    true,
  );
  fireEvent.change(screen.getByLabelText("Texto proposto para esta página"), {
    target: { value: "Correção proposta conferível" },
  });
  expect(change).toHaveBeenCalledWith({
    ...value,
    text: "Correção proposta conferível",
  });
  expect(value).toEqual(before);
  expect(screen.queryByRole("button", { name: /aprovar|salvar/i })).toBeNull();
  view.rerender(<AssistancePageTextEditor {...props} canRead={false} />);
  expect(screen.queryByText(props.documentName)).toBeNull();
  expect(screen.queryByDisplayValue(value.text)).toBeNull();
});
