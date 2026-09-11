import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LegalError, LegalLoading } from "../LegalShared";
import type { LegalOperationsProps } from "../operations/operations-ui";
import { careKey, visibleCareContext } from "./client-care-ui";
import { getClientCareContext } from "./api";
const Access = lazy(() => import("./CareAccess"));
const Publications = lazy(() => import("./CarePublications"));
const Documents = lazy(() => import("./CareDocuments"));
const Communications = lazy(() => import("./CareCommunications"));
const Followups = lazy(() => import("./CareFollowups"));
const TABS = {
  access: "Acessos",
  publications: "Publicações e agenda",
  documents: "Documentos e contador",
  communications: "Comunicações",
  followups: "Acompanhamento",
};
export default function LegalClientCare(props: LegalOperationsProps) {
  const [tab, setTab] = useState<keyof typeof TABS>("access");
  const query = useQuery({
    queryKey: careKey(props, "context"),
    queryFn: () => getClientCareContext(props.legalCase.id),
    refetchOnWindowFocus: true,
  });
  if (query.isPending) return <LegalLoading />;
  if (query.error)
    return (
      <LegalError error={query.error} retry={() => void query.refetch()} />
    );
  const shared = { ...props, context: visibleCareContext(props, query.data) };
  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Atendimento ao cliente"
        className="flex flex-wrap gap-2"
      >
        {Object.entries(TABS).map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            id={`care-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`care-panel-${key}`}
            variant={tab === key ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(key as keyof typeof TABS)}
          >
            {label}
          </Button>
        ))}
      </div>
      <section
        role="tabpanel"
        id={`care-panel-${tab}`}
        aria-labelledby={`care-tab-${tab}`}
      >
        <Suspense fallback={<LegalLoading />}>
          {tab === "access" ? (
            <Access {...shared} />
          ) : tab === "publications" ? (
            <Publications {...shared} />
          ) : tab === "documents" ? (
            <Documents {...shared} />
          ) : tab === "communications" ? (
            <Communications {...shared} />
          ) : (
            <Followups {...shared} />
          )}
        </Suspense>
      </section>
    </div>
  );
}
