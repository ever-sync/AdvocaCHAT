import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { DEFAULT_CRM_FUNNELS } from "@/data/crm-funnels";
import { useCrmBoardFilters } from "./useCrmBoardFilters";

function wrapperFor(initialUrl: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
  );
}

const testFunnels = [
  {
    id: "comercial",
    listName: "COMERCIAL",
    stages: [{ id: "lead", title: "LEAD QUALIFICADA" }],
  },
];

function renderFilters(url: string) {
  return renderHook(() => useCrmBoardFilters(testFunnels), {
    wrapper: wrapperFor(url),
  });
}

describe("useCrmBoardFilters — leitura da URL", () => {
  it("usa padrões quando a URL não tem filtros", () => {
    const { result } = renderFilters("/crm");
    expect(result.current.statusFilter).toBe("all");
    expect(result.current.scoreFilter).toBe("all");
    expect(result.current.alertsFilter).toBe("off");
    expect(result.current.sortId).toBe("created_desc");
    expect(result.current.view).toBe("board");
    expect(result.current.appliedOwner).toEqual({ mode: "all" });
    expect(result.current.funnelId).toBe(testFunnels[0].id);
  });

  it("decodifica filtros simples da query string", () => {
    const { result } = renderFilters(
      "/crm?status=vendido&score=hot&sort=value_desc&view=list&q=acme",
    );
    expect(result.current.statusFilter).toBe("vendido");
    expect(result.current.scoreFilter).toBe("hot");
    expect(result.current.sortId).toBe("value_desc");
    expect(result.current.view).toBe("list");
    expect(result.current.searchQuery).toBe("acme");
  });

  it("decodifica owner custom a partir de owner=custom&owners=", () => {
    const { result } = renderFilters("/crm?owner=custom&owners=u1,u2");
    expect(result.current.appliedOwner).toEqual({ mode: "custom", ids: ["u1", "u2"] });
  });

  it("ignora valores inválidos e cai no padrão", () => {
    const { result } = renderFilters("/crm?status=xpto&sort=naoexiste&score=zzz");
    expect(result.current.statusFilter).toBe("all");
    expect(result.current.sortId).toBe("created_desc");
    expect(result.current.scoreFilter).toBe("all");
  });

  it("decodifica intervalo de datas só quando from e to existem", () => {
    const ok = renderFilters("/crm?from=2026-01-01&to=2026-01-31");
    expect(ok.result.current.creationDateFilter).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
    const incompleto = renderFilters("/crm?from=2026-01-01");
    expect(incompleto.result.current.creationDateFilter).toBeNull();
  });
});
