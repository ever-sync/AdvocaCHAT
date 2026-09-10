// Extração de texto de PDF no browser, sem adicionar dependência ao bundle:
// carrega o pdfjs do CDN (esm.sh) em runtime, sob demanda. O texto extraído é
// enviado ao endpoint de ingestão de texto da base (ai-knowledge).

const PDFJS_VERSION = "4.7.76";
const PDFJS_BASE = `https://esm.sh/pdfjs-dist@${PDFJS_VERSION}/build`;

type PdfTextItem = { str?: string };
type PdfPage = { getTextContent(): Promise<{ items: PdfTextItem[] }> };
type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage> };
type PdfjsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): { promise: Promise<PdfDoc> };
};

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    const url = `${PDFJS_BASE}/pdf.min.mjs`;
    pdfjsPromise = (import(/* @vite-ignore */ url) as Promise<PdfjsModule>).then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
      return mod;
    });
  }
  return pdfjsPromise;
}

/** Extrai o texto de um PDF (com texto; PDFs escaneados/imagem retornam vazio). */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;

  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => item.str ?? "").join(" "));
  }

  return parts
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
