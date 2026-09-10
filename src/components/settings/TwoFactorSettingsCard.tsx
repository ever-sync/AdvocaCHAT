import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { recordAuditEventSafe } from "@/lib/api/audit-logs";

type EnrollState = { factorId: string; qrCode: string; secret: string } | null;

export function TwoFactorSettingsCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = (data?.totp ?? []).find((f) => f.status === "verified");
      setVerifiedFactorId(verified?.id ?? null);
    } catch {
      setVerifiedFactorId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEnroll = async () => {
    if (!supabase) return;
    setBusy(true);
    try {
      // Remove fatores não verificados pendentes (evita "factor already exists").
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.totp ?? []) {
        if (f.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined);
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error || !data) {
        toast({ title: "Erro ao iniciar 2FA", description: error?.message, variant: "destructive" });
        return;
      }
      setEnroll({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async () => {
    if (!supabase || !enroll) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.factorId, code: code.trim() });
      if (error) {
        toast({ title: "Código inválido", description: error.message, variant: "destructive" });
        return;
      }
      setEnroll(null);
      setCode("");
      recordAuditEventSafe({ action: "update", entityType: "session", summary: "2FA ativado" });
      toast({ title: "2FA ativado", description: "Sua conta agora pede um código ao entrar." });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!supabase || !verifiedFactorId) return;
    if (!confirm("Desativar a verificação em duas etapas?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactorId });
      if (error) {
        toast({ title: "Erro ao desativar", description: error.message, variant: "destructive" });
        return;
      }
      recordAuditEventSafe({ action: "update", entityType: "session", summary: "2FA desativado" });
      toast({ title: "2FA desativado" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Verificação em duas etapas (2FA)
          {verifiedFactorId ? (
            <Badge className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
              Ativa
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          Proteja o acesso exigindo um código de um aplicativo autenticador (Google Authenticator, Authy, 1Password…).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : verifiedFactorId ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200/60 bg-emerald-50/50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <span className="text-sm text-foreground">A verificação em duas etapas está ativa nesta conta.</span>
            <Button type="button" variant="outline" onClick={() => void disable()} disabled={busy}>
              Desativar
            </Button>
          </div>
        ) : enroll ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 sm:flex-row sm:items-start">
              <img src={enroll.qrCode} alt="QR Code do 2FA" className="h-40 w-40 rounded-lg bg-white p-2" />
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  1. Escaneie o QR Code no seu app autenticador. <br />
                  2. Ou digite o código manual abaixo. <br />
                  3. Informe o código de 6 dígitos gerado.
                </p>
                <div>
                  <span className="text-xs text-muted-foreground">Código manual:</span>
                  <code className="ml-1 break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{enroll.secret}</code>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-40 text-center tracking-[0.3em]"
              />
              <Button type="button" onClick={() => void confirmEnroll()} disabled={busy || code.length < 6}>
                Confirmar e ativar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEnroll(null)} disabled={busy}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4" />
              Sua conta ainda não usa verificação em duas etapas.
            </div>
            <Button type="button" onClick={() => void startEnroll()} disabled={busy}>
              Ativar 2FA
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
