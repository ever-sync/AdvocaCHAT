import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  createDefaultEmailBlock,
  EMAIL_BLOCK_LABELS,
  type EmailBlock,
  type EmailBlockType,
  type MarketingEmailTemplate,
} from "@/lib/marketing/email-types";
import {
  useCreateMarketingEmailTemplate,
  useDeleteMarketingEmailTemplate,
  useMarketingEmailTemplates,
  useUpdateMarketingEmailTemplate,
} from "@/lib/api/marketing-email-templates";

interface EmailTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BLOCK_TYPES: EmailBlockType[] = ["header", "text", "button", "image", "divider", "footer"];

export function EmailTemplatesDialog({ open, onOpenChange }: EmailTemplatesDialogProps) {
  const { toast } = useToast();
  const { data: templates = [], isLoading } = useMarketingEmailTemplates({ enabled: open });
  const createTemplate = useCreateMarketingEmailTemplate();
  const updateTemplate = useUpdateMarketingEmailTemplate();
  const deleteTemplate = useDeleteMarketingEmailTemplate();

  const [editing, setEditing] = useState<MarketingEmailTemplate | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setSubject(editing.subject);
      setFromName(editing.fromName ?? "");
      setFromEmail(editing.fromEmail ?? "");
      setReplyTo(editing.replyTo ?? "");
      setBlocks(editing.blocks);
    }
  }, [editing]);

  useEffect(() => {
    if (!open) setEditing(null);
  }, [open]);

  const handleCreate = () => {
    createTemplate.mutate(
      { name: "Novo template", subject: "Recebemos seu contato" },
      {
        onSuccess: (tpl) => setEditing(tpl),
        onError: (e) => toast({ title: "Erro ao criar", description: e.message, variant: "destructive" }),
      },
    );
  };

  const handleSave = () => {
    if (!editing) return;
    updateTemplate.mutate(
      {
        id: editing.id,
        patch: {
          name: name.trim() || "Template",
          subject,
          blocks,
          fromName: fromName.trim() || null,
          fromEmail: fromEmail.trim() || null,
          replyTo: replyTo.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Template salvo" });
          setEditing(null);
        },
        onError: (e) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
      },
    );
  };

  const addBlock = (type: EmailBlockType) => setBlocks((prev) => [...prev, createDefaultEmailBlock(type)]);
  const updateBlock = (id: string, patch: Partial<EmailBlock>) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const removeBlock = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));
  const moveBlock = (index: number, dir: -1 | 1) =>
    setBlocks((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar template" : "Templates de e-mail"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Use variáveis como {{name}}, {{email}}, {{form_name}}."
              : "E-mails enviados automaticamente quando um lead preenche o formulário."}
          </DialogDescription>
        </DialogHeader>

        {!editing ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={handleCreate} disabled={createTemplate.isPending}>
                {createTemplate.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                Novo template
              </Button>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum template ainda.</p>
            ) : (
              <div className="space-y-2">
                {templates.map((tpl) => (
                  <div key={tpl.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{tpl.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{tpl.subject || "(sem assunto)"}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setEditing(tpl)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2 text-red-600 hover:text-red-600"
                        onClick={() => deleteTemplate.mutate(tpl.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome interno</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Assunto</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Remetente (nome)</Label>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Equipe" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Remetente (e-mail)</Label>
                <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="contato@seudominio.com" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Responder para (opcional)</Label>
                <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Blocos</Label>
                <Select onValueChange={(v) => addBlock(v as EmailBlockType)}>
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder="+ Adicionar bloco" />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOCK_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {EMAIL_BLOCK_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {blocks.length === 0 ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
                  Adicione blocos ao e-mail.
                </p>
              ) : (
                blocks.map((block, index) => (
                  <div key={block.id} className="space-y-2 rounded-lg border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{EMAIL_BLOCK_LABELS[block.type]}</span>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveBlock(index, -1)}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveBlock(index, 1)}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-600 hover:text-red-600"
                          onClick={() => removeBlock(block.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {(block.type === "text" || block.type === "footer") && (
                      <Textarea
                        rows={3}
                        value={block.content ?? ""}
                        onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                        placeholder="Conteúdo (HTML simples permitido)"
                      />
                    )}
                    {block.type === "header" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={block.logoUrl ?? ""}
                          onChange={(e) => updateBlock(block.id, { logoUrl: e.target.value })}
                          placeholder="URL do logo"
                        />
                        <Input
                          type="color"
                          value={block.backgroundColor ?? "#111827"}
                          onChange={(e) => updateBlock(block.id, { backgroundColor: e.target.value })}
                          className="h-10"
                        />
                      </div>
                    )}
                    {block.type === "button" && (
                      <div className="grid grid-cols-3 gap-2">
                        <Input value={block.label ?? ""} onChange={(e) => updateBlock(block.id, { label: e.target.value })} placeholder="Rótulo" />
                        <Input value={block.url ?? ""} onChange={(e) => updateBlock(block.id, { url: e.target.value })} placeholder="https://" />
                        <Input
                          type="color"
                          value={block.color ?? "#4f46e5"}
                          onChange={(e) => updateBlock(block.id, { color: e.target.value })}
                          className="h-10"
                        />
                      </div>
                    )}
                    {block.type === "image" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={block.src ?? ""} onChange={(e) => updateBlock(block.id, { src: e.target.value })} placeholder="URL da imagem" />
                        <Input value={block.alt ?? ""} onChange={(e) => updateBlock(block.id, { alt: e.target.value })} placeholder="Texto alternativo" />
                      </div>
                    )}
                    {block.type === "divider" && (
                      <Input
                        type="color"
                        value={block.dividerColor ?? "#e5e7eb"}
                        onChange={(e) => updateBlock(block.id, { dividerColor: e.target.value })}
                        className="h-10 w-24"
                      />
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between border-t pt-3">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={handleSave} disabled={updateTemplate.isPending}>
                {updateTemplate.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Salvar template
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
