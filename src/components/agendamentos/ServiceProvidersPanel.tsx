import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useTenantCollaborators } from "@/lib/api/settings";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  useDeleteSchedulingService,
  useSchedulingServices,
  useUpsertSchedulingService,
} from "@/lib/api/scheduling-services";

type Props = {
  productId: string;
  /** Duração padrão do serviço, usada ao vincular um prestador novo. */
  defaultDuration: number;
};

/** Liga/desliga prestadores que executam o serviço, com duração por prestador. */
export function ServiceProvidersPanel({ productId, defaultDuration }: Props) {
  const { toast } = useToast();
  const { data: collaborators = [], isLoading: loadingColabs } = useTenantCollaborators({
    enabled: isSupabaseConfigured,
  });
  const providers = useMemo(
    () =>
      collaborators
        .filter((c) => c.status === "active")
        .map((c) => ({ id: c.id, name: (c.nome?.trim() || c.email?.trim() || "Sem nome").trim() })),
    [collaborators],
  );

  const { data: links = [], isLoading: loadingLinks } = useSchedulingServices({ productId });
  const linkByProvider = useMemo(() => {
    const map = new Map<string, (typeof links)[number]>();
    for (const l of links) map.set(l.providerId, l);
    return map;
  }, [links]);

  const upsert = useUpsertSchedulingService({
    onError: (e) => toast({ title: "Erro ao vincular", description: e.message, variant: "destructive" }),
  });
  const remove = useDeleteSchedulingService({
    onError: (e) => toast({ title: "Erro ao desvincular", description: e.message, variant: "destructive" }),
  });

  const toggle = (providerId: string, checked: boolean) => {
    const existing = linkByProvider.get(providerId);
    if (checked) {
      void upsert.mutate({ productId, providerId, duracaoMin: existing?.duracaoMin ?? defaultDuration });
    } else if (existing) {
      void remove.mutate(existing.id);
    }
  };

  const setDuration = (providerId: string, value: number) => {
    void upsert.mutate({ productId, providerId, duracaoMin: value });
  };

  if (loadingColabs || loadingLinks) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando prestadores…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Selecione quem realiza este serviço e a duração de cada um.
      </p>
      <div className="space-y-1.5">
        {providers.map((p) => {
          const link = linkByProvider.get(p.id);
          const linked = Boolean(link);
          return (
            <div key={p.id} className="flex items-center gap-2">
              <Checkbox
                checked={linked}
                onCheckedChange={(v) => toggle(p.id, v === true)}
                id={`svc-prov-${p.id}`}
              />
              <label htmlFor={`svc-prov-${p.id}`} className="flex-1 text-sm">
                {p.name}
              </label>
              {linked ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    className="h-8 w-20 rounded-[10px]"
                    value={String(link?.duracaoMin ?? defaultDuration)}
                    min={5}
                    onChange={(e) => setDuration(p.id, Number(e.target.value) || defaultDuration)}
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              ) : null}
            </div>
          );
        })}
        {providers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum colaborador ativo.</p>
        ) : null}
      </div>
    </div>
  );
}
