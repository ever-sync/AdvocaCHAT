export interface AppUserProfile {
  id: string;
  nome: string;
  email: string;
  empresa: string;
  plano: string;
  role?: UserRole;
  status?: "active" | "inactive";
  avatar?: string;
  availability?: UserAvailability;
}

export type UserRole = "admin" | "operacao" | "financeiro" | "atendimento";
export type UserAvailability = "available" | "busy" | "offline";

export interface ProfileSettings {
  id: string;
  tenantId: string | null;
  nome: string;
  email: string;
  empresa: string;
  plano: string;
  role: UserRole;
  status: "active" | "inactive";
  cnpj?: string | null;
  /** Telefone (E.164) do atendente para click-to-call. */
  callPhone?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CollaboratorInvite {
  id: string;
  tenantId: string;
  nome: string;
  email: string;
  role: UserRole;
  status: "pending" | "accepted" | "revoked";
  invitedBy?: string | null;
  authUserId?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  updatedAt?: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignUpPayload {
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  cnpj: string;
  password: string;
  plano?: string;
}

export type CustomerProfile = "A" | "B" | "C";
export type CustomerStatus = "ativo" | "inativo" | "bloqueado";
export type DeliveryRouteStatus = "ativo" | "inativo";
export type TaskType = "cliente_inativo" | "inadimplente" | "sem_resposta";
export type TaskStatus = "aberta" | "em_andamento" | "concluida";
export type ProductStatus = "ativo" | "inativo";
export type WhatsappInstanceStatus = "connected" | "connecting" | "disconnected" | "error";
export type InboxChatStatus = "open" | "closed";
export type ChatResolution = "open" | "pending" | "resolved" | "waiting_customer" | "lost";

/** Filtro da lista lateral: alinha com categorias úteis de resolução + aberto/fechado. */
export type InboxListScope = "all" | "open" | "closed" | "resolved" | "lost";

/** Chips rápidos na lista de conversas (Inbox). */
export type InboxQuickFilter =
  | "mine"
  | "unread"
  | "unassigned"
  | "hidden"
  | "waiting_customer"
  | "overdue_followup";
export type ChatAiMode = "off" | "qualifying" | "full" | "handoff";
export type MessageActorType = "human" | "ai" | "system";
export type MessageDirection = "inbound" | "outbound";
export type MessageType =
  | "text"
  | "media"
  | "menu"
  | "poll"
  | "location"
  | "contact"
  | "audio"
  | "document"
  | "system";
export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "received"
  | "failed";
export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "failed";
export type CampaignSendMode = "now" | "scheduled";
export type CampaignRecipientStatus = "queued" | "processing" | "sent" | "failed" | "responded" | "cancelled";
export type FollowUpStep = "4h" | "24h" | "48h";
export type FollowUpJobStatus = "scheduled" | "processing" | "sent" | "cancelled" | "failed";

export interface CampaignCadence {
  minDelaySeconds: number;     // min delay between messages (default 30)
  maxDelaySeconds: number;     // max delay between messages (default 90)
  batchSize: number;           // messages per batch, 0 = no batching
  batchPauseMinutes: number;   // pause between batches in minutes (default 5)
  sendWindowStart: string;     // "HH:MM" in the campaign timezone
  sendWindowEnd: string;       // "HH:MM" in the campaign timezone
  timezone: string;            // IANA timezone string, e.g. "America/Sao_Paulo"
  allowedDays: number[];       // 0=Sun,1=Mon...6=Sat
  maxPerDay: number;           // 0 = unlimited
}

export interface Customer {
  id: string;
  codigo?: string;
  origem?: "organico" | "pago";
  nome: string;
  telefone: string;
  celular?: string;
  phoneE164?: string | null;
  phoneDigits?: string | null;
  phoneJid?: string | null;
  perfil: CustomerProfile;
  rota: string;
  ultimoPedido: string;
  status: CustomerStatus;
  email: string;
  cnpj: string;
  endereco: string;
  vendedor: string;
  ticketMedio: number;
  frequenciaCompra: string;
  totalGasto: number;
  tipo?: string;
  razaoSocial?: string;
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
  cpf?: string;
  rg?: string;
  nascimento?: string;
  nomeSocial?: string;
  fax?: string;
  canal?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  /** Zona de entrega / região (ex.: Zona Norte). */
  zone?: string;
  complemento?: string;
  cidade?: string;
  estado?: string;
  ativo?: boolean;
  observacoes?: string;
  cadastradoEm?: string;
  sourceColumns?: Record<string, string>;
}

/** Status da negociação no Kanban / `crm_negotiations.status`. */
export type CrmNegotiationStatus =
  | "em_andamento"
  | "vendido"
  | "perdido"
  | "pausado"
  | "nao_pausado";

/**
 * Card exibido no quadro CRM (Kanban). Alinhado à tabela `crm_negotiations` e aos mocks locais.
 * `id` é uuid quando persistido; mocks podem usar ids texto até migrar.
 */
export interface CrmNegotiation {
  id: string;
  funnelId: string;
  stageId: string;
  status: CrmNegotiationStatus;
  assigneeId: string;
  title: string;
  starCount: number;
  createdAt: string;
  nextTaskAt?: string;
  closingForecast?: string;
  lastContactAt?: string;
  lastInteractionAt?: string;
  qualification: number;
  totalValue: number;
  /** Quando preenchido, o card abre direto o perfil `/clientes/:id`. */
  customerId?: string;
  sourceChatId?: string;
  sourceChatPreview?: string | null;
  sourceChatUnread?: number;
  otherInfo?: Record<string, string>;
  customer?: Customer;
}

/** Linha persistida em `public.crm_negotiations` (mapeamento camelCase para o app). */
export type CrmTaskStatus = "aberta" | "concluida";

/** Linha `public.crm_tasks`. */
export interface CrmTask {
  id: string;
  tenantId: string;
  negotiationId: string | null;
  customerId: string | null;
  /** `profiles.id` do responsável, quando definido. */
  assigneeId: string | null;
  title: string;
  dueAt: string | null;
  status: CrmTaskStatus;
  notes: string;
  /** Modelo de origem (`crm_task_templates.id`), quando criada a partir de um. */
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Linha `public.crm_task_templates` — "tarefa pronta" reutilizável (modelo). */
export interface CrmTaskTemplate {
  id: string;
  tenantId: string;
  title: string;
  notes: string;
  /** Prazo padrão em dias a partir da criação (null = sem prazo sugerido). */
  defaultDueDays: number | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Linha `public.crm_negotiation_documents` (anexos do lead / negociação). */
export interface CrmNegotiationDocument {
  id: string;
  tenantId: string;
  negotiationId: string;
  /** Nome exibido escolhido ao anexar. */
  displayName: string;
  /** Caminho no bucket `crm-lead-documents`. */
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string | null;
  createdAt: string;
}

export interface CrmNegotiationRecord {
  id: string;
  tenantId: string;
  title: string;
  funnelId: string;
  stageId: string;
  status: CrmNegotiationStatus;
  assigneeId: string | null;
  customerId: string | null;
  sourceChatId?: string | null;
  lostReason?: string | null;
  sourceChatPreview?: string | null;
  sourceChatUnread?: number;
  starCount: number;
  qualification: number;
  totalValue: number;
  createdAt: string;
  updatedAt: string;
  nextTaskAt?: string | null;
  closingForecast?: string | null;
  lastContactAt?: string | null;
  lastInteractionAt?: string | null;
  otherInfo?: Record<string, string>;
  customer?: Customer;
}

export interface CustomerFilters {
  search?: string;
  perfil?: string;
  status?: string;
  rota?: string;
  /** Região macro (Norte/Sul/Leste/Oeste/Centro/etc.) inferida de zona/CEP/endereco. */
  regiao?: "todos" | "norte" | "sul" | "leste" | "oeste" | "centro" | "metropolitana" | "litoral" | "interior" | "rural" | "outros";
  /** Corresponde a `bairro` (substring, case-insensitive no servidor). */
  bairro?: string;
  /** Corresponde a `zone` (substring, case-insensitive no servidor). */
  zone?: string;
  /** Cidade (substring, case-insensitive). */
  cidade?: string;
  /**
   * Flag comercial `customers.ativo` (independente de `status` cadastral ativo/inativo/bloqueado).
   * "sim" = ativo ou não informado; "nao" = explicitamente false.
   */
  ativoComercial?: "todos" | "sim" | "nao";
  /** Corresponde a `observacoes` (substring; útil para notas ou “tags” em texto). */
  observacoesContem?: string;
  /** Tag textual (ex.: "vip", "atacado"), buscada em observacoes e source_columns. */
  tag?: string;
  selectedCustomerIds?: string[];
  /** Metadado de escopo (cache React Query); filtro real no RLS para atendimento. */
  listScopeRole?: UserRole;
  listScopeUserId?: string;
}

export interface CustomerUpsertInput {
  codigo?: string;
  origem?: "organico" | "pago";
  nome: string;
  telefone: string;
  celular?: string;
  email: string;
  cnpj: string;
  endereco: string;
  perfil: CustomerProfile;
  rota: string;
  status: CustomerStatus;
  vendedor: string;
  ultimoPedido: string;
  ticketMedio: number;
  frequenciaCompra: string;
  totalGasto: number;
  tipo?: string;
  razaoSocial?: string;
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
  cpf?: string;
  rg?: string;
  nascimento?: string;
  nomeSocial?: string;
  fax?: string;
  canal?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  zone?: string;
  complemento?: string;
  cidade?: string;
  estado?: string;
  ativo?: boolean;
  observacoes?: string;
  cadastradoEm?: string;
  sourceColumns?: Record<string, string>;
}

export interface DeliveryRoute {
  id: string;
  nome: string;
  regiao: string;
  estado?: string;
  cidade?: string;
  zona?: string;
  horarioCorte: string;
  dias: string[];
  clientesVinculados: number;
  status: DeliveryRouteStatus;
  observacoes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeliveryRouteUpsertInput {
  nome: string;
  regiao: string;
  estado?: string;
  cidade?: string;
  zona?: string;
  horarioCorte: string;
  dias: string[];
  status: DeliveryRouteStatus;
  observacoes?: string;
}

export type ProductKind = "produto" | "servico";

export interface Product {
  id: string;
  codigo: string;
  tipo: ProductKind;
  qtdEstoque: number;
  nome: string;
  precoCompra: number;
  precoVenda: number;
  codigoBarras: string;
  unidade: string;
  ncm: string;
  cest: string;
  grupo: string;
  pesoBruto: number;
  pesoLiquido: number;
  comissao: number;
  status: ProductStatus;
  /** Duração padrão em minutos (serviços agendáveis). */
  duracaoMin?: number | null;
  /** Aparece como serviço no módulo de Agendamento. */
  agendavel?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductFilters {
  search?: string;
  grupo?: string;
  unidade?: string;
  status?: string;
  selectedProductIds?: string[];
  /** Máximo de linhas retornadas (ex.: inbox). Omitir = sem limite explícito na query. */
  limit?: number;
}

export interface ProductUpsertInput {
  codigo: string;
  tipo: ProductKind;
  qtdEstoque: number;
  nome: string;
  precoCompra: number;
  precoVenda: number;
  codigoBarras: string;
  unidade: string;
  ncm: string;
  cest: string;
  grupo: string;
  pesoBruto: number;
  pesoLiquido: number;
  comissao: number;
  status: ProductStatus;
  duracaoMin?: number | null;
  agendavel?: boolean;
}

export type CallDirection = "outbound" | "inbound";
export type CallStatus =
  | "queued"
  | "initiated"
  | "ringing"
  | "in_progress"
  | "answered"
  | "completed"
  | "failed"
  | "no_answer"
  | "busy"
  | "canceled";

/** Registro de ligação (Twilio click-to-call). */
export interface CallLog {
  id: string;
  tenantId: string;
  provider: string;
  providerCallSid: string | null;
  direction: CallDirection;
  fromNumber: string | null;
  toNumber: string | null;
  attendantId: string | null;
  customerId: string | null;
  chatId: string | null;
  negotiationId: string | null;
  status: CallStatus;
  durationSeconds: number | null;
  recordingUrl: string | null;
  error: string | null;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Produto vinculado ao lead/negociação (pré-venda). */
export interface CrmNegotiationProduct {
  id: string;
  tenantId: string;
  negotiationId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  usedCustomPrice: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReturnResolution = "troca" | "credito";
export type ReturnSource = "existente" | "outra";

/** Forma de pagamento registrada na venda (espelha `sales.payment_method` no banco). */
export type SalePaymentMethod =
  | "pix"
  | "dinheiro"
  | "cartao_credito"
  | "cartao_debito"
  | "boleto"
  | "fiado"
  | "credito_loja"
  | "outro"
  | "nao_informado";

export const SALE_PAYMENT_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao_credito: "Cartao de credito",
  cartao_debito: "Cartao de debito",
  boleto: "Boleto",
  fiado: "Fiado / prazo",
  credito_loja: "Saldo de credito (integral)",
  outro: "Outro",
  nao_informado: "Nao informado",
};

export interface SaleFlowLineInput {
  productId: string;
  quantity: number;
  otherPrice?: boolean;
  customUnitPrice?: number;
}

export interface SaleFlowPayload {
  chatId: string | null;
  customerId?: string | null;
  flowType: "venda" | "devolucao";
  soldBy?: string;
  /** Modo multi-item: prioridade sobre saleProductId legado. */
  saleLines?: SaleFlowLineInput[];
  saleProductId?: string;
  saleOtherPrice?: boolean;
  saleCustomPrice?: number;
  /** Obrigatorio no fluxo de venda. */
  salePaymentMethod?: SalePaymentMethod;
  /** Valor abatido do saldo de credito do cliente (pagamento misto ou total via RPC). */
  saleCreditAmount?: number;
  /** Observacoes internas da venda (opcional, ate 2000 caracteres). */
  saleNotes?: string;
  returnSource?: ReturnSource;
  returnExistingSaleId?: string;
  /** Linha `sale_items.id` quando `returnSource === 'existente'` (varios itens na venda). */
  returnSaleItemId?: string;
  returnProductId?: string;
  returnOtherPrice?: boolean;
  returnCustomPrice?: number;
  /** Quantidade devolvida (parcial). Omitir ou null: servidor usa 1. */
  returnQuantity?: number;
  returnResolution?: ReturnResolution;
  /** Observacoes da devolucao (opcional, ate 2000 caracteres). */
  returnNotes?: string;
}

export interface SaleItemRecord {
  id: string;
  saleId: string;
  productId?: string | null;
  productName: string;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  usedCustomPrice: boolean;
  /** Ordenacao das linhas (ex.: devolucao por venda existente = primeiro por data). */
  createdAt?: string;
}

export interface SaleRecord {
  id: string;
  customerId?: string | null;
  customerName: string;
  chatId?: string | null;
  soldBy: string;
  soldAt: string;
  paymentMethod: SalePaymentMethod;
  /** Observacoes registradas no fluxo de venda (se houver). */
  notes?: string | null;
  items: SaleItemRecord[];
  totalAmount: number;
}

export interface ReturnRecord {
  id: string;
  customerId?: string | null;
  customerName: string;
  saleId?: string | null;
  source: "existing_sale" | "other_sale";
  resolution: ReturnResolution;
  productId?: string | null;
  productName?: string | null;
  /** Quantidade devolvida neste registro. */
  quantity: number;
  /** Linha de venda quando a devolucao amarra a `sale_items`. */
  saleItemId?: string | null;
  amount: number;
  usedCustomPrice: boolean;
  returnedAt: string;
  /** Observacoes registradas no fluxo de devolucao (se houver). */
  notes?: string | null;
}

export interface CustomerCreditRecord {
  id: string;
  customerId: string;
  customerName: string;
  returnId?: string | null;
  type: "credit_from_return" | "debit_usage";
  amount: number;
  description?: string | null;
  createdAt: string;
}

export interface CustomerCreditSummary {
  customerId: string;
  customerName: string;
  totalCredit: number;
  creditsCount: number;
  lastCreditAt?: string;
}

export interface Task {
  id: string;
  customerId?: string | null;
  routeId?: string | null;
  cliente: string;
  tipo: TaskType;
  vendedor: string;
  prazo: string;
  status: TaskStatus;
  descricao: string;
  origem?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskFilters {
  search?: string;
  tipo?: string;
  status?: string;
}

export interface TaskUpsertInput {
  customerId?: string | null;
  routeId?: string | null;
  cliente: string;
  vendedor: string;
  tipo: TaskType;
  prazo: string;
  status: TaskStatus;
  descricao: string;
  origem?: string;
}

export type CobrancaStatus = "pendente" | "enviada" | "pago" | "vencido" | "negociando";

export interface Cobranca {
  id: string;
  cliente: string;
  telefone: string;
  valor: number;
  /** Data de vencimento (yyyy-mm-dd) */
  vencimento: string;
  dias_atraso: number;
  tentativas: number;
  vendedor: string;
  status: CobrancaStatus;
}

export interface CobrancaUpsertInput {
  cliente: string;
  telefone: string;
  valor: number;
  /** yyyy-mm-dd */
  dueDate: string;
  vendedor: string;
  tentativas?: number;
  status: CobrancaStatus;
}

/** Backend da instância: UAZAPI (WhatsApp) ou Meta Graph API (Instagram Direct). */
export type ChannelProvider = "uazapi" | "meta_instagram";

/** Canal de uma conversa/mensagem. Em "instagram", remoteJid guarda o IGSID (sem telefone). */
export type ChannelType = "whatsapp" | "instagram";

export interface WhatsappInstance {
  id: string;
  displayName: string;
  uazapiInstanceName: string;
  uazapiBaseUrl: string;
  provider?: ChannelProvider;
  metaPageId?: string | null;
  metaIgUserId?: string | null;
  phoneNumber?: string | null;
  status: WhatsappInstanceStatus;
  isDefault: boolean;
  lastQr?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  createdAt?: string;
  aiEnabled?: boolean;
}

export interface WhatsappInstanceConnectInput {
  displayName: string;
  uazapiInstanceName: string;
  apiKey: string;
  uazapiBaseUrl?: string;
  isDefault?: boolean;
}

export interface WhatsappChannelCreateInput {
  displayName: string;
  uazapiBaseUrl?: string;
  isDefault?: boolean;
}

/** Nota interna visível só para a equipe — nunca enviada ao cliente. */
export interface ChatNote {
  readonly _noteKind: true; // discriminant para separar de WhatsappMessage no thread
  id: string;
  tenantId: string;
  chatId: string;
  authorId: string;
  authorName: string;
  bodyText: string;
  editedAt: string | null;
  createdAt: string;
}

export type QuickReplyScope = "global" | "private";

export interface QuickReply {
  id: string;
  tenantId: string;
  title: string;
  shortcut: string | null;
  bodyText: string;
  scope: QuickReplyScope;
  createdBy: string;
  sortOrder: number;
  createdAt: string;
}

export type ChatTagScope = "global" | "private";

export interface ChatTag {
  id: string;
  tenantId: string;
  name: string;
  color: string;
  scope: ChatTagScope;
  createdBy: string;
  createdAt: string;
}

export interface ChatTagOnChat {
  tagId: string;
  name: string;
  color: string;
  scope: ChatTagScope;
  taggedBy: string;
  taggedAt: string;
}

export interface AtendimentoUser {
  id: string;
  nome: string;
  email: string;
}

export interface ChatTransfer {
  id: string;
  chatId: string;
  fromUserId: string | null;
  toUserId: string | null;
  transferredBy: string | null;
  reason: string | null;
  transferredAt: string;
  fromUserName: string | null;
  toUserName: string | null;
  transferredByName: string | null;
}

export interface InboxChat {
  id: string;
  instanceId: string;
  instanceName: string;
  customerId?: string | null;
  customerName?: string | null;
  primaryNegotiationId?: string | null;
  channelType?: ChannelType;
  remoteJid: string;
  remotePhoneDigits?: string | null;
  remotePhoneE164?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  status: InboxChatStatus;
  resolution?: ChatResolution;
  aiMode?: ChatAiMode;
  assigneeId?: string | null;
  assigneeName?: string | null;
  firstInboundAt?: string | null;
  firstResponseAt?: string | null;
  slaFirstResponseDueAt?: string | null;
  snoozeUntil?: string | null;
  isPinned?: boolean;
  tags?: ChatTagOnChat[];
}

export interface InboxChatFilters {
  search?: string;
  instanceId?: string;
  instanceIds?: string[];
  unreadOnly?: boolean;
  status?: InboxChatStatus | "all";
  /** Subconjunto pela resolução operacional da conversa (ex.: apenas perdidas). */
  resolution?: ChatResolution;
  /** Quando true, exclui conversas com `resolution === "lost"` (ex.: listas Todas / Encerradas). */
  hideLost?: boolean;
  assigneeId?: string | "unassigned" | "mine";
  /** Usado com `assigneeId: "mine"` no cache/realtime. */
  currentUserId?: string;
  tagIds?: string[];
  snoozedOnly?: boolean;
  hideSnoozed?: boolean;
  /** Limite de chats retornados pelo servidor (default 500). */
  limit?: number;
  /** Restringe a um cliente (ex.: ficha de negociação — evita carregar o inbox todo). */
  customerId?: string;
}

export interface WhatsappMessage {
  id: string;
  chatId: string;
  instanceId: string;
  uazapiMessageId?: string | null;
  campaignId?: string | null;
  campaignRecipientId?: string | null;
  channelType?: ChannelType;
  direction: MessageDirection;
  messageType: MessageType;
  status: MessageStatus;
  bodyText?: string | null;
  mediaUrl?: string | null;
  payloadJson?: Record<string, unknown>;
  rawEvent?: Record<string, unknown> | null;
  quotedMessageId?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  createdAt?: string;
  actorType?: "human" | "ai" | "system" | null;
}

export interface SendWhatsappMessageInput {
  instanceId: string;
  chatId: string;
  remoteJid: string;
  messageType: Exclude<MessageType, "system">;
  bodyText?: string;
  mediaUrl?: string;
  payload?: Record<string, unknown>;
  quotedMessageId?: string;
  simulateTypingMs?: number;
}

export interface CampaignAudienceFilters extends CustomerFilters {
  selectedCustomerIds?: string[];
}

export interface CampaignPayload {
  bodyText?: string;
  bodyVariants?: string[];  // if set, dispatcher picks one randomly per recipient; supports spintax {a|b}
  mediaUrl?: string;
  payload?: Record<string, unknown>;
}

export interface Campaign {
  id: string;
  instanceId: string;
  instanceName: string;
  nome: string;
  status: CampaignStatus;
  messageType: Exclude<MessageType, "system">;
  audienceFilters: CampaignAudienceFilters;
  content: CampaignPayload;
  cadence: CampaignCadence;
  sendMode: CampaignSendMode;
  scheduledAt?: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  respondedCount: number;
  deliveredCount: number;
  readCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CampaignEvent {
  id: string;
  campaignId: string;
  eventType: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface CampaignUpsertInput {
  instanceId: string;
  nome: string;
  messageType: Exclude<MessageType, "system">;
  audienceFilters: CampaignAudienceFilters;
  content: CampaignPayload;
  cadence: CampaignCadence;
  excludeOptOuts: boolean;
  sendMode: CampaignSendMode;
  scheduledAt?: string | null;
  followUps: Array<{
    step: FollowUpStep;
    enabled: boolean;
    bodyText?: string;
    payload?: Record<string, unknown>;
  }>;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  instanceId: string;
  customerId?: string | null;
  chatId?: string | null;
  displayName: string;
  phoneDigits?: string | null;
  phoneE164?: string | null;
  phoneJid?: string | null;
  status: CampaignRecipientStatus;
  lastError?: string | null;
  sentAt?: string | null;
  respondedAt?: string | null;
}

export interface FollowUpRule {
  id: string;
  campaignId: string;
  step: FollowUpStep;
  delayMinutes: number;
  enabled: boolean;
  content: CampaignPayload;
}

export interface FollowUpJob {
  id: string;
  campaignId: string;
  campaignName: string;
  chatId?: string | null;
  customerName: string;
  step: FollowUpStep;
  scheduledFor: string;
  status: FollowUpJobStatus;
  executedAt?: string | null;
  lastError?: string | null;
}

// ---------------------------------------------------------------------------
// Módulo de Agendamento (scheduling_*)
// ---------------------------------------------------------------------------

export type AppointmentStatus =
  | "agendado"
  | "confirmado"
  | "concluido"
  | "cancelado"
  | "nao_compareceu";

export type AppointmentOrigin = "interno" | "publico" | "google";

export type GoogleSyncStatus = "pending" | "synced" | "error" | "skip";

/** Linha `public.scheduling_appointments`. */
export interface Appointment {
  id: string;
  tenantId: string;
  providerId: string;
  serviceId: string | null;
  customerId: string | null;
  /** Sala/recurso (opcional). */
  roomId: string | null;
  /** Agrupa ocorrências de uma recorrência/pacote. */
  seriesId: string | null;
  /** Convênio/particular. */
  convenio: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  googleEventId: string | null;
  googleCalendarId: string | null;
  googleSyncStatus: GoogleSyncStatus;
  googleSyncedAt: string | null;
  googleSyncError: string | null;
  customerNome: string | null;
  customerTelefone: string | null;
  serviceNome: string | null;
  preco: number | null;
  notes: string;
  /** Quando o paciente fez check-in (chegou). */
  checkedInAt: string | null;
  /** Motivo do cancelamento, when any. */
  cancelReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Serviços empilhados (sequenciais). */
  stackedServices?: { id: string; nome: string; duracaoMin: number; preco: number | null }[] | null;
  /** Prontuário / Evolução clínica. */
  clinicalNotes?: string | null;
}

/** Linha `public.scheduling_services` — vínculo serviço↔prestador. */
export interface SchedulingService {
  id: string;
  tenantId: string;
  productId: string;
  providerId: string;
  duracaoMin: number;
  preco: number | null;
  bufferAntesMin: number;
  bufferDepoisMin: number;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Linha `public.scheduling_provider_settings` — config do prestador. */
export interface ProviderSettings {
  id: string;
  tenantId: string;
  providerId: string;
  timezone: string;
  slotGranularityMin: number;
  minLeadTimeMin: number;
  maxAdvanceDays: number;
  acceptsOnlineBooking: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Linha `public.scheduling_working_hours` — expediente recorrente. */
export interface WorkingHour {
  id: string;
  tenantId: string;
  providerId: string;
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  /** "HH:MM" (hora local do prestador). */
  startTime: string;
  endTime: string;
  createdAt: string;
  updatedAt: string;
}

export type SchedulingExceptionKind = "block" | "extra";

/** Linha `public.scheduling_exceptions` — folga/bloqueio ou abertura extra. */
export interface SchedulingException {
  id: string;
  tenantId: string;
  providerId: string;
  kind: SchedulingExceptionKind;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  source: "manual" | "google";
  googleEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Slot livre devolvido pela edge function `scheduling-availability`. */
export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
}

export interface AvailabilityDay {
  date: string;
  slots: AvailabilitySlot[];
}
