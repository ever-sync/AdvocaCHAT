import { afterEach, expect, it, vi } from "vitest";
const create = vi.hoisted(() => vi.fn(() => ({ auth: {} })));
vi.mock("@supabase/supabase-js", () => ({ createClient: create }));
afterEach(() => vi.unstubAllEnvs());
it("uses a dedicated storage key and never consumes URL sessions or removes the staff session", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://portal-fixture.invalid");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "synthetic-anon");
  const module = await import("./client");
  module.getPortalClient();
  expect(create).toHaveBeenCalledWith(
    "https://portal-fixture.invalid",
    "synthetic-anon",
    {
      auth: {
        storageKey: module.PORTAL_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    },
  );
  expect(module.PORTAL_STORAGE_KEY).toMatch(/^caleo-legal-portal-auth-v1:/);
  localStorage.setItem("sb-existing-auth-token", "internal-synthetic");
  localStorage.setItem(module.PORTAL_STORAGE_KEY, "portal-synthetic");
  module.markPortalSessionClosed(true);
  expect(localStorage.getItem(module.PORTAL_STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem("sb-existing-auth-token")).toBe(
    "internal-synthetic",
  );
  expect(module.isPortalSessionClosed()).toBe(true);
  module.markPortalSessionClosed(false);
  expect(module.isPortalSessionClosed()).toBe(false);
});
