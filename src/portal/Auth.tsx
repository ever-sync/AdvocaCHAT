import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { acceptPortalInvite } from "./api";
import {
  getPortalClient,
  isPortalSessionClosed,
  markPortalSessionClosed,
  PORTAL_CLOSED_KEY,
} from "./client";
import { portalRequestScope } from "./request-scope";
import type { PortalActivation } from "./entry";
import { PortalAuthContext } from "./auth-context";

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const operation = useRef(0);
  const confirmingCode = useRef(false);
  const identity = useRef<string | null>(null);
  const clearData = useCallback(() => {
    portalRequestScope.invalidate();
    void cache.cancelQueries();
    cache.clear();
  }, [cache]);
  const closeView = useCallback(() => {
    sequence.current++;
    identity.current = null;
    clearData();
    setSession(null);
    setLoading(false);
  }, [clearData]);

  useEffect(() => {
    let active = true;
    let auth: ReturnType<typeof getPortalClient>["auth"];
    try {
      auth = getPortalClient().auth;
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
      return;
    }
    const hydrate = async (next: Session | null) => {
      if (confirmingCode.current && next) return;
      const run = ++sequence.current;
      if (
        !active ||
        isPortalSessionClosed() ||
        !next ||
        next.user.role !== "legal_portal"
      ) {
        if (active) closeView();
        return;
      }
      if (identity.current !== next.user.id) {
        clearData();
        setSession(null);
        setLoading(true);
      }
      try {
        const { data, error: verificationError } = await auth.getUser(
          next.access_token,
        );
        if (!active || run !== sequence.current || isPortalSessionClosed())
          return;
        if (
          verificationError ||
          !data.user ||
          data.user.role !== "legal_portal"
        ) {
          closeView();
          setError("Sua sessão não foi confirmada. Entre novamente no portal.");
          return;
        }
        identity.current = data.user.id;
        setSession({ ...next, user: data.user });
        setError("");
        setLoading(false);
      } catch {
        if (active && run === sequence.current) {
          closeView();
          setError(
            "Não foi possível confirmar sua sessão. Tente entrar novamente.",
          );
        }
      }
    };
    const subscription = auth.onAuthStateChange((_event, next) => {
      void hydrate(next);
    }).data.subscription;
    void auth.getSession().then(({ data }) => hydrate(data.session));
    const storage = (event: StorageEvent) => {
      if (event.key === PORTAL_CLOSED_KEY && event.newValue === "1") {
        auth.stopAutoRefresh();
        closeView();
      }
    };
    window.addEventListener("storage", storage);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("storage", storage);
    };
  }, [clearData, closeView]);

  const signOut = useCallback(async () => {
    operation.current++;
    markPortalSessionClosed(true);
    closeView();
    setError("");
    const auth = getPortalClient().auth;
    auth.stopAutoRefresh();
    try {
      await auth.signOut({ scope: "local" });
    } finally {
      markPortalSessionClosed(true);
      closeView();
    }
  }, [closeView]);
  const signIn = useCallback(
    async (email: string, password: string) => {
      const run = ++operation.current;
      const stillCurrent = () => {
        if (operation.current !== run || isPortalSessionClosed()) {
          if (isPortalSessionClosed()) markPortalSessionClosed(true);
          throw new Error(
            "A sessão foi encerrada. Entre novamente para continuar.",
          );
        }
      };
      clearData();
      setError("");
      markPortalSessionClosed(false);
      const auth = getPortalClient().auth;
      const { data, error: loginError } = await auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      stillCurrent();
      if (loginError || !data.session)
        throw new Error(
          "Não foi possível entrar. Confira o e-mail e a senha do portal.",
        );
      const verified = await auth.getUser(data.session.access_token);
      stillCurrent();
      if (verified.error || verified.data.user?.role !== "legal_portal") {
        await signOut();
        throw new Error(
          "Esta conta não possui acesso externo. Para entrar como equipe, use o acesso do escritório.",
        );
      }
      auth.startAutoRefresh();
      identity.current = verified.data.user.id;
      setSession({ ...data.session, user: verified.data.user });
      setLoading(false);
    },
    [clearData, signOut],
  );
  const requestCode = useCallback(async (email: string) => {
    const result = await getPortalClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/portal` },
    });
    if (result.error)
      throw new Error(
        "Não foi possível solicitar o código. Confira o contato informado ao escritório e tente novamente.",
      );
  }, []);
  const confirmCode = useCallback(
    async (email: string, code: string, password: string) => {
      if (!/^[0-9]{6,10}$/.test(code.trim()) || password.length < 12)
        throw new Error(
          "Informe o código recebido e uma senha com pelo menos 12 caracteres.",
        );
      const run = ++operation.current;
      const stillCurrent = () => {
        if (operation.current !== run || isPortalSessionClosed()) {
          if (isPortalSessionClosed()) markPortalSessionClosed(true);
          throw new Error(
            "A sessão foi encerrada. Entre novamente para continuar.",
          );
        }
      };
      clearData();
      setError("");
      markPortalSessionClosed(false);
      const auth = getPortalClient().auth;
      confirmingCode.current = true;
      try {
        const verified = await auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: "email",
        });
        stillCurrent();
        if (
          verified.error ||
          !verified.data.session ||
          verified.data.user?.role !== "legal_portal"
        ) {
          await signOut();
          throw new Error(
            "O código não foi aceito. Confira o e-mail, o código e a validade antes de tentar novamente.",
          );
        }
        const current = await auth.getUser(verified.data.session.access_token);
        stillCurrent();
        if (current.error || current.data.user?.role !== "legal_portal") {
          await signOut();
          throw new Error("Não foi possível confirmar sua conta do portal.");
        }
        const saved = await auth.updateUser({ password });
        stillCurrent();
        if (saved.error)
          throw new Error(
            "O acesso foi confirmado, mas não foi possível salvar a senha. Solicite outro código para redefini-la.",
          );
        identity.current = current.data.user.id;
        setSession({ ...verified.data.session, user: current.data.user });
        setLoading(false);
        auth.startAutoRefresh();
      } finally {
        confirmingCode.current = false;
      }
    },
    [clearData, signOut],
  );
  const activate = useCallback(
    async (invite: PortalActivation) => {
      const run = ++operation.current;
      const stillCurrent = () => {
        if (operation.current !== run || isPortalSessionClosed())
          throw new Error(
            "Sua sessão foi encerrada. Entre novamente para aceitar o convite.",
          );
      };
      const current = await getPortalClient().auth.getUser();
      stillCurrent();
      if (current.error || current.data.user?.role !== "legal_portal")
        throw new Error(
          "Entre com sua conta do portal antes de aceitar este acesso.",
        );
      await acceptPortalInvite(invite.invite);
      stillCurrent();
      clearData();
    },
    [clearData],
  );
  const value = useMemo(
    () => ({
      session,
      loading,
      error,
      signIn,
      activate,
      signOut,
      requestCode,
      confirmCode,
    }),
    [
      session,
      loading,
      error,
      signIn,
      activate,
      signOut,
      requestCode,
      confirmCode,
    ],
  );
  return (
    <PortalAuthContext.Provider value={value}>
      {children}
    </PortalAuthContext.Provider>
  );
}
