import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { CrmFunnelMigrateDialog } from "@/components/crm/CrmFunnelMigrateDialog";
import { Button } from "@/components/ui/button";
import type { CrmFunnel } from "@/data/crm-funnels";
import { funnelListNameIn, funnelStageTitleIn } from "@/data/crm-funnels";
import { useToast } from "@/hooks/use-toast";
import { applyPendingFunnelMigrations } from "@/lib/api/crm-funnel-migration";
import {
  buildOrphanBulkMigrations,
  findOrphanNegotiations,
  type FunnelStageRef,
} from "@/lib/crm/funnel-migration";
import { cn } from "@/lib/utils";

type CrmOrphanNegotiationsBannerProps = {
  funnels: CrmFunnel[];
  negotiationRefs: FunnelStageRef[];
  className?: string;
};

export function CrmOrphanNegotiationsBanner({
  funnels,
  negotiationRefs,
  className,
}: CrmOrphanNegotiationsBannerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const orphans = useMemo(
    () => findOrphanNegotiations(negotiationRefs, funnels),
    [funnels, negotiationRefs],
  );

  if (orphans.length === 0) {
    return null;
  }

  const sample = orphans.slice(0, 3).map((o) => {
    const funnelLabel = funnelListNameIn(funnels, o.funnelId);
    const stageLabel = funnelStageTitleIn(funnels, o.funnelId, o.stageId);
    return `${funnelLabel} / ${stageLabel}`;
  });

  return (
    <>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] px-4 py-3",
          className,
        )}
        role="status"
      >
        <div className="flex min-w-0 items-start gap-2 text-sm text-[var(--crm-amber-ink)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Negociações órfãs</p>
            <p className="text-xs text-[var(--crm-amber-ink)]">
              {orphans.length} negociação{orphans.length === 1 ? "" : "ões"} com funil ou etapa fora
              da configuração atual
              {sample.length > 0 ? ` (ex.: ${sample.join("; ")})` : ""}.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 border-[var(--crm-amber-border)] bg-white hover:bg-[var(--crm-amber-tint)]"
          disabled={migrating}
          onClick={() => setDialogOpen(true)}
        >
          {migrating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Realocar em lote
        </Button>
      </div>

      <CrmFunnelMigrateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        funnels={funnels}
        negotiationCount={orphans.length}
        title="Realocar negociações órfãs"
        description="Escolha o funil e a etapa para onde todas as negociações órfãs serão movidas:"
        confirmLabel="Realocar negociações"
        disabled={migrating}
        onConfirm={async ({ funnelId, stageId }) => {
          setMigrating(true);
          try {
            const migrations = buildOrphanBulkMigrations(orphans, { funnelId, stageId }, funnels);
            const { negotiationsUpdated } = await applyPendingFunnelMigrations(migrations);
            await queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
            toast({
              title: "Negociações realocadas",
              description: `${negotiationsUpdated} negociação(ões) atualizada(s) no CRM.`,
            });
            setDialogOpen(false);
          } catch (e) {
            toast({
              title: "Não foi possível realocar",
              description: e instanceof Error ? e.message : "Tente novamente.",
              variant: "destructive",
            });
          } finally {
            setMigrating(false);
          }
        }}
      />
    </>
  );
}
