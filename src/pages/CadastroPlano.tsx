import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Check, Zap, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { planos } from "@/data/planosCatalog";
import { readSignUpDraft, writeSignUpDraft } from "@/lib/signup-storage";

const steps = ["Conta", "Plano", "Pagamento"];

export default function CadastroPlano() {
  const draft = readSignUpDraft();
  const [anual, setAnual] = useState(draft.billingPeriod === "anual");
  const navigate = useNavigate();

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
                      i <= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {i < 1 ? <Check className="w-3 h-3" /> : i + 1}
                    </div>
                    <span className={`text-[10px] sm:text-xs font-medium ${i <= 1 ? "text-foreground" : "text-muted-foreground"}`}>
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
              <div className="my-auto w-full max-w-5xl shrink-0 rounded-xl bg-card px-5 py-5 border border-border shadow-[0_1px_8px_hsl(var(--wchat-brand-600)/0.1),0_4px_24px_hsl(var(--wchat-brand-600)/0.06)] sm:px-7 sm:py-6 lg:px-8 lg:py-7">
                <h1 className="text-3xl font-bold text-foreground mb-2 text-center">
                  Escolha seu plano
                </h1>
                <p className="text-muted-foreground mb-6 text-center">
                  Comece grátis por 14 dias, sem cartão de crédito
                </p>

                {/* Toggle Mensal / Anual */}
                <div className="flex items-center justify-center gap-3 mb-10">
                  <span className={`text-sm font-medium ${!anual ? "text-foreground" : "text-muted-foreground"}`}>Mensal</span>
                  <button
                    onClick={() => {
                      const nextValue = !anual;
                      setAnual(nextValue);
                      writeSignUpDraft({ billingPeriod: nextValue ? "anual" : "mensal" });
                    }}
                    className={`relative w-12 h-6 rounded-full transition-colors ${anual ? "bg-accent" : "bg-secondary"}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${anual ? "translate-x-6" : "translate-x-0.5"}`} />
                  </button>
                  <span className={`text-sm font-medium ${anual ? "text-foreground" : "text-muted-foreground"}`}>Anual</span>
                  {anual && <Badge className="bg-success/20 text-success text-xs rounded-badge">-20%</Badge>}
                </div>

                {/* Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                  {planos.map((plano) => (
                    <div
                      key={plano.id}
                      className={`glass rounded-xl p-6 flex flex-col relative ${
                        plano.destaque
                          ? "border-2 border-accent shadow-[0_0_30px_hsl(24_95%_53%/0.15)]"
                          : ""
                      }`}
                    >
                      {plano.destaque && (
                        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground rounded-badge px-4 py-1 text-xs font-semibold">
                          Mais popular
                        </Badge>
                      )}

                      <Badge className="w-fit bg-secondary text-muted-foreground rounded-badge text-xs mb-4">
                        {plano.badge}
                      </Badge>

                      <h3 className="text-xl font-bold text-foreground mb-1">{plano.nome}</h3>

                      <div className="mb-5">
                        <span className="text-4xl font-bold text-foreground">
                          R$ {anual ? plano.preco_anual : plano.preco_mensal}
                        </span>
                        <span className="text-muted-foreground text-sm">/mês</span>
                        {anual && (
                          <p className="text-xs text-muted-foreground mt-1 line-through">
                            R$ {plano.preco_mensal}/mês
                          </p>
                        )}
                      </div>

                      <ul className="space-y-3 mb-6 flex-1">
                        {plano.features.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                            <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      <Button
                        onClick={() => {
                          writeSignUpDraft({
                            plano: plano.id,
                            billingPeriod: anual ? "anual" : "mensal",
                          });
                          navigate("/cadastro/pagamento");
                        }}
                        className={`w-full h-11 rounded-lg font-semibold ${
                          plano.destaque
                            ? "bg-accent hover:bg-accent/90 text-accent-foreground"
                            : "bg-secondary hover:bg-secondary/80 text-foreground border border-border"
                        }`}
                      >
                        {plano.id === "enterprise" ? "Falar com vendas" : `Começar com ${plano.nome}`}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
