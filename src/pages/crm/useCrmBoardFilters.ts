// Hook que concentra TODO o estado de filtros/ordenacao/visao do quadro de CRM,
// extraido de Crm.tsx. Cuida da (de)serializacao na URL (links compartilhaveis e
// restauro pos-reload), da densidade do card no localStorage e de manter o funil
// selecionado valido. Devolve valores + setters para o componente consumir.

import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_CRM_FUNNELS, type CrmFunnel } from "@/data/crm-funnels";
import type { CrmNegotiationStatus } from "@/types/domain";
import {
  decodeAdvancedFilter,
  encodeAdvancedFilter,
  type AdvancedFilter,
} from "@/lib/crm/advanced-filter";
import { type CrmAlertsFilterMode } from "@/lib/crm/negotiation-alerts";
import {
  ALERTS_FILTER_IDS,
  CARD_DENSITY_STORAGE_KEY,
  OWNER_MODE_IDS,
  readCardDensity,
  SCORE_FILTER_IDS,
  SORT_FILTER_IDS,
  STATUS_FILTER_IDS,
  type AppliedOwner,
  type CardDensity,
  type CreationDateRangeIso,
  type ScoreFilterMode,
  type SortId,
} from "./board-helpers";

export type StatusFilterId = "all" | CrmNegotiationStatus;

export function useCrmBoardFilters(funnels: CrmFunnel[]) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [funnelId, setFunnelId] = useState<string>(
    () => searchParams.get("funnel")?.trim() || DEFAULT_CRM_FUNNELS[0]?.id || "",
  );
  const [appliedOwner, setAppliedOwner] = useState<AppliedOwner>(() => {
    const mode = searchParams.get("owner");
    if (mode && OWNER_MODE_IDS.has(mode as AppliedOwner["mode"])) {
      if (mode === "all") return { mode: "all" };
      if (mode === "mine") return { mode: "mine" };
      if (mode === "pool") return { mode: "pool" };
      const ids = (searchParams.get("owners") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return { mode: "custom", ids };
    }
    return { mode: "all" };
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>(() => {
    const v = searchParams.get("status");
    return v && STATUS_FILTER_IDS.has(v) ? (v as StatusFilterId) : "all";
  });
  const [alertsFilter, setAlertsFilter] = useState<CrmAlertsFilterMode>(() => {
    const v = searchParams.get("alerts");
    return v && ALERTS_FILTER_IDS.has(v as CrmAlertsFilterMode) ? (v as CrmAlertsFilterMode) : "off";
  });
  const [scoreFilter, setScoreFilter] = useState<ScoreFilterMode>(() => {
    const v = searchParams.get("score");
    return v && SCORE_FILTER_IDS.has(v as ScoreFilterMode) ? (v as ScoreFilterMode) : "all";
  });
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilter | null>(() =>
    decodeAdvancedFilter(searchParams.get("adv")),
  );
  const [creationDateFilter, setCreationDateFilter] = useState<CreationDateRangeIso | null>(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) return null;
    return { from, to };
  });
  const [searchQuery, setSearchQuery] = useState<string>(() => searchParams.get("q") ?? "");
  const [searchInputResetKey, setSearchInputResetKey] = useState(0);
  const deferredSearchTerm = useDeferredValue(searchQuery);
  const [view, setView] = useState<"board" | "list">(() => {
    const v = searchParams.get("view");
    return v === "list" ? "list" : "board";
  });
  const [cardDensity, setCardDensity] = useState<CardDensity>(() => readCardDensity());
  const [sortId, setSortId] = useState<SortId>(() => {
    const v = searchParams.get("sort");
    return v && SORT_FILTER_IDS.has(v) ? (v as SortId) : "created_desc";
  });

  const resetSearchInput = useCallback((value = "") => {
    setSearchQuery(value);
    setSearchInputResetKey((k) => k + 1);
  }, []);

  // Densidade do card: persiste no localStorage (não-crítico).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CARD_DENSITY_STORAGE_KEY, cardDensity);
    } catch {
      // ignora — funcionalidade não-crítica.
    }
  }, [cardDensity]);

  // Mantém o funil selecionado válido conforme a config muda.
  useEffect(() => {
    if (funnels.some((f) => f.id === funnelId)) {
      return;
    }
    setFunnelId(funnels[0]?.id ?? DEFAULT_CRM_FUNNELS[0]?.id ?? "");
  }, [funnelId, funnels]);

  const funnel = funnels.find((f) => f.id === funnelId) ?? funnels[0] ?? DEFAULT_CRM_FUNNELS[0] ?? { id: "", listName: "", stages: [] };

  // Espelha o estado de filtros na URL — permite compartilhar visões filtradas
  // e preserva o contexto após reload. Usa replace p/ não inflar o histórico.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const apply = (key: string, value: string | null | undefined) => {
          if (value === null || value === undefined || value === "") {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        };
        apply("funnel", (DEFAULT_CRM_FUNNELS[0] && funnelId === DEFAULT_CRM_FUNNELS[0].id) ? null : funnelId);
        apply("q", searchQuery.trim() || null);
        apply("owner", appliedOwner.mode === "all" ? null : appliedOwner.mode);
        apply(
          "owners",
          appliedOwner.mode === "custom" && appliedOwner.ids.length > 0
            ? appliedOwner.ids.join(",")
            : null,
        );
        apply("status", statusFilter === "all" ? null : statusFilter);
        apply("alerts", alertsFilter === "off" ? null : alertsFilter);
        apply("score", scoreFilter === "all" ? null : scoreFilter);
        apply("adv", encodeAdvancedFilter(advancedFilter));
        apply("from", creationDateFilter?.from ?? null);
        apply("to", creationDateFilter?.to ?? null);
        apply("sort", sortId === "created_desc" ? null : sortId);
        apply("view", view === "board" ? null : view);
        return next;
      },
      { replace: true },
    );
  }, [
    advancedFilter,
    alertsFilter,
    appliedOwner,
    creationDateFilter,
    funnelId,
    scoreFilter,
    searchQuery,
    setSearchParams,
    sortId,
    statusFilter,
    view,
  ]);

  return {
    funnelId,
    setFunnelId,
    funnel,
    appliedOwner,
    setAppliedOwner,
    statusFilter,
    setStatusFilter,
    alertsFilter,
    setAlertsFilter,
    scoreFilter,
    setScoreFilter,
    advancedFilter,
    setAdvancedFilter,
    creationDateFilter,
    setCreationDateFilter,
    searchQuery,
    setSearchQuery,
    searchInputResetKey,
    resetSearchInput,
    deferredSearchTerm,
    sortId,
    setSortId,
    view,
    setView,
    cardDensity,
    setCardDensity,
  };
}
