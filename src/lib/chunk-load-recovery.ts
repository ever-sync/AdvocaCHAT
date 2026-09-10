import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const CHUNK_RELOAD_FLAG = "wchat-chunk-reloaded";

function isChunkLoadErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to fetch dynamically imported module") ||
    normalized.includes("error loading dynamically imported module") ||
    normalized.includes("failed to load module script") ||
    normalized.includes("importing a module script failed") ||
    normalized.includes("chunkloaderror") ||
    normalized.includes("imported module")
  );
}

export function isChunkLoadError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown })?.message === "string"
          ? (error as { message: string }).message
          : "";
  return Boolean(message) && isChunkLoadErrorMessage(message);
}

export function clearChunkReloadFlag() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  } catch {
    // ignore storage failures
  }
}

/**
 * Recarrega a página uma única vez por sessão quando um chunk (import dinâmico)
 * some — caso clássico de tab antiga + deploy novo. Retorna true se disparou o
 * reload, false se já tinha recarregado nesta sessão (evita loop).
 */
export function reloadForChunkError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_FLAG) === "1") {
      return false;
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1");
  } catch {
    // ignore storage failures
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_reload", Date.now().toString(36));
  window.location.replace(url.toString());
  return true;
}

/**
 * Igual ao React.lazy, mas se o import dinâmico falhar por chunk ausente
 * (deploy novo com tab antiga), recarrega a página em vez de cair no boundary.
 * Em um carregamento bem-sucedido limpa o flag, rearmando a recuperação para o
 * próximo deploy.
 */
export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      clearChunkReloadFlag();
      return mod;
    } catch (error) {
      if (isChunkLoadError(error) && reloadForChunkError()) {
        // Mantém o fallback do Suspense enquanto a página recarrega.
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}

export function installChunkLoadRecovery() {
  if (typeof window === "undefined") return () => {};

  const handleError = (event: ErrorEvent) => {
    const message = event.message || event.error?.message || "";
    if (!message || !isChunkLoadErrorMessage(message)) {
      return;
    }
    reloadForChunkError();
  };

  const handleRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      typeof reason === "string"
        ? reason
        : reason instanceof Error
          ? reason.message
          : typeof reason?.message === "string"
            ? reason.message
            : "";
    if (!message || !isChunkLoadErrorMessage(message)) {
      return;
    }
    reloadForChunkError();
  };

  // O Vite dispara este evento quando o preload de um módulo dinâmico falha,
  // mesmo quando o React captura a rejeição da import() no error boundary.
  const handlePreloadError = (event: Event) => {
    event.preventDefault();
    reloadForChunkError();
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);
  window.addEventListener("vite:preloadError", handlePreloadError as EventListener);

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
    window.removeEventListener("vite:preloadError", handlePreloadError as EventListener);
  };
}
