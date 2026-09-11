import type { User } from "@supabase/supabase-js";
import type { AppUserProfile, UserRole } from "@/types/domain";

export function isPortalAuthUser(user: Pick<User, "role"> | null | undefined) {
  return user?.role === "legal_portal";
}
/** A verified Auth user is not an internal profile. Authorization comes from the actual row. */
export function internalProfileFromRow(
  user: User,
  row: Partial<AppUserProfile> | null,
): AppUserProfile | null {
  if (
    isPortalAuthUser(user) ||
    !row ||
    !["admin", "operacao", "financeiro", "atendimento"].includes(
      row.role ?? "",
    ) ||
    !["active", "inactive"].includes(row.status ?? "")
  )
    return null;
  return {
    id: user.id,
    nome: row.nome ?? "",
    email: row.email ?? user.email ?? "",
    empresa: row.empresa ?? "",
    plano: row.plano ?? "",
    role: row.role as UserRole,
    status: row.status,
    availability: row.availability,
  };
}
