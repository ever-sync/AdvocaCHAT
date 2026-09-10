import { useMemo, useState } from "react";
import { AlertTriangle, Filter, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePlatformLogs, type PlatformLogEntry, type PlatformLogSource } from "@/lib/api/platform-logs";

const SOURCE_LABELS: Record<PlatformLogSource, string> = {
  crm: "CRM",
  whatsapp: "WhatsApp",
  campaign: "Campanhas",
};

const SOURCE_BADGE_STYLES: Record<PlatformLogSource, string> = {
  crm: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  whatsapp: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200",
  campaign: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200",
};

const SOURCE_ORDER: Array<"all" | PlatformLogSource> = ["all", "crm", "whatsapp", "campaign"];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function severityStyles(severity: PlatformLogEntry["severity"]) {
  switch (severity) {
    case "error":
      return "border-destructive/20 bg-destructive/5 text-destructive";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300";
    default:
      return "border-border/60 bg-card/60 text-foreground";
  }
}

export function PlatformLogSection() {
  const { data: logs = [], isLoading, isFetching, refetch, error } = usePlatformLogs();
  const [sourceFilter, setSourceFilter] = useState<"all" | PlatformLogSource>("all");
  const [search, setSearch] = useState("");

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((entry) => {
      if (sourceFilter !== "all" && entry.source !== sourceFilter) {
        return false;
      }
      if (!q) return true;
      return [entry.title, entry.body ?? "", SOURCE_LABELS[entry.source], entry.entityType ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [logs, search, sourceFilter]);

  const counts = useMemo(() => {
    return {
      all: logs.length,
      crm: logs.filter((entry) => entry.source === "crm").length,
      whatsapp: logs.filter((entry) => entry.source === "whatsapp").length,
      campaign: logs.filter((entry) => entry.source === "campaign").length,
    };
  }, [logs]);

  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Log da plataforma</CardTitle>
            <CardDescription>
              Feed unificado com eventos do CRM, WhatsApp e campanhas. Ele reúne o que a plataforma já grava
              hoje, em ordem cronológica.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isFetching ? "animate-spin" : "")} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no log"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {SOURCE_ORDER.map((source) => {
              const active = sourceFilter === source;
              const label = source === "all" ? "Todos" : SOURCE_LABELS[source];
              const count = source === "all" ? counts.all : counts[source];
              return (
                <button
                  key={source}
                  type="button"
                  onClick={() => setSourceFilter(source)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
                  )}
                >
                  <span>{label}</span>
                  <Badge variant={active ? "secondary" : "outline"} className="rounded-full px-2 py-0 text-[11px]">
                    {count}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Não foi possível carregar o log: {(error as Error).message}</span>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando eventos…</p>
        ) : filteredLogs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nenhum evento encontrado para os filtros atuais.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "rounded-2xl border px-4 py-3 shadow-sm",
                  severityStyles(entry.severity),
                )}
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", SOURCE_BADGE_STYLES[entry.source])}>
                        {SOURCE_LABELS[entry.source]}
                      </Badge>
                      <span className="text-sm font-semibold text-foreground">{entry.title}</span>
                    </div>
                    {entry.body ? <p className="text-sm leading-relaxed text-muted-foreground">{entry.body}</p> : null}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(entry.createdAt)}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5">{entry.actorName}</span>
                      {entry.entityType ? <span className="rounded-full bg-muted px-2 py-0.5">{entry.entityType}</span> : null}
                      {entry.entityId ? <span className="rounded-full bg-muted px-2 py-0.5">{entry.entityId}</span> : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
