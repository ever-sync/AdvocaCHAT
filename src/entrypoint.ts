import { capturePortalEntry, type PortalEntry } from "./portal/entry";
import {
  captureLegalUploadToken,
  normalizeLegalPublicPath,
} from "./lib/legal-upload-token";

export async function startApplication({
  location,
  history,
  portal,
  internal,
}: {
  location: Pick<Location, "pathname" | "search" | "hash">;
  history: Pick<History, "replaceState">;
  portal: (entry: PortalEntry) => Promise<void>;
  internal: (publicPath: string) => Promise<void>;
}) {
  const entry = capturePortalEntry(location, history);
  if (entry) {
    await portal(entry);
    return;
  }
  const publicPath = normalizeLegalPublicPath(location.pathname);
  captureLegalUploadToken(location, history);
  if (["/anamnese/preencher", "/orcamento/aprovar"].includes(publicPath))
    history.replaceState(null, "", publicPath);
  await internal(publicPath);
}
