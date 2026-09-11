import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  downloadPortalDocument,
  downloadPortalExport,
  portalAccess,
  PortalApiError,
  uploadPortalDocument,
} from "./api";
import { portalRequestScope } from "./request-scope";
import {
  portalCategoryAllowed,
  portalMembershipFingerprint,
  type PortalCase,
  type PortalCategory,
  type PortalDocumentRequest,
  type PortalExportManifest,
  type PortalMembership,
} from "./types";
import { PortalStatements } from "./PortalStatements";
import { PortalField, PortalNotice } from "./ui";
import { PORTAL_CATEGORIES, portalDate, portalDownload } from "./format";

const REQUEST_STATES = {
  open: "Aguardando envio",
  uploading: "Envio em processamento",
  submitted: "Recebido para conferência",
  approved: "Conferido pelo escritório",
  rejected: "Não aprovado na conferência",
  cancelled: "Solicitação cancelada",
};
function RequestUpload({
  request,
  submit,
  busy,
}: {
  request: PortalDocumentRequest;
  submit(file: File): Promise<boolean>;
  busy: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const canUpload =
    request.status === "open" && Date.parse(request.expires_at) > Date.now();
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-medium">{request.title}</h3>
        <Badge variant="secondary">{REQUEST_STATES[request.status]}</Badge>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">
        {request.instructions}
      </p>
      <p className="text-xs text-muted-foreground">
        {PORTAL_CATEGORIES[request.category]} · Envio disponível até{" "}
        {portalDate(request.expires_at)}
        {request.due_at && ` · Prazo solicitado: ${portalDate(request.due_at)}`}
      </p>
      {canUpload && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (!file) return;
            if (
              file.size > 10 * 1024 * 1024 ||
              !/\.(pdf|png|jpe?g|txt|csv)$/i.test(file.name)
            ) {
              setError("Selecione um PDF, PNG, JPG, TXT ou CSV de até 10 MB.");
              return;
            }
            if (await submit(file)) setFile(null);
          }}
        >
          <PortalField
            label={`Arquivo para ${request.title}`}
            hint="PDF, PNG, JPG, TXT ou CSV, até 10 MB. Envie apenas o documento solicitado."
          >
            <Input
              aria-label={`Arquivo para ${request.title}`}
              className="max-w-full"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.csv"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </PortalField>
          {error && <PortalNotice error>{error}</PortalNotice>}
          <Button size="sm" disabled={busy || !file}>
            <Upload className="mr-2 h-4 w-4" />
            {busy ? "Enviando…" : "Enviar documento"}
          </Button>
        </form>
      )}
    </article>
  );
}
export function PortalCaseView({
  membership,
  identityId,
}: {
  membership: PortalMembership;
  identityId: string;
}) {
  const cache = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);
  const [expired, setExpired] = useState(
    Date.parse(membership.expires_at) <= Date.now(),
  );
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<PortalCategory>(
    membership.access_kind === "accountant" ? "fiscal" : "general",
  );
  const [manifest, setManifest] = useState<PortalExportManifest | null>(null);
  const alive = useRef(true);
  const messageKey = useRef(crypto.randomUUID());
  const fingerprint = portalMembershipFingerprint([membership]);
  const query = useQuery({
    queryKey: ["portal", identityId, "case", membership.id, fingerprint],
    queryFn: ({ signal }) =>
      portalAccess<PortalCase>(
        { action: "case", membership_id: membership.id },
        signal,
      ),
    enabled: !expired && !denied,
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    retry: false,
  });
  useEffect(() => {
    alive.current = true;
    const duration = Math.max(
      0,
      Math.min(2147483647, Date.parse(membership.expires_at) - Date.now()),
    );
    const timer = setTimeout(() => {
      if (Date.parse(membership.expires_at) <= Date.now()) {
        portalRequestScope.invalidate();
        setExpired(true);
      }
    }, duration);
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [membership.expires_at]);
  useEffect(() => {
    if (query.isError) {
      setManifest(null);
      if (
        query.error instanceof PortalApiError &&
        [401, 403, 404].includes(query.error.status)
      ) {
        setDenied(true);
        void cache.invalidateQueries({
          queryKey: ["portal", identityId, "context"],
        });
      }
    }
  }, [query.isError, query.error, cache, identityId]);
  const run = async (action: () => Promise<void>, message = "") => {
    if (busy) return false;
    const scope = portalRequestScope.capture();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (!alive.current || !scope.current()) return false;
      setNotice(message);
      await query.refetch();
      return true;
    } catch (err) {
      if (alive.current && scope.current()) {
        if (
          err instanceof PortalApiError &&
          [401, 403, 404].includes(err.status)
        ) {
          setDenied(true);
          portalRequestScope.invalidate();
          void cache.invalidateQueries({
            queryKey: ["portal", identityId, "context"],
          });
        }
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível concluir a ação.",
        );
      }
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const download = async (
    operation: Promise<{ blob: Blob; filename: string }>,
  ) => {
    const scope = portalRequestScope.capture();
    const result = await operation;
    if (alive.current && scope.current()) portalDownload(result);
  };
  const has = (scope: PortalMembership["scopes"][number]) =>
    membership.scopes.includes(scope);
  const categories = (
    Object.keys(PORTAL_CATEGORIES) as PortalCategory[]
  ).filter((c) => portalCategoryAllowed(membership, c));
  if (denied || expired)
    return (
      <div className="space-y-4">
        <PortalNotice>
          Este acesso foi alterado, expirou ou está indisponível. Os conteúdos
          desta página foram fechados.
        </PortalNotice>
        <Button asChild variant="outline">
          <Link to="/portal">Voltar aos meus atendimentos</Link>
        </Button>
      </div>
    );
  if (query.isPending)
    return <PortalNotice>Carregando o atendimento…</PortalNotice>;
  if (query.isError)
    return (
      <div className="space-y-4">
        <PortalNotice error>{query.error.message}</PortalNotice>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Consultar novamente
        </Button>
      </div>
    );
  if (portalMembershipFingerprint([query.data.membership]) !== fingerprint)
    return (
      <PortalNotice>
        As permissões mudaram. Aguarde a atualização do seu acesso.
      </PortalNotice>
    );
  const data = query.data;
  const tabs = [
    {
      id: "overview",
      label: "Atualizações",
      visible: has("case_summary:read"),
    },
    { id: "agenda", label: "Agenda", visible: has("agenda:read") },
    {
      id: "documents",
      label: "Documentos",
      visible:
        has("documents:read") ||
        has("requests:upload") ||
        has("fiscal_exports:read"),
    },
    {
      id: "statements",
      label: "Demonstrativos",
      visible: has("statements:read") && membership.allow_fiscal,
    },
    {
      id: "messages",
      label: "Mensagens",
      visible: has("messages:read") || has("messages:write"),
    },
  ].filter((t) => t.visible);
  const selected = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;
  const publications = data.publications.filter(
    (p) =>
      has("case_summary:read") && portalCategoryAllowed(membership, p.category),
  );
  const agenda = data.agenda.filter(
    (p) => has("agenda:read") && portalCategoryAllowed(membership, p.category),
  );
  const documents = data.documents.filter(
    (d) =>
      has("documents:read") && portalCategoryAllowed(membership, d.category),
  );
  const requests = data.requests.filter(
    (r) =>
      has("requests:upload") && portalCategoryAllowed(membership, r.category),
  );
  const messages = data.messages.filter(
    (m) =>
      has("messages:read") && portalCategoryAllowed(membership, m.category),
  );
  return (
    <div className="min-w-0 space-y-5">
      <Link
        to="/portal"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Meus atendimentos
      </Link>
      <h1 className="break-words text-2xl font-semibold">
        {membership.public_title}
      </h1>
      <div
        role="tablist"
        aria-label="Conteúdos do atendimento"
        className="flex flex-wrap gap-2"
      >
        {tabs.map((t) => (
          <Button
            key={t.id}
            id={`portal-tab-${t.id}`}
            role="tab"
            aria-selected={selected === t.id}
            aria-controls={`portal-panel-${t.id}`}
            variant={selected === t.id ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setTab(t.id);
              setError("");
              setNotice("");
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {error && <PortalNotice error>{error}</PortalNotice>}
      {notice && <PortalNotice>{notice}</PortalNotice>}
      <div
        role="tabpanel"
        id={`portal-panel-${selected}`}
        aria-labelledby={`portal-tab-${selected}`}
        className="space-y-4"
      >
        {selected === "overview" &&
          (publications.length ? (
            publications.map((p) => (
              <article
                className="space-y-3 rounded-xl border bg-card p-5"
                key={p.id}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h2 className="break-words font-semibold">{p.title}</h2>
                  <Badge variant="outline">
                    {PORTAL_CATEGORIES[p.category]}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {p.body}
                </p>
                <p className="text-xs text-muted-foreground">
                  Revisado pelo escritório em {portalDate(p.reviewed_at)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await portalAccess({
                        action: "acknowledge",
                        membership_id: membership.id,
                        publication_id: p.id,
                      });
                    }, "Sua leitura foi registrada.")
                  }
                >
                  Registrar que li
                </Button>
              </article>
            ))
          ) : (
            <PortalNotice>
              O escritório ainda não publicou atualizações para este acesso.
            </PortalNotice>
          ))}
        {selected === "agenda" &&
          (agenda.length ? (
            agenda.map((item) => (
              <article
                key={item.id}
                className="space-y-2 rounded-xl border p-5"
              >
                <h2 className="break-words font-semibold">{item.title}</h2>
                <p className="text-sm font-medium">
                  {portalDate(item.starts_at)}
                  {item.ends_at && ` até ${portalDate(item.ends_at)}`}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {item.body}
                </p>
              </article>
            ))
          ) : (
            <PortalNotice>
              Nenhum compromisso foi disponibilizado para este acesso.
            </PortalNotice>
          ))}
        {selected === "documents" && (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">
                Solicitações do escritório
              </h2>
              {requests.length ? (
                requests.map((request) => (
                  <RequestUpload
                    key={request.id}
                    request={request}
                    busy={busy}
                    submit={(file) =>
                      run(async () => {
                        await uploadPortalDocument(request.id, file);
                      }, "Documento recebido para conferência. O escritório ainda precisa revisar o conteúdo.")
                    }
                  />
                ))
              ) : (
                <PortalNotice>
                  Nenhum documento foi solicitado para este acesso.
                </PortalNotice>
              )}
            </section>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Arquivos liberados</h2>
              {documents.length ? (
                documents.map((doc) => (
                  <article
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4"
                    key={doc.id}
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-medium">
                        {doc.display_name || doc.file_name}
                      </h3>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {doc.purpose}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {PORTAL_CATEGORIES[doc.category]} · Disponível até{" "}
                        {portalDate(doc.expires_at)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          download(
                            downloadPortalDocument(membership.id, doc.id),
                          ),
                        )
                      }
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Baixar
                    </Button>
                  </article>
                ))
              ) : (
                <PortalNotice>
                  Nenhum arquivo foi liberado para este acesso.
                </PortalNotice>
              )}
            </section>
            {has("fiscal_exports:read") && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">
                  Pacotes fiscais revisados
                </h2>
                {data.exports.length ? (
                  data.exports.map((item) => (
                    <article
                      key={item.id}
                      className="space-y-3 rounded-lg border p-4"
                    >
                      <h3 className="break-words font-medium">{item.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        Revisado em {portalDate(item.reviewed_at)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const scope = portalRequestScope.capture();
                              const result =
                                await portalAccess<PortalExportManifest>({
                                  action: "request_export",
                                  membership_id: membership.id,
                                  export_id: item.id,
                                });
                              if (alive.current && scope.current())
                                setManifest(result);
                            })
                          }
                        >
                          Ver arquivos do pacote
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              download(
                                downloadPortalExport(membership.id, item.id),
                              ),
                            )
                          }
                        >
                          Baixar relação dos arquivos
                        </Button>
                      </div>
                    </article>
                  ))
                ) : (
                  <PortalNotice>
                    Nenhum pacote fiscal foi liberado.
                  </PortalNotice>
                )}
                {manifest && (
                  <div className="space-y-3 rounded-lg bg-muted/40 p-4">
                    <h3 className="font-medium">{manifest.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      Cada arquivo exige autorização vigente no momento do
                      download.
                    </p>
                    {manifest.items.map((item) => (
                      <div
                        key={item.release_id}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="min-w-0 break-all text-sm">
                          {item.file_name}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              download(
                                downloadPortalDocument(
                                  membership.id,
                                  item.release_id,
                                ),
                              ),
                            )
                          }
                        >
                          Baixar arquivo
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
        {selected === "messages" && (
          <>
            {has("messages:read") &&
              (messages.length ? (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className={`space-y-2 rounded-lg border p-4 ${message.direction === "client" ? "bg-muted/30" : "bg-card"}`}
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {message.direction === "client" ? "Você" : "Escritório"} ·{" "}
                      {PORTAL_CATEGORIES[message.category]} ·{" "}
                      {portalDate(message.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {message.body}
                    </p>
                  </article>
                ))
              ) : (
                <PortalNotice>Nenhuma mensagem disponível.</PortalNotice>
              ))}
            {has("messages:write") && (
              <form
                className="space-y-3 rounded-xl border p-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await run(async () => {
                      await portalAccess({
                        action: "reply",
                        membership_id: membership.id,
                        category,
                        body,
                        idempotency_key: messageKey.current,
                      });
                    }, "Mensagem registrada no portal.")
                  ) {
                    setBody("");
                    messageKey.current = crypto.randomUUID();
                  }
                }}
              >
                <h2 className="font-semibold">Mensagem ao escritório</h2>
                <PortalField label="Categoria">
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    aria-label="Categoria da mensagem"
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as PortalCategory)
                    }
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {PORTAL_CATEGORIES[c]}
                      </option>
                    ))}
                  </select>
                </PortalField>
                <PortalField
                  label="Mensagem"
                  hint="Selecione Saúde ou Fiscal quando o conteúdo incluir essas informações."
                >
                  <Textarea
                    aria-label="Mensagem ao escritório"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={6000}
                    required
                    rows={4}
                  />
                </PortalField>
                <Button disabled={busy || !body.trim()}>
                  {busy ? "Registrando…" : "Registrar mensagem no portal"}
                </Button>
              </form>
            )}
          </>
        )}
        {selected === "statements" && (
          <PortalStatements membership={membership} identityId={identityId} />
        )}
        {!selected && (
          <PortalNotice>
            Seu acesso atual não possui conteúdo publicado para consulta.
          </PortalNotice>
        )}
      </div>
    </div>
  );
}
