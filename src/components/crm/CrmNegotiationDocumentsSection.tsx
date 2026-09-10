import { useRef, useState } from "react";
import { Download, FileText, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  CRM_NEGOTIATION_DOC_MAX_BYTES,
  getCrmNegotiationDocumentSignedUrl,
  useCreateCrmNegotiationDocument,
  useCrmNegotiationDocuments,
  useDeleteCrmNegotiationDocument,
} from "@/lib/api/crm-negotiation-documents";
import { cn } from "@/lib/utils";
import type { CrmNegotiationDocument } from "@/types/domain";

const BRAND_ACCENT = "#5B2FD4";
const RD_RADIUS = "10px";
const RD_CARD_SHADOW = "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)";

function formatDocSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDocDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function CrmNegotiationDocumentsSection({
  negotiationId,
  enabled,
  readOnly = false,
  className,
}: {
  negotiationId: string;
  enabled: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<CrmNegotiationDocument | null>(null);

  const { data: docs = [], isLoading } = useCrmNegotiationDocuments(negotiationId, { enabled });

  const createDoc = useCreateCrmNegotiationDocument();
  const deleteDoc = useDeleteCrmNegotiationDocument();

  const busy = createDoc.isPending || deleteDoc.isPending;

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (list.length === 0) {
      setPickedFiles([]);
      return;
    }
    const valid: File[] = [];
    for (const file of list) {
      if (file.size > CRM_NEGOTIATION_DOC_MAX_BYTES) {
        toast({
          title: "Arquivo grande",
          description: `${file.name}: máximo ${CRM_NEGOTIATION_DOC_MAX_BYTES / (1024 * 1024)} MB.`,
          variant: "destructive",
        });
        continue;
      }
      valid.push(file);
    }
    setPickedFiles(valid);
    if (valid.length === 1) {
      setDisplayName((prev) => {
        if (prev.trim()) return prev;
        return valid[0].name.replace(/\.[^.]+$/, "") || valid[0].name;
      });
    }
  };

  const handleAttach = () => {
    if (pickedFiles.length === 0) {
      toast({
        title: "Selecione um arquivo",
        description: "Escolha ao menos um documento antes de anexar.",
        variant: "destructive",
      });
      return;
    }

    void (async () => {
      const batch = [...pickedFiles];
      try {
        for (const file of batch) {
          const name =
            batch.length === 1
              ? displayName.trim() || file.name.replace(/\.[^.]+$/, "") || file.name
              : file.name.replace(/\.[^.]+$/, "") || file.name;
          if (!name.trim()) {
            toast({
              title: "Nome obrigatório",
              description: "Informe como o documento deve aparecer.",
              variant: "destructive",
            });
            return;
          }
          await createDoc.mutateAsync({
            negotiationId,
            displayName: name,
            file,
          });
        }
        setDisplayName("");
        setPickedFiles([]);
        toast({
          title: batch.length > 1 ? "Documentos anexados" : "Documento anexado",
          description:
            batch.length > 1
              ? `${batch.length} arquivos salvos neste lead.`
              : "O arquivo foi salvo neste lead.",
        });
      } catch (err) {
        toast({
          title: "Não foi possível anexar",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    })();
  };

  const openDownload = (doc: CrmNegotiationDocument) => {
    void (async () => {
      try {
        const url = await getCrmNegotiationDocumentSignedUrl(doc.storagePath);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) {
        toast({
          title: "Download",
          description: err instanceof Error ? err.message : "Não foi possível abrir o arquivo.",
          variant: "destructive",
        });
      }
    })();
  };

  return (
    <section
      className={cn(
        "overflow-hidden border border-[var(--crm-surface-2)] bg-card",
        !enabled && "opacity-60",
        className,
      )}
      style={{ borderRadius: RD_RADIUS, boxShadow: RD_CARD_SHADOW }}
      aria-busy={isLoading || busy}
    >
      <div className="flex items-center justify-between border-b border-[var(--crm-surface)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--crm-ink)]">Documentos do lead</h2>
        <FileText className="h-4 w-4 text-[var(--crm-ink-3)]" aria-hidden />
      </div>
      <div className="space-y-4 px-4 py-4 md:px-6">
        <p className="text-xs text-[var(--crm-ink-3)]">
          {readOnly
            ? "Assuma o negócio para anexar ou excluir documentos deste lead."
            : "Dê um nome ao documento e selecione o arquivo. Os anexos ficam no seu espaço seguro e vinculados a esta negociação."}
        </p>
        {!readOnly ? (
        <>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="lead-doc-display-name">Nome do documento</Label>
            <Input
              id="lead-doc-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex.: Proposta comercial"
              className="border-[var(--crm-border-2)]"
              disabled={!enabled || busy}
            />
          </div>
          <div className="flex flex-col gap-2 sm:items-stretch">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={onFileChange}
              disabled={!enabled || busy}
            />
            <Button
              type="button"
              variant="outline"
              className="border-[var(--crm-border-2)] text-[var(--crm-ink)]"
              style={{ borderRadius: RD_RADIUS }}
              disabled={!enabled || busy}
              onClick={onPickFile}
            >
              <Paperclip className="mr-2 h-4 w-4" />
              Selecionar arquivo(s)
            </Button>
          </div>
        </div>
        {pickedFiles.length ? (
          <p className="text-xs text-[var(--crm-ink-2)]">
            {pickedFiles.length === 1 ? (
              <>
                Arquivo:{" "}
                <span className="break-all font-medium">{pickedFiles[0].name}</span>
              </>
            ) : (
              <span className="break-all font-medium">
                {pickedFiles.length} arquivos selecionados
              </span>
            )}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button
            type="button"
            className="border-0 font-semibold text-white shadow-none hover:opacity-95"
            style={{ backgroundColor: BRAND_ACCENT, borderRadius: RD_RADIUS }}
            disabled={!enabled || busy}
            onClick={handleAttach}
          >
            Anexar ao lead
          </Button>
        </div>
        </>
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-12 animate-pulse rounded-lg bg-[var(--crm-surface)]" />
            <div className="h-12 animate-pulse rounded-lg bg-[var(--crm-surface)]" />
          </div>
        ) : docs.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--crm-ink-3)]">Nenhum documento anexado ainda.</p>
        ) : (
          <ul className="space-y-2 border-t border-[var(--crm-surface)] pt-4">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-start gap-2 rounded-lg border border-[var(--crm-surface)] bg-[var(--crm-surface)] px-3 py-2.5"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--crm-ink-3)]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--crm-ink)]">{d.displayName}</p>
                  <p className="mt-0.5 text-xs text-[var(--crm-ink-3)]">
                    {d.fileName} · {formatDocSize(d.fileSize)}
                    {d.createdAt ? ` · ${formatDocDate(d.createdAt)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface)]"
                    disabled={busy}
                    aria-label={`Baixar ${d.displayName}`}
                    onClick={() => openDownload(d)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {!readOnly ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-[var(--crm-ink-3)] hover:bg-[var(--crm-danger-tint)] hover:text-[var(--crm-danger)]"
                      disabled={busy}
                      aria-label={`Excluir ${d.displayName}`}
                      onClick={() => setDeleteTarget(d)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border-[var(--crm-border-2)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.displayName}” será removido deste lead e o arquivo apagado do armazenamento.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[var(--crm-border-2)]">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--crm-danger)] text-white hover:bg-[var(--crm-danger-strong)]"
              onClick={() => {
                const t = deleteTarget;
                setDeleteTarget(null);
                if (!t) return;
                void (async () => {
                  try {
                    await deleteDoc.mutateAsync({ id: t.id, negotiationId });
                    toast({ title: "Documento removido" });
                  } catch (err) {
                    toast({
                      title: "Não foi possível excluir",
                      description: err instanceof Error ? err.message : "Tente novamente.",
                      variant: "destructive",
                    });
                  }
                })();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
