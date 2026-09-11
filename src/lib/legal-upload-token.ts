// Keep a public collection capability in memory only; never put it in a query,
// referrer, telemetry event, storage or application session.
let uploadToken = "";
export function normalizeLegalPublicPath(pathname: string) {
  return pathname.toLowerCase().replace(/\/+$/, "");
}
export function captureLegalUploadToken(location: Pick<Location, "pathname" | "hash">, history: Pick<History, "replaceState">) {
  if (normalizeLegalPublicPath(location.pathname) !== "/enviar-documento") return;
  const candidate = new URLSearchParams(location.hash.replace(/^#/, "")).get("token") ?? "";
  uploadToken = /^[0-9a-f]{64}$/.test(candidate) ? candidate : "";
  history.replaceState(null, "", "/enviar-documento");
}
export function getLegalUploadToken() { return uploadToken; }
export function clearLegalUploadToken() { uploadToken = ""; }
