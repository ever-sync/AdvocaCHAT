import { describe, expect, it } from "vitest";
import {
  assumeConversationToReplyMessage,
  assumeConversationToViewMessage,
  assumeNegotiationToEditCrmMessage,
  canAtendimentoActOnChat,
  canAtendimentoModifyNegotiation,
  canReleaseCrmNegotiationToPool,
  chatAssignedToOtherAttendantMessage,
  isClientePerfilCrmLocked,
  isInboxLeadLocked,
  managerOnlyTransferConversationMessage,
  canBypassInboxClaimGate,
  autoAssignNegotiationToCreatorOnCreate,
  mustAssumeUnassignedChatToView,
  mustPickNegotiationAssigneeOnCreate,
  resolveNegotiationAssigneeOnCreate,
  shouldOfferInboxClaimBoth,
} from "./negotiation-assignee";

describe("canReleaseCrmNegotiationToPool", () => {
  it("permite admin e operação", () => {
    expect(canReleaseCrmNegotiationToPool("admin")).toBe(true);
    expect(canReleaseCrmNegotiationToPool("operacao")).toBe(true);
  });

  it("nega atendimento, financeiro e demais papeis", () => {
    expect(canReleaseCrmNegotiationToPool("atendimento")).toBe(false);
    expect(canReleaseCrmNegotiationToPool("financeiro")).toBe(false);
    expect(canReleaseCrmNegotiationToPool(undefined)).toBe(false);
  });
});

describe("resolveNegotiationAssigneeOnCreate", () => {
  it("atendimento vincula a si mesmo", () => {
    expect(resolveNegotiationAssigneeOnCreate("atendimento", "u1", null)).toEqual({
      assigneeId: "u1",
    });
    expect(resolveNegotiationAssigneeOnCreate("atendimento", "u1", "u2")).toEqual({
      assigneeId: "u1",
    });
  });

  it("admin exige atendente escolhido", () => {
    expect(resolveNegotiationAssigneeOnCreate("admin", "admin-1", null).error).toContain(
      "atendente",
    );
    expect(resolveNegotiationAssigneeOnCreate("admin", "admin-1", "att-1")).toEqual({
      assigneeId: "att-1",
    });
  });

  it("operacao e financeiro usam o criador quando nao ha escolha", () => {
    expect(resolveNegotiationAssigneeOnCreate("operacao", "op-1", null)).toEqual({
      assigneeId: "op-1",
    });
    expect(mustPickNegotiationAssigneeOnCreate("admin")).toBe(true);
    expect(mustPickNegotiationAssigneeOnCreate("atendimento")).toBe(false);
    expect(autoAssignNegotiationToCreatorOnCreate("atendimento")).toBe(true);
  });
});

describe("canAtendimentoModifyNegotiation", () => {
  it("atendimento só altera negócio atribuído a si", () => {
    expect(canAtendimentoModifyNegotiation("atendimento", "u1", "u1")).toBe(true);
    expect(canAtendimentoModifyNegotiation("atendimento", null, "u1")).toBe(false);
    expect(canAtendimentoModifyNegotiation("atendimento", "u2", "u1")).toBe(false);
  });

  it("admin e operação não são restritos", () => {
    expect(canAtendimentoModifyNegotiation("admin", null, "u1")).toBe(true);
    expect(canAtendimentoModifyNegotiation("operacao", "u2", "u1")).toBe(true);
  });
});

describe("canAtendimentoActOnChat", () => {
  it("atendimento só atua em conversa atribuída a si", () => {
    expect(canAtendimentoActOnChat("atendimento", "u1", "u1")).toBe(true);
    expect(canAtendimentoActOnChat("atendimento", null, "u1")).toBe(false);
    expect(canAtendimentoActOnChat("admin", null, "u1")).toBe(true);
  });
});

describe("isClientePerfilCrmLocked", () => {
  it("bloqueia quando há negócio em andamento não assumido", () => {
    expect(
      isClientePerfilCrmLocked("atendimento", "u1", [
        { status: "em_andamento", assigneeId: null },
      ]),
    ).toBe(true);
    expect(
      isClientePerfilCrmLocked("atendimento", "u1", [
        { status: "em_andamento", assigneeId: "u1" },
      ]),
    ).toBe(false);
    expect(isClientePerfilCrmLocked("admin", "u1", [{ status: "em_andamento", assigneeId: null }])).toBe(
      false,
    );
  });
});

describe("mensagens de bloqueio (plano multi-atendentes)", () => {
  it("expõe textos consistentes para UX", () => {
    expect(chatAssignedToOtherAttendantMessage()).toContain("outro atendente");
    expect(assumeConversationToReplyMessage()).toContain("Assuma a conversa");
    expect(assumeNegotiationToEditCrmMessage()).toContain("Assuma o negócio");
    expect(managerOnlyTransferConversationMessage()).toContain("gestor");
    expect(assumeConversationToViewMessage()).toContain("assumi-la");
  });
});

describe("mustAssumeUnassignedChatToView", () => {
  it("exige assumir pool apenas para atendimento", () => {
    expect(mustAssumeUnassignedChatToView("atendimento", null)).toBe(true);
    expect(mustAssumeUnassignedChatToView("atendimento", "")).toBe(true);
    expect(mustAssumeUnassignedChatToView("atendimento", "u1")).toBe(false);
    expect(mustAssumeUnassignedChatToView("admin", null)).toBe(false);
    expect(mustAssumeUnassignedChatToView("operacao", null)).toBe(false);
    expect(mustAssumeUnassignedChatToView("financeiro", null)).toBe(false);
  });
});

describe("canBypassInboxClaimGate", () => {
  it("libera gate para admin e operação", () => {
    expect(canBypassInboxClaimGate("admin")).toBe(true);
    expect(canBypassInboxClaimGate("operacao")).toBe(true);
    expect(canBypassInboxClaimGate("atendimento")).toBe(false);
    expect(canBypassInboxClaimGate("financeiro")).toBe(false);
  });
});

describe("shouldOfferInboxClaimBoth", () => {
  it("oferece quando conversa e negócio estão no pool", () => {
    expect(shouldOfferInboxClaimBoth(null, null)).toBe(true);
    expect(shouldOfferInboxClaimBoth(undefined, "")).toBe(true);
  });

  it("não oferece se conversa ou negócio já têm responsável", () => {
    expect(shouldOfferInboxClaimBoth("u1", null)).toBe(false);
    expect(shouldOfferInboxClaimBoth(null, "u2")).toBe(false);
  });
});

describe("isInboxLeadLocked", () => {
  it("bloqueia sem conversa ou negócio assumidos", () => {
    expect(isInboxLeadLocked("atendimento", null, null, "u1")).toBe(true);
    expect(
      isInboxLeadLocked("atendimento", "u1", null, "u1", { hasLinkedNegotiation: true }),
    ).toBe(true);
    expect(
      isInboxLeadLocked("atendimento", "u1", "u1", "u1", { hasLinkedNegotiation: true }),
    ).toBe(false);
    expect(isInboxLeadLocked("admin", null, null, "u1", { hasLinkedNegotiation: true })).toBe(
      false,
    );
  });
});
