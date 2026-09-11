import { expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { internalProfileFromRow } from "./internal-profile";
const user = {
  id: "identity",
  role: "authenticated",
  email: "synthetic@example.test",
  user_metadata: {
    role: "admin",
    status: "active",
    empresa: "Fabricada",
    plano: "enterprise",
  },
} as unknown as User;
it("never invents an internal profile from user-controlled metadata when the row is absent", () => {
  expect(internalProfileFromRow(user, null)).toBeNull();
  expect(internalProfileFromRow(user, {})).toBeNull();
});
it("requires an internal identity even if a stale internal-looking row is supplied", () => {
  expect(
    internalProfileFromRow(
      { ...user, role: "legal_portal" },
      { role: "admin", status: "active" },
    ),
  ).toBeNull();
});
it("uses only actual database authorization fields and preserves inactive status", () => {
  const p = internalProfileFromRow(user, {
    role: "atendimento",
    status: "inactive",
    nome: "Pessoa do cadastro",
    empresa: "Escritório cadastrado",
    plano: "starter",
  });
  expect(p).toMatchObject({
    id: "identity",
    role: "atendimento",
    status: "inactive",
    empresa: "Escritório cadastrado",
    plano: "starter",
  });
});
