import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateWaitlistEntry,
  useSetWaitlistStatus,
  useWaitlist,
} from "@/lib/api/scheduling-waitlist";

export function WaitlistManager() {
  const { toast } = useToast();
  const { data: entries = [] } = useWaitlist();
  const createEntry = useCreateWaitlistEntry({
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const setStatus = useSetWaitlistStatus({
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [preferencia, setPreferencia] = useState("");

  const add = () => {
    if (!nome.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    createEntry.mutate(
      { customerNome: nome.trim(), customerTelefone: telefone.trim() || null, preferencia: preferencia.trim() || null },
      {
        onSuccess: () => {
          setNome("");
          setTelefone("");
          setPreferencia("");
          toast({ title: "Adicionado à lista de espera" });
        },
      },
    );
  };

  return (
    <section className="rounded-xl border border-[var(--crm-border-2)] bg-card p-4">
      <h2 className="mb-1 text-sm font-semibold">Lista de espera</h2>
      <p className="mb-3 text-xs text-[var(--crm-ink-3)]">
        Pacientes aguardando horário. Quando vagar, agende e marque como atendido.
      </p>
      <div className="space-y-1.5">
        {entries.length === 0 ? (
          <p className="text-xs text-[var(--crm-ink-3)]">Ninguém na lista.</p>
        ) : (
          entries.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between gap-2 rounded-md border border-[var(--crm-border-2)] bg-[var(--crm-surface)] px-3 py-1.5 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-[var(--crm-ink)]">{w.customerNome}</span>
                <span className="block truncate text-xs text-[var(--crm-ink-3)]">
                  {w.customerTelefone ?? ""}
                  {w.preferencia ? ` · ${w.preferencia}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setStatus.mutate({ id: w.id, status: "agendado" })}
                  className="rounded p-1 text-emerald-600 hover:bg-emerald-500/10"
                  aria-label="Marcar como agendado"
                  title="Marcar como agendado"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setStatus.mutate({ id: w.id, status: "cancelado" })}
                  className="rounded p-1 text-[var(--crm-ink-3)] hover:bg-red-500/10 hover:text-red-500"
                  aria-label="Remover"
                  title="Remover"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 space-y-2 border-t border-[var(--crm-border-2)] pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Input placeholder="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </div>
        <Input
          placeholder="Preferência (ex.: manhãs, qualquer)"
          value={preferencia}
          onChange={(e) => setPreferencia(e.target.value)}
        />
        <Button type="button" variant="outline" className="gap-1" onClick={add} disabled={createEntry.isPending}>
          <Plus className="h-4 w-4" /> Adicionar à lista
        </Button>
      </div>
    </section>
  );
}
