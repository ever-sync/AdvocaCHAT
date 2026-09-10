import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  requireSupabase: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => mockSelect(),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/api/tenant", () => ({
  getCurrentTenantId: async () => "tenant-1",
}));

import { linkWhatsappChatToCustomer } from "@/lib/api/whatsapp";

describe("linkWhatsappChatToCustomer", () => {
  beforeEach(() => {
    mockSelect.mockReset();
  });

  it("throws when update matches no row", async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });
    await expect(linkWhatsappChatToCustomer("missing-chat", "cust-1")).rejects.toThrow(
      "Conversa não encontrada neste workspace",
    );
  });

  it("resolves when one row is returned", async () => {
    mockSelect.mockResolvedValue({ data: [{ id: "chat-1" }], error: null });
    await expect(linkWhatsappChatToCustomer("chat-1", "cust-1")).resolves.toBeUndefined();
  });

  it("propagates Supabase error message", async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: "RLS violation" } });
    await expect(linkWhatsappChatToCustomer("chat-1", "cust-1")).rejects.toThrow("RLS violation");
  });
});
