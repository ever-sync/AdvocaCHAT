import type { CrmFunnel, CrmStageDef } from "@/data/crm-funnels";

export function slugifyFunnelKey(value: string): string {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "item";
}

export function uniqueKey(existing: Set<string>, base: string): string {
  let candidate = base;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

export function updateFunnel(
  funnels: CrmFunnel[],
  funnelId: string,
  patch: Partial<Pick<CrmFunnel, "id" | "listName">>,
): CrmFunnel[] {
  return funnels.map((f) => (f.id === funnelId ? { ...f, ...patch } : f));
}

export function addFunnel(funnels: CrmFunnel[], funnel: CrmFunnel): CrmFunnel[] {
  return [...funnels, funnel];
}

export function removeFunnel(funnels: CrmFunnel[], funnelId: string): CrmFunnel[] {
  return funnels.filter((f) => f.id !== funnelId);
}

export function addStage(funnels: CrmFunnel[], funnelId: string, stage: CrmStageDef): CrmFunnel[] {
  return funnels.map((f) =>
    f.id === funnelId ? { ...f, stages: [...f.stages, stage] } : f,
  );
}

export function updateStage(
  funnels: CrmFunnel[],
  funnelId: string,
  stageId: string,
  patch: Partial<CrmStageDef>,
): CrmFunnel[] {
  return funnels.map((f) => {
    if (f.id !== funnelId) return f;
    return {
      ...f,
      stages: f.stages.map((s) => (s.id === stageId ? { ...s, ...patch } : s)),
    };
  });
}

export function removeStage(funnels: CrmFunnel[], funnelId: string, stageId: string): CrmFunnel[] {
  return funnels.map((f) =>
    f.id === funnelId ? { ...f, stages: f.stages.filter((s) => s.id !== stageId) } : f,
  );
}

export function moveStage(
  funnels: CrmFunnel[],
  funnelId: string,
  stageId: string,
  direction: "up" | "down",
): CrmFunnel[] {
  return funnels.map((f) => {
    if (f.id !== funnelId) return f;
    const idx = f.stages.findIndex((s) => s.id === stageId);
    if (idx < 0) return f;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= f.stages.length) return f;
    const next = [...f.stages];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    return { ...f, stages: next };
  });
}

/** No máximo uma etapa como destino ao registrar/marcar venda. */
export function setExclusiveSaleStage(
  funnels: CrmFunnel[],
  funnelId: string,
  stageId: string,
  checked: boolean,
): CrmFunnel[] {
  return funnels.map((funnel) => {
    if (funnel.id !== funnelId) return funnel;
    return {
      ...funnel,
      stages: funnel.stages.map((stage) => {
        const target = stage.id === stageId;
        if (!checked) {
          return target ? { ...stage, isSaleStage: undefined } : stage;
        }
        return { ...stage, isSaleStage: target };
      }),
    };
  });
}

/** No máximo uma etapa como destino para perda. */
export function setExclusiveLostStage(
  funnels: CrmFunnel[],
  funnelId: string,
  stageId: string,
  checked: boolean,
): CrmFunnel[] {
  return funnels.map((funnel) => {
    if (funnel.id !== funnelId) return funnel;
    return {
      ...funnel,
      stages: funnel.stages.map((stage) => {
        const target = stage.id === stageId;
        if (!checked) {
          return target ? { ...stage, isLostStage: undefined } : stage;
        }
        return { ...stage, isLostStage: target };
      }),
    };
  });
}

/** Chave aleatória única (UUID) usada como id imutável da etapa — referenciada no n8n. */
export function generateStageKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `stage-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createDefaultStage(funnel: CrmFunnel, title = "Nova etapa"): CrmStageDef {
  const existing = new Set(funnel.stages.map((s) => s.id));
  let id = generateStageKey();
  while (existing.has(id)) {
    id = generateStageKey();
  }
  return { id, title: title.toUpperCase() };
}

export function createDefaultFunnel(listName: string, existing: CrmFunnel[]): CrmFunnel {
  const base = slugifyFunnelKey(listName);
  const id = uniqueKey(new Set(existing.map((f) => f.id)), base);
  return {
    id,
    listName: listName.trim().toUpperCase() || "NOVO FUNIL",
    stages: [
      { id: "lead", title: "LEAD QUALIFICADA" },
      { id: "contato", title: "CONTATO FEITO" },
    ],
  };
}

export function validateFunnelsDraft(funnels: CrmFunnel[]): string | null {
  const funnelIds = new Set<string>();
  for (const funnel of funnels) {
    if (!funnel.id.trim() || !funnel.listName.trim()) {
      return "Todo funil precisa de nome e identificador.";
    }
    if (funnelIds.has(funnel.id)) {
      return `Identificador de funil duplicado: ${funnel.id}`;
    }
    funnelIds.add(funnel.id);
    if (funnel.stages.length === 0) {
      return `O funil "${funnel.listName}" precisa de ao menos uma etapa.`;
    }
    const stageIds = new Set<string>();
    let saleStageCount = 0;
    let lostStageCount = 0;
    for (const stage of funnel.stages) {
      if (!stage.id.trim() || !stage.title.trim()) {
        return `Preencha nome e ID de todas as etapas em "${funnel.listName}".`;
      }
      if (stageIds.has(stage.id)) {
        return `ID de etapa duplicado em "${funnel.listName}": ${stage.id}`;
      }
      stageIds.add(stage.id);
      if (stage.isSaleStage) {
        saleStageCount++;
      }
      if (stage.isLostStage) {
        lostStageCount++;
      }
      if (stage.isSaleStage && stage.isLostStage) {
        return `A etapa "${stage.title}" em "${funnel.listName}" não pode ser de venda e perda ao mesmo tempo.`;
      }
    }
    if (saleStageCount > 1) {
      return `O funil "${funnel.listName}" só pode ter uma etapa marcada como "Venda".`;
    }
    if (lostStageCount > 1) {
      return `O funil "${funnel.listName}" só pode ter uma etapa marcada como "Perda".`;
    }
  }
  return null;
}
