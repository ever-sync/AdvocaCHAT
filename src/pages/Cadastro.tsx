import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Zap, Check, ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { clearSignUpDraft, readSignUpDraft, writeSignUpDraft } from "@/lib/signup-storage";
import { useAppStore } from "@/store/useAppStore";
import { useAuth } from "@/hooks/useAuth";
import { isValidCnpj } from "@/lib/brasil-api";

const steps = ["Conta", "Confirmacao", "7 dias gratis"];

export default function Cadastro() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signUp, signOut, isSupabaseConfigured } = useAuth();
  const [form, setForm] = useState(() => readSignUpDraft());
  const [submitting, setSubmitting] = useState(false);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const lastFetchedCnpj = useRef("");

  useEffect(() => {
    const cnpjClean = form.cnpj.replace(/\D/g, "");
    if (cnpjClean.length === 14 && lastFetchedCnpj.current !== cnpjClean) {
      lastFetchedCnpj.current = cnpjClean;

      const fetchCompanyData = async () => {
        setLoadingCompany(true);
        try {
          const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjClean}`);
          if (res.ok) {
            const data = await res.json();
            const name = data.nome_fantasia || data.razao_social || "";
            if (name) {
              update("empresa", name);
            }
          }
        } catch (err) {
          console.error("Erro ao buscar CNPJ:", err);
        } finally {
          setLoadingCompany(false);
        }
      };

      void fetchCompanyData();
    }
  }, [form.cnpj]);

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      writeSignUpDraft(next);
      return next;
    });

  const formatCNPJ = (v: string) => {
    const nums = v.replace(/\D/g, "").slice(0, 14);
    return nums.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  };

  const formatPhone = (v: string) => {
    const nums = v.replace(/\D/g, "").slice(0, 11);
    if (nums.length <= 2) return `(${nums}`;
    if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
    return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const email = form.email.trim();
    const phoneDigits = form.telefone.replace(/\D/g, "");
    const cnpjDigits = form.cnpj.replace(/\D/g, "");

    if (!form.nome.trim() || !email || !form.empresa.trim()) {
      const d = "Nome, e-mail e empresa sao obrigatorios para continuar.";
      toast({ title: "Preencha os campos obrigatorios", description: d, variant: "destructive" });
      useAppStore.getState().addNotification({
        tipo: "aviso",
        titulo: "Preencha os campos obrigatorios",
        descricao: d,
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const d = "Digite um e-mail corporativo valido.";
      toast({ title: "E-mail invalido", description: d, variant: "destructive" });
      useAppStore.getState().addNotification({ tipo: "aviso", titulo: "E-mail invalido", descricao: d });
      return;
    }

    if (phoneDigits.length < 10) {
      const d = "Informe um WhatsApp com DDD.";
      toast({ title: "Telefone incompleto", description: d, variant: "destructive" });
      useAppStore.getState().addNotification({ tipo: "aviso", titulo: "Telefone incompleto", descricao: d });
      return;
    }

    if (!isValidCnpj(form.cnpj)) {
      const d = "CNPJ inválido. Digite um documento real e com 14 números.";
      toast({ title: "CNPJ inválido", description: d, variant: "destructive" });
      useAppStore.getState().addNotification({ tipo: "aviso", titulo: "CNPJ inválido", descricao: d });
      return;
    }

    if (form.senha.length < 6) {
      const d = "Use pelo menos 6 caracteres.";
      toast({ title: "Senha muito curta", description: d, variant: "destructive" });
      useAppStore.getState().addNotification({ tipo: "aviso", titulo: "Senha muito curta", descricao: d });
      return;
    }

    if (!form.termos) {
      const d = "Voce precisa aceitar os termos para continuar.";
      toast({ title: "Aceite os termos", description: d, variant: "destructive" });
      useAppStore.getState().addNotification({ tipo: "aviso", titulo: "Aceite os termos", descricao: d });
      return;
    }

    setSubmitting(true);
    const result = await signUp({
      nome: form.nome.trim(),
      email,
      telefone: form.telefone,
      empresa: form.empresa.trim(),
      cnpj: form.cnpj,
      password: form.senha,
      plano: "sistema",
    });
    setSubmitting(false);

    if (result.error) {
      toast({ title: "Nao foi possivel criar a conta", description: result.error, variant: "destructive" });
      return;
    }

    if (!result.requiresEmailConfirmation && isSupabaseConfigured) {
      await signOut();
    }
    sessionStorage.setItem("advocachat-pending-confirmation-email", email);
    clearSignUpDraft();
    toast({
      title: "Confirme seu e-mail",
      description: "Enviamos um link de confirmacao. Depois de confirmar, seus 7 dias gratis comecam automaticamente.",
    });
    navigate("/login?cadastro=confirmar-email", { replace: true });
  };

  const isEmailInvalid = form.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const isPhoneInvalid = form.telefone.length > 0 && form.telefone.replace(/\D/g, "").length < 10;
  const isCnpjInvalid = form.cnpj.length > 0 && !isValidCnpj(form.cnpj);
  const isPasswordInvalid = form.senha.length > 0 && form.senha.length < 6;

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          {/* Header Fixo */}
          <header className="fixed top-0 left-0 right-0 z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm px-6 sm:px-8 lg:px-10 xl:px-12">
            <div className="flex w-1/4 justify-start">
              <Link to="/" className="inline-block">
                <span className="text-2xl font-semibold tracking-tight">AdvocaCHAT</span>
              </Link>
            </div>

            <div className="flex w-2/4 justify-center">
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                {steps.map((step, i) => (
                  <div key={step} className="flex items-center gap-1 sm:gap-2">
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold ${
                      i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {i < 0 ? <Check className="w-3 h-3" /> : i + 1}
                    </div>
                    <span className={`text-[10px] sm:text-xs font-medium ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}>
                      {step}
                    </span>
                    {i < steps.length - 1 && <div className="w-4 sm:w-6 h-px bg-border" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex w-1/4 justify-end">
              <div className="hidden shrink-0 items-center gap-3 lg:flex">
                <span className="text-sm text-muted-foreground">Já tem conta?</span>
                <Link
                  to="/login"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-wchat-700"
                >
                  Fazer login
                </Link>
              </div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-16">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-y-contain px-4 py-3 sm:px-6 lg:px-10 lg:py-2 xl:px-12">
              <div className="my-auto w-full max-w-[480px] shrink-0 py-6">
                <div className="w-full rounded-xl bg-card px-5 py-5 border border-border shadow-[0_1px_8px_hsl(var(--wchat-brand-600)/0.1),0_4px_24px_hsl(var(--wchat-brand-600)/0.06)] sm:px-7 sm:py-6 lg:px-8 lg:py-7">
                  <h1 className="text-2xl font-bold text-foreground mb-6 text-center">
                    Criar sua conta
                  </h1>

                  <form
                    onSubmit={handleSubmit}
                    className="space-y-4"
                  >
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-foreground block">Nome completo</label>
                      <Input
                        value={form.nome}
                        onChange={(e) => update("nome", e.target.value)}
                        placeholder="Seu nome"
                        className="h-10 sm:h-11 border-input bg-wchat-50 placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary shadow-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-foreground block">E-mail corporativo</label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                        placeholder="seu@empresa.com"
                        className={`h-10 sm:h-11 bg-wchat-50 placeholder:text-muted-foreground focus-visible:ring-1 shadow-none ${
                          isEmailInvalid
                            ? "border-destructive focus-visible:ring-destructive"
                            : "border-input focus-visible:ring-primary"
                        }`}
                      />
                      {isEmailInvalid && (
                        <p className="text-xs text-destructive mt-1">Digite um e-mail corporativo válido.</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-foreground block">Telefone (WhatsApp)</label>
                      <Input
                        value={form.telefone}
                        onChange={(e) => update("telefone", formatPhone(e.target.value))}
                        placeholder="(11) 99999-9999"
                        className={`h-10 sm:h-11 bg-wchat-50 placeholder:text-muted-foreground focus-visible:ring-1 shadow-none ${
                          isPhoneInvalid
                            ? "border-destructive focus-visible:ring-destructive"
                            : "border-input focus-visible:ring-primary"
                        }`}
                      />
                      {isPhoneInvalid && (
                        <p className="text-xs text-destructive mt-1">Informe um WhatsApp válido com DDD.</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-foreground block">CNPJ</label>
                      <Input
                        value={form.cnpj}
                        onChange={(e) => update("cnpj", formatCNPJ(e.target.value))}
                        placeholder="00.000.000/0000-00"
                        className={`h-10 sm:h-11 bg-wchat-50 placeholder:text-muted-foreground focus-visible:ring-1 shadow-none ${
                          isCnpjInvalid
                            ? "border-destructive focus-visible:ring-destructive"
                            : "border-input focus-visible:ring-primary"
                        }`}
                      />
                      {isCnpjInvalid && (
                        <p className="text-xs text-destructive mt-1">Digite um CNPJ com 14 números.</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[13px] font-medium text-foreground block">Nome da empresa</label>
                        {loadingCompany && (
                          <span className="text-xs text-primary flex items-center gap-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Buscando...
                          </span>
                        )}
                      </div>
                      <Input
                        value={form.empresa}
                        onChange={(e) => update("empresa", e.target.value)}
                        placeholder="Distribuidora XYZ"
                        disabled={loadingCompany}
                        className="h-10 sm:h-11 border-input bg-wchat-50 placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary shadow-none disabled:opacity-70"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-foreground block">Senha</label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={form.senha}
                          onChange={(e) => update("senha", e.target.value)}
                          placeholder="••••••••"
                          className={`h-10 sm:h-11 pr-10 bg-wchat-50 placeholder:text-muted-foreground focus-visible:ring-1 shadow-none w-full ${
                            isPasswordInvalid
                              ? "border-destructive focus-visible:ring-destructive"
                              : "border-input focus-visible:ring-primary"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {isPasswordInvalid && (
                        <p className="text-xs text-destructive mt-1">Use pelo menos 6 caracteres.</p>
                      )}
                    </div>

                    <div className="flex items-start gap-2 pt-1">
                      <Checkbox
                        id="termos"
                        checked={form.termos}
                        onCheckedChange={(v) => update("termos", !!v)}
                        className="mt-0.5 border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <label htmlFor="termos" className="text-sm text-muted-foreground leading-snug cursor-pointer">
                        Aceito os <span className="text-primary hover:underline">Termos de Uso</span> e{" "}
                        <span className="text-primary hover:underline">Política de Privacidade</span>
                      </label>
                    </div>

                    <button type="submit" disabled={submitting} className="w-full h-11 sm:h-12 bg-primary hover:bg-wchat-700 text-primary-foreground font-semibold rounded-md mt-2 shadow-none transition-colors disabled:opacity-60">
                      {submitting ? "Criando conta..." : "Comecar gratis por 7 dias"}
                    </button>
                  </form>

                  <p className="text-center text-xs text-muted-foreground mt-4">
                    Já tem conta?{" "}
                    <Link to="/login" className="text-primary hover:underline font-medium">Fazer login</Link>
                  </p>
                </div>
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
