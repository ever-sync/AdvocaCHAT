import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAssistance } from "@/lib/api/legal-assistance";
import type { AssistanceListKinds } from "@/types/legal-assistance";
import {
  assistanceCaseAccess,
  assistanceKey,
  assistanceVisible,
  type AssistanceProps,
} from "./assistance-ui";
export function useAssistanceList<K extends keyof AssistanceListKinds>(
  props: AssistanceProps,
  kind: K,
  enabled = true,
  limit = 25,
) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: [...assistanceKey(props, kind), offset, limit],
    queryFn: ({ signal }) =>
      listAssistance(props.legalCase.id, kind, limit, offset, signal),
    enabled: enabled && assistanceCaseAccess(props),
    retry: false,
    refetchInterval: 15000,
  });
  return {
    query,
    rows:
      !query.isError && assistanceCaseAccess(props)
        ? assistanceVisible(props, query.data?.items ?? [])
        : [],
    offset,
    limit,
    setOffset,
    hasMore: query.data?.has_more === true,
  };
}
