import type { ChatAiMode } from "@/types/domain";

export type AiReplyEligibilityReason =
  | "ai_off"
  | "handoff_mode"
  | "qualifying_stage_limit";

export type AiReplyEligibilityInput = {
  aiMode?: ChatAiMode | null;
  chatAssigneeId?: string | null;
  negotiationAssigneeId?: string | null;
  negotiationStageId?: string | null;
};

export type AiReplyEligibilityResult =
  | { allowed: true; reason?: undefined }
  | { allowed: false; reason: AiReplyEligibilityReason };

const QUALIFYING_ALLOWED_STAGE_IDS = new Set(["lead", "contato"]);

export function evaluateAiReplyEligibility(
  input: AiReplyEligibilityInput,
): AiReplyEligibilityResult {
  const aiMode = input.aiMode ?? "off";

  if (aiMode === "off") {
    return { allowed: false, reason: "ai_off" };
  }

  if (aiMode === "handoff") {
    return { allowed: false, reason: "handoff_mode" };
  }

  if (aiMode === "qualifying") {
    const stageId = input.negotiationStageId?.trim();
    if (stageId && !QUALIFYING_ALLOWED_STAGE_IDS.has(stageId)) {
      return { allowed: false, reason: "qualifying_stage_limit" };
    }
  }

  return { allowed: true };
}
