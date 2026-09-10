import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invokePublicFunction } from "@/lib/api/functions";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";

export default function RecuperarSenha() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      await invokePublicFunction<{ ok: boolean; sent?: boolean; skipped?: boolean }>(
        "password-recovery-request",
        { email: email.trim() },
      );

      const okDesc = "Se o e-mail existir, enviamos um link para redefinir sua senha.";
      toast({ title: "Link enviado", description: okDesc });
      useAppStore.getState().addNotification({ tipo: "info", titulo: "Link enviado", descricao: okDesc });
      setEmail("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Tente novamente.";
      toast({ title: "Nao foi possivel enviar o link", description: msg, variant: "destructive" });
      useAppStore.getState().addNotification({
        tipo: "erro",
        titulo: "Nao foi possivel enviar o link",
        descricao: msg,
      });
    } finally {
      setLoading(false);
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
                <h1 className="text-2xl font-bold text-wchat-900 sm:text-[28px]">Recuperar senha</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Digite seu e-mail para receber o link de redefinição.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[13px] font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu@empresa.com"
              className="h-10 w-full rounded-md border border-input bg-wchat-50 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary sm:h-11"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-wchat-700 disabled:opacity-60 sm:h-12 sm:text-[15px] flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Enviando..." : "Enviar link"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/login" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para o login
          </Link>
        </p>
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
