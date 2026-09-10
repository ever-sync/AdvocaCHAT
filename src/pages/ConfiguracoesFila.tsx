import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useToast } from "@/hooks/use-toast";
import {
  useChatQueueSettings,
  useChatQueueWorkload,
  useSaveChatQueueDistribution,
  type ChatQueueAttendantRow,
  type QueueDistributionStrategy,
} from "@/lib/api/chat-queue";
import { isSupabaseConfigured } from "@/lib/supabase";

type AttendantDraft = {
  profileId: string;
  name: string;
  email: string;
  openChats: number;
  enabled: boolean;
  maxOpenChats: string;
};

function rowsToDraft(rows: ChatQueueAttendantRow[]): AttendantDraft[] {
  return rows.map((row) => ({
    profileId: row.profileId,
    name: row.name,
    email: row.email,
    openChats: row.openChats,
    enabled: row.inQueue ? row.queueEnabled : true,
    maxOpenChats: row.maxOpenChats != null ? String(row.maxOpenChats) : "",
  }));
}

export default function ConfiguracoesFila() {
  const { toast } = useToast();
  const { can } = useRolePermissions();
  const canEdit = can("configuracoes", "edit");

  const { data: settings, isLoading: settingsLoading } = useChatQueueSettings();
  const { data: workload = [], isLoading: workloadLoading } = useChatQueueWorkload();
  const saveQueue = useSaveChatQueueDistribution();

  const [autoAssign, setAutoAssign] = useState(false);
  const [syncCrm, setSyncCrm] = useState(true);
  const [strategy, setStrategy] = useState<QueueDistributionStrategy>("least_open_chats");
  const [globalMax, setGlobalMax] = useState("");
  const [attendants, setAttendants] = useState<AttendantDraft[]>([]);

  useEffect(() => {
    if (!settings) {
      return;
    }
    setAutoAssign(settings.autoAssignOnLead);
    setSyncCrm(settings.syncAssigneeChatCrm);
    setStrategy(settings.strategy);
    setGlobalMax(settings.maxOpenChatsPerAttendant != null ? String(settings.maxOpenChatsPerAttendant) : "");
  }, [settings]);

  useEffect(() => {
    if (workload.length > 0) {
      setAttendants(rowsToDraft(workload));
    }
  }, [workload]);

  const enabledCount = useMemo(
    () => attendants.filter((a) => a.enabled).length,
    [attendants],
  );

  const loading = settingsLoading || workloadLoading;

  async function handleSave() {
    if (!canEdit) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel não tem permissão para alterar a fila.",
        variant: "destructive",
      });
      return;
    }

    const parsedGlobal = globalMax.trim() ? Number(globalMax) : null;
    if (parsedGlobal != null && (!Number.isFinite(parsedGlobal) || parsedGlobal <= 0)) {
      toast({
        title: "Limite inválido",
        description: "Informe um número maior que zero ou deixe em branco para sem limite.",
        variant: "destructive",
      });
      return;
    }

    try {
      await saveQueue.mutateAsync({
        settings: {
          autoAssignOnLead: autoAssign,
          syncAssigneeChatCrm: syncCrm,
          maxOpenChatsPerAttendant: parsedGlobal,
          strategy,
        },
        attendants: attendants.map((a) => {
          const max = a.maxOpenChats.trim() ? Number(a.maxOpenChats) : null;
          return {
            profileId: a.profileId,
            enabled: a.enabled,
            maxOpenChats: max != null && Number.isFinite(max) && max > 0 ? Math.round(max) : null,
          };
        }),
      });
      toast({
        title: "Fila salva",
        description: "Regras de distribuição e atendentes atualizados.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  function toggleAll(enabled: boolean) {
    setAttendants((prev) => prev.map((a) => ({ ...a, enabled })));
  }

  function updateAttendant(profileId: string, patch: Partial<AttendantDraft>) {
    setAttendants((prev) =>
      prev.map((a) => (a.profileId === profileId ? { ...a, ...patch } : a)),
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <PageShell contentClassName="text-sm text-muted-foreground">
        Configure o Supabase para gerenciar a fila de atendimento.
      </PageShell>
    );
  }

  return (
    <PageShell contentClassName="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
            <Link to="/configuracoes?aba=integracoes">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar às configurações
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fila de atendimento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Distribua conversas sem responsável entre os atendentes por menor carga ou rodízio.
          </p>
        </div>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={!canEdit || saveQueue.isPending || loading}
          onClick={() => void handleSave()}
        >
          {saveQueue.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar fila
        </Button>
      </div>

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="text-lg">Distribuição automática</CardTitle>
          <CardDescription>
            Quando ativa, novas conversas no pool (e leads com auto-atribuição) são enviadas a um
            atendente elegível abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
            <div>
              <Label htmlFor="auto-assign-queue">Ativar distribuição automática</Label>
              <p className="text-xs text-muted-foreground">
                Equivale à opção em Integrações → Distribuir chat automaticamente.
              </p>
            </div>
            <Switch
              id="auto-assign-queue"
              checked={autoAssign}
              onCheckedChange={setAutoAssign}
              disabled={!canEdit}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Estratégia</Label>
              <Select
                value={strategy}
                onValueChange={(v) => setStrategy(v as QueueDistributionStrategy)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="least_open_chats">Menor carga (recomendado)</SelectItem>
                  <SelectItem value="round_robin">Rodízio (desempate por antiguidade)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="global-max">Limite global de conversas abertas</Label>
              <Input
                id="global-max"
                type="number"
                min={1}
                placeholder="Sem limite"
                value={globalMax}
                onChange={(e) => setGlobalMax(e.target.value)}
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground">
                Atendentes no limite não recebem novas conversas da fila.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-4 py-3">
            <div>
              <Label htmlFor="sync-crm">Sincronizar responsável com o CRM</Label>
              <p className="text-xs text-muted-foreground">
                Ao assumir chat, atualiza negócio vinculado (quando configurado no tenant).
              </p>
            </div>
            <Switch id="sync-crm" checked={syncCrm} onCheckedChange={setSyncCrm} disabled={!canEdit} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-primary" />
              Atendentes na fila
            </CardTitle>
            <CardDescription>
              {enabledCount > 0
                ? `${enabledCount} atendente(s) participam da distribuição.`
                : "Nenhum selecionado: todos os atendentes ativos entram na rotação (comportamento padrão)."}
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!canEdit} onClick={() => toggleAll(true)}>
              Marcar todos
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!canEdit} onClick={() => toggleAll(false)}>
              Limpar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando atendentes…</p>
          ) : attendants.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum colaborador com papel Atendimento ativo neste tenant.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Fila</TableHead>
                    <TableHead>Atendente</TableHead>
                    <TableHead className="text-right">Abertas</TableHead>
                    <TableHead className="w-28">Limite próprio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendants.map((row) => (
                    <TableRow key={row.profileId}>
                      <TableCell>
                        <Checkbox
                          checked={row.enabled}
                          onCheckedChange={(checked) =>
                            updateAttendant(row.profileId, { enabled: checked === true })
                          }
                          disabled={!canEdit}
                          aria-label={`Incluir ${row.name} na fila`}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{row.name}</p>
                        <p className="text-xs text-muted-foreground">{row.email}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.openChats}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          placeholder="—"
                          className="h-8"
                          value={row.maxOpenChats}
                          onChange={(e) =>
                            updateAttendant(row.profileId, { maxOpenChats: e.target.value })
                          }
                          disabled={!canEdit || !row.enabled}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
