import { useMemo } from "react";
import { useClaimChat } from "@/lib/api/chat-tags";
import {
  useClaimCrmNegotiation,
  useReleaseCrmNegotiationToPool,
} from "@/lib/api/crm-negotiations";
import { isNegotiationUnassigned } from "@/lib/crm/negotiation-alerts";
import {
  canReleaseCrmNegotiationToPool,
  mustAssumeUnassignedChatToView,
  shouldOfferInboxClaimBoth,
} from "@/lib/crm/negotiation-assignee";
import { useToast } from "@/hooks/use-toast";
import type {
  CrmNegotiationRecord,
  InboxChat,
  UserRole,
} from "@/types/domain";

export type UseInboxClaimActionsArgs = {
  chat: InboxChat | null;
  negotiation: CrmNegotiationRecord | null;
  /** True enquanto o `useChatNegotiation` ainda está carregando o vínculo do chat. */
  negotiationLoading: boolean;
  viewerRole: UserRole | undefined;
};

export type UseInboxClaimActionsResult = {
  claimChat: ReturnType<typeof useClaimChat>;
  claimNegotiation: ReturnType<typeof useClaimCrmNegotiation>;
  releaseNegotiation: ReturnType<typeof useReleaseCrmNegotiationToPool>;

  /** O role atual pode devolver negócio ao pool? */
  canReleaseToPool: boolean;

  /** Atendimento precisa assumir antes de ver a thread? */
  mustAssumeChatToView: boolean;

  /** Mostra "Assumir negócio" no header. */
  showClaimNegotiation: boolean;

  /** Mostra "Devolver negócio" no header. */
  showReleaseNegotiation: boolean;

  /** Oferece o botão "Assumir ambos" (chat + negócio). */
  offerClaimBoth: boolean;

  /** Assume chat + negócio em sequência, com toast unificado. */
  handleClaimChatAndNegotiation: () => Promise<void>;
};

/**
 * Encapsula as mutations de claim/release + as flags derivadas do estado
 * do chat e da negociação ligada. Centraliza o handler atômico que assume
 * os dois juntos (usado pelo splash de claim required e pelo botão
 * "Assumir ambos" do header).
 */
export function useInboxClaimActions({
  chat,
  negotiation,
  negotiationLoading,
  viewerRole,
}: UseInboxClaimActionsArgs): UseInboxClaimActionsResult {
  const { toast } = useToast();
  const claimChat = useClaimChat();
  const claimNegotiation = useClaimCrmNegotiation();
  const releaseNegotiation = useReleaseCrmNegotiationToPool();

  const canReleaseToPool = canReleaseCrmNegotiationToPool(viewerRole);

  const mustAssumeChatToView = useMemo(
    () => mustAssumeUnassignedChatToView(viewerRole, chat?.assigneeId),
    [viewerRole, chat?.assigneeId],
  );

  const showClaimNegotiation =
    Boolean(chat?.primaryNegotiationId) &&
    !negotiationLoading &&
    negotiation != null &&
    negotiation.status === "em_andamento" &&
    isNegotiationUnassigned(negotiation.assigneeId);

  const showReleaseNegotiation =
    Boolean(chat?.primaryNegotiationId) &&
    !negotiationLoading &&
    negotiation != null &&
    negotiation.status === "em_andamento" &&
    canReleaseToPool &&
    !isNegotiationUnassigned(negotiation.assigneeId);

  const offerClaimBoth =
    Boolean(chat && negotiation) &&
    shouldOfferInboxClaimBoth(chat?.assigneeId, negotiation?.assigneeId);

  async function handleClaimChatAndNegotiation() {
    if (!chat || !negotiation) {
      return;
    }
    try {
      await claimChat.mutateAsync(chat.id);
      if (isNegotiationUnassigned(negotiation.assigneeId)) {
        await claimNegotiation.mutateAsync(negotiation.id);
      }
      toast({
        title: "Conversa e negócio assumidos",
        description: `Você é o responsável por "${negotiation.title}".`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível assumir",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  return {
    claimChat,
    claimNegotiation,
    releaseNegotiation,
    canReleaseToPool,
    mustAssumeChatToView,
    showClaimNegotiation,
    showReleaseNegotiation,
    offerClaimBoth,
    handleClaimChatAndNegotiation,
  };
}
