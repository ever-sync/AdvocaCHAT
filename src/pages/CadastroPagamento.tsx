import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Check, Zap, Shield, Lock, Copy, QrCode, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import { clearSignUpDraft, readSignUpDraft } from "@/lib/signup-storage";
import { planos } from "@/data/planosCatalog";

const steps = ["Conta", "Plano", "Pagamento"];

export default function CadastroPagamento() {
  const navigate = useNavigate();
  const { signUp, isSupabaseConfigured } = useAuth();
  const { toast } = useToast();
  const draft = readSignUpDraft();
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cvvFocused, setCvvFocused] = useState(false);
  const [parcelas, setParcelas] = useState("1");
  const [pixTimer, setPixTimer] = useState(900);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (pixTimer <= 0) return;
    const timer = setInterval(() => setPixTimer((previous) => previous - 1), 1000);
    return () => clearInterval(timer);
  }, [pixTimer]);

  const formatCardNumber = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 16);
    return numbers.replace(/(\d{4})/g, "$1 ").trim();
  };

  const formatExpiry = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 4);
    if (numbers.length > 2) return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
    return numbers;
  };

  const detectBrand = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.startsWith("4")) return "Visa";
    if (/^5[1-5]/.test(numbers)) return "Master";
    if (/^3[47]/.test(numbers)) return "Amex";
    if (/^(636|438|504|451)/.test(numbers)) return "Elo";
    return "";
  };

  const selectedPlan = planos.find((plan) => plan.id === draft.plano) ?? planos[1];
  const planPrice = draft.billingPeriod === "anual" ? selectedPlan.preco_anual : selectedPlan.preco_mensal;
  const brand = detectBrand(cardNumber);
  const displayNumber = cardNumber || ".... .... .... ....";
  const displayName = cardName || "SEU NOME AQUI";
  const displayExpiry = expiry || "MM/AA";

  const handleActivate = async () => {
    setLoading(true);
    const result = await signUp({
      nome: draft.nome,
      email: draft.email,
      telefone: draft.telefone,
      empresa: draft.empresa,
      cnpj: draft.cnpj,
      password: draft.senha,
      plano: draft.plano,
    });
    setLoading(false);

    if (result.error) {
      toast({
        title: "Não foi possível criar a conta",
        description: result.error,
        variant: "destructive",
      });
      useAppStore.getState().addNotification({
        tipo: "erro",
        titulo: "Não foi possível criar a conta",
        descricao: result.error,
      });
      return;
    }

    clearSignUpDraft();

    if (result.requiresEmailConfirmation && isSupabaseConfigured) {
      const okDesc = "Verifique seu e-mail para confirmar o acesso antes de entrar.";
      toast({ title: "Conta criada", description: okDesc });
      useAppStore.getState().addNotification({ tipo: "info", titulo: "Conta criada", descricao: okDesc });
      navigate("/login");
      return;
    }

    const successDesc = "Sua conta foi criada com sucesso.";
    toast({ title: "Conta criada", description: successDesc });
    useAppStore.getState().addNotification({
      tipo: "sucesso",
      titulo: "Conta criada",
      descricao: successDesc,
    });
    navigate("/inbox");
  };

  const minutes = Math.floor(pixTimer / 60);
  const seconds = pixTimer % 60;

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
                      i <= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {i < 2 ? <Check className="w-3 h-3" /> : i + 1}
                    </div>
                    <span className={`text-[10px] sm:text-xs font-medium ${i <= 2 ? "text-foreground" : "text-muted-foreground"}`}>
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
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-y-contain px-4 py-8 sm:px-6 lg:px-10 xl:px-12">
              <div className="my-auto w-full max-w-4xl shrink-0 rounded-xl bg-card px-5 py-5 border border-border shadow-[0_1px_8px_hsl(var(--wchat-brand-600)/0.1),0_4px_24px_hsl(var(--wchat-brand-600)/0.06)] sm:px-7 sm:py-6 lg:px-8 lg:py-7">
                <div className="flex flex-col items-center mb-6">
                  <Badge className="bg-warning/20 text-warning rounded-badge px-4 py-1.5 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Modo demonstração - nenhum pagamento será cobrado
                  </Badge>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 w-full">
        <div className="lg:col-span-3">
          <h2 className="text-2xl font-bold text-foreground mb-1">Dados de pagamento</h2>
          <p className="text-sm text-muted-foreground mb-6">Ambiente seguro. Dados fake para demonstração.</p>

          <Tabs defaultValue="cartao">
            <TabsList className="bg-secondary border border-border w-full">
              <TabsTrigger value="cartao" className="flex-1 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Cartão de Crédito</TabsTrigger>
              <TabsTrigger value="pix" className="flex-1 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">PIX</TabsTrigger>
              <TabsTrigger value="boleto" className="flex-1 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Boleto</TabsTrigger>
            </TabsList>

            <TabsContent value="cartao" className="mt-6">
              <div className="perspective-1000 mb-6">
                <div className={`relative w-full max-w-[360px] mx-auto h-[200px] transition-transform duration-500 ${cvvFocused ? "[transform:rotateY(180deg)]" : ""}`} style={{ transformStyle: "preserve-3d" }}>
                  <div className="absolute inset-0 rounded-xl p-6 flex flex-col justify-between backface-hidden" style={{ background: "linear-gradient(135deg, hsl(211 52% 24%), hsl(222 20% 12%))", backfaceVisibility: "hidden" }}>
                    <div className="flex justify-between items-start">
                      <div className="w-10 h-7 rounded bg-warning/30" />
                      <span className="text-sm font-mono text-foreground/60">{brand}</span>
                    </div>
                    <p className="font-mono text-lg text-foreground tracking-widest">{displayNumber}</p>
                    <div className="flex justify-between">
                      <p className="text-xs text-foreground/60 uppercase">{displayName}</p>
                      <p className="text-xs text-foreground/60">{displayExpiry}</p>
                    </div>
                  </div>
                  <div className="absolute inset-0 rounded-xl flex flex-col justify-center backface-hidden [transform:rotateY(180deg)]" style={{ background: "linear-gradient(135deg, hsl(222 20% 12%), hsl(211 52% 24%))", backfaceVisibility: "hidden" }}>
                    <div className="w-full h-10 bg-black/40 mb-4" />
                    <div className="px-6 flex items-center gap-3">
                      <div className="flex-1 h-8 bg-secondary rounded" />
                      <span className="font-mono text-foreground">{cvv || "***"}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Número do cartão</label>
                  <Input value={cardNumber} onChange={(event) => setCardNumber(formatCardNumber(event.target.value))} placeholder="0000 0000 0000 0000" className="bg-secondary border-border h-11 font-mono" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Nome no cartão</label>
                  <Input value={cardName} onChange={(event) => setCardName(event.target.value.toUpperCase())} placeholder="NOME COMPLETO" className="bg-secondary border-border h-11" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Validade</label>
                    <Input value={expiry} onChange={(event) => setExpiry(formatExpiry(event.target.value))} placeholder="MM/AA" className="bg-secondary border-border h-11 font-mono" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">CVV</label>
                    <Input type="password" maxLength={4} value={cvv} onChange={(event) => setCvv(event.target.value.replace(/\D/g, ""))} onFocus={() => setCvvFocused(true)} onBlur={() => setCvvFocused(false)} placeholder="***" className="bg-secondary border-border h-11 font-mono" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Parcelamento</label>
                  <Select value={parcelas} onValueChange={setParcelas}>
                    <SelectTrigger className="bg-secondary border-border h-11"><SelectValue /></SelectTrigger>
                    <SelectContent className="glass-strong">
                      {Array.from({ length: 12 }, (_, index) => (
                        <SelectItem key={index + 1} value={String(index + 1)}>{index + 1}x de R$ {(planPrice / (index + 1)).toFixed(2)} {index === 0 ? "sem juros" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleActivate} disabled={loading} className="w-full h-11 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold rounded-lg">
                  {loading ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />Processando...</span> : "Ativar meu plano"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="pix" className="mt-6">
              <div className="glass rounded-xl p-6 text-center">
                <div className="w-48 h-48 mx-auto bg-secondary rounded-xl flex items-center justify-center mb-4">
                  <QrCode className="w-32 h-32 text-muted-foreground" />
                </div>
                <p className="font-semibold text-foreground mb-2">Escaneie o QR Code</p>
                <p className="text-sm text-muted-foreground mb-4">Ou copie o código abaixo</p>
                <div className="flex items-center gap-2 bg-secondary rounded-lg p-3 mb-4">
                  <code className="text-xs text-muted-foreground flex-1 truncate font-mono">00020126360014BR.GOV.BCB.PIX0114+5511998765432...</code>
                  <Button variant="ghost" size="icon" className="flex-shrink-0"><Copy className="w-4 h-4" /></Button>
                </div>
                <p className="text-sm font-medium text-warning">{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")} restantes</p>
                <Button onClick={handleActivate} disabled={loading} className="mt-4 bg-accent hover:bg-accent/90 text-accent-foreground">
                  Confirmar por PIX
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="boleto" className="mt-6">
              <div className="glass rounded-xl p-6 text-center">
                <p className="text-muted-foreground">Boleto bancário será gerado após confirmação.</p>
                <Button onClick={handleActivate} disabled={loading} className="mt-4 bg-accent hover:bg-accent/90 text-accent-foreground">Gerar boleto</Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="lg:col-span-2">
          <div className="glass rounded-xl p-6 sticky top-8">
            <h3 className="font-bold text-foreground mb-4">Resumo do pedido</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Plano</span>
                <Badge className="bg-accent/20 text-accent rounded-badge">{selectedPlan.nome}</Badge>
              </div>
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Período</span><span className="text-sm text-foreground">{draft.billingPeriod === "anual" ? "Anual" : "Mensal"}</span></div>
              <div className="h-px bg-border" />
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Subtotal</span><span className="text-sm text-foreground">R$ {planPrice.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold"><span className="text-foreground">Total</span><span className="text-foreground">R$ {planPrice.toFixed(2)}</span></div>
              <div className="h-px bg-border" />
              <div className="flex items-center gap-2 text-xs text-success"><Check className="w-3 h-3" />Teste grátis de 14 dias</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3 h-3" />Cancele quando quiser</div>
            </div>
            <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border">
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><Shield className="w-3 h-3" />SSL</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="w-3 h-3" />Dados protegidos</div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</main>
      </div>
    </div>
  );
}
