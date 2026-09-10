import {
  E2E_MOCK_ATTENDANT_B_ID,
  E2E_MOCK_PROFILE_ID,
} from "@/data/inbox-e2e-fixtures";
import type { UserRole } from "@/types/domain";

export { E2E_MOCK_ATTENDANT_B_ID, E2E_MOCK_PROFILE_ID };

/** Ativo quando o app é servido com `VITE_E2E_MOCK_AUTH=true` (Playwright / CI). */
export const isE2eMockAuth = import.meta.env.VITE_E2E_MOCK_AUTH === "true";

const E2E_ROLES: UserRole[] = ["admin", "operacao", "financeiro", "atendimento"];

/** Papel mock: `sessionStorage` (Playwright) ou `VITE_E2E_MOCK_ROLE`. */
export function getE2eMockRole(): UserRole {
  if (typeof sessionStorage !== "undefined") {
    const stored = sessionStorage.getItem("e2e-mock-role");
    if (stored && E2E_ROLES.includes(stored as UserRole)) {
      return stored as UserRole;
    }
  }
  const rawRole = import.meta.env.VITE_E2E_MOCK_ROLE;
  if (rawRole && E2E_ROLES.includes(rawRole as UserRole)) {
    return rawRole as UserRole;
  }
  return "atendimento";
}

export function setE2eMockRole(role: UserRole): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("e2e-mock-role", role);
  }
}
