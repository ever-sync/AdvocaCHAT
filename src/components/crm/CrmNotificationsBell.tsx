import { useMemo, useState } from "react";
import { AlertTriangle, Bell, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { CrmFunnelMigrateDialog } from "@/components/crm/CrmFunnelMigrateDialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CrmFunnel } from "@/data/crm-funnels";
import { funnelListNameIn, funnelStageTitleIn } from "@/data/crm-funnels";
import { useToast } from "@/hooks/use-toast";
import { applyPendingFunnelMigrations } from "@/lib/api/crm-funnel-migration";
import {
  buildOrphanBulkMigrations,
  findOrphanNegotiations,
  type FunnelStageRef,
} from "@/lib/crm/funnel-migration";

type CrmNotificationsBellProps = {
  funnels: CrmFunnel[];
  negotiationRefs: FunnelStageRef[];
};

/**
 * Sino de notificações do CRM (toolbar). Hoje agrega o aviso de negociações
 * órfãs; pensado para receber outras notificações no futuro. Substitui o banner
 * full-width para ganhar área vertical do board.
 */
export function CrmNotificationsBell({ funnels, negotiationRefs }: CrmNotificationsBellProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const orphans = useMemo(
    () => findOrphanNegotiations(negotiationRefs, funnels),
    [funnels, negotiationRefs],
  );

  const count = orphans.length;
  const sample = useMemo(
    () =>
      orphans.slice(0, 3).map((o) => {
        const funnelLabel = funnelListNameIn(funnels, o.funnelId);
        const stageLabel = funnelStageTitleIn(funnels, o.funnelId, o.stageId);
        return `${funnelLabel} / ${stageLabel}`;
      }),
    [orphans, funnels],
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface-2)]"
                aria-label={`Notificações${count > 0 ? ` (${count})` : ""}`}
              >
                <Bell className="h-[18px] w-[18px]" aria-hidden />
                {count > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--crm-orange)] px-1 text-[10px] font-semibold leading-none text-white">
                    {count > 9 ? "9+" : count}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Notificações</TooltipContent>
        </Tooltip>

        <PopoverContent
          align="end"
          className="w-80 border-[var(--crm-border)] bg-card p-0 text-[var(--crm-ink)] shadow-lg"
        >
          <div className="border-b border-[var(--crm-border-2)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
            Notificações
          </div>

          {count === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-[var(--crm-ink-3)]">
              Nenhuma notificação no momento.
            </div>
          ) : (
            <div className="p-3">
              <div className="rounded-lg border border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] p-3">
                <div className="flex items-start gap-2 text-sm text-[var(--crm-amber-ink)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">Negociações órfãs</p>
                    <p className="mt-0.5 text-xs text-[var(--crm-amber-ink)]">
                      {count} negociação{count === 1 ? "" : "ões"} com funil ou etapa fora da
                      configuração atual
                      {sample.length > 0 ? ` (ex.: ${sample.join("; ")})` : ""}.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full border-[var(--crm-amber-border)] bg-card hover:bg-[var(--crm-amber-tint)]"
                  disabled={migrating}
                  onClick={() => {
                    setOpen(false);
                    setDialogOpen(true);
                  }}
                >
                  {migrating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Realocar em lote
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <CrmFunnelMigrateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        funnels={funnels}
        negotiationCount={count}
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
