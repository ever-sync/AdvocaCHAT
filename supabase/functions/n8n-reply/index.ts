import { aiBlockReasonMessage, evaluateAiReplyEligibility } from "../_shared/ai-business-rules.ts";
import {
  addNegotiationTag,
  handoffChat,
  moveNegotiationStage,
  sendWhatsappText,
} from "../_shared/ai-tools.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { PermissionDeniedError, assertTenantBillingActive, createAdminClient } from "../_shared/supabase.ts";
import { timingSafeEqual } from "../_shared/timing-safe-equal.ts";

const MAX_TIMESTAMP_SKEW_SECONDS = 300;

function parseTimestampSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d{10,13}$/.test(trimmed)) return null;
  const num = Number(trimmed);
  return trimmed.length === 13 ? Math.floor(num / 1000) : num;
}

async function verifySignedRequest(
  secret: string,
  timestamp: string,
  body: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, signature.replace(/^sha256=/, "").toLowerCase());
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const rawBody = await request.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const admin = createAdminClient();
  const chatId = String(body.chat_id ?? "");
  const tenantId = String(body.tenant_id ?? "");

  if (!chatId || !tenantId) {
    return jsonResponse({ error: "chat_id and tenant_id required." }, 400);
  }

  const { data: integration } = await admin
    .from("tenant_integrations")
    .select("n8n_secret, n8n_enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const serviceKey = Deno.env.get("N8N_SERVICE_KEY");
  const authHeader = request.headers.get("Authorization");
  const signature = request.headers.get("X-WChat-Signature");
  const timestampHeader = request.headers.get("X-WChat-Timestamp");

  const authorizedByKey = Boolean(serviceKey) && authHeader === `Bearer ${serviceKey}`;

  let authorizedByHmac = false;
  if (!authorizedByKey && integration?.n8n_secret && signature) {
    const tsSeconds = parseTimestampSeconds(timestampHeader);
    if (tsSeconds === null) {
      return jsonResponse({ error: "Missing or invalid X-WChat-Timestamp." }, 401);
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - tsSeconds) > MAX_TIMESTAMP_SKEW_SECONDS) {
      return jsonResponse({ error: "Timestamp outside acceptable window." }, 401);
    }
    authorizedByHmac = await verifySignedRequest(
      integration.n8n_secret,
      timestampHeader!.trim(),
      rawBody,
      signature,
    );
  }

  if (!authorizedByKey && !authorizedByHmac) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  if (!integration?.n8n_enabled) {
    return jsonResponse({ error: "n8n integration disabled." }, 403);
  }

  try {
    await assertTenantBillingActive(admin, tenantId, "enviar respostas automaticas");

    const { data: chat, error: chatError } = await admin
      .from("whatsapp_chats")
      .select("*, customers(opt_out)")
      .eq("id", chatId)
      .eq("tenant_id", tenantId)
      .single();

    if (chatError || !chat) {
      return jsonResponse({ error: "Chat not found." }, 404);
    }

    const customersJoin = chat.customers as { opt_out?: boolean } | null | undefined;
    let negotiation: {
      assignee_id?: string | null;
      status?: string | null;
      stage_id?: string | null;
    } | null = null;

    if (chat.primary_negotiation_id) {
      const { data: neg } = await admin
        .from("crm_negotiations")
        .select("assignee_id, status, stage_id")
        .eq("id", chat.primary_negotiation_id)
        .maybeSingle();
      negotiation = neg;
    }

    const aiEligibility = evaluateAiReplyEligibility({
      aiMode: String(chat.ai_mode ?? "off"),
      chatAssigneeId: chat.assignee_id,
      negotiationAssigneeId: negotiation?.assignee_id,
      negotiationStatus: negotiation?.status,
      negotiationStageId: negotiation?.stage_id,
      customerOptOut: Boolean(customersJoin?.opt_out),
    });

    if (!aiEligibility.allowed) {
      const reason = aiEligibility.reason ?? "ai_off";
      return jsonResponse(
        {
          error: "AI blocked by business rules.",
          block_reason: reason,
          message: aiBlockReasonMessage(reason),
          ai_mode: aiEligibility.aiMode,
        },
        409,
      );
    }

    const text = String(body.text ?? "").trim();
    const handoff = body.handoff === true;

    if (text) {
      await sendWhatsappText(admin, chat, text, "n8n");
    }

    const setStage = typeof body.set_stage === "string" ? body.set_stage.trim() : null;
    if (setStage && chat.primary_negotiation_id) {
      await moveNegotiationStage(admin, chat.primary_negotiation_id, setStage);
    }

    if (handoff) {
      await handoffChat(admin, tenantId, chatId);
    }

    const tagsAdd = body.tags_add;
    if (Array.isArray(tagsAdd) && chat.primary_negotiation_id) {
      for (const tagName of tagsAdd) {
        const name = String(tagName).trim();
        if (!name) continue;
        await addNegotiationTag(admin, tenantId, chat.primary_negotiation_id, name);
      }
    }

    return jsonResponse({ success: true, handoff });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      400,
    );
  }
});
