import { useEffect, useState } from "react";
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
import { useUpdateWhatsappInstance } from "@/lib/api/whatsapp";
import { useToast } from "@/hooks/use-toast";
import type { WhatsappInstance } from "@/types/domain";

export function InstanceEditDialog({
  instance,
  open,
  onOpenChange,
  canEdit,
}: {
  instance: WhatsappInstance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const update = useUpdateWhatsappInstance();

  const [displayName, setDisplayName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (open && instance) {
      setDisplayName(instance.displayName);
      setBaseUrl(instance.uazapiBaseUrl);
      setIsDefault(instance.isDefault);
    }
  }, [open, instance]);

  const handleSave = () => {
    if (!instance) return;
    if (!canEdit) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel não tem permissão para editar instâncias.",
        variant: "destructive",
      });
      return;
    }
    if (displayName.trim().length < 2) {
      toast({ title: "Nome inválido", description: "Use pelo menos 2 caracteres.", variant: "destructive" });
      return;
    }
    void update
      .mutateAsync({
        id: instance.id,
        input: { displayName: displayName.trim(), uazapiBaseUrl: baseUrl.trim(), isDefault },
      })
      .then(() => {
        toast({ title: "Instância atualizada" });
        onOpenChange(false);
      })
      .catch((e: Error) => {
        toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Editar instância</DialogTitle>
          <DialogDescription>
            Ajuste nome, Base URL e instância padrão. Para trocar o token, remova e reconecte a
            instância.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-instance-name">Nome exibido</Label>
            <Input
              id="edit-instance-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-instance-url">Base URL</Label>
            <Input
              id="edit-instance-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="edit-instance-default" className="text-sm font-medium">
                Instância padrão
              </Label>
              <p className="text-xs text-muted-foreground">Usada por padrão ao enviar mensagens.</p>
            </div>
            <Switch
              id="edit-instance-default"
              checked={isDefault}
              onCheckedChange={setIsDefault}
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="rounded-xl"
            disabled={!canEdit || update.isPending || displayName.trim().length < 2}
            onClick={handleSave}
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
