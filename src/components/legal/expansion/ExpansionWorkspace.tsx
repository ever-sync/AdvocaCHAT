import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getExpansionContext } from "@/lib/api/legal-expansion";
import { LegalError, LegalLoading } from "../LegalShared";
import type { LegalOperationsProps } from "../operations/operations-ui";
import { ExpansionAccessNotice } from "./ExpansionShared";
import {
  expansionCaseAccess,
  expansionKey,
  type ExpansionProps,
} from "./expansion-ui";
const Coverage = lazy(() => import("./ExpansionCoverage"));
const Acts = lazy(() => import("./ExpansionActs"));
const Diligences = lazy(() => import("./ExpansionDiligences"));
const Succession = lazy(() => import("./ExpansionSuccession"));
const Specialty = lazy(() => import("./ExpansionSpecialty"));
const TABS = [
  ["acts", "Atos e recibos"],
  ["diligences", "Diligências"],
  ["succession", "Sucessores"],
  ["specialty", "Especialidades"],
  ["coverage", "Cobertura institucional"],
] as const;
export default function ExpansionWorkspace(props: LegalOperationsProps) {
  const allowed = expansionCaseAccess(props);
  const context = useQuery({
    queryKey: expansionKey(props, "context"),
    queryFn: ({ signal }) => getExpansionContext(props.legalCase.id, signal),
    enabled: allowed,
    retry: false,
    refetchInterval: 15000,
  });
  if (!allowed) return <ExpansionAccessNotice />;
  if (context.isPending) return <LegalLoading />;
  if (context.isError)
    return (
      <LegalError error={context.error} retry={() => void context.refetch()} />
    );
  if (
    context.data.tenant_id !== props.workspace.tenant_id ||
    context.data.user_id !== props.workspace.user_id
  )
    return <ExpansionAccessNotice />;
  return (
    <ExpansionInner
      key={[
        ...expansionKey(props, "workspace"),
        context.data.can_edit,
        context.data.can_review,
        context.data.can_manage,
      ].join(":")}
      {...props}
      context={context.data}
    />
  );
}
function ExpansionInner(props: ExpansionProps) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("acts");
  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Operações especializadas"
        className="flex flex-wrap gap-2"
      >
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={"expansion-tab-" + value}
            aria-selected={tab === value}
            aria-controls={"expansion-panel-" + value}
            className={
              "rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
              (tab === value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-foreground")
            }
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id={"expansion-panel-" + tab}
        aria-labelledby={"expansion-tab-" + tab}
      >
        <Suspense fallback={<LegalLoading />}>
          {tab === "acts" ? (
            <Acts {...props} />
          ) : tab === "diligences" ? (
            <Diligences {...props} />
          ) : tab === "succession" ? (
            <Succession {...props} />
          ) : tab === "specialty" ? (
            <Specialty {...props} />
          ) : (
            <Coverage {...props} />
          )}
        </Suspense>
      </section>
    </div>
  );
}
