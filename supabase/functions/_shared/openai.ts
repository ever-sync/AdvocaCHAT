// Cliente mínimo da Chat Completions API da OpenAI via fetch (Deno edge function).
// Usado como provedor alternativo de LLM no orquestrador (multi-LLM, F7).

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export type OpenAiTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | unknown[] | null; // unknown[] para conteúdo multimodal (image_url)
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
};

export type OpenAiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
};

export type OpenAiResponse = {
  choices: Array<{
    message: { role: string; content: string | null; tool_calls?: OpenAiToolCall[] };
    finish_reason: string;
  }>;
  usage?: OpenAiUsage;
};

export type CreateChatCompletionInput = {
  model: string;
  maxTokens: number;
  messages: OpenAiMessage[];
  tools: OpenAiTool[];
};

/** Uma chamada POST /v1/chat/completions. Lança em status != 2xx. */
export async function createChatCompletion(input: CreateChatCompletionInput): Promise<OpenAiResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens,
      messages: input.messages,
      tools: input.tools,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as OpenAiResponse;
}
