import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import { resolveAuthRedirectSession } from "@/lib/auth-redirect";
import { requireSupabase } from "@/lib/supabase";

export default function RedefinirSenha() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const session = await resolveAuthRedirectSession();

        if (cancelled) {
          return;
        }

        setSessionReady(Boolean(session?.user));
        setEmail(session?.user?.email ?? "");
      } catch {
        if (!cancelled) {
          setSessionReady(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (senha.length < 6) {
      const d = "Use pelo menos 6 caracteres.";
      toast({ title: "Senha muito curta", description: d, variant: "destructive" });
      useAppStore.getState().addNotification({ tipo: "aviso", titulo: "Senha muito curta", descricao: d });
      return;
    }

    if (senha !== confirmarSenha) {
      const d = "Confirme a mesma senha nos dois campos.";
      toast({ title: "Senhas diferentes", description: d, variant: "destructive" });
      useAppStore.getState().addNotification({ tipo: "aviso", titulo: "Senhas diferentes", descricao: d });
      return;
    }

    setSaving(true);

    try {
      const supabase = requireSupabase();
      const { error } = await supabase.auth.updateUser({ password: senha });

      if (error) {
        throw error;
      }

      const okDesc = "Sua senha foi atualizada com sucesso.";
      toast({ title: "Senha redefinida", description: okDesc });
      useAppStore.getState().addNotification({ tipo: "sucesso", titulo: "Senha redefinida", descricao: okDesc });

      navigate("/inbox", { replace: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Tente novamente.";
      toast({ title: "Nao foi possivel redefinir a senha", description: msg, variant: "destructive" });
      useAppStore.getState().addNotification({
        tipo: "erro",
        titulo: "Nao foi possivel redefinir a senha",
        descricao: msg,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="flex shrink-0 items-center justify-between px-6 py-4 sm:px-8 lg:px-10 xl:px-12">
            <Link to="/" className="inline-block">
              <span className="text-2xl font-semibold tracking-tight">AdvocaCHAT</span>
            </Link>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-y-contain px-4 py-3 sm:px-6 lg:px-10 lg:py-2 xl:px-12">
              <div className="my-auto w-full max-w-[400px] shrink-0 rounded-xl bg-card px-5 py-5 border border-border shadow-[0_1px_8px_hsl(var(--wchat-brand-600)/0.1),0_4px_24px_hsl(var(--wchat-brand-600)/0.06)] sm:px-7 sm:py-6 lg:px-8 lg:py-7">
                <h1 className="text-2xl font-bold text-wchat-900 sm:text-[28px]">Redefinir senha</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Escolha uma nova senha para voltar ao painel.
        </p>

        {loading ? (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Validando seu link...
          </div>
        ) : !sessionReady ? (
          <div className="mt-5 space-y-4 rounded-md border border-border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              Este link não criou uma sessão válida. Solicite uma nova recuperação e tente de novo.
            </p>
            <Link
              to="/recuperar-senha"
              className="block h-11 w-full rounded-md bg-primary text-center text-sm font-semibold leading-[44px] text-primary-foreground transition-colors hover:bg-wchat-700"
            >
              Solicitar novo link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-foreground">
                Email
              </label>
              <input
                value={email}
                disabled
                className="h-10 w-full rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground outline-none cursor-not-allowed sm:h-11"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-foreground">
                Nova senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={senha}
                  onChange={(event) => setSenha(event.target.value)}
                  placeholder="Crie uma nova senha"
                  className="h-10 w-full rounded-md border border-input bg-wchat-50 px-3 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary sm:h-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-foreground">
                Confirmar senha
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmarSenha}
                onChange={(event) => setConfirmarSenha(event.target.value)}
                placeholder="Repita a nova senha"
                className="h-10 w-full rounded-md border border-input bg-wchat-50 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary sm:h-11"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-wchat-700 disabled:opacity-60 sm:h-12 sm:text-[15px]"
            >
              {saving ? "Salvando..." : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
            </div>

            <footer className="flex shrink-0 items-center justify-between px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-xs sm:px-6 lg:px-10 xl:px-12">
              <a href="#" className="text-muted-foreground hover:text-foreground">
                Política de privacidade
              </a>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Português
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
