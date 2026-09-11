import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENT_MAX_BYTES, legalDownloadHeaders, validateLegalDocument } from "../../supabase/functions/_shared/legal-document-validation";

describe("legal vault file boundaries", () => {
  it("rejects MIME spoofing, empty files and executable formats", () => {
    expect(validateLegalDocument(new TextEncoder().encode("<html>private</html>"), "application/pdf")).toBeTruthy();
    expect(validateLegalDocument(new Uint8Array(), "text/plain")).toBeTruthy();
    expect(validateLegalDocument(new TextEncoder().encode("<svg />"), "image/svg+xml")).toBeTruthy();
    expect(validateLegalDocument(new Uint8Array([0, 2, 3]), "text/plain")).toBeTruthy();
  });
  it("accepts supported signatures and UTF-8 while enforcing the size boundary", () => {
    expect(validateLegalDocument(new TextEncoder().encode("%PDF-1.7\n"), "application/pdf")).toBeNull();
    expect(validateLegalDocument(new Uint8Array([255, 216, 255, 224]), "image/jpeg")).toBeNull();
    expect(validateLegalDocument(new TextEncoder().encode("documento sintético"), "text/plain")).toBeNull();
    expect(validateLegalDocument(new Uint8Array(LEGAL_DOCUMENT_MAX_BYTES + 1), "text/plain")).toBeTruthy();
  });
  it("prevents active content rendering, shared caching and response header injection", () => {
    const headers = legalDownloadHeaders("laudo\r\nX-Injected: yes.pdf");
    expect(headers["Content-Disposition"]).not.toMatch(/[\r\n]/);
    expect(headers["Content-Disposition"]).toMatch(/^attachment;/);
    expect(headers["Cache-Control"]).toContain("no-store");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });
});
