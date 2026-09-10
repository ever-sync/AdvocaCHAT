import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CustomerUpsertInput } from "@/types/domain";

type CustomerImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: CustomerUpsertInput[];
  errors: string[];
  fileName: string | null;
  loading?: boolean;
  onConfirm: () => Promise<void> | void;
};

export function CustomerImportDialog({
  open,
  onOpenChange,
  rows,
  errors,
  fileName,
  loading = false,
  onConfirm,
}: CustomerImportDialogProps) {
  const previewRows = rows.slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar clientes por planilha</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">
              <span className="font-medium text-foreground">Telefone obrigatório</span> (formato com DDI ou local).{" "}
              <span className="font-medium text-foreground">Nome opcional</span>
              — se estiver vazio, o sistema cria um nome exibível a partir do número (ex.: +55 (11) 98765-4321).
            </span>
            {fileName ? <span className="block">Arquivo: {fileName}</span> : null}
          </DialogDescription>
        </DialogHeader>

        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>Linhas com problema</AlertTitle>
            <AlertDescription>
              {errors.slice(0, 5).map((error) => (
                <div key={error}>{error}</div>
              ))}
              {errors.length > 5 && <div>...e mais {errors.length - 5} erro(s).</div>}
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Rota</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vendedor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((row, index) => (
                <TableRow key={`${row.telefone || row.nome || "row"}-${index}`}>
                  <TableCell className="font-medium text-foreground">{row.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{row.telefone || "-"}</TableCell>
                  <TableCell>{row.perfil}</TableCell>
                  <TableCell className="text-muted-foreground">{row.rota || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.status}</TableCell>
                  <TableCell className="text-muted-foreground">{row.vendedor || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-sm text-muted-foreground">
          {rows.length} linha(s) válida(s) pronta(s) para importar.
          {rows.length > previewRows.length ? ` Exibindo apenas as primeiras ${previewRows.length}.` : ""}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              await onConfirm();
            }}
            disabled={loading || rows.length === 0}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {loading ? "Importando..." : "Confirmar importação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
