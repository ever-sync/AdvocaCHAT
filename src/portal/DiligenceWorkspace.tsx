import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePortalAuth } from "./auth-context";
import {
  diligenceAccess,
  downloadDiligenceDocument,
  PortalApiError,
  uploadDiligenceDocument,
} from "./api";
import {
  type DiligenceContext,
  diligenceFingerprint,
  type DiligenceGrant,
  type DiligenceRead,
  type DiligenceScope,
} from "./diligence-types";
import { portalRequestScope } from "./request-scope";
import { PortalField, PortalNotice } from "./ui";

const stateLabels: Record<string, string> = {
  prepared: "Envio em preparação",
  submitted: "Entregue; aguarda conferência",
  reviewed: "Entrega conferida",
  returned: "Correção solicitada",
  abandoned: "Envio interrompido",
};
const moment = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Não definido";
function saveFile(result: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.filename;
  link.rel = "noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DiligenceWorkspace({ login }: { login: ReactNode }) {
  const auth = usePortalAuth();
  const { grantId } = useParams();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const context = useQuery({
    queryKey: ["diligence", auth.session?.user.id, "context"],
    queryFn: ({ signal }) =>
      diligenceAccess<DiligenceContext>({ action: "context" }, signal),
    enabled: Boolean(auth.session),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  if (auth.loading) return <PortalNotice>Confirmando sua sessão…</PortalNotice>;
  if (!auth.session) return <>{login}</>;
  if (context.isPending) {
    return <PortalNotice>Consultando suas diligências…</PortalNotice>;
  }
  if (context.isError) {
    return (
      <div className="space-y-4">
        <PortalNotice error>{context.error.message}</PortalNotice>
        <Button variant="outline" onClick={() => void context.refetch()}>
          Consultar novamente
        </Button>
      </div>
    );
  }
  if (
    context.data.identity_id !== auth.session.user.id ||
    context.data.status !== "active"
  ) {
    return (
      <PortalNotice>
        Seu acesso não está ativo. Confira o convite com o escritório.
      </PortalNotice>
    );
  }
  const grants = context.data.diligences.filter(
    (g) => g.state === "active" && Date.parse(g.expires_at) > now,
  );
  const fingerprint = diligenceFingerprint(grants);
  const selected = grants.find((g) => g.grant_id === grantId);
  if (grantId) {
    return selected ? (
      <DiligenceDetail
        key={`${auth.session.user.id}:${selected.grant_id}:${fingerprint}`}
        grant={selected}
        identityId={auth.session.user.id}
        fingerprint={fingerprint}
      />
    ) : (
      <div className="space-y-4">
        <PortalNotice>
          Esta diligência não está disponível no seu acesso atual.
        </PortalNotice>
        <Button asChild variant="outline">
          <Link to="/portal/diligencias">Voltar às minhas diligências</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Minhas diligências</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Instruções e arquivos que o escritório liberou para sua atuação.
        </p>
      </div>
      {grants.length === 0 ? (
        <PortalNotice>
          Nenhuma diligência está disponível neste momento.
        </PortalNotice>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {grants.map((g) => (
            <Link
              className="min-w-0 space-y-3 rounded-xl border bg-card p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              key={g.grant_id}
              to={`/portal/diligencias/${g.grant_id}`}
            >
              <h2 className="break-words font-semibold">{g.title}</h2>
              <p className="text-sm text-muted-foreground">
                Prazo operacional: {moment(g.due_at)}
              </p>
              <p className="text-xs text-muted-foreground">
                Acesso até {moment(g.expires_at)}
              </p>
              <p className="text-sm text-primary">Abrir diligência →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
export function DiligenceDetail({
  grant,
  identityId,
  fingerprint,
}: {
  grant: DiligenceGrant;
  identityId: string;
  fingerprint: string;
}) {
  const cache = useQueryClient();
  const alive = useRef(true);
  const authorization = useRef<{
    key: string | null;
    epoch: number;
    scopes: Set<DiligenceScope>;
    expires: number;
  }>({ key: null, epoch: 0, scopes: new Set(), expires: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"medical" | "fiscal">("medical");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);
  const uploadKey = useRef(crypto.randomUUID());
  const messageKey = useRef(crypto.randomUUID());
  const key = ["diligence", identityId, "detail", grant.grant_id, fingerprint];
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const detail = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      diligenceAccess<DiligenceRead>(
        {
          action: "read",
          grant_id: grant.grant_id,
        },
        signal,
      ),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: !denied,
  });
  // A fresh refusal, scope change or mismatched grant invalidates work already in
  // flight. An authorization that later returns must not revive that old work.
  const fresh =
    detail.isFetchedAfterMount &&
    !detail.isError &&
    !denied &&
    detail.data?.grant.id === grant.grant_id &&
    grant.state === "active";
  const expires = Math.min(
    Date.parse(grant.expires_at),
    Date.parse(detail.data?.grant.expires_at ?? ""),
  );
  const allowedScopes = new Set<DiligenceScope>(
    fresh && expires > Date.now()
      ? grant.scopes.filter((scope) =>
          detail.data!.grant.scopes.includes(scope),
        )
      : [],
  );
  const authorizationKey =
    fresh && expires > Date.now()
      ? JSON.stringify([
          identityId,
          grant.grant_id,
          fingerprint,
          expires,
          [...allowedScopes].sort(),
        ])
      : null;
  if (authorization.current.key !== authorizationKey)
    authorization.current.epoch++;
  authorization.current = {
    key: authorizationKey,
    epoch: authorization.current.epoch,
    scopes: allowedScopes,
    expires,
  };
  const authorized = (operation: DiligenceScope) =>
    alive.current &&
    authorization.current.key !== null &&
    authorization.current.expires > Date.now() &&
    authorization.current.scopes.has(operation);
  const action = async (
    operation: DiligenceScope,
    run: (current: () => boolean) => Promise<void>,
  ) => {
    if (!authorized(operation) || busy) return;
    const scope = portalRequestScope.capture();
    const epoch = authorization.current.epoch;
    const current = () =>
      authorized(operation) &&
      authorization.current.epoch === epoch &&
      scope.current();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await run(current);
    } catch (err) {
      if (
        !current() ||
        (err instanceof DOMException && err.name === "AbortError")
      )
        return;
      if (
        err instanceof PortalApiError &&
        [401, 403, 404].includes(err.status)
      ) {
        setDenied(true);
        portalRequestScope.invalidate();
        await cache.cancelQueries({
          queryKey: ["diligence", identityId, "detail", grant.grant_id],
        });
        cache.removeQueries({
          queryKey: ["diligence", identityId, "detail", grant.grant_id],
        });
        void cache.invalidateQueries({
          queryKey: ["diligence", identityId, "context"],
        });
      }
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível concluir a operação.",
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  if (denied || Date.parse(grant.expires_at) <= Date.now()) {
    return (
      <PortalNotice error>
        O acesso a esta diligência foi encerrado ou alterado. Volte à lista para
        conferir suas autorizações.
      </PortalNotice>
    );
  }
  if (detail.isPending || (!detail.isFetchedAfterMount && !detail.isError)) {
    return <PortalNotice>Consultando instruções e entregas…</PortalNotice>;
  }
  if (detail.isError) {
    return (
      <div className="space-y-4">
        <PortalNotice error>{detail.error.message}</PortalNotice>
        <Button variant="outline" onClick={() => void detail.refetch()}>
          Consultar novamente
        </Button>
      </div>
    );
  }
  const data = detail.data;
  if (!fresh || !Number.isFinite(expires) || expires <= Date.now()) {
    return (
      <PortalNotice>
        O acesso foi alterado. Volte à lista de diligências.
      </PortalNotice>
    );
  }
  const scopes = allowedScopes;
  const download = (id: string) =>
    action("files:read", async (current) => {
      const result = await downloadDiligenceDocument(grant.grant_id, id);
      if (current()) saveFile(result);
    });
  return (
    <div className="min-w-0 space-y-6">
      <Link className="text-sm underline" to="/portal/diligencias">
        ← Minhas diligências
      </Link>
      <div>
        <h1 className="break-words text-2xl font-semibold">
          {data.grant.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Prazo operacional: {moment(data.grant.due_at)} · Acesso até{" "}
          {moment(data.grant.expires_at)}
        </p>
      </div>
      {error && <PortalNotice error>{error}</PortalNotice>}
      {notice && <PortalNotice>{notice}</PortalNotice>}
      {scopes.has("instruction:read") && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Instruções do escritório</h2>
          <p className="whitespace-pre-wrap break-words text-sm">
            {data.instructions || "Nenhuma instrução liberada."}
          </p>
        </section>
      )}
      {scopes.has("files:read") && (
        <section className="space-y-4">
          <h2 className="font-semibold">Arquivos liberados</h2>
          {data.documents.length === 0 ? (
            <PortalNotice>
              Nenhum arquivo liberado para esta diligência.
            </PortalNotice>
          ) : (
            data.documents.map((doc) => (
              <div
                key={doc.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">
                    {doc.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(doc.size_bytes / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void download(doc.id)}
                >
                  Baixar arquivo
                </Button>
              </div>
            ))
          )}
        </section>
      )}
      {scopes.has("delivery:upload") && (
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Entregar comprovante</h2>
          <p className="text-sm text-muted-foreground">
            Até 5 arquivos de 10 MB cada: PDF, PNG, JPEG, TXT ou CSV. A entrega
            ficará aguardando conferência do escritório.
          </p>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!file) return;
              void action("delivery:upload", async (current) => {
                if (file.size < 1 || file.size > 10 * 1024 * 1024) {
                  throw new Error("Selecione um arquivo de até 10 MB.");
                }
                await uploadDiligenceDocument(
                  grant.grant_id,
                  file,
                  description,
                  uploadKey.current,
                  grant.category === "restricted" ? category : undefined,
                );
                if (!current()) return;
                setFile(null);
                setDescription("");
                if (fileInput.current) fileInput.current.value = "";
                uploadKey.current = crypto.randomUUID();
                setNotice(
                  "Comprovante recebido para conferência. A diligência continua sob revisão do escritório.",
                );
                await detail.refetch();
              });
            }}
          >
            <PortalField label="Arquivo">
              <Input
                ref={fileInput}
                aria-label="Arquivo da diligência"
                type="file"
                accept="application/pdf,image/png,image/jpeg,text/plain,text/csv"
                required
                disabled={busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  uploadKey.current = crypto.randomUUID();
                }}
              />
            </PortalField>
            {grant.category === "restricted" && (
              <PortalField
                label="Tipo do comprovante"
                hint="O arquivo permanece restrito à diligência e à conferência do escritório."
              >
                <select
                  className="w-full rounded-md border bg-card p-2 text-sm"
                  aria-label="Tipo do comprovante"
                  disabled={busy}
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value as "medical" | "fiscal");
                    uploadKey.current = crypto.randomUUID();
                  }}
                >
                  <option value="medical">Médico</option>
                  <option value="fiscal">Fiscal</option>
                </select>
              </PortalField>
            )}
            <PortalField label="Descrição do comprovante">
              <Textarea
                aria-label="Descrição do comprovante"
                required
                maxLength={4000}
                disabled={busy}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  uploadKey.current = crypto.randomUUID();
                }}
              />
            </PortalField>
            <Button disabled={busy || !file || !description.trim()}>
              {busy ? "Aguarde…" : "Entregar comprovante"}
            </Button>
          </form>
        </section>
      )}
      <section className="space-y-4">
        <h2 className="font-semibold">Minhas entregas</h2>
        {data.deliveries.length === 0 ? (
          <PortalNotice>Nenhuma entrega registrada.</PortalNotice>
        ) : (
          data.deliveries.map((item) => (
            <article className="space-y-2 rounded-xl border p-4" key={item.id}>
              <h3 className="break-words text-sm font-medium">
                {item.file_name}
              </h3>
              <p className="text-sm">
                {stateLabels[item.state] ?? "Em conferência"}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {item.description}
              </p>
              {item.review_note && (
                <p className="whitespace-pre-wrap break-words text-sm">
                  Conferência: {item.review_note}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {moment(item.created_at)}
              </p>
              {scopes.has("files:read") &&
                ["submitted", "reviewed", "returned"].includes(item.state) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void download(item.document_id)}
                  >
                    Baixar comprovante
                  </Button>
                )}
            </article>
          ))
        )}
      </section>
      {scopes.has("message:write") && (
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Observações para o escritório</h2>
          {data.messages.map((item) => (
            <article className="space-y-1 border-b pb-3" key={item.id}>
              <p className="whitespace-pre-wrap break-words text-sm">
                {item.body}
              </p>
              <p className="text-xs text-muted-foreground">
                {moment(item.created_at)}
              </p>
            </article>
          ))}
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void action("message:write", async (current) => {
                await diligenceAccess({
                  action: "reply",
                  grant_id: grant.grant_id,
                  body: message,
                  idempotency_key: messageKey.current,
                });
                if (!current()) return;
                setMessage("");
                messageKey.current = crypto.randomUUID();
                setNotice("Observação registrada nesta diligência.");
                await detail.refetch();
              });
            }}
          >
            <PortalField label="Nova observação">
              <Textarea
                aria-label="Nova observação"
                value={message}
                maxLength={6000}
                required
                disabled={busy}
                onChange={(e) => {
                  setMessage(e.target.value);
                  messageKey.current = crypto.randomUUID();
                }}
              />
            </PortalField>
            <Button disabled={busy || !message.trim()}>
              Registrar observação
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
