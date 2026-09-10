import { lazy, Suspense, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import type { OpenAPIV3 } from "swagger-ui-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenantIntegrations } from "@/lib/api/integrations";
import { buildN8nInboundWebhookOpenApi, buildN8nReplyOpenApi } from "@/lib/api-docs/openapi-n8n-reply";
import { buildWchatApiOpenApi } from "@/lib/api-docs/openapi-wchat-api";
import { supabaseUrl } from "@/lib/supabase";

// O swagger-ui-react (~1,2 MB) fica em um chunk próprio carregado só ao renderizar
// a documentação — a casca da página abre na hora.
const LazyApiDocsSwagger = lazy(() =>
  import("@/components/settings/ApiDocsSwagger").then((m) => ({ default: m.ApiDocsSwagger })),
);

function ApiDocsSwagger({ spec }: { spec: OpenAPIV3.Document }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center rounded-xl border border-border/60 bg-card text-sm text-muted-foreground">
          Carregando documentação…
        </div>
      }
    >
      <LazyApiDocsSwagger spec={spec} />
    </Suspense>
  );
}

type ApiDocTab = "wchat-api" | "n8n-reply" | "n8n-inbound";

function functionsBaseUrl() {
  if (!supabaseUrl?.trim()) {
    return "";
  }
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1`;
}

export default function ApiDocs() {
  const [tab, setTab] = useState<ApiDocTab>("wchat-api");
  const { data: integrations } = useTenantIntegrations();
  const base = functionsBaseUrl();

  const wchatSpec = useMemo(
    () => buildWchatApiOpenApi(base ? `${base}/wchat-api` : "https://{project}.supabase.co/functions/v1/wchat-api"),
    [base],
  );

  const n8nReplySpec = useMemo(
    () => buildN8nReplyOpenApi(base ? `${base}/n8n-reply` : "https://{project}.supabase.co/functions/v1/n8n-reply"),
    [base],
  );

  const n8nInboundSpec = useMemo(
    () => buildN8nInboundWebhookOpenApi(integrations?.n8nWebhookUrl ?? ""),
    [integrations?.n8nWebhookUrl],
  );

  return (
    <PageShell className="pb-16" contentClassName="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-accent" aria-hidden />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Documentação das APIs</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Duas APIs distintas no Supabase Edge Functions: REST com chave de tenant e reply dedicado ao fluxo de IA no
            n8n. Use as abas para alternar.
          </p>
          {!base ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              VITE_SUPABASE_URL não definida — URLs de exemplo na documentação.
            </p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link to="/configuracoes?aba=integracoes&secao=automacao">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar às integrações
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ApiDocTab)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="wchat-api" className="text-xs sm:text-sm">
            API REST
            <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">
              wchat-api
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="n8n-reply" className="text-xs sm:text-sm">
            n8n Reply
            <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">
              IA + regras
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="n8n-inbound" className="text-xs sm:text-sm">
            Webhook → n8n
            <Badge variant="outline" className="ml-2 hidden sm:inline-flex">
              entrada
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wchat-api" className="mt-4 space-y-3">
          <ApiIntro
            title="API REST pública"
            body="Chaves Bearer (wchat_…), CRM, clientes e envio de mensagens sem as regras de IA do fluxo n8n."
          />
          <ApiDocsSwagger spec={wchatSpec} />
        </TabsContent>

        <TabsContent value="n8n-reply" className="mt-4 space-y-3">
          <ApiIntro
            title="n8n Reply"
            body="Endpoint que o seu fluxo n8n chama depois de processar a mensagem. Respeita modo IA, opt-out e handoff."
          />
          <ApiDocsSwagger spec={n8nReplySpec} />
        </TabsContent>

        <TabsContent value="n8n-inbound" className="mt-4 space-y-3">
          <ApiIntro
            title="Webhook de entrada (CaleoCRM → n8n)"
            body={
              integrations?.n8nWebhookUrl
                ? `URL configurada: ${integrations.n8nWebhookUrl}`
                : "Configure a URL do webhook em Configurações → IA no n8n."
            }
          />
          <ApiDocsSwagger spec={n8nInboundSpec} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function ApiIntro({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
