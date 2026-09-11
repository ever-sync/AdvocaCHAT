import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listExpansion } from "@/lib/api/legal-expansion";
import type { ExpansionListKind } from "@/types/legal-expansion";
import {
  expansionCaseAccess,
  expansionKey,
  expansionVisible,
  type ExpansionProps,
} from "./expansion-ui";
export function useExpansionList(
  props: ExpansionProps,
  kind: ExpansionListKind,
  enabled = true,
  limit = 25,
) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: [...expansionKey(props, kind), offset, limit],
    queryFn: ({ signal }) =>
      listExpansion(props.legalCase.id, kind, limit, offset, signal),
    enabled: enabled && expansionCaseAccess(props),
    retry: false,
    refetchInterval: 15000,
  });
  return {
    query,
    rows:
      !query.isError && enabled && expansionCaseAccess(props)
        ? expansionVisible(props, query.data?.items ?? []).filter(row => !["acts", "succession", "diligences"].includes(kind) || Boolean(row.category))
        : [],
    offset,
    limit,
    setOffset,
    hasMore: query.data?.has_more === true,
  };
}
