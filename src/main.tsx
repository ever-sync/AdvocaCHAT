import { startApplication } from "./entrypoint";

// Only side-effect-free credential capture is imported statically here.
void startApplication({
  location: window.location,
  history: window.history,
  portal: async (entry) => {
    const referrer = document.createElement("meta");
    referrer.name = "referrer";
    referrer.content = "no-referrer";
    document.head.appendChild(referrer);
    const { mountPortal } = await import("./portal/mount");
    mountPortal(entry);
  },
  internal: async (path) => {
    const { mountInternalApp } = await import("./internal-main");
    mountInternalApp(path);
  },
}).catch(() => {
  const root = document.getElementById("root");
  if (root)
    root.textContent =
      "Não foi possível abrir esta página. Atualize para tentar novamente. Se estava ativando um acesso, reabra o convite original.";
});
