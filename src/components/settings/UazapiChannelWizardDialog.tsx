import { useEffect, useMemo, useState } from "react";
import { Loader2, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { useCreateWhatsappChannel } from "@/lib/api/whatsapp";
import { useToast } from "@/hooks/use-toast";
import type { WhatsappInstance } from "@/types/domain";

type WizardStep = "details" | "qr";

function toQrSrc(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return null;
  return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
}

export function UazapiChannelWizardDialog({
  open,
  onOpenChange,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const createChannel = useCreateWhatsappChannel();
  const [step, setStep] = useState<WizardStep>("details");
  const [channelName, setChannelName] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [createdInstance, setCreatedInstance] = useState<WhatsappInstance | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("details");
      setChannelName("");
      setIsDefault(true);
      setCreatedInstance(null);
    }
  }, [open]);

  const qrSrc = useMemo(() => toQrSrc(createdInstance?.lastQr ?? null), [createdInstance?.lastQr]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>Criar novo canal Uazapi</DialogTitle>
          <DialogDescription>
            Criamos a instância com o mesmo nome do canal e já abrimos o QR para conectar no WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pt-3">
          <Badge className={step === "details" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}>
            1. Nome
          </Badge>
          <div className="h-px flex-1 bg-border" />
          <Badge className={step === "qr" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}>
            2. QR
          </Badge>
        </div>

        {step === "details" ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="channel-name">Nome do canal</Label>
              <Input
                id="channel-name"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="Comercial SP"
                disabled={!canEdit || createChannel.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Este será o nome usado no painel da Uazapi e no AdvocaCHAT.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="channel-default" className="text-sm font-medium">
                  Definir como padrão
                </Label>
                <p className="text-xs text-muted-foreground">
                  Novos envios usam esse canal quando nenhum outro for escolhido.
                </p>
              </div>
              <Switch
                id="channel-default"
                checked={isDefault}
                onCheckedChange={setIsDefault}
                disabled={!canEdit || createChannel.isPending}
              />
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!canEdit || createChannel.isPending || channelName.trim().length < 2}
                onClick={async () => {
                  if (!canEdit) {
                    toast({
                      title: "Ação indisponível",
                      description: "Seu papel nao tem permissao para criar canais.",
                      variant: "destructive",
                    });
                    return;
                  }

                  try {
                    const instance = await createChannel.mutateAsync({
                      displayName: channelName.trim(),
                      isDefault,
                    });
                    setCreatedInstance(instance);
                    setStep("qr");
                    toast({
                      title: "Canal criado",
                      description: "Agora escaneie o QR code para conectar a instância.",
                    });
                  } catch (error) {
                    toast({
                      title: "Nao foi possivel criar o canal",
                      description: error instanceof Error ? error.message : "Tente novamente.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                {createChannel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Avançar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-secondary/40 p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Canal criado</p>
                <p className="mt-1 text-base font-semibold text-foreground">{createdInstance?.displayName ?? channelName}</p>
                <p className="text-sm text-muted-foreground">
                  {createdInstance?.uazapiInstanceName ? `Instância Uazapi: ${createdInstance.uazapiInstanceName}` : "Aguardando nome da instância."}
                </p>
              </div>
              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
                {createdInstance?.status === "connected"
                  ? "Conectada"
                  : createdInstance?.status === "error"
                    ? "Com erro"
                    : "Aguardando leitura"}
              </Badge>
            </div>

            {createdInstance?.lastError ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {createdInstance.lastError}
              </div>
            ) : null}

            {qrSrc ? (
              <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Escaneie o QR Code</p>
                </div>
                <div className="mt-4 flex justify-center">
                  <img
                    src={qrSrc}
                    alt={`QR Code do canal ${createdInstance?.displayName ?? channelName}`}
                    className="h-64 w-64 rounded-2xl border border-border bg-white p-3"
                  />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Depois de escanear, a instância entra na lista e a sincronização continua no canal criado.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <p className="text-sm font-medium text-foreground">QR code ainda não disponível</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  A Uazapi não devolveu o QR nesta resposta. Você pode fechar e tentar novamente em alguns segundos.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
