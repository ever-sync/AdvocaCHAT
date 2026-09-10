import { useState } from "react";
import {
  BarChart3,
  Copy,
  FileText,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useToast } from "@/hooks/use-toast";
import {
  useCreateMarketingForm,
  useDeleteMarketingForm,
  useDuplicateMarketingForm,
  useMarketingForms,
  useUpdateMarketingForm,
} from "@/lib/api/marketing-forms";
import type { MarketingFormRecord } from "@/lib/marketing/form-types";
import { AdsIntegrationsDialog } from "./AdsIntegrationsDialog";
import { FormLeadsSheet } from "./FormLeadsSheet";

interface MarketingFormsListProps {
  onEdit: (form: MarketingFormRecord) => void;
  onShowAnalytics: () => void;
}

export function MarketingFormsList({ onEdit, onShowAnalytics }: MarketingFormsListProps) {
  const { toast } = useToast();
  const [adsOpen, setAdsOpen] = useState(false);
  const { data: forms = [], isLoading } = useMarketingForms();
  const createForm = useCreateMarketingForm();
  const updateForm = useUpdateMarketingForm();
  const duplicateForm = useDuplicateMarketingForm();
  const deleteForm = useDeleteMarketingForm();
  const [deleteTarget, setDeleteTarget] = useState<MarketingFormRecord | null>(null);
  const [leadsTarget, setLeadsTarget] = useState<MarketingFormRecord | null>(null);

  const handleCreate = () => {
    createForm.mutate(
      { name: "Novo formulário" },
      {
        onSuccess: (form) => onEdit(form),
        onError: (e) => toast({ title: "Erro ao criar", description: e.message, variant: "destructive" }),
      },
    );
  };

  const handleToggleActive = (form: MarketingFormRecord) => {
    updateForm.mutate(
      { id: form.id, patch: { isActive: !form.isActive } },
      {
        onSuccess: () =>
          toast({ title: form.isActive ? "Formulário desativado" : "Formulário ativado" }),
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      },
    );
  };

  const handleDuplicate = (form: MarketingFormRecord) => {
    duplicateForm.mutate(form.id, {
      onSuccess: () => toast({ title: "Formulário duplicado" }),
      onError: (e) => toast({ title: "Erro ao duplicar", description: e.message, variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteForm.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast({ title: "Formulário removido" });
        setDeleteTarget(null);
      },
      onError: (e) => toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Formulários</h2>
          <p className="text-sm text-muted-foreground">
            Crie formulários embedáveis que viram leads no seu CRM.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onShowAnalytics}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </Button>
          <Button variant="outline" onClick={() => setAdsOpen(true)}>
            <Megaphone className="mr-2 h-4 w-4" />
            Ads
          </Button>
          <Button onClick={handleCreate} disabled={createForm.isPending}>
            {createForm.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Novo formulário
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : forms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">Nenhum formulário ainda</p>
              <p className="text-sm text-muted-foreground">Crie o primeiro para começar a captar leads.</p>
            </div>
            <Button onClick={handleCreate} disabled={createForm.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              Criar formulário
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {forms.map((form) => (
            <Card key={form.id} className="flex flex-col">
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{form.name}</CardTitle>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{form.slug ?? "—"}</p>
                </div>
                <Badge variant={form.isActive ? "default" : "secondary"} className="shrink-0">
                  {form.isActive ? "Ativo" : "Inativo"}
                </Badge>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setLeadsTarget(form)}
                    className="rounded transition-colors hover:text-foreground hover:underline"
                    title="Ver leads no CRM"
                  >
                    <span className="font-semibold text-foreground">{form.totalSubmissions}</span> envios
                  </button>
                  <span>
                    <span className="font-semibold text-foreground">{form.totalViews}</span> views
                  </span>
                  <span>
                    <span className="font-semibold text-foreground">{form.fields.length}</span> campos
                  </span>
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => onEdit(form)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Editar
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="px-2">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setLeadsTarget(form)}>
                      <Users className="mr-2 h-4 w-4" />
                      Ver leads
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleToggleActive(form)}>
                      <Power className="mr-2 h-4 w-4" />
                      {form.isActive ? "Desativar" : "Ativar"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleDuplicate(form)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onSelect={() => setDeleteTarget(form)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <AdsIntegrationsDialog open={adsOpen} onOpenChange={setAdsOpen} />

      <FormLeadsSheet
        formId={leadsTarget?.id ?? null}
        formName={leadsTarget?.name ?? ""}
        open={!!leadsTarget}
        onOpenChange={(open) => !open && setLeadsTarget(null)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover formulário?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `"${deleteTarget.name}" será removido permanentemente. ` : ""}
              Os leads já capturados continuam no CRM.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteForm.isPending}
            >
              {deleteForm.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
