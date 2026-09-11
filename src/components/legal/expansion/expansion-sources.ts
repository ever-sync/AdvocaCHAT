import { useQuery } from "@tanstack/react-query";
import { listLegalDocuments, listLegalProceedings } from "@/lib/api/legal";
import type { ExpansionCategory } from "@/types/legal-expansion";
import {
  expansionCaseAccess,
  expansionCategoryAccess,
  expansionKey,
  type ExpansionProps,
} from "./expansion-ui";
export function useExpansionSources(props: ExpansionProps, enabled = true) {
  const documents = useQuery({
    queryKey: expansionKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
    enabled: enabled && expansionCaseAccess(props),
    retry: false,
    refetchInterval: 15000,
  });
  const judicial = useQuery({
    queryKey: expansionKey(props, "judicial-sources"),
    queryFn: () => listLegalProceedings(props.legalCase.id),
    enabled: enabled && expansionCaseAccess(props),
    retry: false,
    refetchInterval: 15000,
  });
  return {
    documents,
    judicial,
    docs:
      enabled && expansionCaseAccess(props) && !documents.isError
        ? (documents.data ?? []).filter(
            (d) =>
              d.case_id === props.legalCase.id &&
              d.status === "ready" &&
              expansionCategoryAccess(props, d.category),
          )
        : [],
    proceedings:
      enabled && expansionCaseAccess(props) && !judicial.isError
        ? (judicial.data ?? [])
        : [],
  };
}
export function expansionCompatible(
  category: ExpansionCategory,
  source: ExpansionCategory,
) {
  return (
    category === "restricted" || source === "general" || category === source
  );
}
