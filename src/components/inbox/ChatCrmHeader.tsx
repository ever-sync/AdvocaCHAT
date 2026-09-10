import { Link } from "react-router-dom";
import { Briefcase, ExternalLink, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_CRM_FUNNELS, funnelStageTitleIn } from "@/data/crm-funnels";
import { useChatNegotiation } from "@/lib/api/crm-lead";
import { useEffectiveCrmFunnels } from "@/lib/api/crm-funnel-config";
import type { InboxChat } from "@/types/domain";

type ChatCrmHeaderProps = {
  chat: InboxChat;
};

/**
 * Linha abaixo do nome: badges do negócio (funil · etapa, vendido/perdido, link
 * para o CRM) quando existe lead, e o status da IA quando ativa. A criação de
 * lead foi movida para o botão "Criar lead no CRM" na linha do nome (CreateLeadDialog).
 */
export function ChatCrmHeader({ chat }: ChatCrmHeaderProps) {
  const aiMode = chat.aiMode ?? "off";
  const { data: funnels = DEFAULT_CRM_FUNNELS } = useEffectiveCrmFunnels();
  const { data: negotiation } = useChatNegotiation(chat.id);

  const funnel = funnels.find((f) => f.id === negotiation?.funnelId) ?? funnels[0];
  const stageTitle = negotiation
    ? funnelStageTitleIn(funnels, negotiation.funnelId, negotiation.stageId)
    : null;

  if (!negotiation && aiMode === "off") {
    return null;
  }

  return (
    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="CRM e resolução">
      {negotiation ? (
        <>
          <Badge
            variant="secondary"
            className="max-w-[min(240px,40vw)] truncate text-xs font-medium"
            title={`${funnel?.listName ?? negotiation.funnelId} · ${stageTitle ?? negotiation.stageId}`}
          >
            {stageTitle ?? negotiation.stageId}
          </Badge>
          {negotiation.status === "vendido" && (
            <Badge className="shrink-0 bg-emerald-600 text-xs text-white hover:bg-emerald-600">Vendido</Badge>
          )}
          {negotiation.status === "perdido" && (
            <Badge variant="outline" className="shrink-0 text-xs text-destructive">
              Perdido
            </Badge>
          )}
          <Link
            to={`/crm/negociacao/${negotiation.id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-wchat-100 hover:underline"
            title="Abrir negócio no CRM"
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only">CRM</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>
        </>
      ) : null}
      {aiMode !== "off" ? (
        <Badge variant="secondary" className="inline-flex items-center gap-1 text-xs font-medium">
          <Sparkles className="h-3 w-3" />
          {aiMode === "full" ? "IA completa" : aiMode === "qualifying" ? "IA de qualificação" : "IA de handoff"}
        </Badge>
      ) : null}
    </div>
  );
}
