import { useState } from "react";
import { Network, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateTeam,
  useDeleteTeam,
  useSetUserTeam,
  useTeamsData,
  useUpdateTeam,
} from "@/lib/api/teams";

const NO_MANAGER = "__none__";
const NO_TEAM = "__none__";

export function TeamsSettingsSection({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const { data, isLoading, error } = useTeamsData();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const setUserTeam = useSetUserTeam();

  const [newName, setNewName] = useState("");
  const [newManager, setNewManager] = useState<string>(NO_MANAGER);

  const teams = data?.teams ?? [];
  const members = data?.members ?? [];

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast({ title: "Informe um nome", variant: "destructive" });
      return;
    }
    try {
      await createTeam.mutateAsync({ name: newName, managerId: newManager === NO_MANAGER ? null : newManager });
      setNewName("");
      setNewManager(NO_MANAGER);
      toast({ title: "Time criado" });
    } catch (e) {
      toast({ title: "Erro ao criar time", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Network className="h-5 w-5 text-primary" />
            Times
          </CardTitle>
          <CardDescription>
            Organize a equipe em times com um gerente. O gerente passa a enxergar as conversas e negociações
            dos membros do time dele, mesmo com papel de atendimento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Nome do time</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Comercial SP" />
              </div>
              <div className="space-y-1.5 sm:w-56">
                <Label className="text-xs">Gerente</Label>
                <Select value={newManager} onValueChange={setNewManager}>
                  <SelectTrigger><SelectValue placeholder="Sem gerente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_MANAGER}>Sem gerente</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={() => void handleCreate()} disabled={createTeam.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                Criar
              </Button>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive">Erro ao carregar times: {(error as Error).message}</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : teams.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Nenhum time criado ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map((team) => (
                <div key={team.id} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{team.name}</span>
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        <Users className="mr-1 h-3 w-3" />
                        {team.memberCount}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Gerente: {team.managerName ?? "—"}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex items-center gap-2">
                      <Select
                        value={team.managerId ?? NO_MANAGER}
                        onValueChange={(v) =>
                          updateTeam.mutate({ id: team.id, patch: { managerId: v === NO_MANAGER ? null : v } })
                        }
                      >
                        <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Gerente" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_MANAGER}>Sem gerente</SelectItem>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(`Excluir o time "${team.name}"? Os membros ficam sem time.`)) {
                            deleteTeam.mutate(team.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {teams.length > 0 && canEdit ? (
        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle className="text-base">Membros dos times</CardTitle>
            <CardDescription>Defina a qual time cada colaborador pertence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="truncate font-medium text-foreground">{m.nome}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{m.role}</span>
                </div>
                <Select
                  value={m.teamId ?? NO_TEAM}
                  onValueChange={(v) => setUserTeam.mutate({ userId: m.id, teamId: v === NO_TEAM ? null : v })}
                >
                  <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Sem time" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEAM}>Sem time</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
