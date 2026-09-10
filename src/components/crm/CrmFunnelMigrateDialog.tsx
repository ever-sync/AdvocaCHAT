import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CrmFunnel } from "@/data/crm-funnels";
import { funnelListNameIn, funnelStageTitleIn } from "@/data/crm-funnels";
import { validateMigrationTarget } from "@/lib/crm/funnel-migration";

export type CrmFunnelMigrateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funnels: CrmFunnel[];
  title: string;
  description: string;
  negotiationCount: number;
  excludeFunnelId?: string;
  defaultTargetFunnelId?: string;
  defaultTargetStageId?: string;
  confirmLabel?: string;
  disabled?: boolean;
  onConfirm: (target: { funnelId: string; stageId: string }) => void;
};

export function CrmFunnelMigrateDialog({
  open,
  onOpenChange,
  funnels,
  title,
  description,
  negotiationCount,
  excludeFunnelId,
  defaultTargetFunnelId,
  defaultTargetStageId,
  confirmLabel = "Migrar e continuar",
  disabled,
  onConfirm,
}: CrmFunnelMigrateDialogProps) {
  const targetFunnelOptions = useMemo(
    () => funnels.filter((f) => f.id !== excludeFunnelId),
    [excludeFunnelId, funnels],
  );

  const [targetFunnelId, setTargetFunnelId] = useState(
    defaultTargetFunnelId ?? targetFunnelOptions[0]?.id ?? "",
  );
  const [targetStageId, setTargetStageId] = useState("");

  const targetFunnel = useMemo(
    () => targetFunnelOptions.find((f) => f.id === targetFunnelId),
    [targetFunnelId, targetFunnelOptions],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const initialFunnel =
      defaultTargetFunnelId && targetFunnelOptions.some((f) => f.id === defaultTargetFunnelId)
        ? defaultTargetFunnelId
        : (targetFunnelOptions[0]?.id ?? "");
    setTargetFunnelId(initialFunnel);
    const funnel = targetFunnelOptions.find((f) => f.id === initialFunnel);
    const initialStage =
      defaultTargetStageId && funnel?.stages.some((s) => s.id === defaultTargetStageId)
        ? defaultTargetStageId
        : (funnel?.stages[0]?.id ?? "");
    setTargetStageId(initialStage);
  }, [defaultTargetFunnelId, defaultTargetStageId, open, targetFunnelOptions]);

  useEffect(() => {
    if (!targetFunnel) {
      return;
    }
    if (!targetFunnel.stages.some((s) => s.id === targetStageId)) {
      setTargetStageId(targetFunnel.stages[0]?.id ?? "");
    }
  }, [targetFunnel, targetStageId]);

  const validationError = validateMigrationTarget(funnels, targetFunnelId, targetStageId, {
    excludeFunnelId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
            {negotiationCount > 0 ? (
              <>
                {" "}
                <strong>
                  {negotiationCount} negociação{negotiationCount === 1 ? "" : "ões"}
                </strong>{" "}
                {negotiationCount === 1 ? "será movida" : "serão movidas"} ao salvar a configuração.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Funil de destino</Label>
            <Select
              value={targetFunnelId}
              onValueChange={setTargetFunnelId}
              disabled={disabled || targetFunnelOptions.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o funil" />
              </SelectTrigger>
              <SelectContent>
                {targetFunnelOptions.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.listName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Etapa de destino</Label>
            <Select
              value={targetStageId}
              onValueChange={setTargetStageId}
              disabled={disabled || !targetFunnel}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {targetFunnel?.stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {targetFunnelId && targetStageId ? (
            <p className="text-xs text-muted-foreground">
              Destino: {funnelListNameIn(funnels, targetFunnelId)} →{" "}
              {funnelStageTitleIn(funnels, targetFunnelId, targetStageId)}
            </p>
          ) : null}

          {validationError ? (
            <p className="text-xs text-destructive">{validationError}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={disabled}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={
              disabled ||
              targetFunnelOptions.length === 0 ||
              !targetStageId ||
              Boolean(validationError)
            }
            onClick={() => onConfirm({ funnelId: targetFunnelId, stageId: targetStageId })}
          >
            {disabled ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
