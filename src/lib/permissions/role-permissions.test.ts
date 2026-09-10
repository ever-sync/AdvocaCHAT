import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  canRolePermission,
  mergeRolePermissionsConfig,
  normalizePermissionMatrix,
} from "@/lib/permissions/role-permissions";

describe("canRolePermission — atendimento", () => {
  it("nao ve produtos quando visualizar esta desmarcado no tenant", () => {
    const stored = mergeRolePermissionsConfig({
      atendimento: {
        ...DEFAULT_ROLE_PERMISSIONS.atendimento,
        produtos: { view: false, edit: false, delete: false },
      },
    });

    expect(canRolePermission(stored, "atendimento", "produtos", "view")).toBe(false);
    expect(canRolePermission(stored, "atendimento", "produtos", "edit")).toBe(false);
  });

  it("padrao do papel atendimento nao inclui produtos, relatorios nem crm", () => {
    expect(canRolePermission(DEFAULT_ROLE_PERMISSIONS, "atendimento", "produtos", "view")).toBe(false);
    expect(canRolePermission(DEFAULT_ROLE_PERMISSIONS, "atendimento", "relatorios", "view")).toBe(false);
    expect(canRolePermission(DEFAULT_ROLE_PERMISSIONS, "atendimento", "crm", "view")).toBe(false);
    expect(canRolePermission(DEFAULT_ROLE_PERMISSIONS, "atendimento", "inbox", "view")).toBe(true);
    expect(canRolePermission(DEFAULT_ROLE_PERMISSIONS, "atendimento", "clientes", "view")).toBe(true);
  });

  it("libera produtos para atendimento quando admin marca visualizar", () => {
    const stored = mergeRolePermissionsConfig({
      atendimento: {
        ...DEFAULT_ROLE_PERMISSIONS.atendimento,
        produtos: { view: true, edit: false, delete: false },
      },
    });

    expect(canRolePermission(stored, "atendimento", "produtos", "view")).toBe(true);
    expect(canRolePermission(stored, "atendimento", "produtos", "edit")).toBe(false);
  });
});

describe("normalizePermissionMatrix", () => {
  it("remove editar e excluir quando visualizar esta desmarcado", () => {
    const normalized = normalizePermissionMatrix({
      ...DEFAULT_ROLE_PERMISSIONS.atendimento,
      produtos: { view: false, edit: true, delete: true },
    });

    expect(normalized.produtos).toEqual({ view: false, edit: false, delete: false });
  });
});
