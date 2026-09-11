import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePortalAuth } from "./auth-context";
import { portalAccess } from "./api";
import { PortalCaseView } from "./PortalCaseView";
import { portalRequestScope } from "./request-scope";
import { PortalField, PortalNotice } from "./ui";
import { portalMembershipFingerprint, type PortalContext } from "./types";
import type { PortalEntry } from "./entry";

function PortalLogin() {
  const auth = usePortalAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codeLogin, setCodeLogin] = useState(false);
  if (codeLogin) return <PortalCodeLogin onBack={() => setCodeLogin(false)} />;
  return (
    <section className="mx-auto max-w-md space-y-6 rounded-xl border bg-card p-6">
      <div>
        <h1 className="text-xl font-semibold">Acesse seu atendimento</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Entre com o acesso individual liberado pelo escritório.
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await auth.signIn(email, password);
            setPassword("");
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <PortalField label="E-mail">
          <Input
            aria-label="E-mail"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
          />
        </PortalField>
        <PortalField label="Senha">
          <Input
            aria-label="Senha"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </PortalField>
        {(error || auth.error) && (
          <PortalNotice error>{error || auth.error}</PortalNotice>
        )}
        <Button className="w-full" disabled={busy || auth.loading}>
          {busy ? "Entrando…" : "Entrar no portal"}
        </Button>
      </form>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => setCodeLogin(true)}
      >
        Primeiro acesso ou esqueci minha senha
      </Button>
      <p className="text-xs text-muted-foreground">
        O código é enviado somente para a conta individual que o escritório
        cadastrou. Se o contato estiver incorreto, solicite a revisão ao
        escritório.
      </p>
      <a className="block text-sm underline" href="/login">
        Acesso da equipe do escritório
      </a>
    </section>
  );
}
function PortalCodeLogin({ onBack }: { onBack(): void }) {
  const auth = usePortalAuth();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="mx-auto max-w-md space-y-5 rounded-xl border bg-card p-6">
      <div>
        <h2 className="text-xl font-semibold">Confirmar acesso por e-mail</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O código será enviado exclusivamente ao seu e-mail. O escritório não
          recebe seu código nem sua senha.
        </p>
      </div>
      {!sentTo ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await auth.requestCode(email);
              setSentTo(email.trim());
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <PortalField label="E-mail individual autorizado">
            <Input
              aria-label="E-mail individual autorizado"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </PortalField>
          {error && <PortalNotice error>{error}</PortalNotice>}
          <Button disabled={busy}>
            {busy ? "Solicitando…" : "Solicitar código por e-mail"}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await auth.confirmCode(sentTo, code, password);
              setCode("");
              setPassword("");
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p role="status" className="break-words text-sm">
            Solicitação registrada para {sentTo}. Confira a caixa de entrada e o
            spam. A solicitação não confirma a entrega.
          </p>
          <PortalField label="Código recebido por e-mail">
            <Input
              aria-label="Código recebido por e-mail"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </PortalField>
          <PortalField
            label="Senha para os próximos acessos"
            hint="Use pelo menos 12 caracteres. A senha será salva após a confirmação do código."
          >
            <Input
              aria-label="Senha para os próximos acessos"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </PortalField>
          {error && <PortalNotice error>{error}</PortalNotice>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy}>
              {busy ? "Confirmando…" : "Confirmar código e salvar senha"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setSentTo("");
                setCode("");
                setPassword("");
              }}
            >
              Conferir e-mail ou solicitar novamente
            </Button>
          </div>
        </form>
      )}
      <Button type="button" variant="ghost" disabled={busy} onClick={onBack}>
        Voltar ao acesso com senha
      </Button>
    </section>
  );
}
function PortalActivation({ entry }: { entry: PortalEntry }) {
  const auth = usePortalAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!entry.activation || entry.invalidActivation)
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-xl font-semibold">Convite indisponível</h1>
        <PortalNotice>
          Reabra o link completo fornecido pelo escritório. Convites antigos com
          credenciais de acesso não são aceitos. Se o acesso já foi ativado,
          entre com sua senha.
        </PortalNotice>
        <Button asChild>
          <Link to="/portal">Entrar no portal</Link>
        </Button>
      </div>
    );
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Aceite seu atendimento</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Entre com sua conta individual ou confirme um código enviado ao seu
          próprio e-mail antes de aceitar este convite.
        </p>
      </div>
      {auth.loading ? (
        <PortalNotice>Confirmando sessão…</PortalNotice>
      ) : !auth.session ? (
        <PortalLogin />
      ) : (
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <p className="break-all text-sm">
            Conta conectada:{" "}
            {auth.session.user.email ?? "Conta individual do portal"}
          </p>
          <p className="text-sm text-muted-foreground">
            Confirme somente se você é o destinatário deste convite. O
            escritório revisou as permissões específicas deste atendimento.
          </p>
          {error && <PortalNotice error>{error}</PortalNotice>}
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await auth.activate(entry.activation!);
                entry.activation = null;
                navigate("/portal", { replace: true });
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Confirmando…" : "Aceitar acesso deste atendimento"}
          </Button>
        </section>
      )}
    </div>
  );
}
function PortalWorkspace() {
  const auth = usePortalAuth();
  const cache = useQueryClient();
  const { membershipId } = useParams();
  const prior = useRef<string | null>(null);
  const context = useQuery({
    queryKey: ["portal", auth.session?.user.id, "context"],
    queryFn: ({ signal }) =>
      portalAccess<PortalContext>({ action: "context" }, signal),
    enabled: Boolean(auth.session),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const fingerprint = context.data
    ? portalMembershipFingerprint(context.data.memberships)
    : null;
  useEffect(() => {
    if (
      (prior.current !== null && prior.current !== fingerprint) ||
      context.isError
    ) {
      portalRequestScope.invalidate();
      void cache.cancelQueries({
        predicate: (q) =>
          q.queryKey[0] === "portal" && q.queryKey[2] !== "context",
      });
      cache.removeQueries({
        predicate: (q) =>
          q.queryKey[0] === "portal" && q.queryKey[2] !== "context",
      });
    }
    prior.current = fingerprint;
  }, [fingerprint, context.isError, cache]);
  if (auth.loading) return <PortalNotice>Confirmando sua sessão…</PortalNotice>;
  if (!auth.session) return <PortalLogin />;
  if (context.isPending)
    return <PortalNotice>Consultando seus acessos…</PortalNotice>;
  if (context.isError)
    return (
      <div className="space-y-4">
        <PortalNotice error>{context.error.message}</PortalNotice>
        <Button variant="outline" onClick={() => void context.refetch()}>
          Consultar novamente
        </Button>
      </div>
    );
  if (
    context.data.identity_id !== auth.session.user.id ||
    context.data.status !== "active"
  )
    return (
      <PortalNotice>
        Seu acesso ainda não está ativo. Entre em contato com o escritório.
      </PortalNotice>
    );
  const members = context.data.memberships.filter(
    (m) => Date.parse(m.expires_at) > Date.now(),
  );
  const selected = members.find((m) => m.id === membershipId);
  if (membershipId)
    return selected ? (
      <PortalCaseView
        key={`${selected.id}:${fingerprint}`}
        membership={selected}
        identityId={context.data.identity_id}
      />
    ) : (
      <div className="space-y-4">
        <PortalNotice>
          Este atendimento não está disponível no seu acesso atual.
        </PortalNotice>
        <Button asChild variant="outline">
          <Link to="/portal">Voltar aos meus atendimentos</Link>
        </Button>
      </div>
    );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Meus atendimentos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Acompanhe as informações que o escritório disponibilizou para você.
        </p>
      </div>
      {members.length === 0 ? (
        <PortalNotice>
          Nenhum atendimento está disponível neste momento.
        </PortalNotice>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {members.map((member) => (
            <Link
              key={member.id}
              to={`/portal/caso/${member.id}`}
              className="min-w-0 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <h2 className="break-words font-semibold">
                {member.public_title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {member.access_kind === "accountant"
                  ? "Documentos fiscais autorizados"
                  : member.access_kind === "representative"
                    ? "Acesso como representante"
                    : "Acesso individual"}
              </p>
              <p className="mt-4 text-sm text-primary">Abrir atendimento →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
function PortalLayout({ entry }: { entry: PortalEntry }) {
  const auth = usePortalAuth();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <Link
            to="/portal"
            className="flex min-w-0 items-center gap-2 font-semibold"
          >
            <Scale className="h-6 w-6 shrink-0 text-primary" />
            <span>Portal do cliente</span>
          </Link>
          {auth.session && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void auth.signOut()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        <Routes>
          <Route
            path="/portal/ativar"
            element={<PortalActivation entry={entry} />}
          />
          <Route path="/portal" element={<PortalWorkspace />} />
          <Route
            path="/portal/caso/:membershipId"
            element={<PortalWorkspace />}
          />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-6 text-xs text-muted-foreground">
        Informações liberadas pelo escritório. Horários de Brasília. Em caso de
        urgência, utilize o canal de contato combinado com seu advogado.
      </footer>
    </div>
  );
}
export function PortalApp({ entry }: { entry: PortalEntry }) {
  return (
    <BrowserRouter>
      <PortalLayout entry={entry} />
    </BrowserRouter>
  );
}
