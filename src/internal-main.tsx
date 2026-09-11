import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";
import { installChunkLoadRecovery } from "./lib/chunk-load-recovery";

export function mountInternalApp(publicPath: string) {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  if (sentryDsn && publicPath !== "/enviar-documento")
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      sendDefaultPii: false,
    });
  installChunkLoadRecovery();
  createRoot(document.getElementById("root")!).render(<App />);
}
