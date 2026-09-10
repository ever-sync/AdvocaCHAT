import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Facebook, Globe, Loader2, Megaphone, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  useMarketingAdConfigs,
  useUpsertMarketingAdConfig,
  type AdPlatform,
} from "@/lib/api/marketing-ad-configs";

// Aba ADS de Configurações → Integrações. Conexão real: grava credenciais em
// marketing_ad_platform_configs (mesma tabela usada pelos formulários). A
// conexão é por credenciais (Meta CAPI / Google Ads conversion upload), não
// OAuth — é assim que essas APIs de conversão server-side funcionam.

type FieldDef = { key: string; label: string; placeholder: string; secret?: boolean };

type ProviderDef = {
  platform: AdPlatform;
  name: string;
  description: string;
  icon: typeof Facebook;
  iconClass: string;
  fields: FieldDef[];
  /** Campos que precisam estar preenchidos para considerar "conectado". */
  requiredKeys: string[];
};

const PROVIDERS: ProviderDef[] = [
  {
    platform: "meta_ads",
    name: "Meta Ads",
    description: "Facebook e Instagram. Envia conversões via API de Conversões (CAPI).",
    icon: Facebook,
    iconClass: "bg-[#1877F2] text-white",
    fields: [
      { key: "pixel_id", label: "Pixel ID", placeholder: "123456789" },
      { key: "access_token", label: "Access Token", placeholder: "EAAB…", secret: true },
      { key: "dataset_id", label: "Dataset ID (opcional)", placeholder: "Opcional" },
    ],
    requiredKeys: ["pixel_id", "access_token"],
  },
  {
    platform: "google_ads",
    name: "Google Ads",
    description: "Envia conversões offline (lead, venda) do CRM para o Google Ads.",
    icon: Globe,
    iconClass: "bg-[#4285F4] text-white",
    fields: [
      { key: "customer_id", label: "Customer ID", placeholder: "123-456-7890" },
      { key: "conversion_action_id", label: "Conversion Action ID", placeholder: "AW-XXXX" },
    ],
    requiredKeys: ["customer_id", "conversion_action_id"],
  },
];

function ProviderCard({ provider }: { provider: ProviderDef }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: configs = [] } = useMarketingAdConfigs();
  const upsert = useUpsertMarketingAdConfig();

  const config = configs.find((c) => c.platform === provider.platform);
  const enabled = config?.isActive ?? false;

  // Draft local dos campos, hidratado das credenciais salvas.
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    const saved = (config?.credentials ?? {}) as Record<string, unknown>;
    const next: Record<string, string> = {};
    for (const f of provider.fields) {
      next[f.key] = typeof saved[f.key] === "string" ? (saved[f.key] as string) : "";
    }
    setDraft(next);
  }, [config, provider.fields]);

  const hasCredentials = provider.requiredKeys.every((k) => (draft[k] ?? "").trim());
  const connected = enabled && provider.requiredKeys.every((k) => {
    const saved = (config?.credentials ?? {}) as Record<string, unknown>;
    return typeof saved[k] === "string" && (saved[k] as string).trim();
  });

  const Icon = provider.icon;

  const save = async (nextEnabled: boolean) => {
    try {
      await upsert.mutateAsync({
        platform: provider.platform,
        isActive: nextEnabled,
        credentials: { ...(config?.credentials ?? {}), ...draft },
      });
      queryClient.invalidateQueries({ queryKey: ["marketing-ad-configs"] });
      toast({
        title: nextEnabled ? `${provider.name} conectado` : `${provider.name} desconectado`,
      });
    } catch (e) {
      toast({
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
              provider.iconClass,
            )}
          >
            <Icon className="h-6 w-6" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{provider.name}</h3>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[11px] font-semibold",
                  connected
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {connected ? "Conectado" : "Não conectado"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{provider.description}</p>
          </div>
        </div>
        {/* Toggle ativa/desativa o envio sem apagar as credenciais. */}
        <Switch
          checked={enabled}
          disabled={upsert.isPending || (!enabled && !hasCredentials)}
          onCheckedChange={(v) => save(v)}
          aria-label={enabled ? `Desativar ${provider.name}` : `Ativar ${provider.name}`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {provider.fields.map((field) => (
          <div key={field.key} className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {field.label}
            </Label>
            <Input
              type={field.secret ? "password" : "text"}
              value={draft[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={(e) => setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <Button
        type="button"
        className="gap-2 self-start"
        disabled={upsert.isPending || !hasCredentials}
        onClick={() => save(true)}
      >
        {upsert.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Plug className="h-4 w-4" aria-hidden />
        )}
        {connected ? "Salvar credenciais" : "Conectar"}
      </Button>
    </div>
  );
}

export function AdsSettings() {
  const { isLoading } = useMarketingAdConfigs();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">ADS</h2>
        <p className="text-sm text-muted-foreground">
          Conecte suas contas de anúncios para enviar conversões (lead, venda) automaticamente,
          respeitando o consentimento LGPD do lead.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Carregando…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {PROVIDERS.map((provider) => (
            <ProviderCard key={provider.platform} provider={provider} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <Megaphone className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          As conversões ganhas no CRM são enfileiradas para envio às plataformas conectadas. O envio
          final às APIs do Google/Meta depende do worker de dispatch de conversões.
        </p>
      </div>
    </div>
  );
}
