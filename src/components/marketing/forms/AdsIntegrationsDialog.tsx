import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  useMarketingAdConfigs,
  useUpsertMarketingAdConfig,
  type AdPlatform,
  type MarketingAdConfig,
} from "@/lib/api/marketing-ad-configs";

interface AdsIntegrationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIELDS: Record<AdPlatform, { key: string; label: string; placeholder?: string }[]> = {
  google_ads: [
    { key: "customer_id", label: "Customer ID", placeholder: "123-456-7890" },
    { key: "conversion_action_id", label: "Conversion Action ID" },
    { key: "developer_token", label: "Developer Token" },
  ],
  meta_ads: [
    { key: "pixel_id", label: "Pixel / Dataset ID" },
    { key: "access_token", label: "Access Token" },
  ],
};

const PLATFORM_LABEL: Record<AdPlatform, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
};

function PlatformSection({ platform, config }: { platform: AdPlatform; config?: MarketingAdConfig }) {
  const { toast } = useToast();
  const upsert = useUpsertMarketingAdConfig();
  const [isActive, setIsActive] = useState(false);
  const [creds, setCreds] = useState<Record<string, string>>({});

  useEffect(() => {
    setIsActive(config?.isActive ?? false);
    const initial: Record<string, string> = {};
    for (const f of FIELDS[platform]) {
      initial[f.key] = String((config?.credentials?.[f.key] as string) ?? "");
    }
    setCreds(initial);
  }, [config, platform]);

  const handleSave = () => {
    upsert.mutate(
      { platform, isActive, credentials: creds },
      {
        onSuccess: () => toast({ title: `${PLATFORM_LABEL[platform]} salvo` }),
        onError: (e) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{PLATFORM_LABEL[platform]}</p>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {FIELDS[platform].map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-xs">{f.label}</Label>
            <Input
              value={creds[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => setCreds((p) => ({ ...p, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Salvar
        </Button>
      </div>
    </div>
  );
}

export function AdsIntegrationsDialog({ open, onOpenChange }: AdsIntegrationsDialogProps) {
  const { data: configs = [], isLoading } = useMarketingAdConfigs({ enabled: open });
  const byPlatform = (p: AdPlatform) => configs.find((c) => c.platform === p);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Integrações de Ads</DialogTitle>
          <DialogDescription>
            Quando um lead é marcado como vendido no CRM, registramos a conversão para envio às plataformas.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <PlatformSection platform="google_ads" config={byPlatform("google_ads")} />
            <Separator />
            <PlatformSection platform="meta_ads" config={byPlatform("meta_ads")} />
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              As conversões ganhas são enfileiradas. O envio efetivo às APIs do Google/Meta é processado pelo worker de
              dispatch (configuração de credenciais por conta).
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
