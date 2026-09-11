import { expect, it, vi } from "vitest";
import { capturePortalEntry } from "./entry";
import { startApplication } from "../entrypoint";
const invite = "a".repeat(64),
  auth = "b".repeat(64);
it("captures a diligence invitation separately and clears it before loading auth", async () => {
  const history = { replaceState: vi.fn() }, internal = vi.fn();
  const portal = vi.fn(async (entry) => {
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/portal/diligencias/ativar");
    expect(entry.activation).toEqual({ invite, kind: "diligence" });
  });
  await startApplication({ location: { pathname: "/portal/diligencias/ativar", search: "", hash: `#invite=${invite}` }, history, internal, portal });
  expect(internal).not.toHaveBeenCalled(); expect(portal).toHaveBeenCalledOnce();
  expect(capturePortalEntry({ pathname: "/portal/diligencias/ativar", search: `?invite=${invite}`, hash: "" }, history)?.invalidActivation).toBe(true);
});
it.each([
  "/portal/ativar",
  "/PORTAL/ativar/",
  "/%70ortal/ativar",
  "/portal%2Fativar",
])(
  "captures %s in memory and strips credentials before selecting any loader",
  async (path) => {
    let clean = "";
    const internal = vi.fn();
    const portal = vi.fn(async (entry) => {
      expect(clean).toBe("/portal/ativar");
      expect(entry.activation).toEqual({ invite });
    });
    await startApplication({
      location: { pathname: path, search: "", hash: `#invite=${invite}` },
      history: {
        replaceState: (_state, _title, url) => {
          clean = String(url);
        },
      },
      portal,
      internal,
    });
    expect(portal).toHaveBeenCalledOnce();
    expect(internal).not.toHaveBeenCalled();
  },
);
it("does not consume query credentials or ambiguous/unsupported activation types", () => {
  for (const [search, hash] of [
    [`?invite=${invite}`, `#auth=${auth}&type=signup`],
    ["", `#invite=${invite}&invite=${invite}&auth=${auth}&type=signup`],
    ["", `#invite=${invite}&auth=${auth}&type=recovery`],
  ]) {
    const history = { replaceState: vi.fn() };
    const entry = capturePortalEntry(
      { pathname: "/portal/ativar", search, hash },
      history,
    );
    expect(entry?.activation).toBeNull();
    expect(entry?.invalidActivation).toBe(true);
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/portal/ativar",
    );
  }
});
it("does not load internal modules even when a portal activation is malformed", async () => {
  const internal = vi.fn(),
    portal = vi.fn(async () => {});
  await startApplication({
    location: {
      pathname: "/portal/ativar",
      search: "?token=private",
      hash: "#access_token=private",
    },
    history: { replaceState: vi.fn() },
    portal,
    internal,
  });
  expect(internal).not.toHaveBeenCalled();
  expect(portal).toHaveBeenCalledOnce();
});
it("cleans existing collection capabilities before the internal auth bundle loads", async () => {
  let clean = "";
  const internal = vi.fn(async () => {
    expect(clean).toBe("/enviar-documento");
  });
  await startApplication({
    location: {
      pathname: "/enviar-documento",
      search: "",
      hash: `#token=${invite}`,
    },
    history: {
      replaceState: (_s, _t, url) => {
        clean = String(url);
      },
    },
    portal: vi.fn(),
    internal,
  });
  expect(internal).toHaveBeenCalledOnce();
});
it("preserves ordinary internal auth callbacks for their existing flow", async () => {
  const history = { replaceState: vi.fn() },
    internal = vi.fn(async () => {}),
    portal = vi.fn();
  await startApplication({
    location: {
      pathname: "/redefinir-senha",
      search: "?code=internal",
      hash: "",
    },
    history,
    portal,
    internal,
  });
  expect(history.replaceState).not.toHaveBeenCalled();
  expect(portal).not.toHaveBeenCalled();
  expect(internal).toHaveBeenCalledWith("/redefinir-senha");
});

it("captures an existing-account invitation without authentication credentials and clears its URL", () => {
  const history = { replaceState: vi.fn() };
  const entry = capturePortalEntry(
    { pathname: "/portal/ativar", search: "", hash: `#invite=${invite}` },
    history,
  );
  expect(entry?.activation).toEqual({ invite });
  expect(history.replaceState).toHaveBeenCalledWith(null, "", "/portal/ativar");
});

it("rejects historical invitations that carry any authentication credential", () => {
  expect(
    capturePortalEntry(
      {
        pathname: "/portal/ativar",
        search: "",
        hash: `#invite=${invite}&auth=${auth}&type=magiclink`,
      },
      { replaceState: vi.fn() },
    )?.activation,
  ).toBeNull();
});
