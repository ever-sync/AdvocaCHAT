export const LEGAL_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const LEGAL_DOCUMENT_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "text/plain"] as const;

/** Treat client filename/MIME as untrusted. HTML/SVG and executable formats stay out of the vault. */
export function validateLegalDocument(bytes: Uint8Array, mimeType: string): string | null {
  if (bytes.length === 0 || bytes.length > LEGAL_DOCUMENT_MAX_BYTES) return "Arquivo vazio ou maior que 10 MB.";
  const starts = (prefix: number[]) => prefix.every((value, index) => bytes[index] === value);
  if (mimeType === "application/pdf" && starts([37, 80, 68, 70, 45])) return null;
  if (mimeType === "image/png" && starts([137, 80, 78, 71, 13, 10, 26, 10])) return null;
  if (mimeType === "image/jpeg" && starts([255, 216, 255])) return null;
  if (mimeType === "text/plain") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!bytes.includes(0)) return null;
    } catch { /* invalid text is rejected */ }
  }
  return "Formato inválido. Envie PDF, PNG, JPG ou texto UTF-8.";
}

export function legalDownloadHeaders(filename: string): Record<string, string> {
  // Files are always attachments, never active inline content.
  const safeName = Array.from(filename, (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "/" || char === "\\" ? "_" : char).join("").slice(0, 180) || "documento";
  return {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName).replace(/'/g, "%27")}`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
}
