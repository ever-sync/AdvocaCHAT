import { Loader2, Plus, Trophy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { FormAutoWinnerConfig, FormField, FormSettings, FormTheme } from "@/lib/marketing/form-types";
import {
  useApplyWinnerVariant,
  useCreateMarketingFormVariant,
  useDeleteMarketingFormVariant,
  useMarketingFormVariants,
  useUpdateMarketingFormVariant,
} from "@/lib/api/marketing-form-variants";

interface ABTestPanelProps {
  formId: string;
  currentFields: FormField[];
  currentSettings: FormSettings;
  currentTheme: FormTheme;
  onSettingsChange: (next: FormSettings) => void;
}

function conversionPct(views: number, subs: number): string {
  if (views <= 0) return "—";
  return `${((subs / views) * 100).toFixed(1)}%`;
}

export function ABTestPanel({ formId, currentFields, currentSettings, currentTheme, onSettingsChange }: ABTestPanelProps) {
  const { toast } = useToast();
  const aw: FormAutoWinnerConfig = currentSettings.abAutoWinner ?? { enabled: false, minDays: 7, minViews: 100 };
  const setAw = (patch: Partial<FormAutoWinnerConfig>) =>
    onSettingsChange({
      ...currentSettings,
      abAutoWinner: {
        enabled: aw.enabled,
        minDays: aw.minDays,
        minViews: aw.minViews,
        appliedAt: aw.appliedAt ?? null,
        winnerVariantId: aw.winnerVariantId ?? null,
        ...patch,
      },
    });
  const { data: variants = [], isLoading } = useMarketingFormVariants(formId);
  const createVariant = useCreateMarketingFormVariant();
  const updateVariant = useUpdateMarketingFormVariant();
  const deleteVariant = useDeleteMarketingFormVariant();
  const applyWinner = useApplyWinnerVariant();

  const handleAdd = () => {
    createVariant.mutate(
      {
        formId,
        name: `Variante ${String.fromCharCode(65 + variants.length)}`,
        fields: currentFields,
        settings: currentSettings,
        theme: currentTheme,
        weight: 50,
      },
      {
        onSuccess: () => toast({ title: "Variante criada a partir do rascunho atual" }),
        onError: (e) => toast({ title: "Erro ao criar variante", description: e.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Teste A/B</p>
          <p className="text-xs text-muted-foreground">
            Cada variante é uma cópia do formulário; o tráfego é dividido pelo peso. Aplique a vencedora quando tiver dados.
          </p>
        </div>
        <Button size="sm" onClick={handleAdd} disabled={createVariant.isPending}>
          {createVariant.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
          Nova variante
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Vencedora automática</p>
            <p className="text-xs text-muted-foreground">
              Aplica a melhor variante por conversão após atingir os mínimos.
            </p>
          </div>
          <Switch checked={aw.enabled} onCheckedChange={(v) => setAw({ enabled: v })} />
        </div>
        {aw.enabled ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Mín. dias</Label>
              <Input
                type="number"
                min={1}
                value={aw.minDays}
                onChange={(e) => setAw({ minDays: Number(e.target.value) || 7 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mín. views/variante</Label>
              <Input
                type="number"
                min={1}
                value={aw.minViews}
                onChange={(e) => setAw({ minViews: Number(e.target.value) || 100 })}
                className="h-8"
              />
            </div>
          </div>
        ) : null}
        {aw.appliedAt ? (
          <p className="text-xs text-emerald-600">
            Vencedora aplicada em {new Date(aw.appliedAt).toLocaleDateString("pt-BR")}.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">Salve o formulário para guardar esta configuração.</p>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : variants.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhuma variante. Crie uma para começar a testar.
        </div>
      ) : (
        <div className="space-y-2">
          {variants.map((variant) => (
            <div key={variant.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{variant.name}</span>
                  <Badge variant={variant.isActive ? "default" : "secondary"} className="h-5 text-[11px]">
                    {variant.isActive ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {variant.totalViews} views · {variant.totalSubmissions} envios · conv. {conversionPct(variant.totalViews, variant.totalSubmissions)}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <Label className="text-[11px] text-muted-foreground">Peso</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={variant.weight}
                  className="h-8 w-16"
                  onBlur={(e) => {
                    const w = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    if (w !== variant.weight) updateVariant.mutate({ id: variant.id, patch: { weight: w } });
                  }}
                />
              </div>

              <Switch
                checked={variant.isActive}
                onCheckedChange={(v) => updateVariant.mutate({ id: variant.id, patch: { isActive: v } })}
              />

              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() =>
                  applyWinner.mutate(
                    { formId, winnerId: variant.id },
                    {
                      onSuccess: () => toast({ title: `"${variant.name}" definida como vencedora` }),
                      onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
                    },
                  )
                }
              >
                <Trophy className="mr-1.5 h-3.5 w-3.5" />
                Vencedora
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-red-600 hover:text-red-600"
                onClick={() => deleteVariant.mutate(variant.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
