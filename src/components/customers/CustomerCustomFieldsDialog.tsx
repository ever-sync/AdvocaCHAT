import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateCustomerCustomField,
  useCustomerCustomFields,
  useDeleteCustomerCustomField,
  type CustomerCustomFieldKind,
} from "@/lib/api/customer-custom-fields";
import {
  CUSTOM_FIELD_KINDS,
  FIELD_KIND_GROUPS,
  FIELD_KIND_LABEL,
} from "@/lib/custom-field-kinds";
import { isSupabaseConfigured } from "@/lib/supabase";

type CustomerCustomFieldsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function parseOptionsText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function CustomerCustomFieldsDialog({ open, onOpenChange }: CustomerCustomFieldsDialogProps) {
  const { toast } = useToast();
  const { data: fieldDefs = [], isLoading } = useCustomerCustomFields({ enabled: open });
  const createField = useCreateCustomerCustomField();
  const deleteField = useDeleteCustomerCustomField();

  const [newFieldNome, setNewFieldNome] = useState("");
  const [newFieldKind, setNewFieldKind] = useState<CustomerCustomFieldKind>("texto");
  const [listaOptionsText, setListaOptionsText] = useState("");
  const [fieldToDelete, setFieldToDelete] = useState<{ id: string; nome: string } | null>(null);

  const listaOptions = parseOptionsText(listaOptionsText);
  const canSubmit =
    newFieldNome.trim() &&
    !createField.isPending &&
    (newFieldKind !== "lista" || listaOptions.length > 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[min(90dvh,720px)] max-w-2xl overflow-y-auto rounded-[12px]">
          <DialogHeader>
            <DialogTitle>Campos personalizados</DialogTitle>
            <DialogDescription>
              Defina atributos extras para os contatos (texto, números, datas, documentos, listas e mais).
              Eles aparecem ao editar o contato, depois de criados aqui.
            </DialogDescription>
          </DialogHeader>

          {!isSupabaseConfigured ? (
            <p className="text-sm text-muted-foreground">
              Configure o Supabase para gerenciar campos personalizados.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="customer-field-nome">Nome do campo</Label>
                    <Input
                      id="customer-field-nome"
                      value={newFieldNome}
                      onChange={(e) => setNewFieldNome(e.target.value)}
                      placeholder="Ex.: Data da doença, CID, Parcela IR"
                      className="rounded-[10px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select
                      value={newFieldKind}
                      onValueChange={(v) => setNewFieldKind(v as CustomerCustomFieldKind)}
                    >
                      <SelectTrigger className="rounded-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(60dvh,320px)]">
                        {FIELD_KIND_GROUPS.map((group) => (
                          <SelectGroup key={group}>
                            <SelectLabel>{group}</SelectLabel>
                            {CUSTOM_FIELD_KINDS.filter((k) => k.group === group).map((k) => (
                              <SelectItem key={k.value} value={k.value}>
                                {k.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      className="w-full rounded-[10px]"
                      disabled={!canSubmit}
                      onClick={() => {
                        createField.mutate(
                          {
                            nome: newFieldNome,
                            kind: newFieldKind,
                            options: newFieldKind === "lista" ? listaOptions : undefined,
                          },
                          {
                            onSuccess: () => {
                              toast({ title: "Campo criado" });
                              setNewFieldNome("");
                              setListaOptionsText("");
                            },
                            onError: (e) =>
                              toast({
                                title: "Erro ao criar campo",
                                description: e.message,
                                variant: "destructive",
                              }),
                          },
                        );
                      }}
                    >
                      {createField.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Cadastrar campo"
                      )}
                    </Button>
                  </div>
                </div>

                {newFieldKind === "lista" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-field-opcoes">Opções da lista (uma por linha)</Label>
                    <Textarea
                      id="customer-field-opcoes"
                      value={listaOptionsText}
                      onChange={(e) => setListaOptionsText(e.target.value)}
                      placeholder={"Opção A\nOpção B\nOpção C"}
                      className="min-h-[88px] rounded-[10px]"
                    />
                  </div>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Campo</TableHead>
                      <TableHead className="min-w-[140px]">Tipo</TableHead>
                      <TableHead className="w-[56px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                          Carregando…
                        </TableCell>
                      </TableRow>
                    ) : fieldDefs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                          Nenhum campo definido.
                        </TableCell>
                      </TableRow>
                    ) : (
                      fieldDefs.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">
                            <div>{f.nome}</div>
                            {f.kind === "lista" && f.options.length > 0 ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {f.options.join(" · ")}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {FIELD_KIND_LABEL[f.kind] ?? f.kind}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setFieldToDelete({ id: f.id, nome: f.nome })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(fieldToDelete)} onOpenChange={(o) => !o && setFieldToDelete(null)}>
        <AlertDialogContent className="rounded-[12px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campo?</AlertDialogTitle>
            <AlertDialogDescription>
              {fieldToDelete
                ? `“${fieldToDelete.nome}” será removido e os valores nos contatos serão apagados.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteField.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteField.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!fieldToDelete) {
                  return;
                }
                deleteField.mutate(fieldToDelete.id, {
                  onSuccess: () => {
                    toast({ title: "Campo excluído" });
                    setFieldToDelete(null);
                  },
                  onError: (err) =>
                    toast({
                      title: "Erro ao excluir",
                      description: err.message,
                      variant: "destructive",
                    }),
                });
              }}
            >
              {deleteField.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
