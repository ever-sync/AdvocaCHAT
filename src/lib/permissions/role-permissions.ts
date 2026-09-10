import type { UserRole } from "@/types/domain";

export const PERMISSION_ACTIONS = ["view", "edit", "delete"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_FUNCTIONS = [
  { key: "inbox", label: "Chat / Inbox" },
  { key: "crm", label: "CRM" },
  { key: "agenda", label: "Agenda" },
  { key: "clientes", label: "Clientes" },
  { key: "produtos", label: "Produtos" },
  { key: "relatorios", label: "Relatorios" },
  { key: "marketing", label: "Marketing" },
  { key: "ia", label: "Agente IA" },
  { key: "configuracoes", label: "Configuracoes" },
  { key: "colaboradores", label: "Colaboradores e convites" },
] as const;

export type PermissionFunctionKey = (typeof PERMISSION_FUNCTIONS)[number]["key"];

export type FunctionPermissionFlags = Record<PermissionAction, boolean>;

export type RolePermissionMatrix = Record<PermissionFunctionKey, FunctionPermissionFlags>;

export type TenantRolePermissionsConfig = Record<UserRole, RolePermissionMatrix>;

export const USER_ROLES: UserRole[] = ["admin", "operacao", "financeiro", "atendimento"];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  operacao: "Operacao",
  financeiro: "Financeiro",
  atendimento: "Atendimento",
};

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Visualizar",
  edit: "Editar",
  delete: "Excluir",
};

function fullAccess(): FunctionPermissionFlags {
  return { view: true, edit: true, delete: true };
}

function viewOnly(): FunctionPermissionFlags {
  return { view: true, edit: false, delete: false };
}

function viewEdit(): FunctionPermissionFlags {
  return { view: true, edit: true, delete: false };
}

function none(): FunctionPermissionFlags {
  return { view: false, edit: false, delete: false };
}

/** Padroes alinhados ao comportamento atual do app por papel. */
export const DEFAULT_ROLE_PERMISSIONS: TenantRolePermissionsConfig = {
  admin: {
    inbox: fullAccess(),
    crm: fullAccess(),
    agenda: fullAccess(),
    clientes: fullAccess(),
    produtos: fullAccess(),
    relatorios: fullAccess(),
    marketing: fullAccess(),
    ia: fullAccess(),
    configuracoes: fullAccess(),
    colaboradores: fullAccess(),
  },
  operacao: {
    inbox: fullAccess(),
    crm: fullAccess(),
    agenda: fullAccess(),
    clientes: fullAccess(),
    produtos: fullAccess(),
    relatorios: fullAccess(),
    marketing: none(),
    ia: none(),
    configuracoes: viewEdit(),
    colaboradores: viewOnly(),
  },
  financeiro: {
    inbox: viewOnly(),
    crm: viewOnly(),
    agenda: viewEdit(),
    clientes: viewEdit(),
    produtos: viewOnly(),
    relatorios: fullAccess(),
    marketing: none(),
    ia: none(),
    configuracoes: viewOnly(),
    colaboradores: none(),
  },
  atendimento: {
    inbox: viewEdit(),
    crm: none(),
    agenda: viewEdit(),
    clientes: viewOnly(),
    produtos: none(),
    relatorios: none(),
    marketing: none(),
    ia: none(),
    configuracoes: none(),
    colaboradores: none(),
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFlags(raw: unknown): FunctionPermissionFlags {
  if (!isRecord(raw)) {
    return none();
  }

  return {
    view: Boolean(raw.view),
    edit: Boolean(raw.edit),
    delete: Boolean(raw.delete),
  };
}

function parseMatrix(raw: unknown): RolePermissionMatrix {
  const base = { ...DEFAULT_ROLE_PERMISSIONS.admin };
  if (!isRecord(raw)) {
    return base;
  }

  const matrix = {} as RolePermissionMatrix;
  for (const fn of PERMISSION_FUNCTIONS) {
    matrix[fn.key] = parseFlags(raw[fn.key]);
  }
  return matrix;
}

export function mergeRolePermissionsConfig(stored: unknown): TenantRolePermissionsConfig {
  const parsed = isRecord(stored) ? stored : {};
  const config = {} as TenantRolePermissionsConfig;

  for (const role of USER_ROLES) {
    const defaults = DEFAULT_ROLE_PERMISSIONS[role];
    const roleRaw = parsed[role];
    if (!isRecord(roleRaw)) {
      config[role] = defaults;
      continue;
    }

    const matrix = {} as RolePermissionMatrix;
    for (const fn of PERMISSION_FUNCTIONS) {
      const raw = roleRaw[fn.key];
      const flags = isRecord(raw) ? parseFlags(raw) : defaults[fn.key];
      matrix[fn.key] = {
        view: flags.view,
        edit: flags.edit && flags.view,
        delete: flags.delete && flags.view && flags.edit,
      };
    }
    config[role] = matrix;
  }

  return config;
}

export function normalizePermissionMatrix(matrix: RolePermissionMatrix): RolePermissionMatrix {
  const next = {} as RolePermissionMatrix;
  for (const fn of PERMISSION_FUNCTIONS) {
    const flags = matrix[fn.key] ?? none();
    const view = Boolean(flags.view);
    const edit = view && Boolean(flags.edit);
    const deleteFlag = view && edit && Boolean(flags.delete);
    next[fn.key] = { view, edit, delete: deleteFlag };
  }
  return next;
}

export function canRolePermission(
  config: TenantRolePermissionsConfig,
  role: UserRole | undefined,
  fn: PermissionFunctionKey,
  action: PermissionAction,
): boolean {
  const effectiveRole = role ?? "atendimento";
  const flags = config[effectiveRole]?.[fn] ?? DEFAULT_ROLE_PERMISSIONS[effectiveRole][fn];
  if (action === "view") {
    return flags.view;
  }
  if (action === "edit") {
    return flags.edit;
  }
  return flags.delete;
}

export function serializeRolePermissionsConfig(config: TenantRolePermissionsConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const role of USER_ROLES) {
    out[role] = config[role];
  }
  return out;
}
