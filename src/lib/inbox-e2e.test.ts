import { beforeEach, describe, expect, it } from "vitest";
import { E2E_INBOX_CHATS } from "@/data/inbox-e2e-fixtures";
import { E2E_MOCK_PROFILE_ID, setE2eMockRole } from "@/lib/e2e";
import { filterE2eInboxChatsByRole, listE2eInboxChats } from "@/lib/inbox-e2e";

describe("inbox E2E filters", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("atendimento enxerga chat próprio e pool, não o de outro atendente", () => {
    setE2eMockRole("atendimento");
    const visible = filterE2eInboxChatsByRole(E2E_INBOX_CHATS);
    expect(visible).toHaveLength(2);
    expect(visible.some((c) => c.assigneeId === E2E_MOCK_PROFILE_ID)).toBe(true);
    expect(visible.some((c) => !c.assigneeId)).toBe(true);
    expect(visible.some((c) => c.assigneeId && c.assigneeId !== E2E_MOCK_PROFILE_ID)).toBe(
      false,
    );
  });

  it("admin enxerga todas as conversas mock", () => {
    setE2eMockRole("admin");
    expect(filterE2eInboxChatsByRole(E2E_INBOX_CHATS)).toHaveLength(3);
  });

  it("filtro mine restringe ao usuário atual", () => {
    setE2eMockRole("admin");
    const mine = listE2eInboxChats({
      assigneeId: "mine",
      currentUserId: E2E_MOCK_PROFILE_ID,
    });
    expect(mine.every((c) => c.assigneeId === E2E_MOCK_PROFILE_ID)).toBe(true);
  });
});
