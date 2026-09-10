import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCreateRoom, useDeleteRoom, useRooms } from "@/lib/api/scheduling-rooms";

export function RoomsManager() {
  const { toast } = useToast();
  const { data: rooms = [] } = useRooms();
  const createRoom = useCreateRoom({
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteRoom = useDeleteRoom({
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const [nome, setNome] = useState("");

  const add = () => {
    if (!nome.trim()) return;
    createRoom.mutate(nome.trim(), { onSuccess: () => setNome("") });
  };

  return (
    <section className="rounded-xl border border-[var(--crm-border-2)] bg-card p-4">
      <h2 className="mb-1 text-sm font-semibold">Salas / recursos</h2>
      <p className="mb-3 text-xs text-[var(--crm-ink-3)]">
        Uma sala não pode receber dois agendamentos ao mesmo tempo.
      </p>
      <div className="space-y-1.5">
        {rooms.length === 0 ? (
          <p className="text-xs text-[var(--crm-ink-3)]">Nenhuma sala cadastrada.</p>
        ) : (
          rooms.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-md border border-[var(--crm-border-2)] bg-[var(--crm-surface)] px-3 py-1.5 text-sm"
            >
              <span>{r.nome}</span>
              <button
                type="button"
                onClick={() => deleteRoom.mutate(r.id)}
                className="text-[var(--crm-ink-3)] hover:text-red-500"
                aria-label="Remover sala"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-[var(--crm-border-2)] pt-3">
        <Input
          placeholder="Nome da sala (ex.: Consultório 1)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" className="gap-1" onClick={add} disabled={createRoom.isPending}>
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
    </section>
  );
}
