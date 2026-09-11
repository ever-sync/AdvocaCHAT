/** This module must remain free of auth clients, application providers and telemetry. */
export type PortalActivation = { invite: string; kind?: "diligence" };
export type PortalEntry = {
  path: string;
  activation: PortalActivation | null;
  invalidActivation: boolean;
};
function normalizedPath(pathname: string) {
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    /* Classify malformed paths without reading their credentials. */
  }
  return (
    pathname
      .replace(/[\\/]+/g, "/")
      .toLowerCase()
      .replace(/\/+$/, "") || "/"
  );
}
export function isPortalPath(pathname: string) {
  const path = normalizedPath(pathname);
  return path === "/portal" || path.startsWith("/portal/");
}
export function capturePortalEntry(
  location: Pick<Location, "pathname" | "search" | "hash">,
  history: Pick<History, "replaceState">,
): PortalEntry | null {
  if (!isPortalPath(location.pathname)) return null;
  const path = normalizedPath(location.pathname);
  const values = new URLSearchParams(location.hash.replace(/^#/, ""));
  const invite = values.get("invite") ?? "";
  const activating = path === "/portal/ativar" ||
    path === "/portal/diligencias/ativar";
  const valid = activating &&
    !location.search &&
    values.getAll("invite").length === 1 &&
    [...values.keys()].every((key) => key === "invite") &&
    /^[a-f0-9]{64}$/.test(invite);
  // Cleanup is synchronous, before the portal client or any internal module loads.
  history.replaceState(null, "", path);
  return {
    path,
    activation: valid
      ? {
        invite,
        ...(path === "/portal/diligencias/ativar"
          ? { kind: "diligence" as const }
          : {}),
      }
      : null,
    invalidActivation: activating && !valid,
  };
}
