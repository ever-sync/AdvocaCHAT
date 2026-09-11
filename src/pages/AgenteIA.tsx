import { SalesWorkflowPanel } from "@/components/ai-workflow/SalesWorkflowPanel";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import {
  Activity,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  MessageSquare,
  Radio,
  Send,
  SlidersHorizontal,
  Trash2,
  Check,
  Coins,
  Copy,
  FileText,
  Globe,
  HelpCircle,
  Info,
  Layers,
  Plus,
  Search,
  Sparkles,
  Clock,
  ArrowRight,
  UploadCloud,
  Cpu,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { extractPdfText } from "@/lib/pdf-text";
import { cn } from "@/lib/utils";
import { fetchAllInboxMessages, useInboxChats } from "@/lib/api/whatsapp";
import {
  type AiChannel,
  type AiDefaultMode,
  type AiError,
  type AiProvider,
  type AiTurn,
  type AiTurnCritiqueFlag,
  type AiTurnOutcome,
  type LlmProvider,
  type PlaygroundMessage,
  type TenantAiConfig,
  useAddKnowledgeSource,
  useAiChannels,
  useAiErrors,
  useAiSubscription,
  useAiTurns,
  useImportKnowledgeUrl,
  useRunPlayground,
  useAiUsageByModelThisMonth,
  useAiUsageThisMonth,
  type AiUsageByModelRow,
  useDeleteKnowledgeSource,
  useKnowledgeSources,
  useTenantAiConfig,
  useUpdateAiChannel,
  useUpsertTenantAiConfig,
} from "@/lib/api/ai-agent";
import type { InboxChat, WhatsappMessage } from "@/types/domain";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  off: "Desligada",
  native: "Nativa (orquestrador AdvocaCHAT)",
  n8n: "Externa (N8N)",
};

const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
};

const LLM_MODELS: Record<LlmProvider, Array<{ value: string; label: string }>> = {
  anthropic: [
    { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  openai: [
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o mini" },
  ],
};

/** Modelos do provedor + o modelo atual (caso seja um id fora da lista). */
function modelOptions(provider: LlmProvider, current: string): Array<{ value: string; label: string }> {
  const base = LLM_MODELS[provider];
  if (current && !base.some((m) => m.value === current)) {
    return [{ value: current, label: current }, ...base];
  }
  return base;
}

function nf(n: number): string {
  return n.toLocaleString("pt-BR");
}

export default function AgenteIA() {
  const [tab, setTab] = useState("operacional");

  // Hooking up state for header info
  const { data: channels = [] } = useAiChannels();
  const { data: sub } = useAiSubscription();
  const { data: usage } = useAiUsageThisMonth();
  const { data: config } = useTenantAiConfig();
  const { data: knowledgeSources = [] } = useKnowledgeSources();
  const { data: errors = [] } = useAiErrors();

  const isAiActive = channels.some((c) => c.ai_enabled);

  const totalTokens = usage ? usage.inputTokens + usage.outputTokens : 0;
  const planQuota = sub?.active && sub.monthlyTokenQuota > 0 && !sub.overageAllowed ? sub.monthlyTokenQuota : null;
  const selfLimit = config?.monthlyTokenLimit && config.monthlyTokenLimit > 0 ? config.monthlyTokenLimit : null;
  const candidates = [planQuota, selfLimit].filter((v): v is number => v != null);
  const limit = candidates.length > 0 ? Math.min(...candidates) : null;
  const quotaPct = limit ? Math.min(100, Math.round((totalTokens / limit) * 100)) : null;
  const activeChannels = channels.filter((c) => c.ai_enabled);
  const configuredChannels = channels.length;

  return (
    <PageShell contentClassName="flex flex-col gap-4">
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-border/70 bg-card px-5 py-4 shadow-sm">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-primary/[0.04]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold leading-tight tracking-normal text-foreground md:text-2xl">Agente IA</h1>
                {isAiActive ? (
                  <Badge className="flex items-center gap-1 border-emerald-500/20 bg-emerald-500/10 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    Ativo nos canais
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-border/60">
                    Inativo nos canais
                  </Badge>
                )}
              </div>
              <p className="max-w-2xl text-xs text-muted-foreground">
                Configure e personalize a inteligência artificial para automatizar seus atendimentos.
              </p>
            </div>
          </div>

          {limit && limit > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border/50 bg-background/70 p-3 sm:text-right">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Coins className="h-3.5 w-3.5 text-primary/80" />
                  Limite Mensal:
                </span>
                <span className="font-semibold text-foreground">
                  {nf(totalTokens)} / {nf(limit)} tokens
                </span>
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted sm:w-48">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    quotaPct && quotaPct >= 95 ? "bg-destructive animate-pulse" : quotaPct && quotaPct >= 80 ? "bg-amber-500" : "bg-primary"
                  )}
                  style={{ width: `${quotaPct ?? 0}%` }}
                />
              </div>
              {quotaPct !== null && (
                <span className="text-[10px] text-muted-foreground sm:text-right">
                  {quotaPct}% utilizado da cota disponível
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex shrink-0 flex-col gap-4">
        <TabsList className="h-auto w-full shrink-0 flex-nowrap justify-start gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card p-1 shadow-sm">
          <TabsTrigger value="operacional" className="shrink-0 gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Activity className="h-4 w-4" />
            Visão operacional
          </TabsTrigger>
          <TabsTrigger value="analise" className="shrink-0 gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Sparkles className="h-4 w-4" />
            Análise de atendimento
          </TabsTrigger>
          <TabsTrigger value="equipe" className="shrink-0 gap-2 rounded-lg px-4 py-2 text-sm font-medium"><Bot className="h-4 w-4" />SDR e closer</TabsTrigger>
          <TabsTrigger value="configuracao" className="shrink-0 gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <SlidersHorizontal className="h-4 w-4" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="conhecimento" className="shrink-0 gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <BookOpen className="h-4 w-4" />
            Base de conhecimento
          </TabsTrigger>
          <TabsTrigger value="canais" className="shrink-0 gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Radio className="h-4 w-4" />
            Canais
          </TabsTrigger>
          <TabsTrigger value="atividade" className="shrink-0 gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Activity className="h-4 w-4" />
            Atividade
          </TabsTrigger>
          <TabsTrigger value="testar" className="shrink-0 gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <MessageSquare className="h-4 w-4" />
            Testar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equipe" className="mt-0"><SalesWorkflowPanel /></TabsContent>
        <TabsContent value="operacional" className="mt-0 focus-visible:outline-none">
          <AiOpsOverview
            activeChannels={activeChannels.length}
            configuredChannels={configuredChannels}
            knowledgeSourcesCount={knowledgeSources.length}
            openFailures={errors.length}
            isAiActive={isAiActive}
            provider={config?.provider ?? "off"}
            quotaPct={quotaPct}
            totalTokens={totalTokens}
            limit={limit}
            onGo={(nextTab) => setTab(nextTab)}
          />
        </TabsContent>

        <TabsContent value="analise" className="mt-0 focus-visible:outline-none">
          <AnaliseAtendimentoTab
            onOpenConfig={() => setTab("configuracao")}
            onOpenTesting={() => setTab("testar")}
          />
        </TabsContent>

        <TabsContent value="configuracao" className="mt-0 focus-visible:outline-none">
          <ConfiguracaoTab />
        </TabsContent>

        <TabsContent value="conhecimento" className="mt-0 focus-visible:outline-none">
          <ConhecimentoTab />
        </TabsContent>

        <TabsContent value="canais" className="mt-0 focus-visible:outline-none">
          <CanaisTab />
        </TabsContent>

        <TabsContent value="atividade" className="mt-0 focus-visible:outline-none">
          <AtividadeTab />
        </TabsContent>

        <TabsContent value="testar" className="mt-0 focus-visible:outline-none">
          <TestarTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function AiOpsOverview({
  activeChannels,
  configuredChannels,
  knowledgeSourcesCount,
  openFailures,
  isAiActive,
  provider,
  quotaPct,
  totalTokens,
  limit,
  onGo,
}: {
  activeChannels: number;
  configuredChannels: number;
  knowledgeSourcesCount: number;
  openFailures: number;
  isAiActive: boolean;
  provider: AiProvider;
  quotaPct: number | null;
  totalTokens: number;
  limit: number | null;
  onGo: (tab: string) => void;
}) {
  const providerLabel = PROVIDER_LABELS[provider];

  const cards = [
    {
      label: "Status",
      value: isAiActive ? "Ligada" : "Desligada",
      hint: providerLabel,
      tone: isAiActive ? "emerald" : "amber",
    },
    {
      label: "Canais",
      value: `${activeChannels}/${configuredChannels}`,
      hint: activeChannels > 0 ? "Prontos para responder" : "Ainda sem canal ativo",
      tone: activeChannels > 0 ? "primary" : "muted",
    },
    {
      label: "Base",
      value: `${knowledgeSourcesCount}`,
      hint: knowledgeSourcesCount > 0 ? "Fontes cadastradas" : "Ainda vazia",
      tone: knowledgeSourcesCount > 0 ? "primary" : "muted",
    },
    {
      label: "Falhas",
      value: `${openFailures}`,
      hint: openFailures > 0 ? "Precisa de atenção" : "Sem falhas recentes",
      tone: openFailures > 0 ? "amber" : "muted",
    },
  ] as const;

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Bot className="h-4.5 w-4.5 text-primary" />
              Visão operacional
            </CardTitle>
            <CardDescription className="text-xs">
              Tudo que você precisa para ligar, revisar e testar a IA sem ruído.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onGo("configuracao")}>
              Abrir configuração
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onGo("canais")}>
              Ver canais
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => onGo("testar")}>
              Testar agora
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
              className={cn(
                "rounded-xl border p-4 shadow-sm",
                card.tone === "emerald"
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : card.tone === "primary"
                    ? "border-primary/20 bg-primary/[0.04]"
                    : "border-border/60 bg-card",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">{card.value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{card.hint}</p>
          </div>
        ))}

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm md:col-span-2 xl:col-span-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Consumo de tokens
              </p>
              <p className="text-sm font-semibold text-foreground">
                {nf(totalTokens)} {limit ? `de ${nf(limit)}` : ""} tokens usados
              </p>
              <p className="text-[11px] text-muted-foreground">
                {quotaPct === null
                  ? "Sem limite mensal definido."
                  : quotaPct >= 95
                    ? "Atenção: a cota está praticamente no limite."
                    : quotaPct >= 80
                      ? "Bom observar: o consumo já chegou perto da faixa de alerta."
                      : "A cota está sob controle por enquanto."}
              </p>
            </div>
            {quotaPct !== null ? (
              <div className="w-full max-w-md">
                <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Uso mensal</span>
                  <span>{quotaPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      quotaPct >= 95 ? "bg-destructive" : quotaPct >= 80 ? "bg-amber-500" : "bg-primary",
                    )}
                    style={{ width: `${quotaPct}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type AnalysisScope = "conversation" | "period";

type AtendimentoConversationAnalysis = {
  chatName: string;
  score: number;
  resumo: string;
  problemaPrincipal: string;
  ajusteRecomendado: string;
  mensagens: number;
};

type AtendimentoEvidence = {
  title: string;
  quote: string;
  impact: string;
};

type AtendimentoAction = {
  title: string;
  description: string;
  kind: "copy_script" | "copy_system" | "open_config" | "open_testing";
};

type ConversationBundle = {
  chat: InboxChat;
  messages: WhatsappMessage[];
};

type AtendimentoAnalysis = {
  scope: AnalysisScope;
  score: number;
  resumo: string;
  pontosFortes: string[];
  problemas: string[];
  melhoriasScript: string[];
  melhoriasSistema: string[];
  prioridadeProxima: string[];
  conversas: AtendimentoConversationAnalysis[];
  evidencias: AtendimentoEvidence[];
  acoes: AtendimentoAction[];
  raw: string;
};

const ANALYSIS_SCOPE_LABELS: Record<AnalysisScope, string> = {
  conversation: "Conversa única",
  period: "Período",
};

const ANALYSIS_HISTORY_KEY = "wchat-agente-ia-analysis-history";

type AnalysisHistoryItem = {
  id: string;
  createdAt: string;
  scope: AnalysisScope;
  score: number;
  summary: string;
  scopeLabel: string;
  chats: number;
};

function toDateInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function createDateBounds(startValue: string, endValue: string): { start: Date | null; end: Date | null } {
  const start = startValue ? new Date(`${startValue}T00:00:00`) : null;
  const end = endValue ? new Date(`${endValue}T23:59:59.999`) : null;
  return { start, end };
}

function isWithinBounds(value: string | null | undefined, start: Date | null, end: Date | null): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  if (start && timestamp < start.getTime()) return false;
  if (end && timestamp > end.getTime()) return false;
  return true;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMessageLine(message: WhatsappMessage): string {
  const ts = message.createdAt ?? message.receivedAt ?? message.sentAt ?? null;
  const time = formatDateTime(ts);
  const speaker =
    message.direction === "inbound"
      ? "Cliente"
      : message.actorType === "ai"
        ? "IA"
        : message.actorType === "system"
          ? "Sistema"
          : "Atendimento";
  const body = (message.bodyText ?? "").trim();
  const fallback = message.mediaUrl ? `[${message.messageType}] mídia anexada` : `[${message.messageType}]`;
  return `[${time}] ${speaker}: ${body || fallback}`;
}

function shortenText(value: string, max = 140): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function normalizeReportLine(value: unknown, max = 120): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return shortenText(text, max);
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function normalizeConversationReports(value: unknown): AtendimentoConversationAnalysis[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const scoreRaw = Number(entry.score ?? entry.nota ?? 0);
      return {
        chatName: String(entry.chat_name ?? entry.chatName ?? entry.nome ?? entry.name ?? "Conversa").trim(),
        score: Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0,
        resumo: normalizeReportLine(entry.resumo ?? entry.summary ?? "", 160),
        problemaPrincipal: normalizeReportLine(entry.problema_principal ?? entry.main_issue ?? entry.issue ?? "", 140),
        ajusteRecomendado: normalizeReportLine(entry.ajuste_recomendado ?? entry.recommended_fix ?? entry.fix ?? "", 140),
        mensagens: Number.isFinite(Number(entry.mensagens ?? entry.messages ?? 0))
          ? Math.max(0, Math.round(Number(entry.mensagens ?? entry.messages ?? 0)))
          : 0,
      };
    })
    .filter((item): item is AtendimentoConversationAnalysis => Boolean(item?.chatName || item?.resumo || item?.problemaPrincipal || item?.ajusteRecomendado));
}

function normalizeEvidenceReports(value: unknown): AtendimentoEvidence[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      return {
        title: normalizeReportLine(entry.title ?? entry.titulo ?? entry.label ?? "Evidência", 80),
        quote: normalizeReportLine(entry.quote ?? entry.trecho ?? entry.excerpt ?? "", 180),
        impact: normalizeReportLine(entry.impact ?? entry.impacto ?? entry.reason ?? "", 120),
      };
    })
    .filter((item): item is AtendimentoEvidence => Boolean(item?.title || item?.quote || item?.impact));
}

function normalizeActionReports(value: unknown): AtendimentoAction[] {
  if (!Array.isArray(value)) return [];

  const allowedKinds = new Set<AtendimentoAction["kind"]>(["copy_script", "copy_system", "open_config", "open_testing"]);
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const kind = String(entry.kind ?? entry.tipo ?? entry.action ?? "copy_script");
      return {
        title: normalizeReportLine(entry.title ?? entry.titulo ?? entry.label ?? "Ação", 80),
        description: normalizeReportLine(entry.description ?? entry.descricao ?? entry.text ?? "", 160),
        kind: (allowedKinds.has(kind as AtendimentoAction["kind"]) ? kind : "copy_script") as AtendimentoAction["kind"],
      };
    })
    .filter((item): item is AtendimentoAction => Boolean(item?.title || item?.description));
}

function buildScriptActionText(items: string[]): string {
  return items.join("\n");
}

function buildAutoEvidence(conversations: ConversationBundle[]): AtendimentoEvidence[] {
  const evidences: AtendimentoEvidence[] = [];

  for (const bundle of conversations) {
    const messages = bundle.messages.filter((message) => (message.bodyText ?? "").trim() || message.mediaUrl);
    if (messages.length === 0) continue;

    const inbound = messages.filter((message) => message.direction === "inbound");
    const outbound = messages.filter((message) => message.direction === "outbound");
    const firstInbound = inbound[0];
    const lastInbound = inbound[inbound.length - 1];
    const longestInbound = [...inbound].sort((left, right) => (right.bodyText?.length ?? 0) - (left.bodyText?.length ?? 0))[0];
    const latestOutbound = [...outbound].reverse().find((message) => (message.bodyText ?? "").trim() || message.mediaUrl);

    if (firstInbound) {
      evidences.push({
        title: `${bundle.chat.displayName} - abertura do cliente`,
        quote: shortenText(firstInbound.bodyText ?? firstInbound.mediaUrl ?? "[mensagem]", 180),
        impact: "Mostra como a conversa começou e qual foi a primeira demanda do cliente.",
      });
    }

    if (longestInbound && longestInbound !== firstInbound) {
      evidences.push({
        title: `${bundle.chat.displayName} - trecho mais informativo`,
        quote: shortenText(longestInbound.bodyText ?? longestInbound.mediaUrl ?? "[mensagem]", 180),
        impact: "Ajuda a identificar o contexto mais rico da conversa e o ponto de maior atrito ou necessidade.",
      });
    }

    if (lastInbound && lastInbound !== firstInbound) {
      evidences.push({
        title: `${bundle.chat.displayName} - última entrada do cliente`,
        quote: shortenText(lastInbound.bodyText ?? lastInbound.mediaUrl ?? "[mensagem]", 180),
        impact: "Mostra o último pedido ou objeção trazida pelo cliente antes do fechamento ou handoff.",
      });
    }

    if (latestOutbound) {
      evidences.push({
        title: `${bundle.chat.displayName} - última resposta do atendimento`,
        quote: shortenText(latestOutbound.bodyText ?? latestOutbound.mediaUrl ?? "[mensagem]", 180),
        impact: "Mostra a resposta mais recente do time ou da IA e ajuda a avaliar aderência ao script.",
      });
    }
  }

  const unique = new Map<string, AtendimentoEvidence>();
  for (const item of evidences) {
    const key = `${item.title}::${item.quote}`;
    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }

  return [...unique.values()].slice(0, 6);
}

function parseAtendimentoAnalysis(reply: string): AtendimentoAnalysis | null {
  const trimmed = reply.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch?.[0] ?? trimmed;

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const scoreRaw = Number(parsed.score ?? parsed.nota ?? 0);
    return {
      scope: String(parsed.scope ?? parsed.escopo ?? "conversation") === "period" ? "period" : "conversation",
      score: Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0,
      resumo: String(parsed.resumo ?? parsed.summary ?? "").trim(),
      pontosFortes: normalizeArray(parsed.pontos_fortes ?? parsed.pontosFortes ?? parsed.strengths),
      problemas: normalizeArray(parsed.problemas ?? parsed.issues),
      melhoriasScript: normalizeArray(parsed.melhorias_script ?? parsed.melhoriasScript),
      melhoriasSistema: normalizeArray(parsed.melhorias_sistema ?? parsed.melhoriasSistema),
      prioridadeProxima: normalizeArray(parsed.prioridade_proxima ?? parsed.prioridadeProxima ?? parsed.next_steps),
      conversas: normalizeConversationReports(parsed.conversas ?? parsed.conversation_reports ?? parsed.reports),
      evidencias: normalizeEvidenceReports(parsed.evidencias ?? parsed.evidence ?? parsed.trechos),
      acoes: normalizeActionReports(parsed.acoes ?? parsed.actions),
      raw: reply,
    };
  } catch {
    return null;
  }
}

function AnaliseAtendimentoTab({
  onOpenConfig,
  onOpenTesting,
}: {
  onOpenConfig: () => void;
  onOpenTesting: () => void;
}) {
  const { toast } = useToast();
  const { data: config } = useTenantAiConfig();
  const { data: inboxChats = [], isLoading: inboxChatsLoading } = useInboxChats({ limit: 500 });
  const [mode, setMode] = useState<AnalysisScope>("conversation");
  const [chatSearch, setChatSearch] = useState("");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [periodStart, setPeriodStart] = useState(() => toDateInputValue(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)));
  const [periodEnd, setPeriodEnd] = useState(() => toDateInputValue(new Date()));
  const [script, setScript] = useState(config?.systemPrompt ?? "");
  const [objetivo, setObjetivo] = useState("Quero um relatório direto, com score, resumo, problemas, ajustes no script e no sistema.");
  const [analysis, setAnalysis] = useState<AtendimentoAnalysis | null>(null);
  const [replyRaw, setReplyRaw] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(ANALYSIS_HISTORY_KEY);
      const parsed = raw ? (JSON.parse(raw) as AnalysisHistoryItem[]) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
    } catch {
      return [];
    }
  });

  const run = useRunPlayground({
    onError: (e) =>
      toast({ title: "Falha ao analisar atendimento", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (config?.systemPrompt && !script.trim()) {
      setScript(config.systemPrompt);
    }
  }, [config?.systemPrompt, script]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ANALYSIS_HISTORY_KEY, JSON.stringify(history.slice(0, 6)));
  }, [history]);

  const filteredChats = useMemo(() => {
    const search = chatSearch.trim().toLowerCase();
    if (!search) return inboxChats;
    return inboxChats.filter((chat) => {
      const haystack = [
        chat.displayName,
        chat.customerName ?? "",
        chat.remotePhoneE164 ?? "",
        chat.remotePhoneDigits ?? "",
        chat.instanceName,
        chat.assigneeName ?? "",
        chat.lastMessagePreview ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [chatSearch, inboxChats]);

  const selectedChat = useMemo(
    () => inboxChats.find((chat) => chat.id === selectedChatId) ?? null,
    [inboxChats, selectedChatId],
  );

  const { start: periodStartBound, end: periodEndBound } = useMemo(
    () => createDateBounds(periodStart, periodEnd),
    [periodEnd, periodStart],
  );

  const periodChats = useMemo(() => {
    return inboxChats
      .filter((chat) => isWithinBounds(chat.lastMessageAt, periodStartBound, periodEndBound))
      .sort((left, right) => new Date(right.lastMessageAt ?? 0).getTime() - new Date(left.lastMessageAt ?? 0).getTime());
  }, [inboxChats, periodEndBound, periodStartBound]);

  useEffect(() => {
    if (mode !== "conversation") return;
    if (filteredChats.length === 0) {
      if (selectedChatId) setSelectedChatId("");
      return;
    }
    if (!selectedChatId || !filteredChats.some((chat) => chat.id === selectedChatId)) {
      setSelectedChatId(filteredChats[0].id);
    }
  }, [filteredChats, mode, selectedChatId]);

  async function analyze() {
    const scriptText = script.trim() || config?.systemPrompt?.trim() || "Persona padrão da plataforma.";
    if (run.isPending || isAnalyzing) return;

    const chosenChats = mode === "conversation" ? (selectedChat ? [selectedChat] : []) : periodChats;
    if (chosenChats.length === 0) {
      toast({
        title: "Escolha o escopo",
        description:
          mode === "conversation"
            ? "Selecione uma conversa para gerar o relatório."
            : "Defina um período com conversas para analisar.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);

    try {
      const conversations: ConversationBundle[] = await Promise.all(
        chosenChats.map(async (chat) => {
          const allMessages = await fetchAllInboxMessages(chat.id);
          const scopedMessages =
            mode === "period"
              ? allMessages.filter((message) =>
                  isWithinBounds(message.createdAt ?? message.receivedAt ?? message.sentAt, periodStartBound, periodEndBound),
                )
              : allMessages;
          const messages = scopedMessages.length > 0 ? scopedMessages : allMessages.slice(-20);
          return { chat, messages };
        }),
      );
      const fallbackEvidence = buildAutoEvidence(conversations);

      const conversationTranscript = conversations
        .map(({ chat, messages }) => {
          const maxMessages = mode === "conversation" ? 60 : 24;
          const limited = messages.slice(-Math.min(messages.length, maxMessages));
          return [
            `CONVERSA: ${chat.displayName}`,
            `ID: ${chat.id}`,
            `INSTÂNCIA: ${chat.instanceName}`,
            `ÚLTIMA ATIVIDADE: ${formatDateTime(chat.lastMessageAt)}`,
            `MENSAGENS NO RECORTE: ${limited.length}`,
            "TRANSCRIÇÃO:",
            limited.map(formatMessageLine).join("\n"),
          ].join("\n");
        })
        .join("\n\n---\n\n");

      const prompt = [
        "Você é uma IA auditora de atendimento e operação.",
        "Gere um relatório executivo e objetivo com base no script e nas conversas abaixo.",
        "Retorne SOMENTE JSON válido, sem markdown e sem texto fora do JSON.",
        "Estrutura obrigatória:",
        '{ "scope": "conversation|period", "score": 0-100, "resumo": "texto curto", "pontos_fortes": ["..."], "problemas": ["..."], "melhorias_script": ["..."], "melhorias_sistema": ["..."], "prioridade_proxima": ["..."], "evidencias": [{ "title": "Título curto", "quote": "Trecho exato ou quase exato da conversa", "impact": "Por que isso importa" }], "acoes": [{ "title": "Ação", "description": "O que fazer agora", "kind": "copy_script|copy_system|open_config|open_testing" }], "conversas": [{ "chat_name": "Conversa", "score": 0-100, "resumo": "texto curto", "problema_principal": "texto curto", "ajuste_recomendado": "texto curto", "mensagens": 0 }] }',
        "Regras:",
        "- Seja direto, prático e sem floreio.",
        "- Escreva cada item em 1 frase curta, fácil de ler por humano.",
        "- Evite parágrafos longos e evite repetir a mesma ideia em várias linhas.",
        "- O score deve refletir a qualidade do atendimento e a aderência ao script.",
        "- As melhorias de sistema devem apontar mudanças no produto, fluxos, automações, telas, alertas ou campos.",
        "- As melhorias de script devem ajustar linguagem, sequência, perguntas, objeções, CTA e handoff.",
        "- Inclua evidências reais ou muito próximas do texto analisado sempre que possível.",
        "- Proponha ações pragmáticas que possam ser copiadas, ajustadas no sistema ou testadas imediatamente.",
        "- No modo período, compare as conversas e destaque padrões repetidos.",
        "- No modo conversa, a lista `conversas` deve conter apenas um item.",
        "",
        `ESCOPO: ${ANALYSIS_SCOPE_LABELS[mode]}`,
        `OBJETIVO: ${objetivo.trim() || "Gerar relatório operacional."}`,
        "",
        "SCRIPT DE REFERÊNCIA:",
        scriptText,
        "",
        "PERÍODO DE ANÁLISE:",
        mode === "period" ? `${periodStart || "—"} até ${periodEnd || "—"}` : "não se aplica",
        "",
        "CONVERSAS:",
        conversationTranscript,
      ].join("\n");

      const res = await run.mutateAsync([{ role: "user", text: prompt }]);
      setReplyRaw(res.reply || "");
      const parsed = parseAtendimentoAnalysis(res.reply || "");
      if (parsed) {
        setAnalysis({
          ...parsed,
          evidencias: parsed.evidencias.length > 0 ? parsed.evidencias : fallbackEvidence,
        });
        setHistory((current) => [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: new Date().toISOString(),
            scope: parsed.scope,
            score: parsed.score,
            summary: parsed.resumo,
            scopeLabel,
            chats: parsed.conversas.length || chatsInScope,
          },
          ...current,
        ].slice(0, 6));
        return;
      }

      setAnalysis({
        scope: mode,
        score: 0,
        resumo: "Não foi possível interpretar a resposta estruturada da IA. Veja o retorno bruto.",
        pontosFortes: [],
        problemas: [],
        melhoriasScript: [],
        melhoriasSistema: [],
        prioridadeProxima: [],
        conversas: [],
        evidencias: fallbackEvidence,
        acoes: [],
        raw: res.reply || "",
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  const scoreTone =
    analysis && analysis.score >= 80
      ? "emerald"
      : analysis && analysis.score >= 60
        ? "amber"
        : "rose";

  const selectedPeriodLabel = `${periodStart || "—"} até ${periodEnd || "—"}`;
  const scopeLabel =
    mode === "conversation"
      ? selectedChat
        ? `Conversa: ${selectedChat.displayName}`
        : "Conversa única"
      : `Período: ${selectedPeriodLabel}`;
  const chatsInScope = mode === "conversation" ? (selectedChat ? 1 : 0) : periodChats.length;
  const messagesInScope = analysis?.conversas.reduce((sum, item) => sum + item.mensagens, 0) ?? 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
            Análise de atendimento
          </CardTitle>
          <CardDescription className="text-xs">
            Escolha uma conversa ou um período, clique em analisar e leia o relatório com score, problemas e ajustes no script e no sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Objetivo do relatório</Label>
            <Input
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              placeholder="Ex.: reduzir atrito, melhorar conversão, revisar handoff"
              className="h-10 bg-background text-sm focus-visible:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Escopo da análise</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "conversation" ? "default" : "outline"}
                className="h-10 justify-start gap-2 text-xs"
                onClick={() => setMode("conversation")}
              >
                <MessageSquare className="h-4 w-4" />
                Conversa única
              </Button>
              <Button
                type="button"
                variant={mode === "period" ? "default" : "outline"}
                className="h-10 justify-start gap-2 text-xs"
                onClick={() => setMode("period")}
              >
                <Clock className="h-4 w-4" />
                Período
              </Button>
            </div>
          </div>

          {mode === "conversation" ? (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Conversa para analisar</Label>
              <Input
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Buscar conversa, cliente, telefone ou atendente"
                className="h-10 bg-background text-sm focus-visible:ring-primary/20"
              />
              <Select value={selectedChatId} onValueChange={setSelectedChatId}>
                <SelectTrigger className="h-10 bg-background text-sm">
                  <SelectValue placeholder={inboxChatsLoading ? "Carregando conversas..." : "Selecione uma conversa"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredChats.length > 0 ? (
                    filteredChats.map((chat) => (
                      <SelectItem key={chat.id} value={chat.id}>
                        <span className="block max-w-[260px] truncate">
                          {chat.displayName} · {formatDateTime(chat.lastMessageAt)}
                        </span>
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-4 text-xs text-muted-foreground">Nenhuma conversa encontrada.</div>
                  )}
                </SelectContent>
              </Select>
              {selectedChat ? (
                <div className="rounded-xl border border-border/60 bg-muted/15 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{selectedChat.displayName}</p>
                  <p className="mt-1">Última atividade: {formatDateTime(selectedChat.lastMessageAt)}</p>
                  <p>Instância: {selectedChat.instanceName}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Período</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="h-10 bg-background text-sm focus-visible:ring-primary/20"
                />
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="h-10 bg-background text-sm focus-visible:ring-primary/20"
                />
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/15 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{periodChats.length} conversas no período</p>
                <p className="mt-1">Janela: {selectedPeriodLabel}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Script de referência</Label>
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Cole aqui o script, regras de atendimento ou persona usada pelo time."
              className="min-h-[180px] bg-background text-sm leading-relaxed focus-visible:ring-primary/20"
            />
          </div>

          <Button
            onClick={() => void analyze()}
            disabled={isAnalyzing || run.isPending || (mode === "conversation" ? !selectedChat : periodChats.length === 0)}
            className="h-10 w-full text-sm font-medium"
          >
            {isAnalyzing || run.isPending ? "Gerando relatório..." : "Gerar relatório"}
          </Button>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A IA usa o script como referência e devolve um relatório direto com score, achados, ajustes no sistema e melhorias no roteiro.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <FileText className="h-4.5 w-4.5 text-primary" />
                Relatório de atendimento
              </CardTitle>
              <CardDescription className="text-xs">
                Leitura executiva do que aconteceu, onde está travando e o que ajustar no script e no sistema.
              </CardDescription>
            </div>
            <Badge
              className={cn(
                "w-fit border text-xs font-semibold",
                scoreTone === "emerald"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : scoreTone === "amber"
                    ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
              )}
            >
              {analysis ? `${analysis.score}/100` : "Sem análise"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {analysis ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border/60 bg-card p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Escopo</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{scopeLabel}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Conversas</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{analysis.conversas.length || chatsInScope}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mensagens</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{messagesInScope || "—"}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prioridade</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {analysis.prioridadeProxima[0] ?? "Sem prioridade definida"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Resumo executivo</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">{analysis.resumo || "—"}</p>
              </div>

              {analysis.evidencias.length > 0 ? (
                <div className="rounded-xl border border-border/60 bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Evidências</p>
                    <p className="text-[11px] text-muted-foreground">Trechos que sustentam o relatório</p>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {analysis.evidencias.map((item, index) => (
                      <div key={`${item.title}-${index}`} className="rounded-xl border border-border/60 bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">{item.title}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{item.impact || "Evidência extraída do atendimento analisado."}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(item.quote || "");
                                toast({ title: "Trecho copiado", description: item.title });
                              } catch {
                                toast({ title: "Não foi possível copiar", description: "Seu navegador bloqueou a área de transferência.", variant: "destructive" });
                              }
                            }}
                          >
                            Copiar trecho
                          </Button>
                        </div>
                        {item.quote ? (
                          <blockquote className="mt-3 rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 text-xs leading-relaxed text-foreground">
                            {item.quote}
                          </blockquote>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
                <ReportList title="Pontos fortes" items={analysis.pontosFortes} tone="emerald" />
                <ReportList title="Problemas encontrados" items={analysis.problemas} tone="rose" />
                <ReportList title="Ajustes no script" items={analysis.melhoriasScript} tone="primary" />
                <ReportList title="Ajustes no sistema" items={analysis.melhoriasSistema} tone="amber" />
              </div>

              <ReportList title="Próxima prioridade" items={analysis.prioridadeProxima} tone="secondary" />

              {analysis.acoes.length > 0 ? (
                <div className="rounded-xl border border-border/60 bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ações imediatas</p>
                    <p className="text-[11px] text-muted-foreground">Executar agora ou salvar para depois</p>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {analysis.acoes.map((item, index) => {
                      const actionTitle =
                        item.kind === "copy_script"
                          ? "Copiar para script"
                          : item.kind === "copy_system"
                            ? "Copiar para sistema"
                            : item.kind === "open_config"
                              ? "Abrir configuração"
                              : "Abrir testes";
                      return (
                        <div key={`${item.title}-${index}`} className="rounded-xl border border-border/60 bg-background p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-foreground">{item.title}</p>
                              <p className="text-xs leading-relaxed text-muted-foreground">{item.description || "Ação sugerida pela IA."}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={async () => {
                                  const text = `${item.title}\n${item.description}`.trim();
                                  try {
                                    await navigator.clipboard.writeText(text);
                                    toast({ title: "Ação copiada", description: item.title });
                                  } catch {
                                    toast({ title: "Não foi possível copiar", description: "Seu navegador bloqueou a área de transferência.", variant: "destructive" });
                                  }
                                }}
                              >
                                Copiar
                              </Button>
                              {item.kind === "open_config" ? (
                                <Button type="button" variant="default" size="sm" className="h-7 px-2 text-[11px]" onClick={onOpenConfig}>
                                  {actionTitle}
                                </Button>
                              ) : item.kind === "open_testing" ? (
                                <Button type="button" variant="default" size="sm" className="h-7 px-2 text-[11px]" onClick={onOpenTesting}>
                                  {actionTitle}
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="default"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(item.description || item.title);
                                      toast({ title: "Conteúdo copiado", description: item.title });
                                    } catch {
                                      toast({ title: "Não foi possível copiar", description: "Seu navegador bloqueou a área de transferência.", variant: "destructive" });
                                    }
                                  }}
                                >
                                  {actionTitle}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {analysis.conversas.length > 0 ? (
                <div className="rounded-xl border border-border/60 bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Conversas analisadas</p>
                    <p className="text-[11px] text-muted-foreground">
                      {analysis.scope === "period"
                        ? "Padrões recorrentes do período"
                        : "Leitura detalhada da conversa escolhida"}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {analysis.conversas.map((item) => (
                      <div key={item.chatName} className="rounded-xl border border-border/60 bg-background p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">{item.chatName}</p>
                            <p className="text-xs text-muted-foreground">{item.resumo || "Sem resumo informado."}</p>
                          </div>
                          <Badge variant="outline" className="text-[11px] font-semibold">
                            {item.score}/100
                          </Badge>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                          <div>
                            <p className="font-semibold text-foreground">Problema principal</p>
                            <p className="mt-1 leading-relaxed">{item.problemaPrincipal || "—"}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">Ajuste recomendado</p>
                            <p className="mt-1 leading-relaxed">{item.ajusteRecomendado || "—"}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">{item.mensagens} mensagens no recorte</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {replyRaw ? (
                <details className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Ver resposta bruta da IA</summary>
                  <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                    {replyRaw}
                  </pre>
                </details>
              ) : null}

              {history.length > 0 ? (
                <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Histórico recente</p>
                    <p className="text-[11px] text-muted-foreground">Últimos relatórios gerados</p>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {history.map((item) => (
                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{item.summary}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.scopeLabel} · {item.chats} conversa(s) · {formatDateTime(item.createdAt)}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[11px] font-semibold">
                          {item.score}/100
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-6">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-foreground">Relatório ainda não gerado</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Escolha uma conversa ou um período, clique em <span className="font-medium text-foreground">Gerar relatório</span> e a IA devolve os ajustes do script e do sistema.
                </p>
                <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-background p-3">1. Defina o escopo.</div>
                  <div className="rounded-lg border border-border/60 bg-background p-3">2. Revise o script base.</div>
                  <div className="rounded-lg border border-border/60 bg-background p-3">3. Clique para analisar.</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "rose" | "primary" | "amber" | "secondary";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : tone === "rose"
        ? "border-rose-500/20 bg-rose-500/5"
        : tone === "amber"
          ? "border-amber-500/20 bg-amber-500/5"
          : tone === "primary"
            ? "border-primary/20 bg-primary/[0.04]"
            : "border-border/60 bg-card";

  return (
    <div className={cn("rounded-xl border p-4", toneClass)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-sm text-foreground">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Sem itens sugeridos.</p>
      )}
    </div>
  );
}

type ChatMsg = PlaygroundMessage & { knowledgeCount?: number };

function TestarTab() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");

  const { data: config } = useTenantAiConfig();
  const { data: sources = [] } = useKnowledgeSources();

  const run = useRunPlayground({
    onError: (e) => toast({ title: "Falha ao testar", description: e.message, variant: "destructive" }),
  });

  async function send() {
    const text = input.trim();
    if (!text || run.isPending) return;
    const next: ChatMsg[] = [...messages, { role: "user", text }];
    setMessages(next);
    setInput("");
    try {
      const res = await run.mutateAsync(next.map(({ role, text }) => ({ role, text })));
      setMessages([
        ...next,
        { role: "assistant", text: res.reply || "(a IA não retornou texto)", knowledgeCount: res.knowledge_count },
      ]);
    } catch {
      // erro já tratado
    }
  }

  const activeModelName = config ? shortModelName(config.model) : "—";
  const systemPromptPreview = config?.systemPrompt
    ? config.systemPrompt.slice(0, 160) + (config.systemPrompt.length > 160 ? "..." : "")
    : "Persona padrão da plataforma.";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Lado Esquerdo: Simulador de Chat (2/3) */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="border-border/80 shadow-sm overflow-hidden flex flex-col h-[520px]">
          {/* Cabeçalho do Chat */}
          <div className="border-b border-border/40 bg-muted/20 px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/15 shadow-inner">
                  <Bot className="h-4.5 w-4.5" />
                </div>
                <span className="absolute bottom-0 right-0 flex h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">Simulador do Agente IA</p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {run.isPending ? "digitando..." : "online"}
                </p>
              </div>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMessages([])}
                className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5 rounded-md hover:bg-muted/50"
              >
                Limpar conversa
              </Button>
            )}
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/[0.05]">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-3">
                <div className="h-10 w-10 rounded-full border border-border/60 bg-muted/30 flex items-center justify-center text-muted-foreground">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">Inicie o Teste</p>
                  <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
                    Escreva uma mensagem simulando ser o seu cliente. A IA responderá com base na persona e documentos configurados.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={cn("flex flex-col max-w-[85%]", m.role === "user" ? "ml-auto items-end" : "mr-auto items-start")}>
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-card border border-border/80 text-foreground rounded-tl-none"
                    )}
                  >
                    {m.text}
                  </div>
                  {m.role === "assistant" && m.knowledgeCount !== undefined ? (
                    <span className="mt-1 px-1.5 text-[9px] text-muted-foreground font-medium bg-muted/30 rounded px-1.5 py-0.5">
                      {m.knowledgeCount > 0
                        ? `Consultou a base: ${m.knowledgeCount} trecho${m.knowledgeCount > 1 ? "s" : ""}`
                        : "Sem consulta à base"}
                    </span>
                  ) : null}
                </div>
              ))
            )}
            {run.isPending && (
              <div className="flex items-center gap-2.5 max-w-[80%] mr-auto">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/15 text-[10px] font-semibold animate-bounce">
                  AI
                </div>
                <div className="rounded-2xl rounded-tl-none bg-muted/20 border border-border/40 px-3.5 py-2 text-xs text-muted-foreground italic flex items-center gap-1">
                  <span className="animate-pulse">escrevendo...</span>
                </div>
              </div>
            )}
          </div>

          {/* Rodapé: Input */}
          <div className="border-t border-border/40 bg-card p-3 shrink-0 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Digite aqui para testar..."
              disabled={run.isPending}
              className="flex-1 focus-visible:ring-primary/20 bg-background text-xs h-9.5"
            />
            <Button
              onClick={() => void send()}
              disabled={!input.trim() || run.isPending}
              className="h-9.5 w-9.5 shrink-0 bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm"
              size="icon"
              aria-label="Enviar"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>

      {/* Lado Direito: Contexto Técnico de Depuração (1/3) */}
      <div className="space-y-6">
        <Card className="border-border/80 shadow-sm h-full">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Cpu className="h-4.5 w-4.5 text-primary" />
              Contexto do Agente
            </CardTitle>
            <CardDescription className="text-xs">
              Configurações ativas que regem o comportamento da IA neste simulador.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-xs">
            <div className="space-y-1.5">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Persona e Tom de Voz</span>
              <div className="rounded-lg border border-border/40 bg-muted/10 p-3 leading-relaxed text-muted-foreground italic font-sans text-xs">
                "{systemPromptPreview}"
              </div>
              <p className="text-[10px] text-muted-foreground text-right">
                Ajuste na aba <span className="font-medium text-primary">Configuração</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Treinamento / Base de Dados</span>
              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5">
                <span className="font-medium">Fontes ativas no sistema:</span>
                <Badge className="bg-primary/10 hover:bg-primary/10 text-primary border-primary/15 font-semibold text-xs px-2.5">
                  {sources.length} documento(s)
                </Badge>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-border/20 pt-3">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Recursos Avançados</span>
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-[11px] bg-muted/5 p-2 rounded-lg border">
                  <span className="text-muted-foreground">Roteamento Inteligente:</span>
                  <Badge variant="outline" className={cn("text-[9px] h-4 font-semibold", config?.enableModelRouting ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/10" : "bg-muted text-muted-foreground")}>
                    {config?.enableModelRouting ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-[11px] bg-muted/5 p-2 rounded-lg border">
                  <span className="text-muted-foreground">Thinking (Pensamento):</span>
                  <Badge variant="outline" className={cn("text-[9px] h-4 font-semibold", config?.enableThinking ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/10" : "bg-muted text-muted-foreground")}>
                    {config?.enableThinking ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OnboardingChecklist({ onGo }: { onGo: (tab: string) => void }) {
  const { data: config } = useTenantAiConfig();
  const { data: sources = [] } = useKnowledgeSources();
  const { data: channels = [] } = useAiChannels();
  const { data: sub, isSuccess: subLoaded } = useAiSubscription();

  const trialExpired = sub?.trialEndsAt ? new Date(sub.trialEndsAt) <= new Date() : false;
  const addonInactive = subLoaded && (!sub || !sub.active || trialExpired);

  const steps = [
    {
      key: "persona",
      label: "Personalize a IA",
      desc: "Defina o tom de voz e as regras de negócio da IA.",
      done: Boolean(config?.systemPrompt?.trim()),
      tab: "configuracao",
      icon: Sparkles,
    },
    {
      key: "kb",
      label: "Alimente a base de conhecimento",
      desc: "Envie textos, links ou PDFs para a IA responder com precisão.",
      done: sources.length > 0,
      tab: "conhecimento",
      icon: BookOpen,
    },
    {
      key: "channel",
      label: "Ligue a IA num canal",
      desc: "Ative a IA no canal de WhatsApp para iniciar o atendimento.",
      done: channels.some((c) => c.ai_enabled),
      tab: "canais",
      icon: Radio,
    },
  ];
  const allDone = steps.every((s) => s.done);
  const doneCount = steps.filter((s) => s.done).length;

  if (allDone && !addonInactive) return null;

  return (
    <Card className={cn("overflow-hidden border border-border/80 shadow-sm", addonInactive ? "border-destructive/40 bg-destructive/5" : "bg-card")}>
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4.5 w-4.5 text-primary" />
              Primeiros Passos de Configuração
            </CardTitle>
            <CardDescription className="text-xs">
              Deixe sua Inteligência Artificial pronta para atuar em 3 passos simples.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium bg-muted/55 rounded-lg px-2.5 py-1 w-fit">
            <span className="text-primary font-semibold">{doneCount} de 3</span>
            <span className="text-muted-foreground">concluídos</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        {addonInactive ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Seu add-on de IA está inativo{trialExpired ? " (trial expirado)" : ""}.</p>
              <p className="text-destructive/80">Por favor, entre em contato com o suporte para ativar o faturamento e restabelecer o serviço.</p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.key}
                className={cn(
                  "relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-300",
                  step.done
                    ? "border-border/60 bg-muted/20 opacity-80"
                    : "border-primary/20 bg-primary/[0.01] hover:bg-primary/[0.03] shadow-sm hover:border-primary/35"
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shadow-sm border",
                      step.done
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/10"
                        : "bg-primary/10 text-primary border-primary/10"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {step.done ? (
                      <Badge className="bg-emerald-500/10 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px] px-1.5 py-0">
                        Pronto
                      </Badge>
                    ) : (
                      <span className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider">Passo {i + 1}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className={cn("text-xs font-semibold tracking-tight", step.done ? "text-muted-foreground line-through" : "text-foreground")}>
                      {step.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                </div>

                {!step.done ? (
                  <Button
                    size="sm"
                    className="mt-4 w-full text-xs font-medium flex items-center justify-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm h-8"
                    onClick={() => onGo(step.tab)}
                  >
                    Configurar
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                ) : (
                  <div className="mt-4 h-8 flex items-center text-xs font-medium text-emerald-600 gap-1 pl-1">
                    <Check className="h-3.5 w-3.5" />
                    Etapa concluída
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfiguracaoTab() {
  const { toast } = useToast();
  const { data, isLoading } = useTenantAiConfig();
  const upsert = useUpsertTenantAiConfig({
    onSuccess: () => toast({ title: "Configuração salva com sucesso!" }),
    onError: (error) => toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }),
  });
  const [form, setForm] = useState<TenantAiConfig | null>(null);
  const [activeSection, setActiveSection] = useState<"persona" | "lgpd" | "provider" | "control" | "smart">("persona");

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form) {
    return <LoadingCard />;
  }

  const set = (patch: Partial<TenantAiConfig>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  const currentLength = form.systemPrompt?.length ?? 0;

  const TEMPLATES = {
    geral: "Você é o assistente virtual cordial e profissional da nossa empresa. Responda às perguntas dos clientes de forma objetiva, simpática e profissional. Utilize apenas as informações da base de conhecimento para responder. Se não souber a resposta ou se o cliente solicitar um atendente humano, informe que irá encaminhá-lo para a nossa equipe de suporte.",
    vendas: "Você é um especialista em vendas engajador. Ajude o cliente a encontrar o produto perfeito na nossa loja, explique as vantagens e formas de pagamento. Seja persuasivo, cordial e use emojis moderadamente para criar conexão. Conduza o cliente até o link de checkout de maneira natural.",
    suporte: "Você é o agente de suporte técnico de nível 1. Ajude o cliente a resolver problemas com paciência e clareza, orientando-o passo a passo. Faça perguntas de esclarecimento se necessário e consulte sempre as políticas e manuais da base de conhecimento.",
  };

  const menu = [
    { id: "persona", label: "Persona / Instruções", icon: Sparkles },
    { id: "lgpd", label: "Transparência e Avisos", icon: Info },
    { id: "provider", label: "Provedor & Conexão", icon: Cpu },
    { id: "control", label: "Configurações de Controle", icon: SlidersHorizontal },
    { id: "smart", label: "Recursos Inteligentes", icon: Layers },
  ] as const;

  const sectionStyles = "border-border/70 shadow-sm";

  const content =
    activeSection === "persona" ? (
      <Card className={sectionStyles}>
        <CardHeader className="px-5 pb-3 pt-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="h-4.5 w-4.5 text-primary" />
                Persona / Instruções do Agente
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Molde o tom de voz, regras de atendimento e como a IA deve se comportar.
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] bg-muted/30 border-border/60 hover:bg-muted" onClick={() => set({ systemPrompt: TEMPLATES.geral })}>Geral</Button>
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] bg-muted/30 border-border/60 hover:bg-muted" onClick={() => set({ systemPrompt: TEMPLATES.vendas })}>Vendas</Button>
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] bg-muted/30 border-border/60 hover:bg-muted" onClick={() => set({ systemPrompt: TEMPLATES.suporte })}>Suporte</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5">
          <div className="space-y-2">
            <Textarea
              id="ai-persona"
              value={form.systemPrompt}
              onChange={(e) => set({ systemPrompt: e.target.value })}
              placeholder="Ex.: Você é a Ana, atendente virtual da nossa loja. Responda sempre com cordialidade e simplicidade..."
              className="min-h-[168px] font-sans text-sm leading-relaxed border-border focus-visible:ring-primary/30 md:min-h-[190px]"
            />
            <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
              <span>Em branco usará a persona padrão da plataforma.</span>
              <span className={cn("font-medium", currentLength > 4000 ? "text-destructive" : "text-muted-foreground")}>{currentLength} caracteres</span>
            </div>
          </div>
        </CardContent>
      </Card>
    ) : activeSection === "lgpd" ? (
      <Card className={sectionStyles}>
        <CardHeader className="px-5 pb-3 pt-5">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Info className="h-4.5 w-4.5 text-primary" />
            Transparência e Avisos (LGPD)
          </CardTitle>
          <CardDescription className="text-xs">
            Notifique o cliente de forma clara que ele está interagindo com um robô inteligente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-muted/10 p-4">
            <div className="min-w-0 space-y-0.5">
              <span className="text-sm font-semibold text-foreground">Divulgação de IA ativa</span>
              <p className="text-xs text-muted-foreground">Envia um aviso automático no início do primeiro atendimento para cada cliente.</p>
            </div>
            <Switch checked={form.disclosureEnabled} onCheckedChange={(v) => set({ disclosureEnabled: v })} />
          </div>
          {form.disclosureEnabled && (
            <div className="space-y-2 animate-accordion-down">
              <Label htmlFor="ai-disclosure-msg" className="text-xs font-semibold text-muted-foreground">Mensagem de aviso customizada</Label>
              <Textarea
                id="ai-disclosure-msg"
                value={form.disclosureMessage}
                onChange={(e) => set({ disclosureMessage: e.target.value })}
                placeholder="Olá! Você está sendo atendido por um assistente virtual com IA. Se preferir falar com um humano, é só solicitar."
                className="min-h-[80px] text-sm focus-visible:ring-primary/30"
                rows={3}
              />
              <p className="text-[10px] text-muted-foreground">Deixe em branco para usar a mensagem padrão do sistema.</p>
            </div>
          )}
        </CardContent>
      </Card>
    ) : activeSection === "provider" ? (
      <Card className={sectionStyles}>
        <CardHeader className="px-5 pb-3 pt-5">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Cpu className="h-4.5 w-4.5 text-primary" />
            Provedor & Conexão
          </CardTitle>
          <CardDescription className="text-xs">
            Defina o cérebro do agente e onde as mensagens serão processadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Modo de atuação</Label>
            <Select value={form.provider} onValueChange={(v) => set({ provider: v as AiProvider })}>
              <SelectTrigger className="h-10 w-full border-border/85 bg-background text-sm focus:ring-primary/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{PROVIDER_LABELS.off}</SelectItem>
                <SelectItem value="native">{PROVIDER_LABELS.native}</SelectItem>
                <SelectItem value="n8n">{PROVIDER_LABELS.n8n}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground leading-normal"><strong>Nativa</strong> processa no AdvocaCHAT. <strong>Externa</strong> envia para n8n.</p>
          </div>
        </CardContent>
      </Card>
    ) : activeSection === "control" ? (
      <Card className={sectionStyles}>
        <CardHeader className="px-5 pb-3 pt-5">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <SlidersHorizontal className="h-4.5 w-4.5 text-primary" />
            Configurações de Controle
          </CardTitle>
          <CardDescription className="text-xs">
            Ajuste os limites operacionais e tempo de resposta.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5 sm:grid-cols-3 xl:grid-cols-1">
          <div className="space-y-2">
            <Label htmlFor="ai-debounce" className="text-xs font-semibold flex items-center gap-1.5">
              Tempo de Espera (s)
              <span title="Tempo que a IA aguarda novas mensagens do cliente antes de responder (evita respostas picadas).">
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            </Label>
            <Input id="ai-debounce" type="number" min={0} max={120} value={form.debounceSeconds} onChange={(e) => set({ debounceSeconds: Number(e.target.value) })} className="h-10 bg-background focus-visible:ring-primary/20" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-maxtokens" className="text-xs font-semibold flex items-center gap-1.5">
              Máximo de Tokens/Resp
              <span title="Tamanho máximo aproximado que cada resposta da IA pode conter (previne respostas excessivamente longas).">
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            </Label>
            <Input id="ai-maxtokens" type="number" min={256} max={8192} value={form.maxOutputTokens} onChange={(e) => set({ maxOutputTokens: Number(e.target.value) })} className="h-10 bg-background focus-visible:ring-primary/20" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-limit" className="text-xs font-semibold flex items-center gap-1.5">
              Teto Mensal de Tokens
              <span title="Limite de tokens mensal auto-imposto para controlar custos extras.">
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            </Label>
            <Input id="ai-limit" type="number" min={0} value={form.monthlyTokenLimit ?? ""} onChange={(e) => set({ monthlyTokenLimit: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Sem limite" className="h-10 bg-background focus-visible:ring-primary/20" />
          </div>
        </CardContent>
      </Card>
    ) : (
      <Card className={sectionStyles}>
        <CardHeader className="px-5 pb-3 pt-5">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
            Recursos Inteligentes
          </CardTitle>
          <CardDescription className="text-xs">
            Aumente a eficiência e reduza custos com roteamento dinâmico.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5">
          {form.llmProvider === "anthropic" && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/10 p-3">
              <div className="space-y-0.5 min-w-0 flex-1">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1">Roteamento Dinâmico</span>
                <p className="text-[10px] text-muted-foreground leading-normal">Mensagens simples (ex: "ok", "obrigado") usam o Claude Haiku (até 6x mais barato) em vez do modelo principal.</p>
              </div>
              <Switch checked={form.enableModelRouting} onCheckedChange={(v) => set({ enableModelRouting: v })} className="mt-0.5 scale-90" />
            </div>
          )}
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/10 p-3">
            <div className="space-y-0.5 min-w-0 flex-1">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1">Pensamento Adaptativo</span>
              <p className="text-[10px] text-muted-foreground leading-normal">IA reflete e raciocina antes de responder a perguntas complexas da base de conhecimento (adiciona +2-5s de latência).</p>
            </div>
            <Switch checked={form.enableThinking} onCheckedChange={(v) => set({ enableThinking: v })} className="mt-0.5 scale-90" />
          </div>
        </CardContent>
      </Card>
    );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        {content}
        <div className="flex items-center justify-end border-t border-border/70 bg-background py-3">
          <Button onClick={() => upsert.mutate(form)} disabled={upsert.isPending} className="px-6 font-semibold shadow-sm bg-primary hover:bg-primary/95 text-primary-foreground min-w-[150px]">
            {upsert.isPending ? "Salvando configurações..." : "Salvar Configuração"}
          </Button>
        </div>
      </div>

      <aside className="h-fit xl:sticky xl:top-4">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4.5 w-4.5 text-primary" />
              Seções desta aba
            </CardTitle>
            <CardDescription className="text-xs">
              Clique em uma opção para trocar o bloco exibido.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {menu.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <Button
                  key={item.id}
                  variant={active ? "secondary" : "ghost"}
                  className="h-9 justify-start gap-2 px-3 text-xs font-medium"
                  onClick={() => setActiveSection(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
function ConhecimentoTab() {
  const { toast } = useToast();
  const { data: sources = [], isLoading, isError, error } = useKnowledgeSources();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [kbAddTab, setKbAddTab] = useState("manual");
  const fileRef = useRef<HTMLInputElement>(null);

  const add = useAddKnowledgeSource({
    onSuccess: () => {
      toast({ title: "Conteúdo adicionado à base." });
      setTitle("");
      setContent("");
    },
    onError: (e) => toast({ title: "Não foi possível adicionar", description: e.message, variant: "destructive" }),
  });
  const importUrl = useImportKnowledgeUrl({
    onSuccess: () => {
      toast({ title: "Página importada para a base." });
      setUrl("");
    },
    onError: (e) => toast({ title: "Não foi possível importar", description: e.message, variant: "destructive" }),
  });
  const del = useDeleteKnowledgeSource({
    onError: (e) => toast({ title: "Não foi possível remover", description: e.message, variant: "destructive" }),
  });

  async function handlePdf(file: File) {
    setPdfLoading(true);
    try {
      const text = await extractPdfText(file);
      if (!text.trim()) {
        toast({
          title: "PDF sem texto extraível",
          description: "Pode ser um PDF escaneado (imagem). Tente colar o texto manualmente.",
          variant: "destructive",
        });
        return;
      }
      await add.mutateAsync({ title: file.name.replace(/\.pdf$/i, ""), content: text });
      toast({ title: "PDF importado com sucesso!" });
    } catch (e) {
      toast({
        title: "Não foi possível ler o PDF",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setPdfLoading(false);
    }
  }

  const filteredSources = sources.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Coluna de Adicionar Conteúdo (1/3) */}
      <div className="space-y-6 md:col-span-1">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Plus className="h-4.5 w-4.5 text-primary" />
              Alimentar Base
            </CardTitle>
            <CardDescription className="text-xs">
              Adicione textos, links ou documentos para treinar a IA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={kbAddTab} onValueChange={setKbAddTab} className="w-full">
              <TabsList className="grid grid-cols-2 h-9 w-full bg-muted/40 p-0.5 rounded-lg border border-border/40 mb-4">
                <TabsTrigger value="manual" className="text-xs rounded-md">
                  Texto Manual
                </TabsTrigger>
                <TabsTrigger value="import" className="text-xs rounded-md">
                  Página / PDF
                </TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="space-y-3 mt-0 focus-visible:outline-none">
                <div className="space-y-1.5">
                  <Label htmlFor="kb-title" className="text-xs font-semibold">Título da Fonte</Label>
                  <Input
                    id="kb-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex.: Política de Devolução"
                    className="focus-visible:ring-primary/20 bg-background text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kb-content" className="text-xs font-semibold">Texto informativo</Label>
                  <Textarea
                    id="kb-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Escreva ou cole aqui as informações que a IA deve aprender..."
                    className="min-h-[160px] text-xs focus-visible:ring-primary/20 bg-background"
                    rows={6}
                  />
                </div>
                <Button
                  onClick={() => add.mutate({ title: title.trim(), content: content.trim() })}
                  disabled={!title.trim() || !content.trim() || add.isPending}
                  className="w-full font-semibold bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm h-9 text-xs"
                >
                  {add.isPending ? "Salvando..." : "Adicionar à Base"}
                </Button>
              </TabsContent>

              <TabsContent value="import" className="space-y-4 mt-0 focus-visible:outline-none">
                <div className="space-y-2 border-b border-border/40 pb-4">
                  <Label className="text-xs font-semibold">Importar URL de FAQ/Site</Label>
                  <div className="flex gap-2">
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://seusite.com/faq"
                      className="flex-1 focus-visible:ring-primary/20 bg-background h-9 text-xs"
                    />
                    <Button
                      onClick={() => importUrl.mutate(url.trim())}
                      disabled={!url.trim() || importUrl.isPending}
                      className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold h-9 text-xs"
                    >
                      {importUrl.isPending ? "Lendo..." : "Importar"}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    A IA visitará a página e extrairá o texto útil para a base de conhecimento.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Upload de arquivo PDF</Label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handlePdf(file);
                      e.target.value = "";
                    }}
                  />
                  <div
                    onClick={() => !pdfLoading && !add.isPending && fileRef.current?.click()}
                    className={cn(
                      "flex flex-col items-center justify-center border-2 border-dashed border-border/70 hover:border-primary/50 bg-muted/10 hover:bg-primary/[0.01] rounded-xl p-4 cursor-pointer transition-all gap-2 text-center",
                      (pdfLoading || add.isPending) && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <UploadCloud className="h-8 w-8 text-primary/70 animate-pulse-soft" />
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-foreground">
                        {pdfLoading ? "Processando arquivo..." : "Clique para selecionar PDF"}
                      </span>
                      <p className="text-[10px] text-muted-foreground">PDFs apenas com texto legível</p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Coluna da Lista de Documentos (2/3) */}
      <div className="md:col-span-2 space-y-6">
        <Card className="border-border/80 shadow-sm h-full flex flex-col">
          <CardHeader className="pb-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BookOpen className="h-4.5 w-4.5 text-primary" />
                Fontes de Conhecimento Ativas
              </CardTitle>
              <CardDescription className="text-xs">
                {sources.length} documento(s) cadastrados na inteligência artificial.
              </CardDescription>
            </div>
            {sources.length > 0 && (
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar fontes..."
                  className="pl-8 h-8.5 bg-background border-border/80 text-xs focus-visible:ring-primary/20"
                />
              </div>
            )}
          </CardHeader>
          <CardContent className="pt-4 flex-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground text-sm">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                Carregando documentos...
              </div>
            ) : isError ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error?.message ?? "Falha ao carregar a base de conhecimento."}
              </div>
            ) : filteredSources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center border rounded-xl border-dashed border-border/80 bg-muted/5">
                <FileText className="h-10 w-10 text-muted-foreground/60" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Nenhuma fonte encontrada</p>
                  <p className="text-xs text-muted-foreground max-w-sm px-4">
                    {search ? "Nenhuma fonte corresponde aos critérios da busca." : "Alimente a inteligência com manuais, FAQs e informações no painel ao lado."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredSources.map((source) => {
                  const isPdf = source.title.toLowerCase().endsWith(".pdf") || source.kind === "pdf";
                  const isUrl = source.title.toLowerCase().startsWith("http") || source.kind === "url";
                  const SourceIcon = isPdf ? FileText : isUrl ? Globe : FileText;

                  return (
                    <div
                      key={source.id}
                      className="group relative flex items-start gap-3 rounded-xl border border-border/70 p-3 bg-muted/5 hover:bg-muted/15 transition-all shadow-sm hover:border-primary/25"
                    >
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                        isPdf ? "bg-red-500/10 text-red-600 border-red-500/15" :
                        isUrl ? "bg-blue-500/10 text-blue-600 border-blue-500/15" :
                        "bg-primary/10 text-primary border-primary/15"
                      )}>
                        <SourceIcon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1 pr-6">
                        <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors" title={source.title}>
                          {source.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(source.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all rounded-md"
                        onClick={() => del.mutate(source.id)}
                        disabled={del.isPending}
                        aria-label={`Remover ${source.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CanaisTab() {
  const { data: channels = [], isLoading, isError, error } = useAiChannels();
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-4 border-b border-border/40">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Radio className="h-4.5 w-4.5 text-primary animate-pulse-soft" />
          Canais de Atendimento WhatsApp
        </CardTitle>
        <CardDescription className="text-xs">
          Ligue ou desligue a IA por canal de atendimento. Canais ativos respondem automaticamente a conversas novas.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground text-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            Carregando canais...
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error?.message ?? "Falha ao carregar canais."}
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border rounded-xl border-dashed border-border/80 bg-muted/5">
            <Radio className="h-10 w-10 text-muted-foreground/60 mb-2" />
            <p className="text-sm font-semibold text-foreground">Nenhum canal de WhatsApp conectado</p>
            <p className="text-xs text-muted-foreground max-w-sm px-4">
              Conecte um canal de WhatsApp nas configurações do sistema para poder ativar a IA.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {channels.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelCard({ channel }: { channel: AiChannel }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(channel.ai_enabled);
  const [mode, setMode] = useState<AiDefaultMode>(channel.ai_default_mode);
  const [persona, setPersona] = useState(channel.ai_persona ?? "");

  const update = useUpdateAiChannel({
    onSuccess: () => toast({ title: "Canal atualizado com sucesso!" }),
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });

  const dirty =
    enabled !== channel.ai_enabled ||
    mode !== channel.ai_default_mode ||
    persona.trim() !== (channel.ai_persona ?? "");

  const isConnected = channel.status?.toLowerCase() === "connected";

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-300 flex flex-col justify-between shadow-sm p-4 bg-muted/5",
        enabled
          ? "border-primary/30 bg-primary/[0.01] hover:border-primary/45"
          : "border-border/80 hover:border-border/100"
      )}
    >
      <div className="space-y-4">
        {/* Header do Card */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm truncate text-foreground" title={channel.display_name}>
                {channel.display_name}
              </span>
              <span className={cn("inline-flex h-2 w-2 rounded-full", isConnected ? "bg-emerald-500" : "bg-red-500")} />
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">
              {channel.phone_number || "sem número"}
            </p>
          </div>

          <div className="flex items-center gap-2 border border-border/40 rounded-lg bg-card px-2 py-1 shadow-sm shrink-0">
            <span className="text-[11px] font-medium text-muted-foreground">IA Ativa</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} className="scale-75" />
          </div>
        </div>

        {/* Campos Condicionais se IA estiver habilitada */}
        {enabled && (
          <div className="space-y-3 pt-3 border-t border-border/40 animate-accordion-down">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                Modo de atuação inicial
                <span title="Qualificando: Apenas faz as perguntas de cadastro. Completo: Conversa livremente respondendo da base de conhecimento.">
                  <HelpCircle className="h-3 w-3 text-muted-foreground/80" />
                </span>
              </Label>
              <Select value={mode} onValueChange={(v) => setMode(v as AiDefaultMode)}>
                <SelectTrigger className="w-full bg-background border-border/80 text-xs h-8.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualifying" className="text-xs">Qualificação (cadastro inicial)</SelectItem>
                  <SelectItem value="full" className="text-xs">Completo (atendimento livre)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-muted-foreground">Persona Customizada (opcional)</Label>
              <Textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="Exclusivo para este canal. Em branco usa a persona global das configurações."
                className="text-xs min-h-[90px] resize-y bg-background focus-visible:ring-primary/20"
                rows={3}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/30 pt-3">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          {enabled ? (
            <Badge className="bg-primary/10 hover:bg-primary/10 text-primary border-primary/15 text-[9px] px-1.5 py-0 font-normal">
              Respondendo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground border-border/60 text-[9px] px-1.5 py-0 font-normal">
              Desativado
            </Badge>
          )}
        </span>
        <Button
          size="sm"
          className="text-xs font-semibold h-8 bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm px-3"
          disabled={!dirty || update.isPending}
          onClick={() =>
            update.mutate({
              id: channel.id,
              patch: { ai_enabled: enabled, ai_default_mode: mode, ai_persona: persona.trim() || null },
            })
          }
        >
          {update.isPending ? "Salvando..." : "Salvar Canal"}
        </Button>
      </div>
    </div>
  );
}

function AtividadeTab() {
  const { data, isLoading } = useAiUsageThisMonth();
  const { data: config } = useTenantAiConfig();
  const { data: sub } = useAiSubscription();

  if (isLoading || !data) {
    return <LoadingCard />;
  }

  const totalTokens = data.inputTokens + data.outputTokens;
  const planQuota = sub?.active && sub.monthlyTokenQuota > 0 && !sub.overageAllowed ? sub.monthlyTokenQuota : null;
  const selfLimit = config?.monthlyTokenLimit && config.monthlyTokenLimit > 0 ? config.monthlyTokenLimit : null;
  const candidates = [planQuota, selfLimit].filter((v): v is number => v != null);
  const limit = candidates.length > 0 ? Math.min(...candidates) : null;
  const quotaPct = limit ? Math.round((totalTokens / limit) * 100) : null;

  const stats = [
    {
      label: "Custo Estimado (mês)",
      value: data.costUsd.toLocaleString("pt-BR", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: data.costUsd < 1 ? 4 : 2,
      }),
      icon: Coins,
      desc: "Com base no uso de tokens",
      color: "text-primary bg-primary/10",
    },
    {
      label: "Turnos da IA",
      value: nf(data.messages),
      icon: MessageSquare,
      desc: "Respostas geradas",
      color: "text-blue-600 bg-blue-500/10",
    },
    {
      label: "Tokens de Entrada",
      value: nf(data.inputTokens),
      icon: Layers,
      desc: "Contexto enviado",
      color: "text-amber-600 bg-amber-500/10",
    },
    {
      label: "Tokens de Saída",
      value: nf(data.outputTokens),
      icon: Send,
      desc: "Respostas geradas",
      color: "text-emerald-600 bg-emerald-500/10",
    },
    {
      label: "Cache Lido",
      value: nf(data.cacheReadTokens),
      icon: Sparkles,
      desc: "Tokens economizados",
      color: "text-violet-600 bg-violet-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Informações da Assinatura / Add-on */}
      {sub && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-sm text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Status do Add-on:</span>
            {(() => {
              const trialDate = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
              const trialExpired = trialDate ? trialDate <= new Date() : false;
              const effectiveActive = sub.active && !trialExpired;
              return (
                <Badge
                  variant="outline"
                  className={cn(
                    "font-semibold text-[10px] px-2 py-0.5",
                    effectiveActive
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                      : "bg-red-500/10 text-red-700 border-red-500/20"
                  )}
                >
                  {trialExpired ? "Trial Expirado" : sub.active ? "Ativo" : "Inativo"}
                </Badge>
              );
            })()}
          </div>
          {sub.active && sub.trialEndsAt && (
            <div className="flex items-center gap-1 text-muted-foreground border-l border-border/60 pl-4">
              <Clock className="h-3.5 w-3.5" />
              <span>Período de teste até: <strong className="text-foreground">{new Date(sub.trialEndsAt).toLocaleDateString("pt-BR")}</strong></span>
            </div>
          )}
          {sub.active && sub.monthlyTokenQuota > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground border-l border-border/60 pl-4">
              <Coins className="h-3.5 w-3.5" />
              <span>Cota contratada: <strong className="text-foreground">{nf(sub.monthlyTokenQuota)} tokens/mês</strong> {sub.overageAllowed && "(com overage)"}</span>
            </div>
          )}
        </div>
      )}

      {quotaPct !== null && quotaPct >= 80 && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4 text-xs shadow-sm",
            quotaPct >= 100
              ? "border-destructive bg-destructive/5 text-destructive"
              : "border-amber-300 bg-amber-500/5 text-amber-800 dark:text-amber-200"
          )}
        >
          <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">
              {quotaPct >= 100 ? "Limite Mensal Atingido" : "Aviso de Consumo"}
            </p>
            <p className="leading-relaxed">
              {quotaPct >= 100
                ? `O limite mensal de tokens foi atingido (${nf(totalTokens)}/${nf(limit!)}). O agente de IA está pausado até o início do próximo ciclo ou até você elevar o teto nas configurações.`
                : `Você consumiu ${quotaPct}% do seu limite mensal de tokens (${nf(totalTokens)}/${nf(limit!)}).`}
            </p>
          </div>
        </div>
      )}

      {/* Grid de Estatísticas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Activity className="h-4.5 w-4.5 text-primary" />
            Consumo no Ciclo Atual
          </h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((stat) => {
            const StatIcon = stat.icon;
            return (
              <Card key={stat.label} className="border-border/80 shadow-sm hover:shadow-md transition-all duration-300">
                <CardContent className="p-4 flex flex-col justify-between h-full space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider line-clamp-1">{stat.label}</span>
                    <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm border border-border/20", stat.color)}>
                      <StatIcon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{stat.value}</p>
                    <p className="text-[10px] text-muted-foreground">{stat.desc}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Modelos e Custo */}
      <CostByModelCard totalCostUsd={data.costUsd} />

      {/* Falhas Recentes e Turnos */}
      <FailuresList />
      <TurnsList />
    </div>
  );
}

function formatUsd(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: v < 1 ? 4 : 2,
  });
}

function CostByModelCard({ totalCostUsd }: { totalCostUsd: number }) {
  const { data: rows = [], isLoading } = useAiUsageByModelThisMonth();

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-4 border-b border-border/40">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Cpu className="h-4.5 w-4.5 text-primary" />
          Distribuição de Custos por Modelo
        </CardTitle>
        <CardDescription className="text-xs">
          Acompanhe o consumo monetário por modelo de linguagem para otimizar suas regras de roteamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground text-xs">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Carregando custos por modelo...
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Sem registros de consumo de modelos neste ciclo.</p>
        ) : (
          <div className="overflow-x-auto border border-border/60 rounded-xl bg-muted/5 shadow-inner">
            <table className="w-full text-xs text-foreground">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 px-4 font-semibold">Modelo</th>
                  <th className="py-3 px-3 text-right font-semibold">Turnos</th>
                  <th className="py-3 px-3 text-right font-semibold">Entrada</th>
                  <th className="py-3 px-3 text-right font-semibold">Saída</th>
                  <th className="py-3 px-3 text-right font-semibold">Cache (Lido)</th>
                  <th className="py-3 px-3 text-right font-semibold">Custo Total</th>
                  <th className="py-3 px-4 text-center font-semibold">% Custo</th>
                  <th className="py-3 px-4 text-right font-semibold">Economia Cache</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: AiUsageByModelRow) => {
                  const pct = totalCostUsd > 0 ? Math.round((row.costUsd / totalCostUsd) * 100) : 0;
                  return (
                    <tr key={row.model} className="border-b border-border/40 last:border-0 hover:bg-muted/10 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-semibold text-primary">{shortModelName(row.model)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{nf(row.turns)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{nf(row.inputTokens)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{nf(row.outputTokens)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{nf(row.cacheReadTokens)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{formatUsd(row.costUsd)}</td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="relative w-12 h-2 rounded-full bg-muted overflow-hidden border border-border/30">
                            <div className="absolute top-0 left-0 h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-semibold text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                        {row.cacheSavingsUsd > 0 ? `-${formatUsd(row.cacheSavingsUsd)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FailuresList() {
  const { data: errors = [] } = useAiErrors();
  if (errors.length === 0) return null;

  return (
    <Card className="border-destructive/30 bg-destructive/[0.02] shadow-sm">
      <CardHeader className="pb-3 border-b border-destructive/10">
        <CardTitle className="text-base font-semibold text-destructive flex items-center gap-2">
          <ShieldAlert className="h-4.5 w-4.5" />
          Falhas Operacionais Recentes
        </CardTitle>
        <CardDescription className="text-xs text-destructive/80">
          Mensagens ou interações em que a inteligência falhou ou parou.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <ul className="space-y-2.5">
          {errors.map((err: AiError, i) => (
            <li key={`${err.chat_id}-${i}`} className="rounded-xl border border-destructive/20 bg-card p-3 text-xs shadow-sm flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground border-b border-border/40 pb-1.5">
                <span className="font-semibold flex items-center gap-1">
                  ID Conversa: <span className="font-mono text-foreground">{err.chat_id || "—"}</span>
                </span>
                <span className="flex items-center gap-1 font-medium">
                  <Clock className="h-3 w-3" />
                  {new Date(err.updated_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <p className="break-words font-medium text-destructive leading-relaxed">{err.last_error ?? "Erro indefinido na execução do modelo."}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TurnsList() {
  const { data: turns = [], isLoading } = useAiTurns();
  const [search, setSearch] = useState("");

  const filteredTurns = turns.filter((turn) =>
    (turn.user_message?.toLowerCase() ?? "").includes(search.toLowerCase()) ||
    (turn.reply?.toLowerCase() ?? "").includes(search.toLowerCase())
  );

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-4.5 w-4.5 text-primary" />
            Auditoria e Últimas Interações
          </CardTitle>
          <CardDescription className="text-xs">
            Visualize as perguntas feitas pelos clientes, respostas geradas pela IA e o contexto utilizado.
          </CardDescription>
        </div>
        {turns.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar conversas..."
              className="pl-8 h-8.5 bg-background border-border/80 text-xs focus-visible:ring-primary/20"
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground text-xs">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            Carregando interações recentes...
          </div>
        ) : turns.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Nenhuma interação com a IA registrada neste canal.</p>
        ) : filteredTurns.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Nenhuma interação corresponde ao termo pesquisado.</p>
        ) : (
          <ul className="space-y-4">
            {filteredTurns.map((turn) => (
              <TurnRow key={turn.id} turn={turn} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function shortModelName(model: string | null): string {
  if (!model) return "—";
  const m = model.toLowerCase();
  if (m === "circuit-breaker") return "Breaker";
  if (m.includes("haiku")) return "Haiku 4.5";
  if (m.includes("sonnet-4-7")) return "Sonnet 4.7";
  if (m.includes("sonnet")) return "Sonnet 4.6";
  if (m.includes("opus")) return "Opus";
  if (m.startsWith("gpt-")) return model;
  return model;
}

const OUTCOME_META: Record<AiTurnOutcome, { label: string; tone: "ok" | "warn" | "fail" }> = {
  delivered: { label: "Entregue", tone: "ok" },
  blocked_critique: { label: "Bloqueado na Auditoria", tone: "warn" },
  no_reply: { label: "Sem Resposta", tone: "warn" },
  tool_error: { label: "Erro de Ferramenta", tone: "fail" },
  circuit_tripped: { label: "Breaker Disparado", tone: "fail" },
};

function TurnRow({ turn }: { turn: AiTurn }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const topSimilarity = turn.retrieved.length > 0
    ? Math.round(Math.max(...turn.retrieved.map((r) => r.similarity ?? 0)) * 100)
    : 0;
  const writeTools = (turn.tools ?? []).filter((t) => t.name && t.name !== "send_whatsapp_message");
  const hasRetrieved = turn.retrieved.length > 0;

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Trecho copiado!" });
  };

  const outcomeStyle = turn.outcome ? OUTCOME_META[turn.outcome].tone : "warn";

  return (
    <li
      className={cn(
        "rounded-xl border border-border/70 bg-card/60 p-4 shadow-sm hover:shadow-md transition-all duration-300 border-l-4 list-none",
        outcomeStyle === "ok" && "border-l-emerald-500 hover:border-l-emerald-600",
        outcomeStyle === "warn" && "border-l-amber-500 hover:border-l-amber-600",
        outcomeStyle === "fail" && "border-l-destructive hover:border-l-destructive"
      )}
    >
      {/* Linha de Info/Meta */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/20 pb-2">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1.5 font-medium">
          <Clock className="h-3 w-3" />
          {new Date(turn.created_at).toLocaleString("pt-BR")}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-mono text-[9px] px-2 py-0 h-5 border-border/70 text-muted-foreground font-semibold bg-muted/20">
            {shortModelName(turn.model)}
          </Badge>
          {turn.thinking_budget && turn.thinking_budget > 0 ? (
            <Badge
              variant="outline"
              className="border-violet-500/20 bg-violet-500/5 font-semibold text-[9px] px-2 py-0 h-5 text-violet-700 dark:text-violet-300"
              title={`Extended thinking — budget ${turn.thinking_budget} tokens`}
            >
              pensamento estendido
            </Badge>
          ) : null}
          {turn.outcome ? (
            <Badge
              variant="outline"
              className={cn(
                "font-semibold text-[9px] px-2 py-0 h-5 border-transparent",
                OUTCOME_META[turn.outcome].tone === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
                OUTCOME_META[turn.outcome].tone === "warn" && "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
                OUTCOME_META[turn.outcome].tone === "fail" && "bg-destructive/10 text-destructive border-destructive/20",
              )}
            >
              {OUTCOME_META[turn.outcome].label}
            </Badge>
          ) : null}
          {hasRetrieved ? (
            <Badge variant="secondary" className="font-semibold text-[9px] px-2 py-0 h-5 bg-primary/5 border border-primary/10 text-primary">
              Base: {turn.retrieved.length} trechos ({topSimilarity}% rel.)
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal text-[9px] px-2 py-0 h-5 border-border/70 text-muted-foreground">
              Sem base
            </Badge>
          )}
        </div>
      </div>

      {/* Diálogo */}
      <div className="space-y-3">
        {turn.user_message && (
          <div className="flex items-start gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/65 text-muted-foreground border border-border/50 text-[10px] font-semibold">
              U
            </div>
            <div className="rounded-2xl rounded-tl-none bg-muted/30 border border-border/50 px-3 py-2 text-xs text-foreground max-w-[85%] leading-relaxed">
              {turn.user_message}
            </div>
          </div>
        )}

        <div className="flex items-start gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/15 text-[10px] font-semibold">
            AI
          </div>
          {turn.reply ? (
            <div className="rounded-2xl rounded-tl-none bg-primary/[0.02] border border-primary/15 px-3 py-2 text-xs text-foreground max-w-[85%] leading-relaxed">
              {turn.reply}
            </div>
          ) : (
            <div className="rounded-2xl rounded-tl-none bg-muted/20 px-3 py-2 text-xs text-muted-foreground italic border border-border/40">
              Sem resposta enviada ({turn.stop_reason ?? "nulo"}).
            </div>
          )}
        </div>
      </div>

      {writeTools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 items-center pl-8 border-t border-border/20 pt-2.5">
          <span className="text-[10px] text-muted-foreground mr-1">Ferramentas chamadas:</span>
          {writeTools.map((t, i) => (
            <Badge
              key={`${turn.id}-${i}`}
              variant="outline"
              className={cn("font-normal text-[9px] px-2 py-0 h-5", t.is_error ? "bg-red-500/10 text-destructive border-destructive/20" : "bg-muted text-muted-foreground")}
            >
              {t.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Chunks consultados (Knowledge retrieved) */}
      {hasRetrieved && (
        <div className="mt-3 pl-8 border-t border-border/20 pt-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors focus:outline-none"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {expanded ? "Ocultar trechos consultados" : `Ver ${turn.retrieved.length} trecho(s) consultado(s)`}
          </button>
          {expanded && (
            <ol className="mt-2 space-y-2.5">
              {turn.retrieved.map((r, i) => (
                <li
                  key={`${turn.id}-r-${i}`}
                  className="relative rounded-xl border border-border/60 bg-muted/25 p-3 text-[11px] leading-relaxed text-foreground"
                >
                  <div className="mb-2 flex items-center justify-between border-b border-border/30 pb-1.5">
                    <span className="font-mono text-[9px] text-muted-foreground font-semibold">Fonte [{i + 1}]</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-muted-foreground font-semibold">
                        Relevância: {Math.round((r.similarity ?? 0) * 100)}%
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md"
                        onClick={() => copyText(r.content)}
                        title="Copiar trecho"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap font-sans break-words pr-2">{r.content}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <CritiqueSummary flags={turn.critique_flags ?? []} />
    </li>
  );
}

function CritiqueSummary({ flags }: { flags: AiTurnCritiqueFlag[] }) {
  if (flags.length === 0) return null;
  const blocked = flags.filter((f) => f.blocked);
  if (blocked.length === 0) {
    return (
      <div className="mt-2.5 pl-8">
        <Badge variant="outline" className="font-normal text-[9px] border-border/50 text-muted-foreground bg-muted/20">
          auditado · sem ressalvas
        </Badge>
      </div>
    );
  }
  return (
    <div className="mt-2.5 ml-8 rounded-xl border border-destructive/20 bg-destructive/[0.02] p-3 text-xs">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Badge variant="outline" className="border-destructive/30 bg-destructive/10 font-bold text-destructive text-[9px] h-5">
          Auditoria Bloqueou {blocked.length} Envio{blocked.length > 1 ? "s" : ""}
        </Badge>
      </div>
      <ul className="space-y-2 text-xs text-foreground">
        {blocked.map((f, i) => (
          <li key={i} className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground">Texto Bloqueado:</p>
            <p className="italic bg-card border border-border/30 rounded-lg p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">"{f.text}"</p>
            <p className="text-[10px] font-semibold text-muted-foreground mt-1">Motivos do bloqueio:</p>
            <ul className="list-disc pl-4 text-[11px] space-y-0.5 leading-relaxed text-foreground">
              {f.issues.map((iss, j) => (
                <li key={j}>{iss}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LoadingCard() {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        Carregando dados da atividade...
      </CardContent>
    </Card>
  );
}
