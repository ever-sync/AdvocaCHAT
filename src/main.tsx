import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { installChunkLoadRecovery } from "@/lib/chunk-load-recovery";

import { captureLegalUploadToken, normalizeLegalPublicPath } from "@/lib/legal-upload-token";

const publicPath = normalizeLegalPublicPath(window.location.pathname);
captureLegalUploadToken(window.location, window.history);
if (["/anamnese/preencher", "/orcamento/aprovar"].includes(publicPath)) {
  window.history.replaceState(null, "", publicPath);
}

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn && publicPath !== "/enviar-documento") {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  });
}

installChunkLoadRecovery();

createRoot(document.getElementById("root")!).render(<App />);
