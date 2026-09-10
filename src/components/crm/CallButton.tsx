import { Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useStartCall } from "@/lib/api/call-logs";
import { cn } from "@/lib/utils";

type CallButtonProps = {
  phone: string | null | undefined;
  customerId?: string | null;
  chatId?: string | null;
  negotiationId?: string | null;
  disabled?: boolean;
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  label?: string;
};

export function CallButton({
  phone,
  customerId,
  chatId,
  negotiationId,
  disabled,
  className,
  variant = "outline",
  size = "sm",
  label = "Ligar",
}: CallButtonProps) {
  const { toast } = useToast();
  const startCall = useStartCall({
    onSuccess: () => {
      toast({
        title: "Ligação iniciada",
        description: "Seu telefone vai tocar — atenda para conectar com o lead.",
      });
    },
    onError: (error) => {
      toast({
        title: "Não foi possível ligar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const hasPhone = Boolean(phone && phone.trim());

  const handleClick = () => {
    if (!hasPhone) {
      toast({
        title: "Sem número",
        description: "Este lead não tem telefone para ligar.",
        variant: "destructive",
      });
      return;
    }
    startCall.mutate({
      toNumber: phone as string,
      customerId: customerId ?? null,
      chatId: chatId ?? null,
      negotiationId: negotiationId ?? null,
    });
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled || startCall.isPending || !hasPhone}
      onClick={handleClick}
      className={cn(size === "icon" ? "" : "gap-1.5", className)}
      title="Ligar para o lead (click-to-call)"
    >
      {startCall.isPending ? (
        <Loader2 className={cn("h-4 w-4 animate-spin", size !== "icon" && "mr-0")} />
      ) : (
        <Phone className="h-4 w-4" />
      )}
      {size === "icon" ? null : label}
    </Button>
  );
}
