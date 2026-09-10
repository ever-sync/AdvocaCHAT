import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface EmbedSnippetDialogProps {
  formId: string;
  formName: string;
  isActive: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmbedSnippetDialog({ formId, formName, isActive, open, onOpenChange }: EmbedSnippetDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inlineSnippet =
    `<div id="wchat-form-${formId}"></div>\n` +
    `<script src="${origin}/embed.js" data-form="${formId}"></script>`;
  const popupSnippet = `<script src="${origin}/embed.js" data-form="${formId}" data-mode="popup" data-trigger-label="Fale conosco"></script>`;
  const directLink = `${origin}/embed/?formId=${formId}`;

  const copy = (text: string, key: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
        toast({ title: "Copiado!" });
      })
      .catch(() => toast({ title: "Não foi possível copiar", variant: "destructive" }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Incorporar "{formName}"</DialogTitle>
          <DialogDescription>Cole o código no site onde o formulário deve aparecer.</DialogDescription>
        </DialogHeader>

        {!isActive ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Este formulário está <strong>inativo</strong> — ative-o para que os envios sejam aceitos.
          </div>
        ) : null}

        <div className="space-y-4">
          <SnippetBlock
            label="Inline (no corpo da página)"
            value={inlineSnippet}
            copied={copied === "inline"}
            onCopy={() => copy(inlineSnippet, "inline")}
          />
          <SnippetBlock
            label="Pop-up (botão flutuante)"
            value={popupSnippet}
            copied={copied === "popup"}
            onCopy={() => copy(popupSnippet, "popup")}
          />

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Link direto</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-xs">{directLink}</code>
              <Button variant="outline" size="sm" onClick={() => copy(directLink, "link")}>
                {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={directLink} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SnippetBlock({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCopy}>
          {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
          Copiar
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 text-xs">
        <code>{value}</code>
      </pre>
    </div>
  );
}
