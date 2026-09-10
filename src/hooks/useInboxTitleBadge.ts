import { useEffect, useRef } from "react";

/**
 * Atualiza `document.title` com `(N) ...` enquanto a aba esta em background e
 * existem mensagens nao lidas. Restaura o titulo original ao focar.
 *
 * - Salva o titulo "limpo" na primeira montagem (sem sufixo) para nao acumular
 *   "(2) (5) X" se o hook for remontado.
 * - Garante restauracao no unmount.
 */
export function useInboxTitleBadge(unreadCount: number) {
  const baseTitleRef = useRef<string | null>(null);

  if (typeof document !== "undefined" && baseTitleRef.current === null) {
    baseTitleRef.current = stripUnreadPrefix(document.title);
  }

  useEffect(() => {
    if (typeof document === "undefined") return;

    const baseTitle = baseTitleRef.current ?? document.title;

    function updateTitle() {
      const isVisible = document.visibilityState === "visible";
      const shouldBadge = !isVisible && unreadCount > 0;
      const target = shouldBadge ? `(${formatBadge(unreadCount)}) ${baseTitle}` : baseTitle;
      if (document.title !== target) {
        document.title = target;
      }
    }

    updateTitle();

    document.addEventListener("visibilitychange", updateTitle);
    window.addEventListener("focus", updateTitle);

    return () => {
      document.removeEventListener("visibilitychange", updateTitle);
      window.removeEventListener("focus", updateTitle);
      // Garante limpeza se o consumidor desmontar com badge ainda aplicado.
      if (document.title !== baseTitle) {
        document.title = baseTitle;
      }
    };
  }, [unreadCount]);
}

function stripUnreadPrefix(title: string): string {
  return title.replace(/^\(\d+\+?\)\s*/, "");
}

function formatBadge(n: number): string {
  if (n > 99) return "99+";
  return String(n);
}
