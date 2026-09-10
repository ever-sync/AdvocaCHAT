import {
  ArrowRightCircle,
  Bell,
  CalendarClock,
  CaseSensitive,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Filter,
  FlaskConical,
  GitMerge,
  Lock,
  Mail,
  MessageCircle,
  MessageSquare,
  Package,
  Plug,
  Send,
  ShoppingCart,
  Sparkles,
  Split,
  Star,
  StarOff,
  Tag,
  User,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export type ItemBadge =
  | { kind: "novo" }
  | { kind: "creditos"; label: string }
  | { kind: "conheca" }
  | { kind: "plano-advanced" };

export type ActionDefinition = {
  id: string;
  label: string;
  iconKey: string;
  iconClass: string;
  badge?: ItemBadge;
  defaultSubtitle?: string;
};

export type ActionCategory = {
  id: string;
  label: string;
  items: ActionDefinition[];
};

export const ACTION_ICONS: Record<string, LucideIcon> = {
  mail: Mail,
  "message-circle": MessageCircle,
  "message-square": MessageSquare,
  sparkles: Sparkles,
  clock: Clock,
  "calendar-clock": CalendarClock,
  flask: FlaskConical,
  "user-plus": UserPlus,
  "user-minus": UserMinus,
  "user-cog": UserCog,
  user: User,
  users: Users,
  send: Send,
  split: Split,
  "git-merge": GitMerge,
  star: Star,
  "star-off": StarOff,
  "case-sensitive": CaseSensitive,
  "file-text": FileText,
  package: Package,
  "clipboard-check": ClipboardCheck,
  "clipboard-list": ClipboardList,
  "arrow-right-circle": ArrowRightCircle,
  lock: Lock,
  filter: Filter,
  "shopping-cart": ShoppingCart,
  tag: Tag,
  bell: Bell,
  webhook: Webhook,
  plug: Plug,
};

export const ACTION_CATEGORIES: ActionCategory[] = [
  {
    id: "comunicacao",
    label: "Comunicação",
    items: [
      { id: "email", label: "Enviar email", iconKey: "mail", iconClass: "bg-violet-600" },
      {
        id: "whatsapp",
        label: "Enviar WhatsApp",
        iconKey: "message-circle",
        iconClass: "bg-violet-600",
        badge: { kind: "novo" },
      },
      {
        id: "sms",
        label: "Enviar SMS",
        iconKey: "message-square",
        iconClass: "bg-violet-600",
        badge: { kind: "creditos", label: "100 créditos gratuitos" },
      },
      {
        id: "mensagem-inteligente",
        label: "Enviar Mensagem Inteligente",
        iconKey: "sparkles",
        iconClass: "bg-violet-600",
        badge: { kind: "conheca" },
      },
    ],
  },
  {
    id: "inteligencia",
    label: "Inteligência",
    items: [
      {
        id: "classificar-ia",
        label: "Classificar com IA",
        iconKey: "sparkles",
        iconClass: "bg-fuchsia-600",
        badge: { kind: "conheca" },
      },
      {
        id: "transferir-humano",
        label: "Transferir para humano",
        iconKey: "user",
        iconClass: "bg-fuchsia-600",
        badge: { kind: "novo" },
        defaultSubtitle: "Pausa a IA e entrega o chat ao time",
      },
    ],
  },
  {
    id: "espera",
    label: "Espera",
    items: [
      {
        id: "espera",
        label: "Espera",
        iconKey: "clock",
        iconClass: "bg-orange-500",
        defaultSubtitle: "1 dia(s), 0 hora(s) e 0 minuto(s)",
      },
      {
        id: "esperar-agendar-hora",
        label: "Esperar e agendar hora",
        iconKey: "clock",
        iconClass: "bg-orange-500",
      },
      {
        id: "esperar-agendar-data-hora",
        label: "Esperar e agendar data e hora",
        iconKey: "calendar-clock",
        iconClass: "bg-orange-500",
      },
      {
        id: "esperar-condicao",
        label: "Esperar até condição",
        iconKey: "clock",
        iconClass: "bg-orange-500",
      },
    ],
  },
  {
    id: "caminho-do-lead",
    label: "Caminho do Lead",
    items: [
      {
        id: "teste-ab",
        label: "Teste A/B",
        iconKey: "flask",
        iconClass: "bg-emerald-500",
        badge: { kind: "plano-advanced" },
      },
      {
        id: "adicionar-leads-outros-fluxos",
        label: "Adicionar Leads a outros fluxos",
        iconKey: "user-plus",
        iconClass: "bg-emerald-500",
      },
      {
        id: "remover-leads-outros-fluxos",
        label: "Remover Lead de outros fluxos",
        iconKey: "user-minus",
        iconClass: "bg-emerald-500",
      },
      {
        id: "enviar-rd-conversas",
        label: "Enviar para RD Station Conversas",
        iconKey: "send",
        iconClass: "bg-emerald-500",
        badge: { kind: "novo" },
      },
      {
        id: "dividir-por-email",
        label: "Dividir caminho por email do fluxo",
        iconKey: "split",
        iconClass: "bg-emerald-500",
      },
      {
        id: "dividir-por-segmentacao",
        label: "Dividir caminho por segmentação",
        iconKey: "split",
        iconClass: "bg-emerald-500",
      },
      {
        id: "unir-caminho",
        label: "Unir caminho",
        iconKey: "git-merge",
        iconClass: "bg-emerald-500",
      },
    ],
  },
  {
    id: "rd-station-crm",
    label: "RD Station CRM",
    items: [
      {
        id: "criar-negociacao",
        label: "Criar Negociação no CRM",
        iconKey: "star",
        iconClass: "bg-sky-500",
      },
      {
        id: "atualizar-nome-negociacao",
        label: "Atualizar nome da Negociação",
        iconKey: "case-sensitive",
        iconClass: "bg-sky-500",
      },
      {
        id: "adicionar-anotacao",
        label: "Adicionar anotação",
        iconKey: "file-text",
        iconClass: "bg-sky-500",
      },
      {
        id: "adicionar-produto-negociacao",
        label: "Adicionar produto à Negociação",
        iconKey: "package",
        iconClass: "bg-sky-500",
      },
      {
        id: "criar-tarefa-negociacao",
        label: "Criar tarefa na Negociação",
        iconKey: "clipboard-check",
        iconClass: "bg-sky-500",
      },
      {
        id: "atualizar-tarefa",
        label: "Atualizar tarefa",
        iconKey: "clipboard-list",
        iconClass: "bg-sky-500",
      },
      {
        id: "atualizar-responsavel",
        label: "Atualizar responsável",
        iconKey: "user-plus",
        iconClass: "bg-sky-500",
      },
      {
        id: "atualizar-status",
        label: "Atualizar status",
        iconKey: "clock",
        iconClass: "bg-sky-500",
      },
      {
        id: "definir-qualificacao",
        label: "Definir qualificação (estrelas)",
        iconKey: "star",
        iconClass: "bg-sky-500",
      },
      {
        id: "mover-negociacao",
        label: "Mover Negociação no CRM",
        iconKey: "arrow-right-circle",
        iconClass: "bg-sky-500",
      },
      {
        id: "dividir-por-produto",
        label: "Dividir caminho por produto",
        iconKey: "split",
        iconClass: "bg-sky-500",
      },
      {
        id: "dividir-por-qualificacao",
        label: "Dividir caminho por qualificação",
        iconKey: "split",
        iconClass: "bg-sky-500",
      },
      {
        id: "dividir-por-equipe",
        label: "Dividir caminho por equipe",
        iconKey: "split",
        iconClass: "bg-sky-500",
      },
    ],
  },
  {
    id: "integracoes",
    label: "Integrações",
    items: [
      { id: "webhook", label: "Webhook", iconKey: "webhook", iconClass: "bg-slate-500" },
      { id: "zapier", label: "Zapier", iconKey: "plug", iconClass: "bg-orange-600" },
      {
        id: "definir-variavel",
        label: "Definir variável",
        iconKey: "case-sensitive",
        iconClass: "bg-indigo-600",
      },
    ],
  },
  {
    id: "gerenciar-lead",
    label: "Gerenciar Lead",
    items: [
      { id: "adicionar-tags", label: "Adicionar Tags", iconKey: "tag", iconClass: "bg-pink-500" },
      { id: "remover-tag", label: "Remover Tag", iconKey: "tag", iconClass: "bg-pink-500" },
      {
        id: "suprimir-canal",
        label: "Cancelar inscrição (opt-out)",
        iconKey: "lock",
        iconClass: "bg-pink-500",
      },
      {
        id: "adicionar-base-legal",
        label: "Adicionar Base Legal",
        iconKey: "lock",
        iconClass: "bg-pink-500",
      },
      {
        id: "remover-base-legal",
        label: "Remover Base Legal",
        iconKey: "lock",
        iconClass: "bg-pink-500",
      },
      {
        id: "marcar-oportunidade",
        label: "Marcar Oportunidade",
        iconKey: "star",
        iconClass: "bg-pink-500",
      },
      {
        id: "desmarcar-oportunidade",
        label: "Desmarcar Oportunidade",
        iconKey: "star-off",
        iconClass: "bg-pink-500",
      },
      {
        id: "alterar-estagio-leads",
        label: "Alterar estágio dos Leads",
        iconKey: "filter",
        iconClass: "bg-pink-500",
      },
      {
        id: "marcar-venda",
        label: "Marcar Venda",
        iconKey: "shopping-cart",
        iconClass: "bg-pink-500",
      },
    ],
  },
  {
    id: "responsavel-e-notificacao",
    label: "Responsável e Notificação",
    items: [
      {
        id: "alterar-responsavel-leads",
        label: "Alterar responsável pelos Leads",
        iconKey: "user-cog",
        iconClass: "bg-amber-400",
      },
      {
        id: "distribuir-leads",
        label: "Distribuir Leads entre os responsáveis",
        iconKey: "users",
        iconClass: "bg-amber-400",
      },
      {
        id: "notificar-email",
        label: "Notificar email",
        iconKey: "bell",
        iconClass: "bg-amber-400",
      },
      {
        id: "notificar-responsavel",
        label: "Notificar responsável pelo Lead",
        iconKey: "user",
        iconClass: "bg-amber-400",
      },
    ],
  },
];

export const DRAG_MIME = "application/x-marketing-action";

export type DragPayload = {
  actionId: string;
  label: string;
  iconKey: string;
  iconClass: string;
  defaultSubtitle?: string;
};

export function findAction(actionId: string): ActionDefinition | undefined {
  for (const category of ACTION_CATEGORIES) {
    const hit = category.items.find((item) => item.id === actionId);
    if (hit) return hit;
  }
  return undefined;
}
