import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { parseTheoAnalysis } from "../_shared/theo-analysis.ts";

const base = { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "1", type: "function" as const, function: { name: "submit_document_analysis", arguments: '{"document_type":"medical_report"}' } }] }, finish_reason: "tool_calls" }] };

Deno.test("parseTheoAnalysis accepts only the structured Theo tool", () => {
  assertEquals(parseTheoAnalysis(base as never).document_type, "medical_report");
});

Deno.test("parseTheoAnalysis rejects prose-only responses", () => {
  assertThrows(() => parseTheoAnalysis({ choices: [{ message: { role: "assistant", content: "parece válido" }, finish_reason: "stop" }] } as never));
});
