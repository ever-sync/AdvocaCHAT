import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getJudicialContext } from "@/lib/api/legal-judicial";
import { LegalError, LegalLoading } from "../LegalShared";
import type { LegalOperationsProps } from "../operations/operations-ui";
import { JudicialAccessNotice } from "./JudicialShared";
import {
  judicialCaseAccess,
  judicialKey,
  judicialVisibleContext,
} from "./judicial-ui";
const JudicialProceedings = lazy(() => import("./JudicialProceedings"));
const JudicialInbox = lazy(() => import("./JudicialInbox"));
const JudicialMonitoring = lazy(() => import("./JudicialMonitoring"));
const JudicialCatalog = lazy(() => import("./JudicialCatalog"));
const JudicialDeadlines = lazy(() => import("./JudicialDeadlines"));
const tabs = [
  { id: "proceedings", label: "Processos" },
  { id: "inbox", label: "Publicações e triagem" },
  { id: "monitoring", label: "Fontes e monitoramento" },
  { id: "catalog", label: "Calendário e regras" },
  { id: "deadlines", label: "Prazos assistidos" },
] as const;
export default function LegalJudicialWorkspace(props: LegalOperationsProps) {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("proceedings");
  const allowed = judicialCaseAccess(props);
  const query = useQuery({
    queryKey: judicialKey(props, "context"),
    queryFn: ({ signal }) => getJudicialContext(props.legalCase.id, signal),
    enabled: allowed && tab !== "proceedings",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    retry: false,
  });
  if (!allowed) return <JudicialAccessNotice />;
  const current = query.data
    ? judicialVisibleContext(props, query.data)
    : undefined;
  const panelProps = current ? { ...props, context: current } : undefined;
  return (
    <div className="min-w-0 space-y-4">
      <div
        role="tablist"
        aria-label="Processos e acompanhamento judicial"
        className="flex flex-wrap gap-2"
      >
        {tabs.map((item) => (
          <Button
            key={item.id}
            id={`judicial-tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`judicial-panel-${item.id}`}
            variant={tab === item.id ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`judicial-panel-${tab}`}
        aria-labelledby={`judicial-tab-${tab}`}
      >
        <Suspense fallback={<LegalLoading />}>
          {tab === "proceedings" ? (
            <JudicialProceedings {...props} />
          ) : query.isError ? (
            <LegalError
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : !panelProps ? (
            <LegalLoading />
          ) : tab === "inbox" ? (
            <JudicialInbox {...panelProps} />
          ) : tab === "monitoring" ? (
            <JudicialMonitoring {...panelProps} />
          ) : tab === "catalog" ? (
            <JudicialCatalog {...panelProps} />
          ) : (
            <JudicialDeadlines {...panelProps} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
