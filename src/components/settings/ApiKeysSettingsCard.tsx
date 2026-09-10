import { useState } from "react";
import { BookOpen, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  getWchatApiBaseUrl,
  useCreateTenantApiKey,
  useRevokeTenantApiKey,
  useTenantApiKeys,
  type TenantApiKeyRecord,
} from "@/lib/api/api-keys";

const API_ENDPOINTS = [
  "GET /v1/health",
  "GET /v1/me",
  "GET /v1/chats",
  "GET /v1/chats/:id",
  "POST /v1/messages/send",
  "GET /v1/customers",
  "POST /v1/customers",
  "PATCH /v1/customers/:id",
  "GET /v1/crm/negotiations",
  "POST /v1/crm/negotiations",
] as const;

type Props = {
  canEdit: boolean;
  disabled?: boolean;
};

export function ApiKeysSettingsCard({ canEdit, disabled }: Props) {
  const { toast } = useToast();
  const { data: keys = [], isLoading } = useTenantApiKeys();
  const createKey = useCreateTenantApiKey();
  const revokeKey = useRevokeTenantApiKey();
  const [name, setName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const apiBaseUrl = getWchatApiBaseUrl();

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copiado", description: label });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  }

  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5 text-accent" />
          API para integrações
        </CardTitle>
        <CardDescription className="space-y-2">
          <span className="block">
            Conecte n8n, Zapier, Make ou sistemas próprios com chaves Bearer. Use a edge function{" "}
            <code className="text-xs">wchat-api</code> — autenticação separada da API{" "}
            <code className="text-xs">n8n-reply</code> (IA).
          </span>
          <Button variant="link" className="h-auto p-0 text-accent" asChild>
            <Link to="/configuracoes/api-docs">
              <BookOpen className="mr-1 inline h-3.5 w-3.5" />
              Abrir documentação Swagger
            </Link>
          </Button>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Section title="URL base">
          <UrlBlock apiBaseUrl={apiBaseUrl} onCopy={copyText} />
        </Section>

        <Section title="Endpoints (v1)">
          <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {API_ENDPOINTS.map((ep) => (
              <li key={ep}>
                <code>{ep}</code>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Chaves ativas">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma chave criada ainda.</p>
          ) : (
            <ul className="space-y-2">
              {keys.map((key) => (
                <li
                  key={key.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
                >
                  <ApiKeyRow keyRecord={key} />
                  {canEdit && key.enabled ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={disabled || revokeKey.isPending}
                      onClick={async () => {
                        try {
                          await revokeKey.mutateAsync(key.id);
                          toast({ title: "Chave revogada" });
                        } catch (e) {
                          toast({
                            title: "Erro",
                            description: e instanceof Error ? e.message : "Falha ao revogar",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Revogar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {canEdit ? (
          <Button
            variant="secondary"
            disabled={disabled || createKey.isPending}
            onClick={() => {
              setName("");
              setCreatedSecret(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova chave de API
          </Button>
        ) : null}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createdSecret ? "Chave criada" : "Nova chave de API"}</DialogTitle>
              <DialogDescription>
                {createdSecret
                  ? "Copie o segredo agora. Ele não será exibido novamente."
                  : "Dê um nome para identificar onde a chave será usada (ex.: n8n produção)."}
              </DialogDescription>
            </DialogHeader>
            {createdSecret ? (
              <div className="space-y-2">
                <Label>Segredo (Bearer)</Label>
                <div className="flex gap-2">
                  <Input readOnly value={createdSecret} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => copyText(createdSecret, "Chave copiada")}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <NameField name={name} onNameChange={setName} />
            )}
            <DialogFooter>
              {createdSecret ? (
                <Button onClick={() => setDialogOpen(false)}>Fechar</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                    disabled={createKey.isPending || name.trim().length < 2 || disabled}
                    onClick={async () => {
                      try {
                        const result = await createKey.mutateAsync({ name: name.trim() });
                        setCreatedSecret(result.secret);
                        toast({ title: "Chave criada", description: result.warning });
                      } catch (e) {
                        toast({
                          title: "Erro",
                          description: e instanceof Error ? e.message : "Falha ao criar chave",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    {createKey.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Gerar chave
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

function ApiKeyRow({ keyRecord }: { keyRecord: TenantApiKeyRecord }) {
  return (
    <div>
      <p className="font-medium text-foreground">{keyRecord.name}</p>
      <p className="text-xs text-muted-foreground">
        <code>{keyRecord.keyPrefix}…</code>
        {keyRecord.lastUsedAt
          ? ` · último uso ${new Date(keyRecord.lastUsedAt).toLocaleString("pt-BR")}`
          : ""}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {keyRecord.scopes.map((scope) => (
          <Badge key={scope} variant="secondary" className="text-[10px]">
            {scope}
          </Badge>
        ))}
        {!keyRecord.enabled ? (
          <Badge variant="outline" className="text-[10px]">
            revogada
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function UrlBlock({
  apiBaseUrl,
  onCopy,
}: {
  apiBaseUrl: string;
  onCopy: (value: string, label: string) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <code className="flex-1 break-all rounded-md bg-muted px-2 py-1 text-xs">
          {apiBaseUrl || "Configure VITE_SUPABASE_URL"}
        </code>
        {apiBaseUrl ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onCopy(apiBaseUrl, "URL base")}>
            <Copy className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Header: <code className="text-xs">Authorization: Bearer wchat_…</code>
      </p>
    </>
  );
}

function NameField({
  name,
  onNameChange,
}: {
  name: string;
  onNameChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="api-key-name">Nome</Label>
      <Input
        id="api-key-name"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="n8n — fluxo de boas-vindas"
      />
    </div>
  );
}
