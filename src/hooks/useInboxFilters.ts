import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "react-router-dom";
import {
  inboxFiltersFromQuickFilter,
  inboxScopeFiltersForQuickFilter,
} from "@/lib/inbox-quick-filters";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type {
  InboxChatFilters,
  InboxListScope,
  InboxQuickFilter,
} from "@/types/domain";

export type UseInboxFiltersResult = {
  /** Estado bruto */
  search: string;
  instanceIds: string[];
  listScope: InboxListScope;
  assigneeFilter: string;
  snoozedFilter: "active" | "snoozed";
  quickFilter: InboxQuickFilter | null;
  selectedTagIds: string[];

  /** Setters */
  setSearch: (value: string) => void;
  setInstanceIds: Dispatch<SetStateAction<string[]>>;
  setListScope: (value: InboxListScope) => void;
  setAssigneeFilter: (value: string) => void;
  setSnoozedFilter: (value: "active" | "snoozed") => void;
  setQuickFilter: (value: InboxQuickFilter | null) => void;
  setSelectedTagIds: Dispatch<SetStateAction<string[]>>;

  /** Filtro composto para passar ao useInboxChats. */
  inboxChatsFilter: InboxChatFilters;
};

/**
 * Centraliza o estado da barra de filtros do Inbox + a composição do
 * objeto enviado ao `useInboxChats`. Lê o `search` inicial do query-string
 * e mantém sincronizado quando ele mudar (deep link).
 */
export function useInboxFilters(profileId: string | undefined): UseInboxFiltersResult {
  const [searchParams] = useSearchParams();
  const requestedSearch = searchParams.get("search");

  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [instanceIds, setInstanceIds] = useState<string[]>([]);
  const [listScope, setListScope] = useState<InboxListScope>("open");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [snoozedFilter, setSnoozedFilter] = useState<"active" | "snoozed">("active");
  const [quickFilter, setQuickFilter] = useState<InboxQuickFilter | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Deep link: /inbox?search=... atualiza o campo se o termo mudar.
  useEffect(() => {
    if (!requestedSearch) {
      return;
    }
    setSearch((current) => (current === requestedSearch ? current : requestedSearch));
  }, [requestedSearch]);

  const inboxChatsFilter = useMemo<InboxChatFilters>(() => {
    const quick = inboxFiltersFromQuickFilter(quickFilter, profileId);
    const useAdvancedAssignee = quickFilter === null;
    const useAdvancedSnooze = quickFilter === null;

    return {
      search: debouncedSearch,
      instanceIds: instanceIds.length > 0 ? instanceIds : undefined,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      ...inboxScopeFiltersForQuickFilter(quickFilter, listScope),
      ...quick,
      assigneeId: useAdvancedAssignee
        ? assigneeFilter === "all"
          ? undefined
          : assigneeFilter
        : quick.assigneeId,
      hideSnoozed: useAdvancedSnooze ? snoozedFilter === "active" : quick.hideSnoozed,
      snoozedOnly: useAdvancedSnooze ? snoozedFilter === "snoozed" : quick.snoozedOnly,
    };
  }, [
    debouncedSearch,
    instanceIds,
    assigneeFilter,
    selectedTagIds,
    snoozedFilter,
    listScope,
    quickFilter,
    profileId,
  ]);

  return {
    search,
    instanceIds,
    listScope,
    assigneeFilter,
    snoozedFilter,
    quickFilter,
    selectedTagIds,
    setSearch,
    setInstanceIds,
    setListScope,
    setAssigneeFilter,
    setSnoozedFilter,
    setQuickFilter,
    setSelectedTagIds,
    inboxChatsFilter,
  };
}
