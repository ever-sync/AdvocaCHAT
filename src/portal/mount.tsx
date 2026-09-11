import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalApp } from "./PortalApp";
import { PortalAuthProvider } from "./Auth";
import type { PortalEntry } from "./entry";
import "@/index.css";

export function mountPortal(entry: PortalEntry) {
  document.documentElement.classList.remove("dark");
  document.title = "Portal do cliente — AdvocaCHAT";
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={cache}>
      <PortalAuthProvider>
        <PortalApp entry={entry} />
      </PortalAuthProvider>
    </QueryClientProvider>,
  );
}
