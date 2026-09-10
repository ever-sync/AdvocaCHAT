import type { CrmFunnel } from "@/data/crm-funnels";

export type FunnelStageRef = { funnelId: string; stageId: string };

export type PendingFunnelMigration =
  | {
      kind: "funnel";
      fromFunnelId: string;
      toFunnelId: string;
      toStageId: string;
    }
  | {
      kind: "stage";
      funnelId: string;
      fromStageId: string;
      toStageId: string;
    }
  | {
      kind: "funnel_rename";
      fromFunnelId: string;
      toFunnelId: string;
    }
  | {
      // Transfere uma etapa específica de um funil para uma etapa de OUTRO funil.
      kind: "funnel_stage";
      fromFunnelId: string;
      fromStageId: string;
      toFunnelId: string;
      toStageId: string;
    }
  | {
      // Exclui o funil sem transferir: negociações viram órfãs (banner do CRM) e
      // o vínculo de funil/etapa é removido do cadastro dos clientes.
      kind: "funnel_clear";
      fromFunnelId: string;
    };

export function buildFunnelStageIndex(funnels: CrmFunnel[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const funnel of funnels) {
    index.set(funnel.id, new Set(funnel.stages.map((s) => s.id)));
  }
  return index;
}

export function isStageValidInFunnels(
  funnels: CrmFunnel[],
  funnelId: string,
  stageId: string,
): boolean {
  const index = buildFunnelStageIndex(funnels);
  return index.get(funnelId)?.has(stageId) ?? false;
}

export function isNegotiationOrphan(
  ref: FunnelStageRef,
  funnels: CrmFunnel[],
): boolean {
  return !isStageValidInFunnels(funnels, ref.funnelId, ref.stageId);
}

export function findOrphanNegotiations<T extends FunnelStageRef>(
  negotiations: T[],
  funnels: CrmFunnel[],
): T[] {
  return negotiations.filter((n) => isNegotiationOrphan(n, funnels));
}

export function diffRemovedFunnelIds(before: CrmFunnel[], after: CrmFunnel[]): string[] {
  const afterIds = new Set(after.map((f) => f.id));
  return before.filter((f) => !afterIds.has(f.id)).map((f) => f.id);
}

export function diffRemovedStages(
  before: CrmFunnel[],
  after: CrmFunnel[],
): Array<{ funnelId: string; stageId: string }> {
  const removed: Array<{ funnelId: string; stageId: string }> = [];
  const afterByFunnel = new Map(after.map((f) => [f.id, new Set(f.stages.map((s) => s.id))]));

  for (const funnel of before) {
    const afterStages = afterByFunnel.get(funnel.id);
    if (!afterStages) {
      continue;
    }
    for (const stage of funnel.stages) {
      if (!afterStages.has(stage.id)) {
        removed.push({ funnelId: funnel.id, stageId: stage.id });
      }
    }
  }
  return removed;
}

/** Funil com mesmo nome exibido mas id alterado (rename de slug). */
export function diffFunnelIdRenames(before: CrmFunnel[], after: CrmFunnel[]): Array<{ from: string; to: string }> {
  const renames: Array<{ from: string; to: string }> = [];
  const afterIds = new Set(after.map((f) => f.id));

  for (const prev of before) {
    if (afterIds.has(prev.id)) {
      continue;
    }
    const match = after.find(
      (f) => f.listName === prev.listName && f.stages.length === prev.stages.length,
    );
    if (match && match.id !== prev.id) {
      const sameStages =
        match.stages.length === prev.stages.length &&
        match.stages.every((s, i) => s.id === prev.stages[i]?.id);
      if (sameStages) {
        renames.push({ from: prev.id, to: match.id });
      }
    }
  }
  return renames;
}

export function validateMigrationTarget(
  funnels: CrmFunnel[],
  targetFunnelId: string,
  targetStageId: string,
  options?: { excludeFunnelId?: string },
): string | null {
  if (options?.excludeFunnelId && targetFunnelId === options.excludeFunnelId) {
    return "Escolha outro funil de destino.";
  }
  if (!isStageValidInFunnels(funnels, targetFunnelId, targetStageId)) {
    return "Funil ou etapa de destino inválidos.";
  }
  return null;
}

/** Migrações implícitas ao salvar (funil/etapa removidos no JSON sem passar pelo editor). */
export function buildUnresolvedConfigRemovals(
  before: CrmFunnel[],
  after: CrmFunnel[],
): Array<
  | { kind: "funnel"; funnelId: string }
  | { kind: "stage"; funnelId: string; stageId: string }
  | { kind: "funnel_rename"; from: string; to: string }
> {
  const renames = diffFunnelIdRenames(before, after);
  const renamedFrom = new Set(renames.map((r) => r.from));
  const removals: Array<
    | { kind: "funnel"; funnelId: string }
    | { kind: "stage"; funnelId: string; stageId: string }
    | { kind: "funnel_rename"; from: string; to: string }
  > = renames.map((r) => ({ kind: "funnel_rename", from: r.from, to: r.to }));

  for (const funnelId of diffRemovedFunnelIds(before, after)) {
    if (!renamedFrom.has(funnelId)) {
      removals.push({ kind: "funnel", funnelId });
    }
  }
  for (const { funnelId, stageId } of diffRemovedStages(before, after)) {
    removals.push({ kind: "stage", funnelId, stageId });
  }
  return removals;
}

/** Migrações para realocar todas as negociações órfãs para um destino único. */
export function buildOrphanBulkMigrations(
  orphans: FunnelStageRef[],
  target: { funnelId: string; stageId: string },
  funnels: CrmFunnel[],
): PendingFunnelMigration[] {
  const funnelIndex = buildFunnelStageIndex(funnels);
  const migrations: PendingFunnelMigration[] = [];
  const funnelHandled = new Set<string>();
  const stageHandled = new Set<string>();

  for (const orphan of orphans) {
    const funnelMissing = !funnelIndex.has(orphan.funnelId);
    if (funnelMissing) {
      if (funnelHandled.has(orphan.funnelId)) {
        continue;
      }
      funnelHandled.add(orphan.funnelId);
      migrations.push({
        kind: "funnel",
        fromFunnelId: orphan.funnelId,
        toFunnelId: target.funnelId,
        toStageId: target.stageId,
      });
      continue;
    }
    const stageKey = `${orphan.funnelId}:${orphan.stageId}`;
    if (stageHandled.has(stageKey)) {
      continue;
    }
    stageHandled.add(stageKey);
    migrations.push({
      kind: "stage",
      funnelId: orphan.funnelId,
      fromStageId: orphan.stageId,
      toStageId: target.stageId,
    });
  }
  return migrations;
}

export function mergePendingMigrations(
  existing: PendingFunnelMigration[],
  next: PendingFunnelMigration,
): PendingFunnelMigration[] {
  const filtered = existing.filter((m) => {
    if (m.kind === "funnel" && next.kind === "funnel" && m.fromFunnelId === next.fromFunnelId) {
      return false;
    }
    if (
      m.kind === "stage" &&
      next.kind === "stage" &&
      m.funnelId === next.funnelId &&
      m.fromStageId === next.fromStageId
    ) {
      return false;
    }
    if (
      m.kind === "funnel_rename" &&
      next.kind === "funnel_rename" &&
      m.fromFunnelId === next.fromFunnelId
    ) {
      return false;
    }
    if (
      m.kind === "funnel_stage" &&
      next.kind === "funnel_stage" &&
      m.fromFunnelId === next.fromFunnelId &&
      m.fromStageId === next.fromStageId
    ) {
      return false;
    }
    if (
      m.kind === "funnel_clear" &&
      next.kind === "funnel_clear" &&
      m.fromFunnelId === next.fromFunnelId
    ) {
      return false;
    }
    return true;
  });
  return [...filtered, next];
}

/** Origem (funil) afetada por uma migração — usado para resolver conflitos ao excluir um funil. */
function migrationSourceFunnelId(m: PendingFunnelMigration): string {
  return m.kind === "stage" ? m.funnelId : m.fromFunnelId;
}

/**
 * Remove todas as migrações que partem de `fromFunnelId` e acrescenta `next`.
 * Garante que escolher "uma etapa" / "etapa por etapa" / "órfã" não acumule migrações conflitantes.
 */
export function replaceFunnelMigrations(
  existing: PendingFunnelMigration[],
  fromFunnelId: string,
  next: PendingFunnelMigration[],
): PendingFunnelMigration[] {
  const kept = existing.filter((m) => migrationSourceFunnelId(m) !== fromFunnelId);
  return [...kept, ...next];
}
