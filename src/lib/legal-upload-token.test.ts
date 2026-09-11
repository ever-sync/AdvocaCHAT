import { describe, it, expect } from "vitest";
import { captureLegalUploadToken, clearLegalUploadToken, getLegalUploadToken } from "./legal-upload-token";
describe("public upload capability privacy", () => {
  it("keeps a valid fragment capability only in memory and strips URL state", () => {
    const changes: unknown[][] = [];
    captureLegalUploadToken({ pathname: "/enviar-documento", hash: "#token=" + "a".repeat(64) }, { replaceState: (...args) => changes.push(args) });
    expect(getLegalUploadToken()).toBe("a".repeat(64));
    expect(changes).toEqual([[null, "", "/enviar-documento"]]);
    clearLegalUploadToken(); expect(getLegalUploadToken()).toBe("");
  });
  it("rejects malformed capabilities without propagating their contents", () => {
    let clean = "";
    captureLegalUploadToken({ pathname: "/enviar-documento", hash: "#token=<script>" }, { replaceState: (_state, _title, url) => { clean = String(url); } });
    expect(getLegalUploadToken()).toBe(""); expect(clean).toBe("/enviar-documento");
  });
  it.each(["/enviar-documento/", "/ENVIAR-DOCUMENTO", "/ENVIAR-DOCUMENTO//"])("strips capabilities on router-compatible path %s", (pathname) => {
    let clean = "";
    captureLegalUploadToken({ pathname, hash: "#token=" + "b".repeat(64) }, { replaceState: (_state, _title, url) => { clean = String(url); } });
    expect(getLegalUploadToken()).toBe("b".repeat(64));
    expect(clean).toBe("/enviar-documento");
    clearLegalUploadToken();
  });
});
