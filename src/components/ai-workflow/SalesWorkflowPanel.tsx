import { PrevidasPanel } from "./PrevidasPanel";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bot, Download, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  downloadSalesContract,
  getSalesWorkflowConfig,
  getSalesWorkflowOverview,
  saveSalesWorkflowConfig,
  type SalesWorkflowConfig,
} from "@/lib/api/ai-sales-workflow";
import { useAiChannels, useTenantAiConfig } from "@/lib/api/ai-agent";

function WorkflowEditor({
  initial,
  onSave,
}: {
  initial: SalesWorkflowConfig;
  onSave: (config: SalesWorkflowConfig) => Promise<void>;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const { data: ai } = useTenantAiConfig();
  const { data: channels = [] } = useAiChannels();
  const nativeReady =
    ai?.provider === "native" && channels.some((channel) => channel.ai_enabled);
  const set = (patch: Partial<SalesWorkflowConfig>) =>
    setForm((current) => ({ ...current, ...patch }));
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        void onSave(form).finally(() => setSaving(false));
      }}
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">Equipe de atendimento</CardTitle>
            <Badge variant="outline">
              {form.enabled ? "Fluxo habilitado" : "Em preparação"}
            </Badge>
          </div>
          <CardDescription>
            Davi coleta as informações; o closer continua a conversa com as
            respostas preservadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr]">
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center gap-2 font-medium">
                <Bot className="h-4 w-4" />
                SDR
              </div>
              <Label htmlFor="sales-sdr-name">Nome do SDR</Label>
              <Input
                id="sales-sdr-name"
                required
                maxLength={60}
                value={form.sdr_name}
                onChange={(e) => set({ sdr_name: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                Identifica o contato, pede autorização e coleta benefício, IR
                atual ou anterior, saúde declarada e disponibilidade de
                documentos.
              </p>
              <Label htmlFor="sales-sdr-instructions">
                Orientações adicionais do SDR
              </Label>
              <Textarea
                id="sales-sdr-instructions"
                rows={5}
                maxLength={12000}
                value={form.sdr_instructions}
                onChange={(e) => set({ sdr_instructions: e.target.value })}
                placeholder="Tom de voz e orientações específicas do escritório"
              />
            </div>
            <ArrowRight
              className="hidden self-center text-muted-foreground md:block"
              aria-hidden
            />
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center gap-2 font-medium">
                <Bot className="h-4 w-4" />
                Closer
              </div>
              <Label htmlFor="sales-closer-name">Nome do closer</Label>
              <Input
                id="sales-closer-name"
                required
                maxLength={60}
                value={form.closer_name}
                onChange={(e) => set({ closer_name: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                Registra anexos recebidos, organiza pendências e prepara o
                contrato com o modelo e os honorários definidos abaixo.
              </p>
              <Label htmlFor="sales-closer-instructions">
                Orientações adicionais do closer
              </Label>
              <Textarea
                id="sales-closer-instructions"
                rows={5}
                maxLength={12000}
                value={form.closer_instructions}
                onChange={(e) => set({ closer_instructions: e.target.value })}
                placeholder="Como explicar o serviço e continuar a contratação"
              />
            </div>
          </div>
          <p className="rounded-lg bg-muted/40 p-3 text-sm">
            A passagem ocorre ao concluir a coleta autorizada, inclusive quando
            houver dúvidas ou respostas negativas. Ela não confirma o direito à
            isenção. Dados desconhecidos permanecem pendentes.
          </p>
          <div className="flex items-center gap-3">
            <Switch
              id="sales-enabled"
              checked={form.enabled}
              onCheckedChange={(enabled) => set({ enabled })}
            />
            <Label htmlFor="sales-enabled">
              Usar SDR e closer nos canais de IA nativa
            </Label>
          </div>
          {!nativeReady && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Para responder no WhatsApp, configure a IA nativa e habilite um
              canal na aba Canais. Salvar este fluxo não conecta um número nem
              ativa o provedor.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Quando habilitado, este fluxo usa as personas acima em todos os
            canais de IA nativa do escritório. Desligar o fluxo devolve o
            atendimento à configuração geral. A recusa do contato pausa a
            coleta.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Follow-ups automáticos</CardTitle>
          <CardDescription>
            O sistema cancela as mensagens pendentes quando o cliente responde,
            retira o consentimento ou muda de etapa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="sales-followups-enabled">
              Enviar follow-ups de pendências
            </Label>
            <Switch
              id="sales-followups-enabled"
              checked={form.followups_enabled}
              onCheckedChange={(checked) => set({ followups_enabled: checked })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sales-followup-first">
                Primeiro contato, em horas
              </Label>
              <Input
                id="sales-followup-first"
                type="number"
                min={1}
                max={168}
                value={form.followup_first_hours}
                onChange={(event) =>
                  set({ followup_first_hours: Number(event.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sales-followup-second">
                Segundo contato, em horas
              </Label>
              <Input
                id="sales-followup-second"
                type="number"
                min={2}
                max={336}
                value={form.followup_second_hours}
                onChange={(event) =>
                  set({ followup_second_hours: Number(event.target.value) })
                }
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Limite de duas tentativas por etapa. Falhas técnicas são repetidas
            com atraso e ficam visíveis no painel.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Contrato e condições comerciais
          </CardTitle>
          <CardDescription>
            O closer pode preencher e guardar uma cópia do modelo autorizado.
            Alterações neste bloco exigem nova confirmação antes do uso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sales-fees">
              Honorários e condições permitidas
            </Label>
            <Textarea
              id="sales-fees"
              rows={3}
              maxLength={4000}
              value={form.fee_terms}
              onChange={(e) =>
                set({ fee_terms: e.target.value, template_approved: false })
              }
              placeholder="Informe valores, forma de pagamento e limites de negociação previamente definidos."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sales-contract">Modelo de contrato</Label>
            <Textarea
              id="sales-contract"
              rows={8}
              maxLength={50000}
              value={form.contract_template}
              onChange={(e) =>
                set({
                  contract_template: e.target.value,
                  template_approved: false,
                })
              }
              placeholder="Cole o texto validado pelo escritório."
            />
            <p className="text-xs text-muted-foreground">
              Campos disponíveis:{" "}
              {"{{nome}}, {{email}}, {{telefone}} e {{honorarios}}"}. Outros
              campos impedem a preparação. O agente não pode criar cláusulas ou
              descontos.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.template_approved}
              disabled={
                !form.contract_template.trim() || !form.fee_terms.trim()
              }
              onChange={(e) => set({ template_approved: e.target.checked })}
            />
            Confirmo que este modelo e estas condições foram validados pelo
            escritório para preenchimento automático.
          </label>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <strong>Integrações pendentes</strong>
            <p className="mt-1">
              Assinatura eletrônica e análise do conteúdo dos anexos ainda não
              estão conectadas ao closer. O fluxo não envia contratos para
              assinar nem aprova laudos. As decisões jurídicas e a assinatura do
              cliente permanecem distintas da preparação comercial.
            </p>
          </div>
        </CardContent>
      </Card>
      <Button type="submit" disabled={saving}>
        {saving ? "Salvando…" : "Salvar equipe e condições"}
      </Button>
    </form>
  );
}

export function SalesWorkflowPanel() {
  const { profile } = useAuth();
  const admin = profile?.role === "admin";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const key = ["sales-workflow-config", profile?.id];
  const config = useQuery({
    queryKey: key,
    queryFn: getSalesWorkflowConfig,
    enabled: admin,
  });
  const overview = useQuery({
    queryKey: ["sales-workflow-overview", profile?.id],
    queryFn: getSalesWorkflowOverview,
    enabled: admin,
    refetchInterval: 30000,
  });
  if (!admin)
    return (
      <p className="rounded-lg border p-4">
        A configuração da equipe de agentes é reservada ao administrador do
        escritório.
      </p>
    );
  if (config.isPending) return <p>Carregando equipe…</p>;
  if (config.error)
    return (
      <div role="alert" className="space-y-3 rounded-lg border p-4">
        <p>Não foi possível carregar os agentes: {config.error.message}</p>
        <Button variant="outline" onClick={() => void config.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  async function save(value: SalesWorkflowConfig) {
    try {
      const saved = await saveSalesWorkflowConfig(value);
      queryClient.setQueryData(key, saved);
      toast({ title: "Equipe e condições salvas" });
    } catch (error) {
      toast({
        title: "Não foi possível salvar",
        description: error instanceof Error ? error.message : "Erro inesperado",
        variant: "destructive",
      });
    }
  }
  return (
    <div className="space-y-5">
      <PrevidasPanel />
      <WorkflowEditor
        key={config.data.revision}
        initial={config.data}
        onSave={save}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Atendimentos dos agentes</CardTitle>
          <CardDescription>
            Até 30 conversas recentes. Arquivos recebidos ainda precisam de
            processamento documental.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.error ? (
            <p role="alert">
              Não foi possível consultar os atendimentos:{" "}
              {overview.error.message}
            </p>
          ) : overview.isPending ? (
            <p>Carregando atendimentos…</p>
          ) : !overview.data?.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhum atendimento deste fluxo. As conversas aparecerão após a
              atuação dos agentes em um canal habilitado.
            </p>
          ) : (
            <ul className="divide-y">
              {overview.data.map((row) => (
                <li
                  key={row.chat_id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <span className="min-w-0 flex-1 break-words">
                    {row.display_name || "Contato"}
                  </span>
                  <Badge variant="secondary">
                    {
                      { sdr: "SDR", closer: "Closer", paused: "Pausado" }[
                        row.phase
                      ]
                    }
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {row.documents_received} anexo(s) não revisado(s)
                  </span>
                  {row.crm_stage_id && (
                    <Badge variant="outline">
                      CRM: {row.crm_stage_id.replace(/-/g, " ")}
                    </Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {row.documents_stored ?? 0} no caso jurídico
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Theo: {row.theo_completed ?? 0} analisado(s)
                    {(row.theo_pending ?? 0) > 0
                      ? ` · ${row.theo_pending} na fila`
                      : ""}
                  </span>
                  {row.theo_recommended_action && (
                    <span className="text-sm text-muted-foreground">
                      Próxima ação: {row.theo_recommended_action.replace(/_/g, " ")}
                    </span>
                  )}
                  {row.next_task_at && (
                    <span className="text-sm text-muted-foreground">
                      Tarefa:{" "}
                      {new Date(row.next_task_at).toLocaleString("pt-BR")}
                    </span>
                  )}
                  {row.next_followup_at && (
                    <span className="text-sm text-muted-foreground">
                      Follow-up:{" "}
                      {new Date(row.next_followup_at).toLocaleString("pt-BR")}
                    </span>
                  )}
                  {((row.document_failures ?? 0) > 0 ||
                    (row.followup_failures ?? 0) > 0) && (
                    <Badge variant="destructive">
                      {(row.document_failures ?? 0) +
                        (row.followup_failures ?? 0)}{" "}
                      falha(s)
                    </Badge>
                  )}
                  {row.draft_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void downloadSalesContract(row.draft_id!).catch(
                          (error: Error) =>
                            toast({
                              title: "Não foi possível baixar",
                              description: error.message,
                              variant: "destructive",
                            }),
                        )
                      }
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Rascunho do contrato
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
