import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Kanban,
  Mail,
  MoreHorizontal,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatBRL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerCrmPipelineForm } from "@/components/cliente/CustomerCrmPipelineForm";
import { CrmNegotiationDocumentsSection } from "@/components/crm/CrmNegotiationDocumentsSection";
import { CustomerMediaGallery } from "@/components/inbox/CustomerMediaGallery";
import { NegotiationProductsEditor } from "@/components/crm/NegotiationProductsEditor";
import { CallLogsPanel } from "@/components/crm/CallLogsPanel";
import { CustomerCustomFieldsFacts } from "@/components/customers/CustomerCustomFieldsFacts";
import { CustomerLeadSheet } from "@/components/customers/CustomerLeadSheet";
import { type CrmFunnel, DEFAULT_CRM_FUNNELS, funnelListNameIn, funnelStageTitleIn } from "@/data/crm-funnels";
import { useCrmNegotiationsForCustomer, useUpdateCrmNegotiation } from "@/lib/api/crm-negotiations";
import { useCrmTasksForCustomer, useCrmTasksForNegotiation } from "@/lib/api/crm-tasks";
import { useTenantCrmFunnelConfig } from "@/lib/api/crm-funnel-config";
import {
  toCustomerUpsertInput,
  syncCustomerNomeToChatsAndCrm,
  useCreateCustomer,
  useCustomer,
  useCustomers,
  useDistinctCustomerTags,
  useUpdateCustomer,
} from "@/lib/api/customers";
import { useChatNegotiation, useEnsureLeadFromChat, useSetChatResolution } from "@/lib/api/crm-lead";
import { useAtendimentoUsers, useSetChatAiMode } from "@/lib/api/chat-tags";
import { useCustomerAiFacts, useDeleteCustomerAiFact } from "@/lib/api/customer-ai-facts";
import { useDeleteWhatsappChat, useLinkWhatsappChatCustomer } from "@/lib/api/whatsapp";
import { ChatTagsPicker } from "@/components/inbox/ChatTagsPicker";
import { CUSTOMER_TAGS_SOURCE_KEY, parseCustomerTags, serializeCustomerTags } from "@/lib/customer-tags";
import { CRM_FUNNEL_ID_KEY, CRM_PIPELINE_STAGE_KEY } from "@/lib/crm-pipeline";
import { leadPrefillFromInboxChat, linkSearchHintFromInboxChat } from "@/lib/inbox-clientes-deeplink";
import { isInlineMediaUrlAllowed } from "@/lib/restricted-media-hosts";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  canAtendimentoActOnChat,
  chatAssigneeBlockedMessage,
  negotiationAssigneeBlockedMessage,
} from "@/lib/crm/negotiation-assignee";
import { isPersistedCrmNegotiationId } from "@/lib/crm/negotiation-model";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { CHAT_RESOLUTION_LABELS } from "@/lib/inbox-chat-rules";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import {
  type ChatResolution,
  type CrmNegotiationRecord,
  type CrmTask,
  type CrmNegotiationStatus,
  type Customer,
  type InboxChat,
  type CustomerUpsertInput,
  type WhatsappMessage,
} from "@/types/domain";

function negotiationStatusLabelPt(s: CrmNegotiationStatus): string {
  const map: Record<CrmNegotiationStatus, string> = {
    em_andamento: "Em andamento",
    vendido: "Vendido",
    perdido: "Perdido",
    pausado: "Pausado",
    nao_pausado: "Não pausado",
  };
  return map[s] ?? s;
}

function isUuidString(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatMoney(value?: number) {
  return formatBRL(value);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Nao informado";
  }

  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Sem data";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatTaskDue(value?: string | null) {
  if (!value) {
    return "Sem prazo";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function taskDueTone(task: CrmTask): "done" | "overdue" | "scheduled" | "none" {
  if (task.status === "concluida") {
    return "done";
  }
  if (!task.dueAt) {
    return "none";
  }
  const time = Date.parse(task.dueAt);
  if (Number.isNaN(time)) {
    return "none";
  }
  return time < Date.now() ? "overdue" : "scheduled";
}

function infoValue(value?: string | null) {
  return value?.trim() ? value : "Nao informado";
}

function profileHeaderPhone(customer: Customer | null | undefined, chat: InboxChat | null): string {
  const phone =
    customer?.telefone?.trim() ||
    chat?.remotePhoneE164?.trim() ||
    chat?.remotePhoneDigits?.trim() ||
    chat?.remoteJid?.trim() ||
    "";
  return phone || "Telefone não informado";
}

function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("@s.whatsapp.net")) {
    return true;
  }
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 8 && /^[\d\s()+\-./]+$/.test(trimmed);
}

function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return value.trim();
}

function resolveProfileIdentity(
  customer: Customer | null | undefined,
  chat: InboxChat | null,
): { displayName: string; phone: string; phoneFormatted: string } {
  const phone = profileHeaderPhone(customer, chat);
  const phoneFormatted =
    phone !== "Telefone não informado" ? formatPhoneDisplay(phone) : phone;

  const candidates = [
    customer?.nome?.trim(),
    chat?.customerName?.trim(),
    chat?.displayName?.trim(),
  ].filter((value): value is string => Boolean(value?.trim()));

  const properName = candidates.find((candidate) => !looksLikePhone(candidate));
  const displayName = properName ?? "Contato sem nome";

  return { displayName, phone, phoneFormatted };
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const FUNNEL_NONE = "__funnel_none__";

function ProfileTagsPicker({
  customer,
  suggestionTags,
  disabled = false,
}: {
  customer: Customer;
  suggestionTags: string[];
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const updateCustomer = useUpdateCustomer();
  const tags = useMemo(() => parseCustomerTags(customer.sourceColumns), [customer.sourceColumns]);
  const [input, setInput] = useState("");

  const addable = useMemo(
    () => suggestionTags.filter((t) => !tags.includes(t) && t.trim().length >= 2),
    [suggestionTags, tags],
  );

  const isBusy = disabled || updateCustomer.isPending;

  const commit = async (next: string[]) => {
    if (disabled) {
      return;
    }
    try {
      await updateCustomer.mutateAsync({
        id: customer.id,
        input: {
          ...toCustomerUpsertInput(customer),
          sourceColumns: {
            ...customer.sourceColumns,
            [CUSTOMER_TAGS_SOURCE_KEY]: serializeCustomerTags(next),
          },
        },
      });
    } catch (e) {
      toast({
        title: "Erro ao salvar tags",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="rounded-[20px] border border-[var(--inbox-border)] bg-card/90 p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--inbox-muted-2)]">Tags</p>
      <div className="mt-2 flex min-h-[36px] flex-wrap gap-2">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] px-2.5 py-1 text-xs font-medium text-[var(--crm-brand)]"
          >
            {t}
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-[var(--crm-brand-tint)]"
              aria-label={`Remover tag ${t}`}
              disabled={isBusy}
              onClick={() => void commit(tags.filter((x) => x !== t))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 ? <span className="text-sm text-[var(--inbox-muted-2)]">Nenhuma tag.</span> : null}
      </div>
      <div className="mt-3 space-y-2">
        <Label className="text-xs text-[var(--inbox-muted)]">Adicionar tag já usada na base</Label>
        {addable.length === 0 ? (
          <p className="text-xs text-[var(--inbox-muted-2)]">Nenhuma outra tag conhecida além das já aplicadas.</p>
        ) : (
          <Select
            disabled={isBusy}
            onValueChange={(v) => {
              if (tags.includes(v)) {
                return;
              }
              void commit([...tags, v]);
            }}
          >
            <SelectTrigger className="h-9 rounded-xl border-[var(--inbox-border)] bg-card">
              <SelectValue placeholder="Escolher tag…" />
            </SelectTrigger>
            <SelectContent>
              {addable.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ou criar tag nova (Enter)"
            className="h-9 flex-1 rounded-xl border-[var(--inbox-border)] bg-card"
            disabled={isBusy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const v = input.trim();
                if (!v || tags.includes(v)) {
                  setInput("");
                  return;
                }
                setInput("");
                void commit([...tags, v]);
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-9 w-9 shrink-0 rounded-xl"
            disabled={isBusy || !input.trim() || tags.includes(input.trim())}
            aria-label="Adicionar tag nova"
            onClick={() => {
              const v = input.trim();
              if (!v) {
                return;
              }
              setInput("");
              void commit([...tags, v]);
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}


function chatAttendantLabel(chat: InboxChat | null): string {
  const name = chat?.assigneeName?.trim();
  return name || "Sem atendente";
}

function negotiationAssigneeLabel(
  assigneeId: string | null | undefined,
  resolveName: (id: string) => string | null,
): string {
  const id = assigneeId?.trim();
  if (!id) {
    return "Pool (sem responsável)";
  }
  return resolveName(id) ?? "Responsável não identificado";
}

function EditableCustomerFactRow({
  label,
  value,
  field,
  customer,
  canEdit,
  showEditButton,
  editBlockedMessage,
  inputType = "text",
  placeholder,
}: {
  label: string;
  value: string;
  field: "nome" | "email";
  customer: Customer;
  canEdit: boolean;
  showEditButton: boolean;
  editBlockedMessage?: string | null;
  inputType?: "text" | "email";
  placeholder?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateCustomer = useUpdateCustomer();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [editing, value]);

  const isBusy = updateCustomer.isPending;
  const display =
    field === "nome" && value.trim() && looksLikePhone(value)
      ? "Adicionar nome"
      : value.trim()
        ? value
        : "Não informado";

  const save = async () => {
    const trimmed = draft.trim();
    if (field === "nome" && trimmed.length < 2) {
      toast({
        title: "Nome obrigatório",
        description: "Informe pelo menos 2 caracteres.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateCustomer.mutateAsync({
        id: customer.id,
        input: {
          ...toCustomerUpsertInput(customer),
          ...(field === "nome" ? { nome: trimmed } : { email: trimmed }),
        },
      });

      if (field === "nome" && isSupabaseConfigured) {
        await syncCustomerNomeToChatsAndCrm(customer.id, trimmed);
        await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
        await queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
        await queryClient.invalidateQueries({ queryKey: ["crm-negotiations", "customer", customer.id] });
      }

      setEditing(false);
      toast({
        title: "Salvo",
        description:
          field === "nome"
            ? "Nome atualizado na lista de contatos, conversas e CRM."
            : "E-mail atualizado no cadastro do cliente.",
      });
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const startEditing = () => {
    if (!canEdit) {
      toast({
        title: "Edição indisponível",
        description: editBlockedMessage ?? "Você não pode editar este campo agora.",
        variant: "destructive",
      });
      return;
    }
    setDraft(field === "nome" && looksLikePhone(value) ? "" : value.trim());
    setEditing(true);
  };

  const FieldIcon = field === "email" ? Mail : User;

  return (
    <div className="flex items-start gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
        <FieldIcon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <div
          className={
            showEditButton && !editing
              ? "mt-1 flex min-w-0 cursor-pointer items-center gap-2 rounded-md py-0.5 transition-colors hover:bg-muted/40"
              : "mt-1 flex min-w-0 items-center gap-2"
          }
          onClick={showEditButton && !editing ? startEditing : undefined}
          role={showEditButton && !editing ? "button" : undefined}
          tabIndex={showEditButton && !editing ? 0 : undefined}
          title={
            showEditButton && !editing
              ? canEdit
                ? `Editar ${label.toLowerCase()}`
                : (editBlockedMessage ?? undefined)
              : undefined
          }
        >
          {editing ? (
            <>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                type={inputType}
                placeholder={placeholder}
                className="h-9 min-w-0 flex-1 rounded-lg text-sm"
                disabled={isBusy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void save();
                  }
                  if (e.key === "Escape") {
                    setDraft(value);
                    setEditing(false);
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-8 w-8 shrink-0 rounded-lg"
                disabled={isBusy}
                aria-label="Salvar"
                onClick={(e) => {
                  e.stopPropagation();
                  void save();
                }}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 rounded-lg"
                disabled={isBusy}
                aria-label="Cancelar"
                onClick={(e) => {
                  e.stopPropagation();
                  setDraft(value);
                  setEditing(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <p
                className={cn(
                  "min-w-0 flex-1 break-words text-sm font-medium leading-snug",
                  display === "Adicionar nome" || display === "Não informado"
                    ? "text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {display}
              </p>
              {showEditButton ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-primary"
                  disabled={isBusy}
                  aria-label={`Editar ${label.toLowerCase()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditing();
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </h3>
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        {children}
      </div>
    </section>
  );
}

function ProfileFactRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
      {Icon ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-sm font-medium leading-snug text-foreground">{value}</p>
      </div>
    </div>
  );
}

function CustomerQuickFacts({
  customer,
  chat,
  messageCount,
  linkedNegotiationAssigneeLabel,
  canEditIdentity,
  showIdentityEditButton,
  identityEditBlockedMessage,
}: {
  customer: Customer;
  chat: InboxChat | null;
  messageCount: number;
  linkedNegotiationAssigneeLabel?: string | null;
  canEditIdentity: boolean;
  showIdentityEditButton: boolean;
  identityEditBlockedMessage?: string | null;
}) {
  return (
    <div className="space-y-5">
      <ProfileSection title="Contato">
        <EditableCustomerFactRow
          label="Nome"
          value={customer.nome ?? ""}
          field="nome"
          customer={customer}
          canEdit={canEditIdentity}
          showEditButton={showIdentityEditButton}
          editBlockedMessage={identityEditBlockedMessage}
          placeholder="Nome do contato"
        />
        <EditableCustomerFactRow
          label="E-mail"
          value={customer.email ?? ""}
          field="email"
          customer={customer}
          canEdit={canEditIdentity}
          showEditButton={showIdentityEditButton}
          editBlockedMessage={identityEditBlockedMessage}
          inputType="email"
          placeholder="email@exemplo.com"
        />
      </ProfileSection>

      {chat || linkedNegotiationAssigneeLabel != null ? (
        <ProfileSection title="Atendimento">
          {chat ? (
            <ProfileFactRow label="Atendente da conversa" value={chatAttendantLabel(chat)} icon={User} />
          ) : null}
          {linkedNegotiationAssigneeLabel != null ? (
            <ProfileFactRow label="Responsável no CRM" value={linkedNegotiationAssigneeLabel} icon={Kanban} />
          ) : null}
        </ProfileSection>
      ) : null}

      <ProfileSection title="Histórico">
        <ProfileFactRow label="Cadastro" value={formatDate(customer.cadastradoEm)} icon={CalendarClock} />
        {chat ? (
          <ProfileFactRow label="Mensagens nesta conversa" value={String(messageCount)} icon={Phone} />
        ) : null}
        {chat ? (
          <ProfileFactRow label="Última mensagem" value={formatDateTime(chat.lastMessageAt)} icon={CalendarClock} />
        ) : null}
      </ProfileSection>
    </div>
  );
}

const PROFILE_TAB_TRIGGER_CLASS =
  "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

function ProfileTasksPanel({
  tasks,
  isLoading,
  negotiations,
  effectiveCrmFunnels,
}: {
  tasks: CrmTask[];
  isLoading: boolean;
  negotiations: CrmNegotiationRecord[];
  effectiveCrmFunnels: CrmFunnel[];
}) {
  const negotiationById = useMemo(
    () => new Map(negotiations.map((n) => [n.id, n])),
    [negotiations],
  );

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "aberta" ? -1 : 1;
      }
      const at = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER;
      const bt = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER;
      return at - bt;
    });
  }, [tasks]);

  return (
    <div className="rounded-[20px] border border-[var(--inbox-border)] bg-card/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--inbox-muted-2)]">
          Tarefas do lead
        </p>
        <Badge className="border border-[var(--inbox-border)] bg-[var(--inbox-surface)] text-[10px] font-medium text-[var(--inbox-muted)]">
          {tasks.length} tarefa{tasks.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-[var(--inbox-muted)]">Carregando tarefas…</p>
      ) : sortedTasks.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--inbox-muted)]">
          Nenhuma tarefa vinculada a este lead.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {sortedTasks.map((task) => {
            const tone = taskDueTone(task);
            const negotiation = task.negotiationId ? negotiationById.get(task.negotiationId) : null;
            const scopeLabel = negotiation
              ? `${funnelListNameIn(effectiveCrmFunnels, negotiation.funnelId)} · ${funnelStageTitleIn(
                  effectiveCrmFunnels,
                  negotiation.funnelId,
                  negotiation.stageId,
                )}`
              : "Cliente";
            const StatusIcon = task.status === "concluida" ? CheckCircle2 : Circle;
            return (
              <li
                key={task.id}
                className="rounded-2xl border border-[var(--inbox-border)] bg-[var(--inbox-surface)] px-3 py-3"
              >
                <div className="flex items-start gap-2.5">
                  <StatusIcon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      task.status === "concluida"
                        ? "text-emerald-600"
                        : "text-[var(--crm-brand)]",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-semibold leading-snug text-[var(--inbox-ink)]">
                        {task.title}
                      </p>
                      <Badge
                        className={cn(
                          "shrink-0 border text-[10px] font-medium",
                          task.status === "concluida"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]",
                        )}
                      >
                        {task.status === "concluida" ? "Concluída" : "Aberta"}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--inbox-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock
                          className={cn(
                            "h-3.5 w-3.5",
                            tone === "overdue" && "text-[var(--crm-danger,#dc2626)]",
                            tone === "done" && "text-emerald-600",
                          )}
                          aria-hidden
                        />
                        {formatTaskDue(task.dueAt)}
                      </span>
                      <span>{scopeLabel}</span>
                    </div>
                    {task.notes.trim() ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-xl bg-card px-3 py-2 text-xs leading-relaxed text-[var(--inbox-muted)]">
                        {task.notes.trim()}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProfileNegotiationsPanel({
  negotiations,
  negotiationsForDisplay,
  negLoading,
  chat,
  effectiveCrmFunnels,
  resolveAttendantName,
}: {
  negotiations: CrmNegotiationRecord[];
  negotiationsForDisplay: CrmNegotiationRecord[];
  negLoading: boolean;
  chat: InboxChat;
  effectiveCrmFunnels: CrmFunnel[];
  resolveAttendantName: (id: string) => string | null;
}) {
  return (
    <div className="rounded-[20px] border border-[var(--inbox-border)] bg-card/90 p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--inbox-muted-2)]">Negociações</p>
      {negLoading ? (
        <p className="mt-2 text-sm text-[var(--inbox-muted)]">Carregando…</p>
      ) : negotiations.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--inbox-muted)]">Nenhuma negociação vinculada.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {negotiationsForDisplay.slice(0, 5).map((n) => {
            const isPrimaryChatDeal =
              Boolean(chat.primaryNegotiationId?.trim()) && n.id === chat.primaryNegotiationId;
            const negAssigneeLabel = negotiationAssigneeLabel(n.assigneeId, resolveAttendantName);
            return (
              <li
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--inbox-border)] bg-[var(--inbox-surface)] px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-[var(--inbox-ink)]">{n.title.trim() || "Sem título"}</p>
                    {isPrimaryChatDeal ? (
                      <Badge className="shrink-0 border border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[10px] font-medium text-[var(--crm-brand)]">
                        Esta conversa
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-[var(--inbox-muted)]">
                    {funnelListNameIn(effectiveCrmFunnels, n.funnelId)} ·{" "}
                    {funnelStageTitleIn(effectiveCrmFunnels, n.funnelId, n.stageId)} ·{" "}
                    {negotiationStatusLabelPt(n.status)}
                    {n.totalValue > 0 ? <> · {formatMoney(n.totalValue)}</> : null}
                    <> · {negAssigneeLabel}</>
                  </p>
                </div>
                {isUuidString(n.id) ? (
                  <Button asChild variant="outline" size="sm" className="shrink-0 rounded-xl text-xs">
                    <Link to={`/crm/negociacao/${encodeURIComponent(n.id)}`}>Abrir</Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChatOnlyConversationSummary({
  chat,
}: {
  chat: InboxChat;
}) {
  const phone = chat.remotePhoneE164 || chat.remotePhoneDigits || chat.remoteJid || "";

  return (
    <ProfileSection title="Conversa">
      <ProfileFactRow label="Atendente" value={chatAttendantLabel(chat)} icon={User} />
      <ProfileFactRow
        label="Telefone"
        value={phone.trim() ? formatPhoneDisplay(phone) : "Não informado"}
        icon={Phone}
      />
      <ProfileFactRow label="Última mensagem" value={formatDateTime(chat.lastMessageAt)} icon={CalendarClock} />
    </ProfileSection>
  );
}

export function CustomerProfileSheet({
  open,
  onOpenChange,
  chat,
  messages,
  crmActionsLocked = false,
  channelAiEnabled = false,
  onChatDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: InboxChat | null;
  messages: WhatsappMessage[];
  /** Atendente sem conversa/negócio assumidos: bloqueia CRM e vínculos. */
  crmActionsLocked?: boolean;
  /** Instância do chat tem IA habilitada — habilita o toggle de Pausar/Retomar IA. */
  channelAiEnabled?: boolean;
  /** Chamado após admin excluir a conversa — pai limpa seleção/URL. */
  onChatDeleted?: (chatId: string) => void;
}) {
  const { data: customer } = useCustomer(chat?.customerId ?? undefined, { enabled: Boolean(chat?.customerId) });
  const { toast } = useToast();
  const { profile } = useAuth();
  const { can } = useRolePermissions();
  const canViewCrm = can("crm", "view");
  const canEditClientes = can("clientes", "edit");
  const canEditInbox = can("inbox", "edit");
  const isAdmin = profile?.role === "admin";
  const setChatResolution = useSetChatResolution();
  const setAiMode = useSetChatAiMode();
  const deleteChat = useDeleteWhatsappChat();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const canActOnChat = canAtendimentoActOnChat(profile?.role, chat?.assigneeId, profile?.id);
  const { data: negotiations = [], isLoading: negLoading } = useCrmNegotiationsForCustomer(customer?.id, {
    enabled: Boolean(open && customer?.id && isSupabaseConfigured),
  });
  const { data: linkedNegotiation } = useChatNegotiation(open && chat?.id ? chat.id : null);
  const { data: atendimentoUsers = [] } = useAtendimentoUsers();
  const resolveAttendantName = useMemo(() => {
    const byId = new Map(atendimentoUsers.map((user) => [user.id, user.nome]));
    return (id: string) => byId.get(id) ?? null;
  }, [atendimentoUsers]);
  const linkedNegotiationAssigneeLabel = useMemo(() => {
    if (!linkedNegotiation) {
      return undefined;
    }
    return negotiationAssigneeLabel(linkedNegotiation.assigneeId, resolveAttendantName);
  }, [linkedNegotiation, resolveAttendantName]);
  const negotiationsForDisplay = useMemo(() => {
    const list = [...negotiations];
    const primaryId = chat?.primaryNegotiationId?.trim();
    if (!primaryId) {
      return list;
    }
    return list.sort((a, b) => {
      if (a.id === primaryId) {
        return -1;
      }
      if (b.id === primaryId) {
        return 1;
      }
      return 0;
    });
  }, [negotiations, chat?.primaryNegotiationId]);
  const documentsNegotiationId = useMemo(() => {
    const candidates = [
      linkedNegotiation?.id,
      chat?.primaryNegotiationId,
      ...negotiationsForDisplay.map((n) => n.id),
    ];
    for (const id of candidates) {
      if (id && isPersistedCrmNegotiationId(id)) {
        return id;
      }
    }
    return null;
  }, [linkedNegotiation?.id, chat?.primaryNegotiationId, negotiationsForDisplay]);
  const { data: customerTasks = [], isLoading: customerTasksLoading } = useCrmTasksForCustomer(customer?.id, {
    enabled: Boolean(open && customer?.id && isSupabaseConfigured),
  });
  const { data: negotiationTasks = [], isLoading: negotiationTasksLoading } = useCrmTasksForNegotiation(
    documentsNegotiationId ?? undefined,
    {
      enabled: Boolean(open && documentsNegotiationId && isSupabaseConfigured),
    },
  );
  const profileTasks = useMemo(() => {
    const byId = new Map<string, CrmTask>();
    for (const task of customerTasks) {
      byId.set(task.id, task);
    }
    for (const task of negotiationTasks) {
      byId.set(task.id, task);
    }
    return [...byId.values()];
  }, [customerTasks, negotiationTasks]);
  const profileTasksLoading = customerTasksLoading || negotiationTasksLoading;
  const {
    data: tenantFunnelsSaved,
    isError: tenantFunnelsQueryError,
    error: tenantFunnelsQueryErr,
  } = useTenantCrmFunnelConfig({
    enabled: Boolean(open && isSupabaseConfigured),
  });
  const tenantFunnelErrorToastShown = useRef(false);
  useEffect(() => {
    if (!open) {
      tenantFunnelErrorToastShown.current = false;
    }
  }, [open]);
  useEffect(() => {
    if (!open || !tenantFunnelsQueryError || !tenantFunnelsQueryErr) {
      return;
    }
    if (tenantFunnelErrorToastShown.current) {
      return;
    }
    tenantFunnelErrorToastShown.current = true;
    toast({
      title: "Não foi possível carregar os funis do tenant",
      description: tenantFunnelsQueryErr.message,
      variant: "destructive",
    });
  }, [open, tenantFunnelsQueryErr, tenantFunnelsQueryError, toast]);
  const effectiveCrmFunnels = useMemo(
    () => tenantFunnelsSaved ?? DEFAULT_CRM_FUNNELS,
    [tenantFunnelsSaved],
  );
  const linkChat = useLinkWhatsappChatCustomer();
  const ensureLead = useEnsureLeadFromChat();
  const createCustomer = useCreateCustomer();
  const [linkSearch, setLinkSearch] = useState("");
  const [leadSheetOpen, setLeadSheetOpen] = useState(false);
  const [leadPrefill, setLeadPrefill] = useState<Partial<CustomerUpsertInput> | null>(null);
  const { data: customersForLink = [] } = useCustomers(
    { search: linkSearch.trim() || undefined },
    {
      enabled: Boolean(
        open && chat && !chat.customerId && isSupabaseConfigured && linkSearch.trim().length >= 2,
      ),
    },
  );

  // Reinicia a busca ao abrir ou trocar conversa desvinculada; deps limitadas para não sobrescrever digitação a cada render.
  useEffect(() => {
    if (!open || !chat || chat.customerId) {
      return;
    }
    const hint = linkSearchHintFromInboxChat(chat);
    setLinkSearch(hint.length >= 2 ? hint : "");
  }, [open, chat?.customerId, chat?.id, chat?.remoteJid, chat?.remotePhoneDigits, chat?.remotePhoneE164]); // eslint-disable-line react-hooks/exhaustive-deps -- omitir `chat` evita reset ao rerender com novo ref

  const { data: tagSuggestions = [] } = useDistinctCustomerTags({
    enabled: Boolean(open && isSupabaseConfigured),
    staleTime: 120_000,
  });

  const totalMessages = messages.length;
  const profileIdentity = useMemo(
    () => resolveProfileIdentity(customer, chat),
    [customer, chat],
  );
  const displayName = profileIdentity.displayName;
  const initials = getInitials(displayName === "Contato sem nome" ? "?" : displayName);
  const resolutionLabel =
    chat?.resolution && CHAT_RESOLUTION_LABELS[chat.resolution]
      ? CHAT_RESOLUTION_LABELS[chat.resolution]
      : "Em aberto";
  const [profileTab, setProfileTab] = useState("resumo");
  const showCrmTab = Boolean(customer && isSupabaseConfigured);
  const showCamposTab = Boolean(customer && isSupabaseConfigured);
  const showArquivosTab = Boolean(isSupabaseConfigured && canViewCrm);
  const showProdutosTab = Boolean(isSupabaseConfigured && canViewCrm && (customer || chat));
  const showTarefasTab = Boolean(isSupabaseConfigured && canViewCrm && (customer || documentsNegotiationId));
  const canEditCustomerIdentityInInbox = canEditClientes || canEditInbox;
  const showCustomerIdentityEditButton = Boolean(customer) && canEditCustomerIdentityInInbox;
  const customerIdentityEditBlockedMessage = useMemo(() => {
    if (!canEditCustomerIdentityInInbox) {
      return "Seu papel não tem permissão para editar contatos no Inbox.";
    }
    if (chat && !canActOnChat) {
      return chatAssigneeBlockedMessage();
    }
    return null;
  }, [canEditCustomerIdentityInInbox, chat, canActOnChat]);
  const canEditCustomerIdentity = showCustomerIdentityEditButton && !customerIdentityEditBlockedMessage;

  useEffect(() => {
    setProfileTab("resumo");
  }, [chat?.id]);

  useEffect(() => {
    if (profileTab === "crm" && !showCrmTab) {
      setProfileTab("resumo");
    } else if (profileTab === "campos" && !showCamposTab) {
      setProfileTab("resumo");
    } else if (profileTab === "arquivos" && !showArquivosTab) {
      setProfileTab("resumo");
    } else if (profileTab === "produtos" && !showProdutosTab) {
      setProfileTab("resumo");
    } else if (profileTab === "tarefas" && !showTarefasTab) {
      setProfileTab("resumo");
    }
  }, [profileTab, showArquivosTab, showCamposTab, showCrmTab, showProdutosTab, showTarefasTab]);

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[96vw] overflow-y-auto border-l border-[var(--inbox-border)] bg-[linear-gradient(180deg,var(--inbox-surface)_0%,var(--inbox-surface-2)_100%)] p-0 sm:max-w-[760px] xl:max-w-[860px]"
      >
        <div className="flex min-h-full flex-col">
          <SheetHeader className="space-y-0 border-b border-border/60 bg-card/80 px-5 pb-4 pt-5 backdrop-blur-sm">
            <div className="flex items-start gap-4">
              <Avatar className="h-14 w-14 shrink-0 ring-2 ring-background shadow-md">
                <AvatarImage
                  src={
                    chat?.avatarUrl && isInlineMediaUrlAllowed(chat.avatarUrl)
                      ? chat.avatarUrl
                      : undefined
                  }
                  alt={displayName}
                  className="object-cover"
                />
                <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <SheetTitle className="line-clamp-2 text-left text-lg font-semibold leading-tight tracking-tight">
                    {displayName}
                  </SheetTitle>
                  <SheetDescription className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{profileIdentity.phoneFormatted}</span>
                  </SheetDescription>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {chat ? (
                    <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[11px] font-medium">
                      {chatAttendantLabel(chat)}
                    </Badge>
                  ) : null}
                  {chat ? (
                    <Badge variant="outline" className="rounded-md px-2 py-0.5 text-[11px] font-medium">
                      {resolutionLabel}
                    </Badge>
                  ) : null}
                  {customer?.email?.trim() ? (
                    <Badge variant="outline" className="max-w-full truncate rounded-md px-2 py-0.5 text-[11px] font-medium">
                      {customer.email.trim()}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            {chat ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="min-w-[160px] flex-1">
                  <Label htmlFor="inbox-profile-resolution" className="sr-only">
                    Status da conversa
                  </Label>
                  <Select
                    value={chat.resolution ?? "open"}
                    disabled={crmActionsLocked || !canActOnChat || setChatResolution.isPending}
                    onValueChange={(value) => {
                      if (!canActOnChat) {
                        toast({
                          title: "Assuma a conversa",
                          description: chatAssigneeBlockedMessage(),
                          variant: "destructive",
                        });
                        return;
                      }
                      void setChatResolution.mutateAsync({
                        chatId: chat.id,
                        resolution: value as ChatResolution,
                      });
                    }}
                  >
                    <SelectTrigger
                      id="inbox-profile-resolution"
                      className="h-9 w-full rounded-lg bg-background text-sm"
                    >
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CHAT_RESOLUTION_LABELS) as ChatResolution[]).map((key) => (
                        <SelectItem key={key} value={key}>
                          {CHAT_RESOLUTION_LABELS[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {customer && canViewCrm ? (
                  <Button
                    asChild
                    variant="secondary"
                    size="sm"
                    className="h-9 shrink-0 rounded-lg px-3 text-xs font-semibold"
                  >
                    <Link to="/crm" className="inline-flex items-center gap-1.5">
                      <Kanban className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Abrir CRM
                    </Link>
                  </Button>
                ) : null}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-lg"
                      aria-label="Mais ações do perfil"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {channelAiEnabled ? (() => {
                      const aiPaused = chat.aiMode === "off" || chat.aiMode === "handoff";
                      const disabled = setAiMode.isPending || !canActOnChat || !canEditInbox;
                      return (
                        <DropdownMenuItem
                          disabled={disabled}
                          onClick={() => {
                            if (!canEditInbox) {
                              toast({
                                title: "Ação indisponível",
                                description: "Seu papel não tem permissão para esta ação.",
                                variant: "destructive",
                              });
                              return;
                            }
                            if (!canActOnChat) {
                              toast({
                                title: "Assuma a conversa",
                                description: chatAssigneeBlockedMessage(),
                                variant: "destructive",
                              });
                              return;
                            }
                            setAiMode.mutate(
                              { chatId: chat.id, aiMode: aiPaused ? "full" : "off" },
                              {
                                onSuccess: () =>
                                  toast({
                                    title: aiPaused
                                      ? "IA reativada nesta conversa"
                                      : "IA pausada nesta conversa",
                                  }),
                              },
                            );
                          }}
                        >
                          {aiPaused ? (
                            <Play className="mr-2 h-4 w-4" aria-hidden />
                          ) : (
                            <Pause className="mr-2 h-4 w-4" aria-hidden />
                          )}
                          {setAiMode.isPending
                            ? aiPaused
                              ? "Retomando IA..."
                              : "Pausando IA..."
                            : aiPaused
                              ? "Retomar IA"
                              : "Pausar IA"}
                        </DropdownMenuItem>
                      );
                    })() : null}
                    {isAdmin ? (
                      <>
                        {channelAiEnabled ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={deleteChat.isPending}
                          onClick={() => setDeleteConfirmOpen(true)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                          {deleteChat.isPending ? "Excluindo..." : "Excluir conversa"}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </SheetHeader>

          <div className="px-5 py-5">
            {crmActionsLocked ? (
              <p className="mb-5 rounded-xl border border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] px-4 py-3 text-sm text-[var(--crm-amber-ink)]">
                {negotiationAssigneeBlockedMessage()}
              </p>
            ) : null}
            {chat && !chat.customerId ? (
              <div className="mb-5 rounded-[28px] border border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] p-4 shadow-[0_16px_28px_rgba(84,95,101,0.06)]">
                <p className="text-sm font-semibold text-[var(--inbox-ink)]">Conversa sem cliente vinculado</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--inbox-muted)]">
                  Busque o cadastro pelo nome, telefone ou documento e vincule para ver CRM, credito e campos completos no perfil.
                </p>
                {!isSupabaseConfigured ? (
                  <p className="mt-2 text-xs text-[var(--crm-amber-ink)]">Configure o Supabase para vincular conversas a clientes.</p>
                ) : (
                  <>
                    <Input
                      value={linkSearch}
                      onChange={(e) => setLinkSearch(e.target.value)}
                      placeholder="Digite pelo menos 2 caracteres..."
                      className="mt-3 h-10 rounded-xl border-[var(--inbox-border)] bg-card"
                      autoComplete="off"
                    />
                    {linkSearch.trim().length < 2 ? (
                      <p className="mt-2 text-xs text-[var(--inbox-muted)]">Continue digitando para buscar cadastros.</p>
                    ) : customersForLink.length === 0 ? (
                      <p className="mt-2 text-xs text-[var(--inbox-muted)]">Nenhum cliente encontrado.</p>
                    ) : (
                      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[var(--inbox-border)] bg-card p-2">
                        {customersForLink.slice(0, 8).map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm text-[var(--inbox-ink)] hover:bg-[var(--inbox-surface)] disabled:opacity-50"
                              disabled={linkChat.isPending || crmActionsLocked}
                              onClick={() => {
                                if (crmActionsLocked) {
                                  toast({
                                    title: "Assuma a conversa",
                                    description: chatAssigneeBlockedMessage(),
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                void (async () => {
                                  try {
                                    await linkChat.mutateAsync({ chatId: chat.id, customerId: c.id });
                                    await ensureLead.mutateAsync({ chatId: chat.id }).catch(() => undefined);
                                    toast({
                                      title: "Cliente vinculado",
                                      description: `${c.nome} foi associado a esta conversa.`,
                                    });
                                    setLinkSearch("");
                                  } catch (e) {
                                    toast({
                                      title: "Nao foi possivel vincular",
                                      description: e instanceof Error ? e.message : "Tente novamente.",
                                      variant: "destructive",
                                    });
                                  }
                                })();
                              }}
                            >
                              <span className="min-w-0 truncate font-medium">{c.nome}</span>
                              <span className="shrink-0 text-xs text-[var(--inbox-muted)]">
                                {c.codigo?.trim() || c.telefone || c.id.slice(0, 8)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild variant="secondary" size="sm" className="rounded-xl">
                        <Link to="/clientes">Abrir Clientes</Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        disabled={crmActionsLocked}
                        onClick={() => {
                          if (crmActionsLocked) {
                            toast({
                              title: "Assuma a conversa",
                              description: chatAssigneeBlockedMessage(),
                              variant: "destructive",
                            });
                            return;
                          }
                          if (chat) {
                            setLeadPrefill(leadPrefillFromInboxChat(chat));
                          } else {
                            setLeadPrefill(null);
                          }
                          setLeadSheetOpen(true);
                        }}
                      >
                        Cadastrar cliente
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {chat ? (
              <Tabs value={profileTab} onValueChange={setProfileTab} className="space-y-4">
                <TabsList className="h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/40 p-1">
                  <TabsTrigger value="resumo" className={PROFILE_TAB_TRIGGER_CLASS}>
                    Resumo
                  </TabsTrigger>
                  {showCrmTab ? (
                    <TabsTrigger value="crm" className={PROFILE_TAB_TRIGGER_CLASS}>
                      CRM
                    </TabsTrigger>
                  ) : null}
                  {showCamposTab ? (
                    <TabsTrigger value="campos" className={PROFILE_TAB_TRIGGER_CLASS}>
                      Campos
                    </TabsTrigger>
                  ) : null}
                  <TabsTrigger value="etiquetas" className={PROFILE_TAB_TRIGGER_CLASS}>
                    Etiquetas
                  </TabsTrigger>
                  <TabsTrigger value="midia" className={PROFILE_TAB_TRIGGER_CLASS}>
                    Mídia
                  </TabsTrigger>
                  {showProdutosTab ? (
                    <TabsTrigger value="produtos" className={PROFILE_TAB_TRIGGER_CLASS}>
                      Produtos
                    </TabsTrigger>
                  ) : null}
                  {showTarefasTab ? (
                    <TabsTrigger value="tarefas" className={PROFILE_TAB_TRIGGER_CLASS}>
                      Tarefas
                    </TabsTrigger>
                  ) : null}
                  {showArquivosTab ? (
                    <TabsTrigger value="arquivos" className={PROFILE_TAB_TRIGGER_CLASS}>
                      Arquivos
                    </TabsTrigger>
                  ) : null}
                </TabsList>

                  <TabsContent value="resumo" className="mt-0 space-y-5 focus-visible:outline-none">
                  {customer ? (
                    <CustomerQuickFacts
                      customer={customer}
                      chat={chat}
                      messageCount={totalMessages}
                      linkedNegotiationAssigneeLabel={linkedNegotiationAssigneeLabel}
                      canEditIdentity={canEditCustomerIdentity}
                      showIdentityEditButton={showCustomerIdentityEditButton}
                      identityEditBlockedMessage={customerIdentityEditBlockedMessage}
                    />
                  ) : (
                    <ChatOnlyConversationSummary chat={chat} />
                  )}
                  {isSupabaseConfigured ? (
                    <CallLogsPanel
                      scope={{
                        customerId: customer?.id ?? null,
                        negotiationId: linkedNegotiation?.id ?? null,
                        chatId: chat.id,
                      }}
                    />
                  ) : null}
                  {customer?.id ? (
                    <CustomerAiMemoryPanel
                      customerId={customer.id}
                      canDelete={canEditClientes}
                    />
                  ) : null}
                </TabsContent>

                {showCrmTab && customer ? (
                  <TabsContent value="crm" className="mt-0 space-y-5 focus-visible:outline-none">
                    <CustomerCrmPipelineForm
                      customer={customer}
                      funnels={effectiveCrmFunnels}
                      readOnly={crmActionsLocked}
                    />
                    <ProfileNegotiationsPanel
                      negotiations={negotiations}
                      negotiationsForDisplay={negotiationsForDisplay}
                      negLoading={negLoading}
                      chat={chat}
                      effectiveCrmFunnels={effectiveCrmFunnels}
                      resolveAttendantName={resolveAttendantName}
                    />
                  </TabsContent>
                ) : null}

                {showCamposTab && customer ? (
                  <TabsContent value="campos" className="mt-0 focus-visible:outline-none">
                    <CustomerCustomFieldsFacts
                      customerId={customer.id}
                      sourceColumns={customer.sourceColumns}
                      readOnly={!canEditCustomerIdentity}
                      editBlockedMessage={customerIdentityEditBlockedMessage}
                    />
                  </TabsContent>
                ) : null}

                <TabsContent value="etiquetas" className="mt-0 focus-visible:outline-none">
                  {isSupabaseConfigured ? (
                    <ChatTagsPicker chatId={chat.id} tags={chat.tags ?? []} disabled={crmActionsLocked} messages={messages} />
                  ) : customer ? (
                    <ProfileTagsPicker
                      customer={customer}
                      suggestionTags={tagSuggestions}
                      disabled={crmActionsLocked}
                    />
                  ) : (
                    <p className="text-sm text-[var(--inbox-muted)]">Etiquetas disponíveis com Supabase configurado.</p>
                  )}
                </TabsContent>

                {showProdutosTab ? (
                  <TabsContent value="produtos" className="mt-0 focus-visible:outline-none">
                    <div className="rounded-[20px] border border-[var(--inbox-border)] bg-card/90 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--inbox-muted-2)]">
                        Produtos
                      </p>
                      <div className="mt-3">
                        {documentsNegotiationId ? (
                          <NegotiationProductsEditor
                            negotiationId={documentsNegotiationId}
                            readOnly={crmActionsLocked}
                            negotiationTotalValue={linkedNegotiation?.totalValue}
                          />
                        ) : (
                          <p className="text-sm text-[var(--inbox-muted)]">
                            Crie ou vincule uma negociação a esta conversa para adicionar produtos ao lead.
                          </p>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                ) : null}

                {showTarefasTab ? (
                  <TabsContent value="tarefas" className="mt-0 focus-visible:outline-none">
                    <ProfileTasksPanel
                      tasks={profileTasks}
                      isLoading={profileTasksLoading}
                      negotiations={negotiations}
                      effectiveCrmFunnels={effectiveCrmFunnels}
                    />
                  </TabsContent>
                ) : null}

                <TabsContent value="midia" className="mt-0 focus-visible:outline-none">
                  <CustomerMediaGallery messages={messages} />
                </TabsContent>

                {showArquivosTab ? (
                  <TabsContent value="arquivos" className="mt-0 focus-visible:outline-none">
                    {documentsNegotiationId ? (
                      <CrmNegotiationDocumentsSection
                        negotiationId={documentsNegotiationId}
                        enabled={open}
                        readOnly={crmActionsLocked}
                        className="border-[var(--inbox-border)]"
                      />
                    ) : (
                      <div className="rounded-[20px] border border-[var(--inbox-border)] bg-card/90 p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--inbox-muted-2)]">
                          Arquivos
                        </p>
                        <p className="mt-2 text-sm text-[var(--inbox-muted)]">
                          Crie ou vincule uma negociação a esta conversa para anexar documentos ao lead.
                        </p>
                      </div>
                    )}
                  </TabsContent>
                ) : null}
              </Tabs>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>

    <CustomerLeadSheet
      open={leadSheetOpen}
      disabled={crmActionsLocked}
      onOpenChange={(next) => {
        setLeadSheetOpen(next);
        if (!next) {
          setLeadPrefill(null);
        }
      }}
      initialOverrides={leadPrefill ?? undefined}
      loading={createCustomer.isPending}
      onSubmit={async (input) => {
        const created = await createCustomer.mutateAsync(input);
        if (chat && !chat.customerId) {
          try {
            await linkChat.mutateAsync({ chatId: chat.id, customerId: created.id });
            await ensureLead.mutateAsync({ chatId: chat.id }).catch(() => undefined);
            toast({
              title: "Cliente criado e vinculado",
              description: `${created.nome} foi associado a esta conversa.`,
            });
            useAppStore.getState().addNotification({
              tipo: "sucesso",
              titulo: "Cliente criado e vinculado",
              descricao: `${created.nome} foi associado a esta conversa.`,
            });
          } catch (e) {
            toast({
              title: "Cliente criado",
              description:
                e instanceof Error
                  ? `${e.message} Vincule manualmente em Clientes ou na busca acima.`
                  : "Nao foi possivel vincular automaticamente. Vincule manualmente.",
              variant: "destructive",
            });
            useAppStore.getState().addNotification({
              tipo: "erro",
              titulo: "Vinculo automatico falhou",
              descricao: e instanceof Error ? e.message : "Vincule o cliente manualmente.",
            });
          }
        } else {
          toast({
            title: "Cliente criado",
            description: `${created.nome} foi adicionado à base.`,
          });
          useAppStore.getState().addNotification({
            tipo: "sucesso",
            titulo: "Cliente criado",
            descricao: `${created.nome} foi adicionado à base.`,
          });
        }
        setLeadSheetOpen(false);
        setLeadPrefill(null);
      }}
    />
    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir esta conversa?</AlertDialogTitle>
          <AlertDialogDescription>
            Todas as mensagens, notas, etiquetas e histórico desta conversa serão removidos
            permanentemente. O cadastro do cliente continua intacto. Essa ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteChat.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!chat || deleteChat.isPending}
            onClick={async (e) => {
              e.preventDefault();
              if (!chat) return;
              try {
                await deleteChat.mutateAsync({ chatId: chat.id });
                toast({ title: "Conversa excluída" });
                setDeleteConfirmOpen(false);
                onOpenChange(false);
                onChatDeleted?.(chat.id);
              } catch (err) {
                toast({
                  title: "Não foi possível excluir",
                  description: err instanceof Error ? err.message : "Erro inesperado.",
                  variant: "destructive",
                });
              }
            }}
            className="bg-[var(--crm-danger,#dc2626)] text-white hover:bg-[var(--crm-danger,#dc2626)]/90"
          >
            {deleteChat.isPending ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function CustomerAiMemoryPanel({ customerId, canDelete }: { customerId: string; canDelete: boolean }) {
  const { toast } = useToast();
  const { data: facts = [], isLoading } = useCustomerAiFacts(customerId);
  const deleteFact = useDeleteCustomerAiFact(customerId, {
    onError: (err) =>
      toast({
        title: "Não foi possível remover o fato",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (isLoading) return null;
  if (facts.length === 0) return null;

  return (
    <div className="rounded-[20px] border border-[var(--inbox-border)] bg-card/90 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--inbox-muted-2)]">
          Memória da IA
        </p>
        <span className="text-[10px] text-[var(--inbox-muted)]">
          {facts.length} fato{facts.length > 1 ? "s" : ""}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--inbox-muted)]">
        Fatos persistentes que a IA aprendeu nas conversas e usa para personalizar respostas.
      </p>
      <ul className="mt-3 space-y-1.5">
        {facts.map((f) => (
          <li
            key={f.id}
            className="flex items-start justify-between gap-2 rounded-md border border-[var(--inbox-border)] bg-[var(--inbox-surface)] px-2.5 py-1.5 text-xs text-[var(--inbox-ink)]"
          >
            <div className="min-w-0 flex-1">
              <p className="break-words leading-relaxed">{f.fact}</p>
              <p className="mt-0.5 text-[10px] text-[var(--inbox-muted)]">
                {f.source === "ai" ? "aprendido pela IA" : "registrado pelo time"}
                {" · "}
                {new Date(f.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
            {canDelete ? (
              <button
                type="button"
                aria-label="Esquecer este fato"
                disabled={deleteFact.isPending}
                onClick={() => void deleteFact.mutateAsync(f.id)}
                className="shrink-0 rounded p-1 text-[var(--inbox-muted)] hover:bg-[var(--crm-danger-tint,rgba(220,38,38,0.08))] hover:text-[var(--crm-danger,#dc2626)] disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
