import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Notification {
  id: string;
  tipo: "sucesso" | "info" | "aviso" | "erro";
  titulo: string;
  descricao: string;
  tempo: string;
  lida?: boolean;
}

const MAX_IN_APP_NOTIFICATIONS = 48;

export type AddAppNotificationInput = Pick<Notification, "titulo" | "descricao"> &
  Partial<Pick<Notification, "tipo" | "tempo" | "lida">>;

function newNotificationId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `n-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;

  notifications: Notification[];
  unreadCount: number;
  addNotification: (payload: AddAppNotificationInput) => void;
  markAllRead: () => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

      notifications: [] as Notification[],
      unreadCount: 0,
      addNotification: (payload) =>
        set((s) => {
          const lida = payload.lida ?? false;
          const item: Notification = {
            id: newNotificationId(),
            tipo: payload.tipo ?? "info",
            titulo: payload.titulo,
            descricao: payload.descricao,
            tempo:
              payload.tempo ??
              new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date()),
            lida,
          };
          return {
            notifications: [item, ...s.notifications].slice(0, MAX_IN_APP_NOTIFICATIONS),
            unreadCount: lida ? s.unreadCount : s.unreadCount + 1,
          };
        }),
      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, lida: true })),
          unreadCount: 0,
        })),
      markNotificationRead: (id) =>
        set((s) => {
          const notifications = s.notifications.map((n) => (n.id === id ? { ...n, lida: true } : n));
          return {
            notifications,
            unreadCount: notifications.filter((n) => !n.lida).length,
          };
        }),
      clearNotifications: () => set({ notifications: [], unreadCount: 0 }),
    }),
    {
      name: "distribuibot-store",
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    }
  )
);
