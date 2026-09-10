// Diálogo de matrícula manual de leads num fluxo (Fase 5 — gatilho manual).
// Busca clientes por nome/telefone, multi-seleção, e chama o RPC de matrícula.
// Só faz sentido com o fluxo ATIVO (o RPC recusa fluxo inativo).
import { useEffect, useState } from "react";
import { Check, Loader2, Search, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  searchCustomersForEnroll,
  useEnrollCustomersInFlow,
  type ManualCustomer,
} from "@/lib/api/marketing-flow-manual";

export function ManualEnrollDialog({
  open,
  onOpenChange,
  flowId,
  flowActive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowId: string;
  flowActive: boolean;
}) {
  const { toast } = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ManualCustomer[]>([]);
  const [selected, setSelected] = useState<Map<string, ManualCustomer>>(new Map());
  const [searching, setSearching] = useState(false);
  const enroll = useEnrollCustomersInFlow();

  // Reseta ao abrir.
  useEffect(() => {
    if (open) {
      setTerm("");
      setResults([]);
      setSelected(new Map());
    }
  }, [open]);

  // Busca com debounce simples.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const list = await searchCustomersForEnroll(term);
        if (!cancelled) setResults(list);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [term, open]);

  const toggle = (customer: ManualCustomer) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(customer.id)) next.delete(customer.id);
      else next.set(customer.id, customer);
      return next;
    });
  };

  const handleEnroll = () => {
    if (selected.size === 0) return;
    enroll.mutate(
      { flowId, customerIds: [...selected.keys()] },
      {
        onSuccess: (res) => {
          toast({
            title: "Leads matriculados",
            description:
              res.skipped > 0
                ? `${res.enrolled} adicionado(s), ${res.skipped} já estavam no fluxo`
                : `${res.enrolled} adicionado(s) ao fluxo`,
          });
          onOpenChange(false);
        },
        onError: (e) =>
          toast({
            title: "Erro ao matricular",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar leads manualmente</DialogTitle>
          <DialogDescription>
            Busque clientes por nome ou telefone e matricule-os neste fluxo agora.
          </DialogDescription>
        </DialogHeader>

        {!flowActive ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
            Ative o fluxo (Salvar e Ativar) para poder matricular leads manualmente.
          </div>
        ) : (
          <>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              {searching ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Buscando…
                </div>
              ) : results.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum cliente encontrado.
                </div>
              ) : (
                results.map((customer) => {
                  const isSelected = selected.has(customer.id);
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => toggle(customer)}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/50",
                        isSelected ? "bg-primary/5" : "",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {isSelected ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-foreground">{customer.nome}</span>
                        {customer.telefone ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {customer.telefone}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selecionado(s)` : ""}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleEnroll}
              disabled={!flowActive || selected.size === 0 || enroll.isPending}
              className="gap-2"
            >
              {enroll.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden />
              )}
              Matricular
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
