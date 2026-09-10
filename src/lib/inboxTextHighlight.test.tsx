import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { highlightTextMatches, textContainsQuery } from "./inboxTextHighlight";

function render(node: ReturnType<typeof highlightTextMatches>): string {
  if (typeof node === "string") return node;
  return renderToStaticMarkup(<>{node}</>);
}

describe("highlightTextMatches", () => {
  it("retorna o texto cru quando query é vazia", () => {
    expect(highlightTextMatches("oi tudo bem", "")).toBe("oi tudo bem");
  });

  it("retorna o texto cru quando query é só espaço", () => {
    expect(highlightTextMatches("oi tudo bem", "   ")).toBe("oi tudo bem");
  });

  it("retorna o texto cru quando não há match", () => {
    expect(highlightTextMatches("oi tudo bem", "xpto")).toBe("oi tudo bem");
  });

  it("envolve o trecho casado em <mark>", () => {
    const html = render(highlightTextMatches("oi tudo bem", "tudo"));
    expect(html).toContain("oi <mark");
    expect(html).toContain(">tudo</mark> bem");
  });

  it("é case-insensitive preservando capitalização original", () => {
    const html = render(highlightTextMatches("OI Tudo Bem", "tudo"));
    expect(html).toContain(">Tudo</mark>");
  });

  it("marca múltiplas ocorrências", () => {
    const html = render(highlightTextMatches("oi oi oi", "oi"));
    expect(html.match(/<mark/g) ?? []).toHaveLength(3);
  });

  it("trim de query removendo whitespace nas pontas", () => {
    const html = render(highlightTextMatches("um teste de busca", "  teste  "));
    expect(html).toContain(">teste</mark>");
  });

  it("respeita caracteres especiais sem regex injection", () => {
    const html = render(highlightTextMatches("preço: R$ 49.90 (oferta)", "R$ 49.90"));
    expect(html).toContain(">R$ 49.90</mark>");
  });
});

describe("textContainsQuery", () => {
  it("true para match case-insensitive", () => {
    expect(textContainsQuery("Olá Mundo", "mundo")).toBe(true);
  });
  it("false para texto null/undefined", () => {
    expect(textContainsQuery(null, "x")).toBe(false);
    expect(textContainsQuery(undefined, "x")).toBe(false);
  });
  it("false para query vazia ou só espaços", () => {
    expect(textContainsQuery("abc", "")).toBe(false);
    expect(textContainsQuery("abc", "   ")).toBe(false);
  });
});
