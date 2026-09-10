import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  MessageSquare,
  PartyPopper,
  Settings2,
  Sparkles,
  Target,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTenantAiConfig, useKnowledgeSources } from "@/lib/api/ai-agent";
import { useTenantCrmFunnelConfig } from "@/lib/api/crm-funnel-config";
import { useTenantCollaborators } from "@/lib/api/settings";
import { useTenantBillingSnapshot } from "@/lib/api/billing";
import { useTenantIntegrations, useTenantSettings, useUpsertTenantSettings } from "@/lib/api/integrations";
import { useWhatsappInstances } from "@/lib/api/whatsapp";
import { useAppStore } from "@/store/useAppStore";

type Objective = "atendimento" | "vendas" | "suporte" | "recuperacao";

type OnboardingStep = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  summary: string;
  actionLabel: string;
  actionTo: string;
  icon: LucideIcon;
};

const OBJECTIVE_OPTIONS: Array<{
  value: Objective;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "atendimento",
    label: "Atendimento",
    description: "Centralizar conversas e responder rapido.",
    icon: MessageSquare,
  },
  {
    value: "vendas",
    label: "Vendas",
    description: "Organizar leads, funis e fechamento.",
    icon: Target,
  },
  {
    value: "suporte",
    label: "Suporte",
    description: "Reduzir tempo de resposta e fila.",
    icon: Users,
  },
  {
    value: "recuperacao",
    label: "Recuperacao",
    description: "Automatizar follow-up e reativacao.",
    icon: Workflow,
  },
];

const OBJECTIVE_STORAGE_KEY = "wchat-onboarding-objective";

function readObjective(): Objective {
  if (typeof window === "undefined") return "atendimento";
  const value = window.localStorage.getItem(OBJECTIVE_STORAGE_KEY);
  if (value === "atendimento" || value === "vendas" || value === "suporte" || value === "recuperacao") {
    return value;
  }
  return "atendimento";
}

function objectiveDestination(objective: Objective) {
  switch (objective) {
    case "vendas":
      return { label: "Abrir CRM", to: "/crm" };
    case "suporte":
      return { label: "Abrir Inbox", to: "/inbox" };
    case "recuperacao":
      return { label: "Abrir automacoes", to: "/marketing?aba=automacao-2" };
    case "atendimento":
    default:
      return { label: "Abrir Inbox", to: "/inbox" };
  }
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [objective, setObjective] = useState<Objective>(readObjective());
  const saveTenantSettingsMutation = useUpsertTenantSettings();
  const lastSavedSignatureRef = useRef<string>("");

  const { data: instances = [], isLoading: instancesLoading } = useWhatsappInstances();
  const { data: aiConfig, isLoading: aiLoading } = useTenantAiConfig();
  const { data: knowledgeSources = [], isLoading: knowledgeLoading } = useKnowledgeSources();
  const { data: collaborators = [], isLoading: collaboratorsLoading } = useTenantCollaborators();
  const { data: crmFunnels, isLoading: crmLoading } = useTenantCrmFunnelConfig();
  const { data: integrations, isLoading: integrationsLoading } = useTenantIntegrations();
  const { data: settings, isLoading: settingsLoading } = useTenantSettings();
  const { data: billingSnapshot, isLoading: billingLoading } = useTenantBillingSnapshot();

  useEffect(() => {
    window.localStorage.setItem(OBJECTIVE_STORAGE_KEY, objective);
  }, [objective]);

  useEffect(() => {
    const persistedObjective = settings?.onboardingState?.objective;
    if (persistedObjective && settings.onboardingState.completedAt) {
      setObjective(persistedObjective);
    }
  }, [settings?.onboardingState?.completedAt, settings?.onboardingState?.objective]);

  const defaultInstance = useMemo(
    () => instances.find((instance) => instance.isDefault) ?? instances[0] ?? null,
    [instances],
  );
  const connectedInstance = defaultInstance?.status === "connected" ? defaultInstance : null;

  const onboardingSteps = useMemo<OnboardingStep[]>(() => {
    const aiReady = aiConfig?.provider !== "off";
    const crmReady = crmFunnels !== null;
    const teamReady = collaborators.length > 1 || collaboratorsLoading === false && collaborators.length > 0;
    const automationReady =
      Boolean(integrations?.n8nEnabled || integrations?.n8nWebhookUrl) ||
      Boolean(settings?.defaultAiMode && settings.defaultAiMode !== "off");

    return [
      {
        key: "whatsapp",
        title: "Conectar WhatsApp",
        description: "Ligue um canal ativo para o time começar a atender de verdade.",
        done: connectedInstance !== null,
        summary: connectedInstance
          ? `${connectedInstance.displayName} conectado`
          : defaultInstance
            ? `${defaultInstance.displayName} aguardando conexão`
            : "Nenhuma instância criada ainda",
        actionLabel: connectedInstance ? "Revisar canal" : "Conectar canal",
        actionTo: "/configuracoes?aba=integracoes&secao=whatsapp",
        icon: MessageSquare,
      },
      {
        key: "ai",
        title: "Configurar IA",
        description: "Ative o agente e deixe a base pronta para responder.",
        done: aiReady,
        summary: aiReady
          ? `Agente ativo${knowledgeSources.length > 0 ? ` · ${knowledgeSources.length} fonte(s)` : ""}`
          : "IA ainda desligada",
        actionLabel: aiReady ? "Abrir IA" : "Configurar IA",
        actionTo: "/agente-ia",
        icon: Sparkles,
      },
      {
        key: "team",
        title: "Montar equipe",
        description: "Crie acesso para quem vai operar o canal sem dividir senha.",
        done: teamReady,
        summary:
          collaborators.length > 1
            ? `${collaborators.length} pessoas no time`
            : collaborators.length === 1
              ? "Só o primeiro acesso ainda"
              : "Nenhum colaborador carregado",
        actionLabel: "Gerenciar equipe",
        actionTo: "/configuracoes?aba=colaboradores&secao=colaboradores",
        icon: Users,
      },
      {
        key: "crm",
        title: "Revisar CRM",
        description: "Ajuste funis e campos para transformar conversa em oportunidade.",
        done: crmReady,
        summary: crmReady ? "Funil do tenant já configurado" : "Usando funil padrão",
        actionLabel: "Abrir CRM",
        actionTo: "/configuracoes?aba=funis",
        icon: Target,
      },
      {
        key: "automation",
        title: "Ativar automação",
        description: "Conecte integrações, fluxos ou regras para a operação rodar sem atrito.",
        done: automationReady,
        summary: integrations?.n8nEnabled
          ? "n8n habilitado"
          : integrations?.n8nWebhookUrl
            ? "Webhook configurado"
            : settings?.defaultAiMode && settings.defaultAiMode !== "off"
              ? `IA padrão: ${settings.defaultAiMode}`
              : "Sem automação externa ligada",
        actionLabel: "Abrir automações",
        actionTo: "/marketing?aba=automacao-2",
        icon: Workflow,
      },
      {
        key: "test",
        title: "Fazer teste final",
        description: "Envie uma mensagem de teste e valide o primeiro fluxo ponta a ponta.",
        done: connectedInstance !== null && aiReady && (crmReady || billingSnapshot?.subscription !== null),
        summary:
          connectedInstance && aiReady
            ? "Pronto para validação de ponta a ponta"
            : "Ainda falta ligar WhatsApp e IA",
        actionLabel: "Ir para o Inbox",
        actionTo: "/inbox",
        icon: CheckCircle2,
      },
    ];
  }, [
    aiConfig?.llmProvider,
    aiConfig?.provider,
    billingSnapshot?.subscription,
    collaborators.length,
    collaboratorsLoading,
    connectedInstance,
    crmFunnels,
    defaultInstance,
    integrations?.n8nEnabled,
    integrations?.n8nWebhookUrl,
    knowledgeSources.length,
    settings?.defaultAiMode,
  ]);

  const completedSteps = onboardingSteps.filter((step) => step.done).length;
  const progress = Math.round((completedSteps / onboardingSteps.length) * 100);
  const nextStep = onboardingSteps.find((step) => !step.done) ?? onboardingSteps[onboardingSteps.length - 1];
  const destination = objectiveDestination(objective);
  const pendingSteps = onboardingSteps.filter((step) => !step.done);
  const loading =
    instancesLoading ||
    aiLoading ||
    knowledgeLoading ||
    collaboratorsLoading ||
    crmLoading ||
    integrationsLoading ||
    settingsLoading ||
    billingLoading;

  useEffect(() => {
    if (!settings || loading) return;

    const currentStepKeys = onboardingSteps.filter((step) => step.done).map((step) => step.key);
    const signature = `${objective}|${currentStepKeys.join(",")}`;
    if (signature === lastSavedSignatureRef.current) return;

    lastSavedSignatureRef.current = signature;
    const timeout = window.setTimeout(() => {
      void saveTenantSettingsMutation.mutateAsync({
        onboardingState: {
          objective,
          completedAt: onboardingSteps.every((step) => step.done)
            ? new Date().toISOString()
            : null,
          completedStepKeys: currentStepKeys,
        },
      });
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [loading, objective, onboardingSteps, saveTenantSettingsMutation, settings]);

  async function finalize() {
    const descricao =
      objective === "vendas"
        ? "Seu onboarding ficou pronto para vender com CRM e funil."
        : objective === "recuperacao"
          ? "Seu onboarding ficou pronto para recuperar leads com automacoes."
          : objective === "suporte"
            ? "Seu onboarding ficou pronto para operar suporte no Inbox."
            : "Seu onboarding ficou pronto para atender com WhatsApp, IA e time.";

    toast({ title: "Onboarding concluido", description: descricao });
    useAppStore.getState().addNotification({
      tipo: "sucesso",
      titulo: "Onboarding concluido",
      descricao,
    });
    try {
      await saveTenantSettingsMutation.mutateAsync({
        onboardingState: {
          objective,
          completedAt: new Date().toISOString(),
          completedStepKeys: onboardingSteps.filter((step) => step.done).map((step) => step.key),
        },
      });
    } catch (error) {
      toast({
        title: "Nao foi possivel salvar o onboarding",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
      return;
    }
    navigate(destination.to);
  }

  function scrollToStep(stepKey: string) {
    if (typeof window === "undefined") return;
    const element = document.getElementById(`onboarding-step-${stepKey}`);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent">
            <Zap className="h-5 w-5 text-accent-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">CaleoCRM</p>
            <p className="text-sm text-muted-foreground">Onboarding inicial da operação</p>
          </div>
        </div>

        <Card className="border-border/60 bg-card/90">
          <CardContent className="space-y-6 p-6 md:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl space-y-3">
                <Badge className="bg-accent/15 text-accent">Primeiro valor em poucos passos</Badge>
                <div>
                  <h1 className="text-3xl font-bold text-foreground">Configure sua operação sem perder o rumo</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Vamos marcar o que já está pronto e mostrar exatamente o que falta para o CaleoCRM começar a rodar de verdade.
                  </p>
                </div>
              </div>

              <div className="min-w-[260px] rounded-2xl border border-border bg-secondary/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Progresso</p>
                    <p className="mt-1 text-3xl font-bold text-foreground">{progress}%</p>
                  </div>
                  <div className="rounded-full bg-accent/10 p-3 text-accent">
                    <PartyPopper className="h-5 w-5" />
                  </div>
                </div>
                <Progress value={progress} className="mt-4 h-2" />
                {settings?.onboardingState?.completedAt ? (
                  <p className="mt-3 text-sm text-success">
                    Concluído em{" "}
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(settings.onboardingState.completedAt))}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Ainda em configuração.</p>
                )}
                <p className="mt-3 text-sm text-muted-foreground">
                  {completedSteps} de {onboardingSteps.length} etapas prontas.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {OBJECTIVE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = option.value === objective;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setObjective(option.value)}
                    className={[
                      "flex items-start gap-3 rounded-2xl border p-4 text-left transition",
                      active ? "border-accent bg-accent/5" : "border-border bg-background hover:bg-secondary/30",
                    ].join(" ")}
                  >
                    <div className={["mt-0.5 rounded-xl p-2", active ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"].join(" ")}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{option.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <Card className="border-border/60 bg-card/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings2 className="h-5 w-5 text-accent" />
                Checklist de ativação
              </CardTitle>
              <CardDescription>
                Cada etapa abaixo usa o estado real do tenant. Quando ficar pronta, ela muda de cor e some da lista de pendências.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="rounded-2xl border border-border bg-secondary/30 p-5 text-sm text-muted-foreground">
                  Carregando o estado da operação...
                </div>
              ) : null}

              {onboardingSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.key}
                    id={`onboarding-step-${step.key}`}
                    className={[
                      "rounded-2xl border p-4",
                      step.done ? "border-success/30 bg-success/5" : "border-border bg-background",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-start gap-3">
                        <div className={["mt-0.5 rounded-xl p-2", step.done ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"].join(" ")}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-foreground">{step.title}</h3>
                            <Badge className={step.done ? "bg-success/20 text-success" : "bg-warning/15 text-warning"}>
                              {step.done ? "Pronto" : "Pendente"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                          <p className="mt-2 text-sm text-foreground">{step.summary}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {step.done ? (
                          <div className="flex items-center gap-2 rounded-full bg-success/10 px-3 py-2 text-sm font-medium text-success">
                            <Check className="h-4 w-4" />
                            Concluído
                          </div>
                        ) : null}
                        <Button
                          variant={step.done ? "outline" : "default"}
                          className={step.done ? "" : "bg-accent text-accent-foreground hover:bg-accent/90"}
                          onClick={() => navigate(step.actionTo)}
                        >
                          {step.actionLabel}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Card className="border-border/60 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-accent" />
                  Próximo passo
                </CardTitle>
                <CardDescription>O sistema já calculou a próxima ação útil para esse tenant.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary/30 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Agora</p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">{nextStep.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{nextStep.description}</p>
                </div>

                <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => navigate(nextStep.actionTo)}>
                  {nextStep.actionLabel}
                </Button>

                <Separator />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">WhatsApp</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {connectedInstance ? "Conectado" : defaultInstance ? "Aguardando" : "Nenhum canal"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">IA</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {aiConfig?.provider && aiConfig.provider !== "off" ? "Ativa" : "Desligada"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Equipe</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{collaborators.length} pessoas</p>
                  </div>
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Funil</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{crmFunnels ? "Customizado" : "Padrão"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                  Atalhos do checklist
                </CardTitle>
                <CardDescription>
                  Pule direto para o que ainda falta. Faltam {pendingSteps.length} etapa{pendingSteps.length === 1 ? "" : "s"} para concluir.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {onboardingSteps.map((step) => (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => scrollToStep(step.key)}
                    className={[
                      "flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition",
                      step.done ? "border-success/25 bg-success/5 hover:bg-success/10" : "border-border bg-background hover:bg-secondary/50",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{step.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{step.done ? "Pronto" : "Pendente"}</p>
                    </div>
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        step.done ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                      ].join(" ")}
                    >
                      {step.done ? "OK" : "Falta"}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="h-5 w-5 text-accent" />
                  Atalho final
                </CardTitle>
                <CardDescription>Quando terminar o checklist, vá direto para o destino do seu objetivo.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={finalize}>
                  {destination.label}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
