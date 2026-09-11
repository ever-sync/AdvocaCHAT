import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getAssistanceContext } from "@/lib/api/legal-assistance";
import type { AssistanceCitation } from "@/types/legal-assistance";
import type { LegalOperationsProps } from "../operations/operations-ui";
import { LegalError, LegalLoading } from "../LegalShared";
import { AssistanceAccessNotice } from "./AssistanceShared";
import {
  assistanceCaseAccess,
  assistanceCategoryAccess,
  assistanceKey,
  type AssistanceProps,
} from "./assistance-ui";
import { AssistanceDraftComposer } from "./AssistanceDraftComposer";
const AssistanceDocuments = lazy(() => import("./AssistanceDocuments"));
const AssistanceKnowledge = lazy(() => import("./AssistanceKnowledge"));
const AssistanceSettings = lazy(() => import("./AssistanceSettings"));
const AssistanceSearch = lazy(() => import("./AssistanceSearch"));
const AssistanceDrafts = lazy(() => import("./AssistanceDrafts"));
export default function LegalAssistanceWorkspace(props: LegalOperationsProps) {
  const allowed = assistanceCaseAccess(props);
  const context = useQuery({
    queryKey: assistanceKey(props, "context"),
    queryFn: ({ signal }) => getAssistanceContext(props.legalCase.id, signal),
    enabled: allowed,
    retry: false,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  if (!allowed) return <AssistanceAccessNotice />;
  if (context.isError)
    return (
      <LegalError error={context.error} retry={() => void context.refetch()} />
    );
  if (!context.data) return <LegalLoading />;
  if (
    context.data.tenant_id !== props.workspace.tenant_id ||
    context.data.user_id !== props.workspace.user_id
  )
    return <AssistanceAccessNotice />;
  return (
    <AssistanceArea
      key={assistanceKey(props, "area").join(":")}
      {...props}
      context={context.data}
    />
  );
}
const tabs = [
  { id: "documents", label: "Textos e OCR" },
  { id: "knowledge", label: "Biblioteca" },
  { id: "search", label: "Pesquisa" },
  { id: "drafts", label: "Rascunhos" },
  { id: "settings", label: "Configuração" },
] as const;
function AssistanceArea(props: AssistanceProps) {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("documents"),
    [citations, setCitations] = useState<AssistanceCitation[] | null>(null);
  return (
    <div className="min-w-0 space-y-4">
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Assistência jurídica revisável"
      >
        {tabs.map((item) => (
          <Button
            key={item.id}
            id={`assistance-tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`assistance-panel-${item.id}`}
            size="sm"
            variant={tab === item.id ? "default" : "outline"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`assistance-panel-${tab}`}
        aria-labelledby={`assistance-tab-${tab}`}
      >
        <Suspense fallback={<LegalLoading />}>
          {tab === "documents" ? (
            <AssistanceDocuments {...props} />
          ) : tab === "search" ? (
            <AssistanceSearch props={props} onCompose={setCitations} />
          ) : tab === "knowledge" ? (
            <AssistanceKnowledge {...props} />
          ) : tab === "settings" ? (
            <AssistanceSettings {...props} />
          ) : (
            <AssistanceDrafts {...props} />
          )}
        </Suspense>
      </div>
      {citations &&
        props.context.can_edit &&
        citations.every(
          (citation) =>
            citation.case_id === props.legalCase.id &&
            assistanceCategoryAccess(props, citation.category),
        ) && (
          <AssistanceDraftComposer
            props={props}
            citations={citations}
            onClose={() => setCitations(null)}
          />
        )}
    </div>
  );
}
