import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type ReCAPTCHA from "react-google-recaptcha";
import { ChevronDown, Eye, EyeOff, Scale } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { LoginRecaptcha } from "@/components/auth/LoginRecaptcha";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAppStore } from "@/store/useAppStore";
import { isRecaptchaEnabled, verifyRecaptchaToken } from "@/lib/recaptcha";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const recaptchaRequired = isRecaptchaEnabled();
  const [mfaStep, setMfaStep] = useState<{ factorId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { signIn, verifyMfa } = useAuth();

  const finishLogin = () => {
    if (rememberDevice) {
      localStorage.setItem("wchat-remember-device", "1");
    } else {
      localStorage.removeItem("wchat-remember-device");
    }
    useAppStore.getState().addNotification({
      tipo: "sucesso",
      titulo: "Login realizado",
      descricao: "Sua sessão foi iniciada com sucesso.",
    });
    navigate("/inbox");
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaStep) return;
    setLoading(true);
    const { error } = await verifyMfa(mfaStep.factorId, mfaCode.trim());
    setLoading(false);
    if (error) {
      toast({ title: "Código inválido", description: error, variant: "destructive" });
      return;
    }
    setMfaStep(null);
    setMfaCode("");
    finishLogin();
  };

  useEffect(() => {
    document.documentElement.classList.add("login-screen");
    return () => document.documentElement.classList.remove("login-screen");
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (recaptchaRequired && !captchaToken) {
      toast({
        title: "Confirme que voce nao e um robo",
        description: "Marque a caixa do reCAPTCHA antes de continuar.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    if (recaptchaRequired && captchaToken) {
      const captcha = await verifyRecaptchaToken(captchaToken);
      if (!captcha.ok) {
        setLoading(false);
        recaptchaRef.current?.reset();
        setCaptchaToken(null);
        toast({
          title: "reCAPTCHA invalido",
          description: captcha.error ?? "Tente marcar a caixa novamente.",
          variant: "destructive",
        });
        return;
      }
    }

    const { error, mfaRequired, factorId } = await signIn({ email, password: senha });
    setLoading(false);

    if (error) {
      recaptchaRef.current?.reset();
      setCaptchaToken(null);
      toast({
        title: "Não foi possível entrar",
        description: error,
        variant: "destructive",
      });
      useAppStore.getState().addNotification({
        tipo: "erro",
        titulo: "Não foi possível entrar",
        descricao: error,
      });
      return;
    }

    if (mfaRequired) {
      if (!factorId) {
        toast({
          title: "Verificação em duas etapas",
          description: "Não foi possível iniciar a verificação. Tente entrar novamente.",
          variant: "destructive",
        });
        return;
      }
      setMfaStep({ factorId });
      return;
    }

    finishLogin();
  };

  const inputClass =
    "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary sm:h-11";

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="flex shrink-0 items-center justify-between px-6 py-4 sm:px-8 lg:px-10 xl:px-12">
            <Link to="/" className="inline-block">
              <span className="flex items-center gap-2.5 text-xl font-semibold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar text-sidebar-primary"><Scale className="h-5 w-5" aria-hidden /></span>AdvocaCHAT</span>
            </Link>
            <div className="hidden shrink-0 items-center gap-3 lg:flex">
              <span className="text-sm text-muted-foreground">Ainda não tem uma conta?</span>
              <Link
                to="/cadastro"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Comece o teste grátis
              </Link>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-y-contain px-4 py-3 sm:px-6 lg:px-10 lg:py-2 xl:px-12">
              <div className="my-auto w-full max-w-[400px] shrink-0 rounded-xl bg-card px-5 py-5 border border-border  sm:px-7 sm:py-6 lg:px-8 lg:py-7">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">Bem-vindo ao seu escritório.</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Atendimento e relacionamento com os clientes do seu escritório.
                </p>
                {searchParams.get("cadastro") === "confirmar-email" ? (
                  <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-foreground">
                    Conta criada. Abra o link de confirmacao enviado ao seu e-mail e depois entre aqui.
                  </div>
                ) : null}

                {mfaStep ? (
                  <form onSubmit={handleVerifyMfa} className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Verificação em duas etapas. Digite o código de 6 dígitos do seu aplicativo autenticador.
                    </p>
                    <input
                      aria-label="Código de verificação em duas etapas"
                      autoFocus
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className={`${inputClass} text-center tracking-[0.4em]`}
                    />
                    <button
                      type="submit"
                      disabled={loading || mfaCode.length < 6}
                      className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:h-12 sm:text-[15px]"
                    >
                      {loading ? "Verificando..." : "Confirmar código"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMfaStep(null);
                        setMfaCode("");
                      }}
                      className="w-full text-sm text-muted-foreground hover:text-foreground"
                    >
                      Voltar
                    </button>
                  </form>
                ) : (
                <>
                <form onSubmit={handleLogin} className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-[13px] font-medium text-foreground">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="senha" className="block text-[13px] font-medium text-foreground">
                      Senha
                    </label>
                    <div className="relative">
                      <input
                        id="senha"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        className={`${inputClass} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Link
                    to="/recuperar-senha"
                    className="inline-block text-sm text-primary hover:underline"
                  >
                    Esqueceu sua senha?
                  </Link>

                  <LoginRecaptcha
                    ref={recaptchaRef}
                    onChange={setCaptchaToken}
                    onExpired={() => setCaptchaToken(null)}
                  />

                  <label className="flex cursor-pointer items-start gap-2.5">
                    <Checkbox
                      id="remember"
                      checked={rememberDevice}
                      onCheckedChange={(checked) => setRememberDevice(checked === true)}
                      className="mt-0.5 border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                    />
                    <span className="text-[13px] leading-snug text-muted-foreground">
                      Lembrar deste dispositivo por 14 dias
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={loading || (recaptchaRequired && !captchaToken)}
                    className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:h-12 sm:text-[15px]"
                  >
                    {loading ? "Entrando..." : "Avançar"}
                  </button>
                </form>
                </>
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
