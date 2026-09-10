import { ArrowRight, Facebook, Instagram, Loader2, MessageSquare } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useStartMetaOauth } from "@/lib/api/whatsapp";
import type { WhatsappInstance } from "@/types/domain";

type ChannelsHubSectionProps = {
  instances: WhatsappInstance[];
  isLoading: boolean;
  canEdit: boolean;
  onOpenWhatsapp: () => void;
};

export function ChannelsHubSection({
  instances,
  isLoading,
  canEdit,
  onOpenWhatsapp,
}: ChannelsHubSectionProps) {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const startMetaOauth = useStartMetaOauth({
    onSuccess: (authorizeUrl) => {
      // Redirect completo (não popup): o callback da Meta volta para esta tela.
      window.location.href = authorizeUrl;
    },
    onError: (error) => {
      toast({
        title: "Não foi possível iniciar a conexão",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  // Resultado do callback OAuth (?meta=ok|erro) vira toast e sai da URL.
  const handledOauthReturn = useRef(false);
  useEffect(() => {
    const result = searchParams.get("meta");
    if (!result || handledOauthReturn.current) return;
    handledOauthReturn.current = true;

    if (result === "ok") {
      const contas = searchParams.get("contas") ?? "1";
      toast({
        title: "Instagram conectado",
        description: `${contas} conta(s) conectada(s). As DMs já aparecem no chat.`,
      });
    } else {
      toast({
        title: "Conexão com o Instagram falhou",
        description: searchParams.get("motivo") ?? "Tente novamente.",
        variant: "destructive",
      });
    }

    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("meta");
        p.delete("contas");
        p.delete("motivo");
        return p;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams, toast]);

  const whatsappInstances = instances.filter((i) => (i.provider ?? "uazapi") === "uazapi");
  const whatsappConnected = whatsappInstances.filter((i) => i.status === "connected").length;
  const instagramInstances = instances.filter((i) => i.provider === "meta_instagram");
  const instagramConnected = instagramInstances.filter((i) => i.status === "connected").length;
  const hasInstagram = instagramInstances.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Canais</h2>
        <p className="text-sm text-muted-foreground">
          Conecte os canais de atendimento da sua operacao.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="flex flex-col border-border/60 bg-card/80">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-accent/10 p-3 text-accent">
                <MessageSquare className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <CardTitle className="text-base">WhatsApp</CardTitle>
                <CardDescription>Instancias UAZAPI conectadas ao atendimento.</CardDescription>
              </div>
            </div>
            <Badge className="shrink-0 bg-success/20 text-success">Ativo</Badge>
          </CardHeader>
          <CardContent className="mt-auto flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {isLoading ? (
                "Carregando..."
              ) : (
                <>
                  <span className="font-semibold text-foreground">{whatsappConnected}</span> de{" "}
                  <span className="font-semibold text-foreground">{whatsappInstances.length}</span>{" "}
                  conectadas
                </>
              )}
            </p>
            <Button variant="outline" size="sm" onClick={onOpenWhatsapp}>
              Gerenciar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card
          className={
            hasInstagram
              ? "flex flex-col border-border/60 bg-card/80"
              : "flex flex-col border-dashed border-border/60 bg-card/60"
          }
        >
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex items-start gap-3">
              <div
                className={
                  hasInstagram
                    ? "rounded-xl bg-accent/10 p-3 text-accent"
                    : "rounded-xl bg-secondary p-3 text-muted-foreground"
                }
              >
                <Instagram className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <CardTitle className="text-base">Instagram</CardTitle>
                <CardDescription>DMs do Instagram direto no inbox.</CardDescription>
              </div>
            </div>
            {hasInstagram ? (
              <Badge className="shrink-0 bg-success/20 text-success">Ativo</Badge>
            ) : (
              <Badge variant="outline" className="shrink-0 text-muted-foreground">
                Conectavel
              </Badge>
            )}
          </CardHeader>
          <CardContent className="mt-auto flex flex-wrap items-center justify-between gap-3">
            {hasInstagram ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{instagramConnected}</span> de{" "}
                <span className="font-semibold text-foreground">{instagramInstances.length}</span>{" "}
                conectadas
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma conta conectada.</p>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={!canEdit || startMetaOauth.isPending}
              onClick={() => startMetaOauth.mutate()}
            >
              {startMetaOauth.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {hasInstagram ? "Conectar outra" : "Conectar"}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col border-dashed border-border/60 bg-card/60">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-secondary p-3 text-muted-foreground">
                <Facebook className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <CardTitle className="text-base">Facebook</CardTitle>
                <CardDescription>Conversas do Messenger da sua pagina.</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-muted-foreground">
              Em breve
            </Badge>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button variant="outline" size="sm" disabled>
              Conectar
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
