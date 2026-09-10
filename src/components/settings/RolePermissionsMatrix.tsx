import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSaveTenantRolePermissions, useTenantRolePermissions } from "@/lib/api/role-permissions";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_ACTION_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_FUNCTIONS,
  ROLE_LABELS,
  type PermissionAction,
  type PermissionFunctionKey,
  type RolePermissionMatrix,
} from "@/lib/permissions/role-permissions";
import { useToast } from "@/hooks/use-toast";
import type { UserRole } from "@/types/domain";

// Funcoes que admin NUNCA pode perder view+edit, para evitar lockout do tenant.
const ADMIN_LOCKED_FUNCTIONS: PermissionFunctionKey[] = ["colaboradores", "configuracoes"];
const ADMIN_LOCKED_ACTIONS: PermissionAction[] = ["view", "edit"];

function isAdminLocked(role: UserRole, fn: PermissionFunctionKey, action: PermissionAction) {
  return (
    role === "admin" &&
    ADMIN_LOCKED_FUNCTIONS.includes(fn) &&
    ADMIN_LOCKED_ACTIONS.includes(action)
  );
}

type RolePermissionsMatrixProps = {
  canEdit: boolean;
  disabled?: boolean;
};

export function RolePermissionsMatrix({ canEdit, disabled }: RolePermissionsMatrixProps) {
  const { toast } = useToast();
  const { data: storedConfig, isLoading } = useTenantRolePermissions();
  const savePermissions = useSaveTenantRolePermissions();
  const [selectedRole, setSelectedRole] = useState<UserRole>("atendimento");
  const [draft, setDraft] = useState<RolePermissionMatrix | null>(null);
  const [pendingRoleSwitch, setPendingRoleSwitch] = useState<UserRole | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  const roleMatrix = useMemo(() => {
    if (!storedConfig) {
      return null;
    }
    return storedConfig[selectedRole];
  }, [storedConfig, selectedRole]);

  useEffect(() => {
    if (roleMatrix) {
      setDraft(roleMatrix);
    }
  }, [roleMatrix, selectedRole]);

  const isDirty = useMemo(() => {
    if (!draft || !roleMatrix) return false;
    return JSON.stringify(draft) !== JSON.stringify(roleMatrix);
  }, [draft, roleMatrix]);

  const setFlag = (fn: PermissionFunctionKey, action: PermissionAction, checked: boolean) => {
    if (isAdminLocked(selectedRole, fn, action) && !checked) {
      return;
    }
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }

      const current = { ...prev[fn] };

      if (action === "view") {
        current.view = checked;
        if (!checked) {
          current.edit = false;
          current.delete = false;
        }
      } else if (action === "edit") {
        current.edit = checked;
        if (checked) {
          current.view = true;
        } else {
          current.delete = false;
        }
      } else {
        current.delete = checked;
        if (checked) {
          current.view = true;
          current.edit = true;
        }
      }

      if (selectedRole === "admin" && ADMIN_LOCKED_FUNCTIONS.includes(fn)) {
        current.view = true;
        current.edit = true;
      }

      return { ...prev, [fn]: current };
    });
  };

  const setRowAll = (fn: PermissionFunctionKey, enable: boolean) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const adminLocked = selectedRole === "admin" && ADMIN_LOCKED_FUNCTIONS.includes(fn);
      const next = enable
        ? { view: true, edit: true, delete: true }
        : { view: false, edit: false, delete: adminLocked ? prev[fn].delete : false };
      if (adminLocked) {
        next.view = true;
        next.edit = true;
      }
      return { ...prev, [fn]: next };
    });
  };

  const handleSave = async () => {
    if (!draft || !canEdit) {
      return;
    }

    try {
      await savePermissions.mutateAsync({ role: selectedRole, matrix: draft });
      toast({
        title: "Permissoes salvas",
        description: `Matriz atualizada para ${ROLE_LABELS[selectedRole]}.`,
      });
    } catch (e) {
      toast({
        title: "Nao foi possivel salvar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleRequestRoleChange = (nextRole: UserRole) => {
    if (nextRole === selectedRole) return;
    if (isDirty) {
      setPendingRoleSwitch(nextRole);
      return;
    }
    setSelectedRole(nextRole);
  };

  const handleCancelChanges = () => {
    if (roleMatrix) {
      setDraft(roleMatrix);
    }
  };

  const handleRestoreDefaults = () => {
    setDraft(DEFAULT_ROLE_PERMISSIONS[selectedRole]);
    setShowRestoreConfirm(false);
  };

  const confirmRoleSwitch = (discard: boolean) => {
    if (!pendingRoleSwitch) return;
    const target = pendingRoleSwitch;
    setPendingRoleSwitch(null);
    if (discard) {
      setSelectedRole(target);
    }
  };

  return (
    <>
      <Card className="border-border/60 bg-card/80">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-accent" />
              Permissoes por funcao
            </CardTitle>
            <CardDescription>
              Escolha o tipo de usuario e defina o que cada papel pode visualizar, editar e excluir.
            </CardDescription>
          </div>
          <div className="w-full space-y-2 sm:w-56">
            <Label htmlFor="perm-role-select">Tipo de usuario</Label>
            <Select
              value={selectedRole}
              onValueChange={(value) => handleRequestRoleChange(value as UserRole)}
              disabled={disabled || isLoading}
            >
              <SelectTrigger id="perm-role-select">
                <SelectValue placeholder="Selecione o papel" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !draft ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando permissoes...
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[220px] font-semibold">Funcao</TableHead>
                    {PERMISSION_ACTIONS.map((action) => (
                      <TableHead key={action} className="w-28 text-center font-semibold">
                        {PERMISSION_ACTION_LABELS[action]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PERMISSION_FUNCTIONS.map((fn) => {
                    const flags = draft[fn.key];
                    const countOn = Number(flags.view) + Number(flags.edit) + Number(flags.delete);
                    const rowAllChecked: boolean | "indeterminate" =
                      countOn === 0 ? false : countOn === 3 ? true : "indeterminate";
                    return (
                      <TableRow key={fn.key}>
                        <TableCell className="font-medium text-foreground">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={rowAllChecked}
                              disabled={!canEdit || disabled || savePermissions.isPending}
                              onCheckedChange={(checked) => setRowAll(fn.key, checked === true)}
                              aria-label={`${fn.label} — alternar todas`}
                            />
                            <span>{fn.label}</span>
                          </div>
                        </TableCell>
                        {PERMISSION_ACTIONS.map((action) => {
                          const locked = isAdminLocked(selectedRole, fn.key, action);
                          return (
                            <TableCell key={action} className="text-center">
                              <Checkbox
                                checked={flags[action]}
                                disabled={!canEdit || disabled || savePermissions.isPending || locked}
                                onCheckedChange={(checked) => setFlag(fn.key, action, checked === true)}
                                aria-label={`${fn.label} — ${PERMISSION_ACTION_LABELS[action]}`}
                                title={locked ? "Obrigatorio para administradores" : undefined}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {!canEdit ? (
            <p className="text-xs text-warning">Somente administradores podem alterar permissoes.</p>
          ) : null}

          {selectedRole === "admin" ? (
            <p className="text-xs text-muted-foreground">
              Visualizar e Editar de <strong>Colaboradores</strong> e <strong>Configuracoes</strong> ficam
              travados para o papel Administrador, para evitar perda de acesso ao tenant.
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canEdit || disabled || isLoading || !draft || savePermissions.isPending}
                onClick={() => setShowRestoreConfirm(true)}
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Restaurar padroes
              </Button>
              {isDirty ? (
                <>
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
                    Alteracoes pendentes
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={savePermissions.isPending}
                    onClick={handleCancelChanges}
                  >
                    <Undo2 className="mr-2 h-3.5 w-3.5" />
                    Cancelar alteracoes
                  </Button>
                </>
              ) : null}
            </div>
            <Button
              type="button"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={!canEdit || disabled || isLoading || !draft || savePermissions.isPending || !isDirty}
              onClick={() => void handleSave()}
            >
              {savePermissions.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar permissoes
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingRoleSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRoleSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alteracoes?</AlertDialogTitle>
            <AlertDialogDescription>
              Voce tem alteracoes nao salvas em <strong>{ROLE_LABELS[selectedRole]}</strong>. Trocar para outro
              papel agora ira descartar as mudancas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => confirmRoleSwitch(false)}>
              Manter editando
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRoleSwitch(true)}>
              Descartar e trocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar padroes?</AlertDialogTitle>
            <AlertDialogDescription>
              A matriz de <strong>{ROLE_LABELS[selectedRole]}</strong> sera reposta para os padroes do
              sistema. Voce ainda precisa clicar em Salvar para gravar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreDefaults}>Restaurar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
