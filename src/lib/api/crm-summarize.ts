import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { invokeAuthedFunction } from "@/lib/api/functions";

export type SummarizeNegotiationResponse = {
  summary: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  model: string;
  contextSize: {
    activities: number;
    comments: number;
    tasks: number;
    products: number;
    messages: number;
    hasCustomer: boolean;
  };
};

export async function summarizeCrmNegotiation(
  negotiationId: string,
): Promise<SummarizeNegotiationResponse> {
  return invokeAuthedFunction<SummarizeNegotiationResponse>(
    "crm-summarize-negotiation",
    { negotiationId },
  );
}

export function useSummarizeCrmNegotiation(
  options?: UseMutationOptions<SummarizeNegotiationResponse, Error, string>,
) {
  return useMutation({
    mutationFn: summarizeCrmNegotiation,
    ...options,
  });
}

// ─── Sugerir próxima mensagem ─────────────────────────────────────────────────

export type SuggestNextMessageTone = "cordial" | "direto" | "urgente";

export type SuggestNextMessageResponse = {
  message: string;
  tone: SuggestNextMessageTone;
  usage: SummarizeNegotiationResponse["usage"];
  model: string;
  chatId: string | null;
};

export async function suggestNextMessage(input: {
  negotiationId: string;
  tone: SuggestNextMessageTone;
}): Promise<SuggestNextMessageResponse> {
  return invokeAuthedFunction<SuggestNextMessageResponse>(
    "crm-suggest-next-message",
    input,
  );
}

export function useSuggestNextMessage(
  options?: UseMutationOptions<
    SuggestNextMessageResponse,
    Error,
    { negotiationId: string; tone: SuggestNextMessageTone }
  >,
) {
  return useMutation({
    mutationFn: suggestNextMessage,
    ...options,
  });
}
