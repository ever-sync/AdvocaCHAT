import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getLegalWorkspaceContext } from "@/lib/api/legal";
import {
  LegalEmpty,
  LegalError,
  LegalField,
  LegalLoading,
} from "../LegalShared";
import { legalDate, selectClassName } from "../legal-ui";
import { getLegalMyDay } from "./api";
const KINDS: Record<string, string> = {
  task: "Tarefa",
  appointment: "Compromisso",
  waiting_client: "Documento do cliente",
  communication: "Comunicação para conferir",
  withholding_reopened: "Retenção retomada",
};
function brasilDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export default function LegalMyDay() {
  const { profile } = useAuth();
  const [from, setFrom] = useState(brasilDate(-30));
  const [until, setUntil] = useState(brasilDate(7));
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState("all");
  const workspace = useQuery({
    queryKey: ["legal", profile?.id, "context"],
    queryFn: getLegalWorkspaceContext,
    enabled: Boolean(profile?.id),
  });
  const end = until
    ? new Date(`${until}T23:59:59.999-03:00`).toISOString()
    : "";
  const start = from ? new Date(`${from}T00:00:00-03:00`).toISOString() : "";
  const valid = Boolean(start && end && start < end);
  const query = useQuery({
    queryKey: [
      "legal",
      workspace.data?.user_id,
      workspace.data?.tenant_id,
      "my-day",
      from,
      until,
      offset,
    ],
    queryFn: () => getLegalMyDay(start, end, offset),
    enabled: Boolean(workspace.data?.enabled && valid),
    refetchOnWindowFocus: true,
  });
  const rows = (query.data?.items ?? []).filter(
    (row) => kind === "all" || row.kind === kind,
  );
  return (
    <PageShell contentClassName="max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Meu dia jurídico</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Providências atribuídas a você ou sob sua substituição, pendências
            de clientes e comunicações que precisam de conferência.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/casos">Abrir casos</Link>
        </Button>
      </header>
      {workspace.isPending ? (
        <LegalLoading />
      ) : workspace.error ? (
        <LegalError
          error={workspace.error}
          retry={() => void workspace.refetch()}
        />
      ) : !workspace.data?.enabled ? (
        <LegalEmpty title="A área jurídica está desabilitada" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <LegalField label="Desde">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setOffset(0);
                  }}
                />
              )}
            </LegalField>
            <LegalField label="Até">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={until}
                  onChange={(e) => {
                    setUntil(e.target.value);
                    setOffset(0);
                  }}
                />
              )}
            </LegalField>
            <LegalField label="Tipo nesta página">
              {(id) => (
                <select
                  id={id}
                  className={selectClassName}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="all">Todos os tipos</option>
                  {Object.entries(KINDS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </LegalField>
          </div>
          <p className="text-xs text-muted-foreground">
            Horários de Brasília. Itens sem data também aparecem. Cada página
            consulta até 50 registros autorizados.
          </p>
          {!valid ? (
            <p role="alert" className="text-sm text-destructive">
              Informe um período válido.
            </p>
          ) : query.isPending ? (
            <LegalLoading />
          ) : query.error ? (
            <LegalError
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : (
            <>
              {rows.length ? (
                rows.map((row) => (
                  <article
                    key={`${row.kind}:${row.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <Badge variant="secondary">
                        {KINDS[row.kind] ?? "Providência"}
                      </Badge>
                      <h2 className="mt-2 break-words font-medium">
                        {row.title}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {legalDate(row.due_at, true)}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/casos/${row.case_id}`}>Abrir caso</Link>
                    </Button>
                  </article>
                ))
              ) : (
                <LegalEmpty title="Nenhuma providência neste período e filtro" />
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                >
                  Página anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Página {Math.floor(offset / 50) + 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!query.data?.has_more}
                  onClick={() => setOffset(offset + 50)}
                >
                  Próxima página
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
