export type PermissionAction = "view" | "edit" | "delete";
export type PermissionFunctionKey =
  | "inbox"
  | "crm"
  | "clientes"
  | "produtos"
  | "relatorios"
  | "configuracoes"
  | "colaboradores";

type FunctionPermissionFlags = Record<PermissionAction, boolean>;
type RolePermissionMatrix = Record<PermissionFunctionKey, FunctionPermissionFlags>;
type TenantRolePermissionsConfig = Record<string, RolePermissionMatrix>;

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

export const DEFAULT_ROLE_PERMISSIONS: TenantRolePermissionsConfig = {
  admin: {
    inbox: fullAccess(),
    crm: fullAccess(),
    clientes: fullAccess(),
    produtos: fullAccess(),
    relatorios: fullAccess(),
    configuracoes: fullAccess(),
    colaboradores: fullAccess(),
  },
  operacao: {
    inbox: fullAccess(),
    crm: fullAccess(),
    clientes: fullAccess(),
    produtos: fullAccess(),
    relatorios: fullAccess(),
    configuracoes: viewEdit(),
    colaboradores: viewOnly(),
  },
  financeiro: {
    inbox: viewOnly(),
    crm: viewOnly(),
    clientes: viewEdit(),
    produtos: viewOnly(),
    relatorios: fullAccess(),
    configuracoes: viewOnly(),
    colaboradores: none(),
  },
  atendimento: {
    inbox: viewEdit(),
    crm: viewEdit(),
    clientes: viewOnly(),
    produtos: viewOnly(),
    relatorios: viewOnly(),
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

export function mergeRolePermissionsConfig(stored: unknown): TenantRolePermissionsConfig {
  const parsed = isRecord(stored) ? stored : {};
  const config = {} as TenantRolePermissionsConfig;

  for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
    const defaults = DEFAULT_ROLE_PERMISSIONS[role];
    const roleRaw = parsed[role];
    if (!isRecord(roleRaw)) {
      config[role] = defaults;
      continue;
    }

    const matrix = {} as RolePermissionMatrix;
    for (const fn of Object.keys(defaults) as PermissionFunctionKey[]) {
      const flags = parseFlags(roleRaw[fn]);
      matrix[fn] = {
        view: flags.view,
        edit: flags.edit && flags.view,
        delete: flags.delete && flags.view && flags.edit,
      };
    }
    config[role] = matrix;
  }

  return config;
}

function actionLabel(action: PermissionAction) {
  if (action === "view") return "visualizar";
  if (action === "edit") return "editar";
  return "excluir";
}

function functionLabel(fn: PermissionFunctionKey) {
  const labels: Record<PermissionFunctionKey, string> = {
    inbox: "o inbox",
    crm: "o CRM",
    clientes: "os clientes",
    produtos: "os produtos",
    relatorios: "os relatórios",
    configuracoes: "as configurações",
    colaboradores: "os colaboradores",
  };

  return labels[fn];
}

export class PermissionDeniedError extends Error {
  status = 403;

  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export function canTenantPermission(
  config: TenantRolePermissionsConfig,
  role: string | null | undefined,
  fn: PermissionFunctionKey,
  action: PermissionAction,
): boolean {
  const effectiveRole = role && config[role] ? role : "atendimento";
  const flags = config[effectiveRole]?.[fn] ?? DEFAULT_ROLE_PERMISSIONS.atendimento[fn];
  if (action === "view") {
    return flags.view;
  }
  if (action === "edit") {
    return flags.edit;
  }
  return flags.delete;
}

export function permissionDeniedMessage(fn: PermissionFunctionKey, action: PermissionAction) {
  return `Seu papel nao tem permissao para ${actionLabel(action)} ${functionLabel(fn)}.`;
}
