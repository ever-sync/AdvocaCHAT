import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLegalWorkspaceContext } from "@/lib/api/legal";
import { LegalError, LegalLoading } from "../LegalShared";
import {
  readinessMetrics,
  readinessCases,
  exportCaseManifest,
  previewCaseImport,
  applyCaseImport,
  parseCaseImport,
  type ImportPreview,
} from "@/lib/api/legal-readiness";
import { OperationalCostForm } from "./OperationalCostForm";
export default function LegalReadinessPage() {
  const { profile } = useAuth();
  return (
    <PageShell contentClassName="max-w-6xl space-y-6">
      <Readiness key={profile?.id ?? "none"} userId={profile?.id} />
    </PageShell>
  );
}
function Readiness({ userId }: { userId?: string }) {
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState(""),
    [source, setSource] = useState(""),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const mutation = useRef<AbortController | null>(null),
    importKey = useRef(crypto.randomUUID());
  useEffect(() => () => mutation.current?.abort(), []);
  const workspace = useQuery({
    queryKey: ["legal", userId, "context"],
    queryFn: getLegalWorkspaceContext,
    enabled: !!userId,
  });
  const enabled = !!workspace.data?.enabled;
  const metrics = useQuery({
    queryKey: ["legal", userId, "readiness"],
    queryFn: ({ signal }) => readinessMetrics(signal),
    enabled,
    refetchInterval: 60000,
  });
  const cases = useQuery({
    queryKey: ["legal", userId, "readiness-cases", page],
    queryFn: ({ signal }) => readinessCases(page, signal),
    enabled,
  });
  const current = cases.data?.items.find((c) => c.id === selected);
  const canExport =
    enabled && cases.isSuccess && !cases.error && current?.owner_id === userId;
  useEffect(() => {
    if (!enabled || workspace.error || cases.error) mutation.current?.abort();
  }, [enabled, workspace.error, cases.error]);
  async function run(fn: (signal: AbortSignal) => Promise<void>) {
    mutation.current?.abort();
    const c = new AbortController();
    mutation.current = c;
    setBusy(true);
    setMessage("");
    try {
      await fn(c.signal);
    } catch (e) {
      if (!c.signal.aborted) setMessage((e as Error).message);
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  const m = metrics.data;
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Operação do escritório</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Indicadores dos casos aos quais você tem acesso. Valores financeiros
            exigem permissão médica e fiscal.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/casos">Voltar aos casos</Link>
        </Button>
      </header>
      {workspace.isPending ? (
        <LegalLoading />
      ) : workspace.error ? (
        <LegalError error={workspace.error} />
      ) : !enabled ? (
        <p>Habilite a área jurídica nas configurações do escritório.</p>
      ) : (
        <>
          {metrics.isPending ? (
            <LegalLoading />
          ) : metrics.error ? (
            <LegalError
              error={metrics.error}
              retry={() => void metrics.refetch()}
            />
          ) : m ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Casos acessíveis", m.case_count],
                  ["Ativos", m.active_cases],
                  ["Aguardando", m.waiting_cases],
                  ["Próximas ações vencidas", m.overdue_next_actions],
                  ["Pedidos IR", m.ir_claims],
                  ["Recebido documentado (BRL)", m.ir_received_brl],
                  [
                    "Reconhecido por pedido (BRL)",
                    m.ir_recognized_by_claim_brl,
                  ],
                  [
                    "Fontes com cessação verificada",
                    m.ir_cessation_verified_sources,
                  ],
                ].map(([label, value]) => (
                  <article
                    key={label}
                    className="rounded-xl border bg-card p-4"
                  >
                    <h2 className="text-sm text-muted-foreground">{label}</h2>
                    <p className="mt-2 break-words text-2xl font-semibold">
                      {value}
                    </p>
                  </article>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {m.ir_warning} A cessação corresponde ao último registro por
                fonte. Atualizado em{" "}
                {new Date(m.measured_at).toLocaleString("pt-BR")}.
              </p>
              <section className="space-y-3 rounded-xl border bg-card p-4">
                <h2 className="text-lg font-semibold">Custos informados</h2>
                <p className="text-sm">{m.cost_warning}</p>
                {m.cost_totals.length ? (
                  <ul>
                    {m.cost_totals.map((c) => (
                      <li key={c.kind + c.currency}>
                        {
                          {
                            actual: "Efetivo documentado",
                            estimate: "Estimativa",
                            budget: "Orçamento",
                          }[c.kind]
                        }{" "}
                        · {c.currency} {c.amount}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Nenhum custo informado nos casos sob sua responsabilidade.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Arquivos acessíveis:{" "}
                  {(Number(m.storage_visible_bytes) / 1048576).toFixed(2)} MiB.
                  Este volume não representa custo faturado.
                </p>
              </section>
            </>
          ) : null}
          <section className="space-y-4 rounded-xl border bg-card p-4">
            <h2 className="text-lg font-semibold">
              Caso para custo ou exportação
            </h2>
            {cases.error ? (
              <LegalError error={cases.error} />
            ) : (
              <label className="block space-y-2 text-sm">
                Caso
                <select
                  aria-label="Caso para operação"
                  className="w-full rounded-md border bg-background p-2"
                  value={selected}
                  onChange={(e) => {
                    mutation.current?.abort();
                    setBusy(false);
                    setSelected(e.target.value);
                    setMessage("");
                  }}
                >
                  <option value="">Selecione</option>
                  {cases.data?.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={page === 0}
                onClick={() => {
                  setSelected("");
                  setPage((p) => p - 1);
                }}
              >
                Anterior
              </Button>
              <span className="text-sm">
                Página {page + 1} · {cases.data?.total ?? 0} casos
              </span>
              <Button
                variant="outline"
                disabled={(page + 1) * 25 >= (cases.data?.total ?? 0)}
                onClick={() => {
                  setSelected("");
                  setPage((p) => p + 1);
                }}
              >
                Próxima
              </Button>
            </div>
            {selected && !canExport ? (
              <p className="text-sm">
                Somente o responsável pelo caso registra custos e exporta o
                manifesto completo.
              </p>
            ) : null}
            {selected && canExport ? (
              <>
                <OperationalCostForm
                  key={selected}
                  caseId={selected}
                  onSaved={() => void metrics.refetch()}
                />
                <div className="space-y-2 border-t pt-4">
                  <h3 className="font-medium">Exportar manifesto do caso</h3>
                  <p className="text-sm text-muted-foreground">
                    JSON com registros e versões do caso. Não inclui os bytes
                    dos arquivos, bibliotecas do escritório ou credenciais.
                    Baixe os documentos pela área de Documentos ou Diligências;
                    este manifesto não substitui backup integral.
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async (signal) => {
                        const data = await exportCaseManifest(selected, signal);
                        signal.throwIfAborted();
                        const blob = new Blob([JSON.stringify(data, null, 2)], {
                            type: "application/json",
                          }),
                          url = URL.createObjectURL(blob),
                          a = document.createElement("a");
                        a.href = url;
                        a.download = "advocachat-caso-" + selected + ".json";
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                        setMessage(
                          "Manifesto exportado. Os arquivos privados devem ser baixados separadamente.",
                        );
                      })
                    }
                  >
                    Baixar manifesto JSON
                  </Button>
                </div>
              </>
            ) : null}
          </section>
          {workspace.data?.can_create ? (
            <section className="space-y-4 rounded-xl border bg-card p-4">
              <h2 className="text-lg font-semibold">
                Importação assistida de casos
              </h2>
              <p className="text-sm">
                Lista JSON com 1 a 100 casos, até 128 KiB. Cada item aceita
                título, área, tipo e próxima ação. Cliente existente pode ser
                vinculado por customer_id do mesmo escritório. Não importa
                documentos, decisões, poderes ou prazos legais.
              </p>
              <code className="block overflow-x-auto rounded bg-muted p-3 text-xs">
                {
                  '[{"title":"Novo atendimento","area":"IR","case_type":"consultivo","next_action":"Conferir documentos"}]'
                }
              </code>
              <Input
                aria-label="Arquivo JSON de casos"
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void run(async (signal) => {
                    if (f.size > 131072)
                      throw new Error("Arquivo acima de 128 KiB.");
                    const text = await f.text();
                    signal.throwIfAborted();
                    parseCaseImport(text);
                    setSource(text);
                    setPreview(null);
                    importKey.current = crypto.randomUUID();
                  });
                }}
              />
              <Button
                variant="outline"
                disabled={!source || busy}
                onClick={() =>
                  void run(async (signal) => {
                    const p = await previewCaseImport(
                      parseCaseImport(source),
                      signal,
                    );
                    signal.throwIfAborted();
                    setPreview(p);
                  })
                }
              >
                Conferir prévia
              </Button>
              {preview ? (
                <div className="space-y-3">
                  <p>
                    {preview.count} casos novos. {preview.warning}
                  </p>
                  <ol className="max-h-64 list-inside list-decimal overflow-auto text-sm">
                    {preview.rows.map((r, i) => (
                      <li key={i}>
                        {String(r.title)} — {String(r.next_action)}
                      </li>
                    ))}
                  </ol>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async (signal) => {
                        const r = await applyCaseImport(
                          parseCaseImport(source),
                          preview.preview_hash,
                          importKey.current,
                          signal,
                        );
                        signal.throwIfAborted();
                        setMessage(
                          `${r.count} casos ${r.already_applied ? "já haviam sido importados" : "importados"}.`,
                        );
                        setSource("");
                        setPreview(null);
                        await cases.refetch();
                        await metrics.refetch();
                      })
                    }
                  >
                    Confirmar criação dos {preview.count} casos
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}
          {message ? (
            <p
              role="status"
              className="break-words rounded-lg border p-3 text-sm"
            >
              {message}
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
