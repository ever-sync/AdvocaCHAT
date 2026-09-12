import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { E2E_MOCK_PROFILE_ID, getE2eMockRole, isE2eMockAuth } from "@/lib/e2e";
import { invokeAuthedFunction } from "@/lib/api/functions";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { recordAuditEventSafe } from "@/lib/api/audit-logs";
import { useAppStore } from "@/store/useAppStore";
import { internalProfileFromRow, isPortalAuthUser } from "./internal-profile";
import type { AppUserProfile, AuthCredentials, SignUpPayload, UserRole } from "@/types/domain";

async function fetchProfileFromDb(userId: string): Promise<Partial<AppUserProfile> | null> {
  if (!supabase) return null;
  const sb = supabase;

  const runSelect = (columns: string) =>
    sb.from("profiles").select(columns).eq("id", userId).maybeSingle();

  // `availability` pode não existir se a migration ainda não foi aplicada.
  // Sem o fallback, uma coluna ausente derruba toda a query e o `role` não carrega.
  let { data, error } = await runSelect("nome, email, empresa, plano, role, status, availability");
  if (error) {
    ({ data, error } = await runSelect("nome, email, empresa, plano, role, status"));
  }
  if (error || !data) return null;

  const row = data as unknown as Record<string, unknown>;
  const out: Partial<AppUserProfile> = {};
  if (typeof row.nome === "string" && row.nome) out.nome = row.nome;
  if (typeof row.email === "string" && row.email) out.email = row.email;
  if (typeof row.empresa === "string" && row.empresa) out.empresa = row.empresa;
  if (typeof row.plano === "string" && row.plano) out.plano = row.plano as AppUserProfile["plano"];
  if (typeof row.role === "string" && row.role) out.role = row.role as UserRole;
  if (typeof row.status === "string" && row.status) out.status = row.status as AppUserProfile["status"];
  if (typeof row.availability === "string" && row.availability)
    out.availability = row.availability as AppUserProfile["availability"];
  return out;
}

type AuthContextValue = {
  profile: AppUserProfile | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSupabaseConfigured: boolean;
  signIn: (
    credentials: AuthCredentials,
  ) => Promise<{ error: string | null; mfaRequired?: boolean; factorId?: string }>;
  verifyMfa: (factorId: string, code: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signUp: (payload: SignUpPayload) => Promise<{ error: string | null; requiresEmailConfirmation: boolean }>;
  resendSignUpConfirmation: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function resolveValidSession(nextSession: Session | null) {
  if (!supabase || !nextSession?.access_token || isPortalAuthUser(nextSession.user)) {
    return null;
  }

  // Timeout defensivo: se o backend (Supabase self-hosted) estiver fora/lento, o
  // getUser pendura indefinidamente e o app trava em "Carregando sessão...". Em vez
  // de pendurar, após o timeout confiamos na sessão guardada (best-effort) para
  // desbloquear a UI — chamadas subsequentes falham normalmente se o token for inválido.
  const timeoutMs = 8000;
  try {
    const userResult = await Promise.race([
      supabase.auth.getUser(nextSession.access_token),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("auth-getUser-timeout")), timeoutMs),
      ),
    ]);
    if (userResult.error || !userResult.data.user || isPortalAuthUser(userResult.data.user)) {
      return null;
    }
    return { ...nextSession, user: userResult.data.user };
  } catch {
    // Timeout ou erro de rede: não derruba o login eterno; segue com a sessão local.
    return nextSession;
  }
}

/** Sessão existe mas falta o 2º fator (TOTP): aal1 com aal2 exigido. Best-effort. */
async function isMfaVerificationPending(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.currentLevel === "aal1" && data.nextLevel === "aal2";
  } catch {
    return false;
  }
}

async function getVerifiedTotpFactorId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error || !data) return null;
    const totp = (data.totp ?? []).find((f) => f.status === "verified") ?? data.totp?.[0];
    return totp?.id ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);
  const authHydrationInFlightRef = useRef<Promise<void> | null>(null);
  const pendingSessionRef = useRef<Session | null>(null);
  const welcomeEmailForUserRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isE2eMockAuth) {
      const mockRole = getE2eMockRole();
      setProfile({
        id: E2E_MOCK_PROFILE_ID,
        nome: "E2E User",
        email: "e2e@wchat.test",
        empresa: "E2E Tenant",
        plano: "starter",
        role: mockRole,
        status: "active",
      });
      setSession(null);
      setIsLoading(false);
      welcomeEmailForUserRef.current = null;
      return undefined;
    }

    if (supabase) {
      // Captura a referência já estreitada: o TS perde o narrowing de `supabase`
      // dentro dos closures async abaixo (hydrateProfile), então usamos `sb`.
      const sb = supabase;
      let isMounted = true;
      let hydrationSequence = 0;
      let profileChannel: ReturnType<typeof sb.channel> | null = null;

      const applyDbProfile = (dbProfile: Partial<AppUserProfile>, userId: string) => {
        if (!isMounted) return;
        setProfile((prev) => (prev?.id === userId ? { ...prev, ...dbProfile } : prev));
      };

      const hydrateProfile = async (
        user: User | null,
        sequence: number,
        prefetchedProfile?: Partial<AppUserProfile> | null,
      ) => {
        if (profileChannel) {
          await sb.removeChannel(profileChannel).catch(() => undefined);
          profileChannel = null;
        }
        if (sequence !== hydrationSequence || !isMounted) return;
        if (!user || isPortalAuthUser(user)) {
          setProfile(null);
          return;
        }
        // Preserve only an already verified row for the same identity while it refreshes.
        setProfile(prev => prev?.id === user.id ? prev : null);
        const dbProfile = prefetchedProfile === undefined
          ? await fetchProfileFromDb(user.id)
          : prefetchedProfile;
        if (!isMounted || sequence !== hydrationSequence) return;
        const resolved = internalProfileFromRow(user, dbProfile);
        setProfile(resolved);
        if (!resolved) return;

        profileChannel = sb
          .channel(`profile:${user.id}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
            (payload) => {
              const next = payload.new as Record<string, unknown>;
              const update: Partial<AppUserProfile> = {};
              if (typeof next.nome === "string" && next.nome) update.nome = next.nome;
              if (typeof next.email === "string" && next.email) update.email = next.email;
              if (typeof next.empresa === "string" && next.empresa) update.empresa = next.empresa;
              if (typeof next.plano === "string" && next.plano) update.plano = next.plano as AppUserProfile["plano"];
              if (typeof next.role === "string" && next.role) update.role = next.role as UserRole;
              if (typeof next.status === "string" && next.status) update.status = next.status as AppUserProfile["status"];
              if (typeof next.availability === "string" && next.availability)
                update.availability = next.availability as AppUserProfile["availability"];
              applyDbProfile(update, user.id);
            },
          )
          .subscribe();
      };

      const hydrateAuthState = async (nextSession: Session | null) => {
        hydrationSequence++;
        pendingSessionRef.current = nextSession;
        if (!nextSession || isPortalAuthUser(nextSession.user)) {
          pendingSessionRef.current = null;
          setSession(null); setProfile(null); setMfaPending(false); setIsLoading(false);
          if (profileChannel) { void sb.removeChannel(profileChannel).catch(() => undefined); profileChannel = null; }
          return;
        }
        if (authHydrationInFlightRef.current) {
          return authHydrationInFlightRef.current;
        }

        authHydrationInFlightRef.current = (async () => {
          while (pendingSessionRef.current) {
            const sequence = hydrationSequence;
            const sessionToHydrate = pendingSessionRef.current;
            pendingSessionRef.current = null;

            // As três verificações são independentes e usam a mesma sessão. Rodá-las
            // juntas elimina duas esperas de rede no caminho crítico de abertura.
            const [validSession, prefetchedProfile, pending] = await Promise.all([
              resolveValidSession(sessionToHydrate),
              fetchProfileFromDb(sessionToHydrate.user.id),
              isMfaVerificationPending(),
            ]);
            if (!isMountedRef.current || !isMounted) {
              break;
            }

            if (sequence !== hydrationSequence) continue;
            setSession(validSession);
            await hydrateProfile(validSession?.user ?? null, sequence, prefetchedProfile);
            if (sequence !== hydrationSequence) continue;
            if (isMountedRef.current && isMounted && sequence === hydrationSequence) {
              setMfaPending(Boolean(validSession) && pending);
            }
          }

          if (isMountedRef.current && isMounted) {
            setIsLoading(false);
          }
        })().finally(() => {
          authHydrationInFlightRef.current = null;
        });

        return authHydrationInFlightRef.current;
      };

      void supabase.auth.getSession().then(async ({ data }) => {
        if (!isMounted) {
          return;
        }
        await hydrateAuthState(data.session);
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        void hydrateAuthState(nextSession);
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
        if (profileChannel && supabase) {
          void supabase.removeChannel(profileChannel).catch(() => undefined);
          profileChannel = null;
        }
      };
    }

    setIsLoading(false);
    return undefined;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      profile,
      session,
      isAuthenticated: Boolean(profile) && !mfaPending,
      isLoading,
      isSupabaseConfigured,
      signIn: async ({ email, password }) => {
        if (!supabase) {
          return {
            error:
              "Supabase não configurado. Preencha as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
          };
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          return { error: error.message };
        }

        const {
          data: { session: nextSession },
        } = await supabase.auth.getSession();
        if (isPortalAuthUser(nextSession?.user)) {
          await supabase.auth.signOut({ scope: "local" });
          setSession(null); setProfile(null);
          return { error: "Esta conta acessa o portal do cliente. Entre pela página /portal." };
        }
        const validSession = await resolveValidSession(nextSession);

        if (!validSession) {
          return {
            error:
              "A sessao foi criada, mas nao ficou valida neste navegador. Tente entrar novamente.",
          };
        }

        const actualProfile = internalProfileFromRow(validSession.user, await fetchProfileFromDb(validSession.user.id));
        if (!actualProfile) {
          await supabase.auth.signOut({ scope: "local" });
          setSession(null); setProfile(null);
          return { error: "Não foi encontrado um perfil interno autorizado para esta conta. Se você é cliente, use /portal." };
        }

        // 2FA: se a conta tem TOTP, a sessão fica em aal1 até verificar o código.
        if (await isMfaVerificationPending()) {
          setMfaPending(true);
          const factorId = await getVerifiedTotpFactorId();
          return { error: null, mfaRequired: true, factorId: factorId ?? undefined };
        }

        setMfaPending(false);
        recordAuditEventSafe({ action: "login", entityType: "session", summary: "Login no painel" });

        return { error: null };
      },
      verifyMfa: async (factorId, code) => {
        if (!supabase) {
          return { error: "Supabase não configurado." };
        }
        try {
          const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
          if (error) {
            return { error: error.message };
          }
          setMfaPending(false);
          recordAuditEventSafe({
            action: "login",
            entityType: "session",
            summary: "Login no painel (2FA)",
          });
          return { error: null };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Falha ao verificar o código." };
        }
      },
      signInWithGoogle: async () => {
        if (!supabase) {
          return { error: "Supabase não configurado." };
        }
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/inbox` },
        });
        return { error: error?.message ?? null };
      },
      signUp: async ({ nome, email, telefone, empresa, cnpj, password, plano }) => {
        if (!supabase) {
          return {
            error:
              "Supabase não configurado. Preencha as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
            requiresEmailConfirmation: false,
          };
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login?cadastro=confirmado`,
            data: {
              nome,
              telefone,
              empresa,
              cnpj,
              plano: plano ?? "profissional",
            },
          },
        });

        return {
          error: error?.message ?? null,
          requiresEmailConfirmation: !data.session,
        };
      },
      resendSignUpConfirmation: async (email) => {
        if (!supabase) {
          return { error: "Supabase não configurado." };
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
          return { error: "Informe o e-mail usado no cadastro." };
        }
        const { error } = await supabase.auth.resend({
          type: "signup",
          email: normalizedEmail,
          options: {
            emailRedirectTo: `${window.location.origin}/login?cadastro=confirmado`,
          },
        });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        if (supabase) {
          await supabase.auth.signOut();
        }

        useAppStore.getState().clearNotifications();
        setSession(null);
        setProfile(null);
        setMfaPending(false);
        welcomeEmailForUserRef.current = null;
      },
    }),
    [isLoading, profile, session, mfaPending],
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !session?.access_token || !profile?.id || isLoading || mfaPending) {
      return;
    }

    if (welcomeEmailForUserRef.current === profile.id) {
      return;
    }

    welcomeEmailForUserRef.current = profile.id;
    void invokeAuthedFunction<{ ok: boolean; sent: number; failed: number; skipped: number }>(
      "marketing-email-dispatch",
    ).catch((error) => {
      console.warn("marketing-email-dispatch (boas-vindas) falhou:", error);
      welcomeEmailForUserRef.current = null;
    });
  }, [isLoading, mfaPending, profile?.id, session?.access_token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
