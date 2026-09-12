import type { OpenAiResponse } from "./openai.ts";

export function parseTheoAnalysis(response: OpenAiResponse) {
  const call = response.choices?.[0]?.message?.tool_calls?.find(
    (item) => item.function.name === "submit_document_analysis",
  );
  if (!call) throw new Error("Theo não entregou uma análise estruturada.");
  let value: unknown;
  try {
    value = JSON.parse(call.function.arguments);
  } catch {
    throw new Error("Theo entregou JSON inválido.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Theo entregou análise inválida.");
  }
  return value as Record<string, unknown>;
}
