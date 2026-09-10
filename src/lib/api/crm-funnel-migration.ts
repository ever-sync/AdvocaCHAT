import { CRM_FUNNEL_ID_KEY, CRM_PIPELINE_STAGE_KEY } from "@/lib/crm-pipeline";
import type { PendingFunnelMigration } from "@/lib/crm/funnel-migration";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export async function countCrmNegotiationsByFunnelId(funnelId: string): Promise<number> {
  if (!isSupabaseConfigured || !funnelId.trim()) {
    return 0;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { count, error } = await supabase
    .from("crm_negotiations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("funnel_id", funnelId);

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function countCrmNegotiationsByFunnelStage(
  funnelId: string,
  stageId: string,
): Promise<number> {
  if (!isSupabaseConfigured || !funnelId.trim() || !stageId.trim()) {
    return 0;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { count, error } = await supabase
    .from("crm_negotiations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("funnel_id", funnelId)
    .eq("stage_id", stageId);

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function migrateCrmNegotiationsFunnel(params: {
  fromFunnelId: string;
  toFunnelId: string;
  toStageId: string;
}): Promise<number> {
  if (!isSupabaseConfigured) {
    return 0;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_negotiations")
    .update({
      funnel_id: params.toFunnelId,
      stage_id: params.toStageId,
    })
    .eq("tenant_id", tenantId)
    .eq("funnel_id", params.fromFunnelId)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  return data?.length ?? 0;
}

export async function migrateCrmNegotiationsStage(params: {
  funnelId: string;
  fromStageId: string;
  toStageId: string;
}): Promise<number> {
  if (!isSupabaseConfigured) {
    return 0;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_negotiations")
    .update({ stage_id: params.toStageId })
    .eq("tenant_id", tenantId)
    .eq("funnel_id", params.funnelId)
    .eq("stage_id", params.fromStageId)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  return data?.length ?? 0;
}

/** Transfere negociações de (funil, etapa) para (outro funil, etapa) — mapeamento etapa→etapa. */
export async function migrateCrmNegotiationsFunnelStagePair(params: {
  fromFunnelId: string;
  fromStageId: string;
  toFunnelId: string;
  toStageId: string;
}): Promise<number> {
  if (!isSupabaseConfigured) {
    return 0;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_negotiations")
    .update({ funnel_id: params.toFunnelId, stage_id: params.toStageId })
    .eq("tenant_id", tenantId)
    .eq("funnel_id", params.fromFunnelId)
    .eq("stage_id", params.fromStageId)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  return data?.length ?? 0;
}

/** Remove o vínculo de funil/etapa do CRM gravado no cadastro dos clientes daquele funil. */
export async function clearCustomersFunnelLink(params: { fromFunnelId: string }): Promise<number> {
  if (!isSupabaseConfigured) {
    return 0;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("customers")
    .select("id, source_columns")
    .eq("tenant_id", tenantId)
    .filter(`source_columns->>${CRM_FUNNEL_ID_KEY}`, "eq", params.fromFunnelId);

  if (error) {
    throw new Error(error.message);
  }

  let updated = 0;
  for (const row of data ?? []) {
    const raw = row as { id: string; source_columns?: Record<string, unknown> | null };
    const sc = { ...(raw.source_columns ?? {}) } as Record<string, unknown>;
    delete sc[CRM_FUNNEL_ID_KEY];
    delete sc[CRM_PIPELINE_STAGE_KEY];
    const { error: upErr } = await supabase
      .from("customers")
      .update({ source_columns: sc })
      .eq("tenant_id", tenantId)
      .eq("id", raw.id);
    if (upErr) {
      throw new Error(upErr.message);
    }
    updated += 1;
  }
  return updated;
}

export async function renameCrmNegotiationsFunnelId(params: {
  fromFunnelId: string;
  toFunnelId: string;
}): Promise<number> {
  if (!isSupabaseConfigured) {
    return 0;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_negotiations")
    .update({ funnel_id: params.toFunnelId })
    .eq("tenant_id", tenantId)
    .eq("funnel_id", params.fromFunnelId)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  return data?.length ?? 0;
}

/** Atualiza `customers.source_columns` com funil/etapa CRM legados no cliente. */
export async function alignCustomersSourceColumnsForFunnelMigration(params: {
  fromFunnelId: string;
  toFunnelId: string;
  toStageId?: string;
  /** Quando informado, só clientes com esta etapa em `source_columns` são atualizados. */
  fromStageId?: string;
}): Promise<number> {
  if (!isSupabaseConfigured) {
    return 0;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("customers")
    .select("id, source_columns")
    .eq("tenant_id", tenantId)
    .filter(`source_columns->>${CRM_FUNNEL_ID_KEY}`, "eq", params.fromFunnelId);

  if (error) {
    throw new Error(error.message);
  }

  let updated = 0;
  for (const row of data ?? []) {
    const raw = row as { id: string; source_columns?: Record<string, unknown> | null };
    const sc = { ...(raw.source_columns ?? {}) } as Record<string, string>;
    if (params.fromStageId) {
      const currentStage = sc[CRM_PIPELINE_STAGE_KEY]?.trim();
      if (currentStage !== params.fromStageId) {
        continue;
      }
    }
    sc[CRM_FUNNEL_ID_KEY] = params.toFunnelId;
    if (params.toStageId) {
      sc[CRM_PIPELINE_STAGE_KEY] = params.toStageId;
    }
    const { error: upErr } = await supabase
      .from("customers")
      .update({ source_columns: sc })
      .eq("tenant_id", tenantId)
      .eq("id", raw.id);
    if (upErr) {
      throw new Error(upErr.message);
    }
    updated += 1;
  }
  return updated;
}

export async function applyPendingFunnelMigration(migration: PendingFunnelMigration): Promise<{
  negotiationsUpdated: number;
  customersAligned: number;
}> {
  if (migration.kind === "funnel") {
    const negotiationsUpdated = await migrateCrmNegotiationsFunnel({
      fromFunnelId: migration.fromFunnelId,
      toFunnelId: migration.toFunnelId,
      toStageId: migration.toStageId,
    });
    const customersAligned = await alignCustomersSourceColumnsForFunnelMigration({
      fromFunnelId: migration.fromFunnelId,
      toFunnelId: migration.toFunnelId,
      toStageId: migration.toStageId,
    });
    return { negotiationsUpdated, customersAligned };
  }

  if (migration.kind === "stage") {
    const negotiationsUpdated = await migrateCrmNegotiationsStage({
      funnelId: migration.funnelId,
      fromStageId: migration.fromStageId,
      toStageId: migration.toStageId,
    });
    const customersAligned = await alignCustomersSourceColumnsForFunnelMigration({
      fromFunnelId: migration.funnelId,
      toFunnelId: migration.funnelId,
      toStageId: migration.toStageId,
      fromStageId: migration.fromStageId,
    });
    return { negotiationsUpdated, customersAligned };
  }

  if (migration.kind === "funnel_stage") {
    const negotiationsUpdated = await migrateCrmNegotiationsFunnelStagePair({
      fromFunnelId: migration.fromFunnelId,
      fromStageId: migration.fromStageId,
      toFunnelId: migration.toFunnelId,
      toStageId: migration.toStageId,
    });
    const customersAligned = await alignCustomersSourceColumnsForFunnelMigration({
      fromFunnelId: migration.fromFunnelId,
      toFunnelId: migration.toFunnelId,
      toStageId: migration.toStageId,
      fromStageId: migration.fromStageId,
    });
    return { negotiationsUpdated, customersAligned };
  }

  if (migration.kind === "funnel_clear") {
    // Não move negociações (viram órfãs e são resolvidas pelo banner do CRM);
    // só remove o vínculo de funil/etapa do cadastro dos clientes.
    const customersAligned = await clearCustomersFunnelLink({
      fromFunnelId: migration.fromFunnelId,
    });
    return { negotiationsUpdated: 0, customersAligned };
  }

  const negotiationsUpdated = await renameCrmNegotiationsFunnelId({
    fromFunnelId: migration.fromFunnelId,
    toFunnelId: migration.toFunnelId,
  });
  const customersAligned = await alignCustomersSourceColumnsForFunnelMigration({
    fromFunnelId: migration.fromFunnelId,
    toFunnelId: migration.toFunnelId,
  });
  return { negotiationsUpdated, customersAligned };
}

export async function applyPendingFunnelMigrations(
  migrations: PendingFunnelMigration[],
): Promise<{ negotiationsUpdated: number; customersAligned: number }> {
  let negotiationsUpdated = 0;
  let customersAligned = 0;
  for (const migration of migrations) {
    const result = await applyPendingFunnelMigration(migration);
    negotiationsUpdated += result.negotiationsUpdated;
    customersAligned += result.customersAligned;
  }
  return { negotiationsUpdated, customersAligned };
}
