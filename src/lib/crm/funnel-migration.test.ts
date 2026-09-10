import { describe, expect, it } from "vitest";
import type { CrmFunnel } from "@/data/crm-funnels";
import {
  buildOrphanBulkMigrations,
  diffFunnelIdRenames,
  diffRemovedFunnelIds,
  diffRemovedStages,
  findOrphanNegotiations,
  isNegotiationOrphan,
  mergePendingMigrations,
  validateMigrationTarget,
} from "./funnel-migration";

const FUNNELS: CrmFunnel[] = [
  {
    id: "comercial",
    listName: "COMERCIAL",
    stages: [
      { id: "lead", title: "LEAD" },
      { id: "venda", title: "VENDA" },
    ],
  },
  {
    id: "auxilio",
    listName: "AUXÍLIO",
    stages: [{ id: "lead", title: "LEAD" }],
  },
];

describe("funnel-migration", () => {
  it("detecta negociação órfã por funil inexistente", () => {
    expect(
      isNegotiationOrphan({ funnelId: "removido", stageId: "lead" }, FUNNELS),
    ).toBe(true);
  });

  it("detecta negociação órfã por etapa inexistente", () => {
    expect(
      isNegotiationOrphan({ funnelId: "comercial", stageId: "etapa-antiga" }, FUNNELS),
    ).toBe(true);
  });

  it("aceita negociação alinhada à config", () => {
    expect(isNegotiationOrphan({ funnelId: "comercial", stageId: "lead" }, FUNNELS)).toBe(
      false,
    );
  });

  it("lista órfãs", () => {
    const list = [
      { id: "1", funnelId: "comercial", stageId: "lead" },
      { id: "2", funnelId: "fantasma", stageId: "lead" },
    ];
    expect(findOrphanNegotiations(list, FUNNELS)).toHaveLength(1);
    expect(findOrphanNegotiations(list, FUNNELS)[0]?.id).toBe("2");
  });

  it("diff de funis removidos", () => {
    const before = FUNNELS;
    const after = [FUNNELS[0]!];
    expect(diffRemovedFunnelIds(before, after)).toEqual(["auxilio"]);
  });

  it("diff de etapas removidas", () => {
    const before = FUNNELS;
    const after: CrmFunnel[] = [
      {
        ...FUNNELS[0]!,
        stages: [{ id: "lead", title: "LEAD" }],
      },
      FUNNELS[1]!,
    ];
    expect(diffRemovedStages(before, after)).toEqual([{ funnelId: "comercial", stageId: "venda" }]);
  });

  it("detecta rename de id de funil", () => {
    const before = FUNNELS;
    const after: CrmFunnel[] = [
      { ...FUNNELS[0]!, id: "comercial-novo" },
      FUNNELS[1]!,
    ];
    expect(diffFunnelIdRenames(before, after)).toEqual([
      { from: "comercial", to: "comercial-novo" },
    ]);
  });

  it("valida destino de migração", () => {
    expect(validateMigrationTarget(FUNNELS, "auxilio", "lead", { excludeFunnelId: "comercial" })).toBeNull();
    expect(
      validateMigrationTarget(FUNNELS, "comercial", "lead", { excludeFunnelId: "comercial" }),
    ).toMatch(/outro funil/i);
    expect(validateMigrationTarget(FUNNELS, "comercial", "inexistente")).toMatch(/inválid/i);
  });

  it("monta migrações em lote para órfãs", () => {
    const orphans = [
      { funnelId: "fantasma", stageId: "lead" },
      { funnelId: "comercial", stageId: "etapa-antiga" },
    ];
    const migrations = buildOrphanBulkMigrations(
      orphans,
      { funnelId: "auxilio", stageId: "lead" },
      FUNNELS,
    );
    expect(migrations).toEqual([
      {
        kind: "funnel",
        fromFunnelId: "fantasma",
        toFunnelId: "auxilio",
        toStageId: "lead",
      },
      {
        kind: "stage",
        funnelId: "comercial",
        fromStageId: "etapa-antiga",
        toStageId: "lead",
      },
    ]);
  });

  it("substitui migração pendente duplicada", () => {
    const first = {
      kind: "funnel" as const,
      fromFunnelId: "x",
      toFunnelId: "auxilio",
      toStageId: "lead",
    };
    const second = {
      kind: "funnel" as const,
      fromFunnelId: "x",
      toFunnelId: "comercial",
      toStageId: "venda",
    };
    const merged = mergePendingMigrations([first], second);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(second);
  });
});
