import type { UserRole } from "@/types/domain";

/** Admin e operação podem devolver negócio ao pool (limpar responsável). */
export function canReleaseCrmNegotiationToPool(role: UserRole | undefined): boolean {
  return role === "admin" || role === "operacao";
}

/** Ao criar negociação, admin deve escolher o atendente responsável. */
export function mustPickNegotiationAssigneeOnCreate(role: UserRole | undefined): boolean {
  return role === "admin";
}

/** Atendente que cria negociação vira responsável automaticamente. */
export function autoAssignNegotiationToCreatorOnCreate(role: UserRole | undefined): boolean {
  return role === "atendimento";
}

export function resolveNegotiationAssigneeOnCreate(
  role: UserRole | undefined,
  profileId: string | null | undefined,
  pickedAssigneeId: string | null | undefined,
): { assigneeId: string | null; error?: string } {
  if (autoAssignNegotiationToCreatorOnCreate(role)) {
    const selfId = profileId?.trim();
    if (!selfId) {
      return { assigneeId: null, error: "Não foi possível identificar seu usuário." };
    }
    return { assigneeId: selfId };
  }

  if (mustPickNegotiationAssigneeOnCreate(role)) {
    const assigneeId = pickedAssigneeId?.trim();
    if (!assigneeId) {
      return { assigneeId: null, error: "Selecione o atendente responsável pelo lead." };
    }
    return { assigneeId };
  }

  const fallbackId = profileId?.trim();
  return { assigneeId: fallbackId || null };
}

export function isNegotiationAssignedToProfile(
  assigneeId: string | null | undefined,
  profileId: string | null | undefined,
): boolean {
  const aid = assigneeId?.trim();
  const pid = profileId?.trim();
  return Boolean(aid && pid && aid === pid);
}

/** Atendimento só altera negócio assumido (responsável = usuário logado). Demais papéis seguem regras atuais. */
export function canAtendimentoModifyNegotiation(
  role: UserRole | undefined,
  assigneeId: string | null | undefined,
  profileId: string | null | undefined,
): boolean {
  if (role !== "atendimento") {
    return true;
  }
  return isNegotiationAssignedToProfile(assigneeId, profileId);
}

/** Atendimento só interage na conversa quando ela está atribuída a ele. */
export function canAtendimentoActOnChat(
  role: UserRole | undefined,
  chatAssigneeId: string | null | undefined,
  profileId: string | null | undefined,
): boolean {
  if (role !== "atendimento") {
    return true;
  }
  const aid = chatAssigneeId?.trim();
  const pid = profileId?.trim();
  return Boolean(aid && pid && aid === pid);
}

export function negotiationAssigneeBlockedMessage(): string {
  return assumeNegotiationToEditCrmMessage();
}

export function chatAssigneeBlockedMessage(): string {
  return assumeConversationToReplyMessage();
}

/** Conversa atribuída a outro atendente (deep link / RLS). */
export function chatAssignedToOtherAttendantMessage(): string {
  return "Conversa atribuída a outro atendente.";
}

export function assumeConversationToReplyMessage(): string {
  return "Assuma a conversa para responder.";
}

/** Admin e operação veem conversa no pool sem assumir (gestão da fila). */
export function canBypassInboxClaimGate(role: UserRole | undefined): boolean {
  return role === "admin" || role === "operacao";
}

/**
 * Bloqueio de conteúdo no Inbox: somente atendimento em conversa sem responsável.
 * Demais papéis (admin, operação, financeiro, etc.) não passam por este gate.
 */
export function mustAssumeUnassignedChatToView(
  role: UserRole | undefined,
  chatAssigneeId: string | null | undefined,
): boolean {
  if (canBypassInboxClaimGate(role)) {
    return false;
  }
  if (role !== "atendimento") {
    return false;
  }
  return !chatAssigneeId?.trim();
}

export function assumeConversationToViewMessage(): string {
  return "Para ver esta conversa, você precisa assumi-la.";
}

export function assumeNegotiationToEditCrmMessage(): string {
  return "Assuma o negócio para alterar o CRM.";
}

export function managerOnlyTransferConversationMessage(): string {
  return "Apenas gestor pode transferir esta conversa.";
}

export function managerOnlyReleaseToPoolMessage(): string {
  return "Apenas gestor pode devolver ao pool.";
}

/** Chat e negócio vinculados no pool: oferecer assumir os dois de uma vez. */
export function shouldOfferInboxClaimBoth(
  chatAssigneeId: string | null | undefined,
  negotiationAssigneeId: string | null | undefined,
): boolean {
  const chatOpen = !chatAssigneeId?.trim();
  const negOpen = !negotiationAssigneeId?.trim();
  return chatOpen && negOpen;
}

/** Perfil do cliente: bloqueia CRM se houver negócio em andamento não assumido pelo atendente. */
export function isClientePerfilCrmLocked(
  role: UserRole | undefined,
  profileId: string | null | undefined,
  negotiations: Array<{ status: string; assigneeId?: string | null }>,
): boolean {
  if (role !== "atendimento") {
    return false;
  }
  const active = negotiations.filter((n) => n.status === "em_andamento");
  if (active.length === 0) {
    return false;
  }
  return !active.every((n) => isNegotiationAssignedToProfile(n.assigneeId, profileId));
}

/** Inbox: atendente precisa da conversa e do negócio CRM assumidos para ações no lead. */
export function isInboxLeadLocked(
  role: UserRole | undefined,
  chatAssigneeId: string | null | undefined,
  negotiationAssigneeId: string | null | undefined,
  profileId: string | null | undefined,
  options?: { hasLinkedNegotiation?: boolean },
): boolean {
  if (role !== "atendimento") {
    return false;
  }
  if (!canAtendimentoActOnChat(role, chatAssigneeId, profileId)) {
    return true;
  }
  if (options?.hasLinkedNegotiation) {
    return !canAtendimentoModifyNegotiation(role, negotiationAssigneeId, profileId);
  }
  return false;
}
