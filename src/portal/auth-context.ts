import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { PortalActivation } from "./entry";
export type AuthValue = {
  session: Session | null;
  loading: boolean;
  error: string;
  signIn(email: string, password: string): Promise<void>;
  activate(invite: PortalActivation): Promise<void>;
  requestCode(email: string): Promise<void>;
  confirmCode(email: string, code: string, password: string): Promise<void>;
  signOut(): Promise<void>;
};
export const PortalAuthContext = createContext<AuthValue | null>(null);
export function usePortalAuth() {
  const value = useContext(PortalAuthContext);
  if (!value) throw new Error("Portal authentication unavailable");
  return value;
}
