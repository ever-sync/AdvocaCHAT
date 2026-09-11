import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
const fake = vi.hoisted(() => ({
  closed: false,
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    startAutoRefresh: vi.fn(),
    stopAutoRefresh: vi.fn(),
  },
  accept: vi.fn(),
}));
vi.mock("./client", () => ({
  getPortalClient: () => ({ auth: fake.auth }),
  isPortalSessionClosed: () => fake.closed,
  markPortalSessionClosed: (closed: boolean) => {
    fake.closed = closed;
  },
  PORTAL_CLOSED_KEY: "portal-closed",
}));
vi.mock("./api", () => ({ acceptPortalInvite: fake.accept }));
import { PortalAuthProvider } from "./Auth";
import { usePortalAuth } from "./auth-context";
const session = {
  access_token: "synthetic",
  user: { id: "external", role: "legal_portal" },
} as Session;
const activation = { invite: "a".repeat(64) };
function Probe() {
  const auth = usePortalAuth();
  return (
    <>
      <p>
        {auth.loading
          ? "loading"
          : auth.session
            ? `identity:${auth.session.user.id}`
            : "closed"}
      </p>
      <button
        onClick={() =>
          void auth
            .signIn("external@example.invalid", "synthetic-password")
            .catch(() => {})
        }
      >
        login
      </button>
      <button onClick={() => void auth.activate(activation).catch(() => {})}>
        activate
      </button>
      <button onClick={() => void auth.signOut()}>logout</button>
      <button
        onClick={() =>
          void auth.requestCode("external@example.invalid").catch(() => {})
        }
      >
        request-code
      </button>
      <button
        onClick={() =>
          void auth
            .confirmCode(
              "external@example.invalid",
              "123456",
              "synthetic-password",
            )
            .catch(() => {})
        }
      >
        confirm-code
      </button>
      <button
        onClick={() =>
          void auth.activate({ invite: activation.invite }).catch(() => {})
        }
      >
        accept-existing
      </button>
    </>
  );
}
function mount() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <PortalAuthProvider>
        <Probe />
      </PortalAuthProvider>
    </QueryClientProvider>,
  );
  return cache;
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.closed = false;
  fake.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  fake.auth.getUser.mockResolvedValue({
    data: { user: session.user },
    error: null,
  });
  fake.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  fake.auth.signOut.mockResolvedValue({ error: null });
  fake.auth.signInWithPassword.mockResolvedValue({
    data: { session },
    error: null,
  });
  fake.auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  fake.auth.verifyOtp.mockResolvedValue({
    data: { session, user: session.user },
    error: null,
  });
  fake.auth.updateUser.mockResolvedValue({
    data: { user: session.user },
    error: null,
  });
  fake.accept.mockResolvedValue({ status: "active" });
});
it("opening an invitation does not send or consume a code; the recipient explicitly requests and verifies it before accepting", async () => {
  mount();
  await screen.findByText("closed");
  expect(fake.auth.verifyOtp).not.toHaveBeenCalled();
  expect(fake.auth.signInWithOtp).not.toHaveBeenCalled();
  expect(fake.accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("request-code"));
  await waitFor(() =>
    expect(fake.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "external@example.invalid",
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/portal` },
    }),
  );
  fireEvent.click(screen.getByText("confirm-code"));
  await screen.findByText("identity:external");
  expect(fake.auth.verifyOtp).toHaveBeenCalledWith({
    email: "external@example.invalid",
    token: "123456",
    type: "email",
  });
  expect(fake.auth.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(
    fake.auth.updateUser.mock.invocationCallOrder[0],
  );
  expect(fake.accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("activate"));
  await waitFor(() =>
    expect(fake.accept).toHaveBeenCalledWith(activation.invite),
  );
});
it("blocks an internal Auth account from the external portal and signs out only the portal client locally", async () => {
  fake.auth.signInWithPassword.mockResolvedValue({
    data: {
      session: { ...session, user: { ...session.user, role: "authenticated" } },
    },
    error: null,
  });
  fake.auth.getUser.mockResolvedValue({
    data: { user: { ...session.user, role: "authenticated" } },
    error: null,
  });
  localStorage.setItem("internal-staff-session", "preserve");
  mount();
  await screen.findByText("closed");
  fireEvent.click(screen.getByText("login"));
  await waitFor(() =>
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: "local" }),
  );
  expect(screen.queryByText("identity:external")).not.toBeInTheDocument();
  expect(localStorage.getItem("internal-staff-session")).toBe("preserve");
});
it("a login response arriving after logout cannot reopen the view or restore cached documents", async () => {
  let resolve!: (value: unknown) => void;
  fake.auth.signInWithPassword.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const cache = mount();
  await screen.findByText("closed");
  cache.setQueryData(["portal", "external", "case"], {
    medical: "synthetic-private",
  });
  fireEvent.click(screen.getByText("login"));
  fireEvent.click(screen.getByText("logout"));
  await waitFor(() => expect(fake.closed).toBe(true));
  await act(async () => resolve({ data: { session }, error: null }));
  expect(screen.queryByText("identity:external")).not.toBeInTheDocument();
  expect(cache.getQueryCache().getAll()).toHaveLength(0);
  expect(fake.auth.getUser).not.toHaveBeenCalled();
});
it("an Auth verification finishing after a sign-out event cannot hydrate the prior identity", async () => {
  let callback!: (_event: string, next: Session | null) => void;
  let resolve!: (value: unknown) => void;
  fake.auth.onAuthStateChange.mockImplementation((cb) => {
    callback = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  fake.auth.getUser.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  mount();
  await screen.findByText("closed");
  act(() => callback("SIGNED_IN", session));
  await waitFor(() => expect(fake.auth.getUser).toHaveBeenCalled());
  act(() => callback("SIGNED_OUT", null));
  await act(async () => resolve({ data: { user: session.user }, error: null }));
  expect(screen.getByText("closed")).toBeInTheDocument();
  expect(screen.queryByText("identity:external")).not.toBeInTheDocument();
});

it("an existing account invitation only accepts the current authenticated grant, without OTP or password change", async () => {
  fake.auth.getSession.mockResolvedValue({ data: { session }, error: null });
  mount();
  await screen.findByText("identity:external");
  fireEvent.click(screen.getByText("accept-existing"));
  await waitFor(() =>
    expect(fake.accept).toHaveBeenCalledWith(activation.invite),
  );
  expect(fake.auth.verifyOtp).not.toHaveBeenCalled();
  expect(fake.auth.updateUser).not.toHaveBeenCalled();
});
