import { useEffect, useState, type FormEvent } from "react";
import { FileCheck2, FileLock2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase";
import { clearLegalUploadToken, getLegalUploadToken } from "@/lib/legal-upload-token";

export default function LegalDocumentUpload() {
  const [token] = useState(getLegalUploadToken);
  const [checking, setChecking] = useState(true);
  const [available, setAvailable] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    if (!token) { setChecking(false); setError("Reabra o link enviado pelo escritório para continuar."); return () => controller.abort(); }
    fetch(`${supabaseUrl}/functions/v1/legal-document-requests`, { method: "POST", headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "inspect" }), signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Link indisponível."); setAvailable(data.available === true); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível abrir a solicitação."); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [token]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file || !available || busy) return;
    if (!file.size || file.size > 10 * 1024 * 1024 || file.name.length > 200) { setError("Selecione um arquivo não vazio de até 10 MB, com nome de até 200 caracteres."); return; }
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch(`${supabaseUrl}/functions/v1/legal-document-requests`, { method: "POST", headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` }, body: form });
      const data = await response.json(); if (!response.ok) { if (response.status === 404 || response.status === 503) setAvailable(false); throw new Error(data.error ?? "Não foi possível enviar."); }
      setReceived(true); setFile(null); clearLegalUploadToken();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível enviar. Procure o escritório."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-dvh bg-muted/30 px-4 py-10 sm:py-20"><section className="mx-auto w-full max-w-lg rounded-2xl border bg-background p-6 shadow-sm sm:p-8" aria-labelledby="upload-title">
    {received ? <><FileCheck2 className="mb-5 h-10 w-10 text-emerald-600" aria-hidden /><h1 id="upload-title" className="text-2xl font-semibold">Documento recebido</h1><p className="mt-3 text-muted-foreground">O escritório poderá revisar seu arquivo. Se for necessário algum complemento, a equipe entrará em contato pelos canais combinados.</p></> : <>
      <FileLock2 className="mb-5 h-10 w-10 text-primary" aria-hidden /><h1 id="upload-title" className="text-2xl font-semibold">Envio de documento</h1><p className="mt-3 text-muted-foreground">Envie o arquivo combinado com o escritório. Este link permite enviar um documento e não dá acesso aos demais arquivos do caso.</p>
      {checking ? <p className="mt-6 flex items-center gap-2" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Conferindo solicitação…</p> : available ? <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}><div className="space-y-2"><label htmlFor="legal-upload-file" className="text-sm font-medium">Arquivo solicitado</label><Input id="legal-upload-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.csv" required disabled={busy} aria-describedby="legal-upload-help" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="h-auto min-h-11" /><p id="legal-upload-help" className="text-sm text-muted-foreground">PDF, JPG, PNG, TXT ou CSV UTF-8, até 10 MB.</p></div><Button type="submit" className="w-full min-h-11" disabled={busy || !file}>{busy ? "Enviando documento…" : "Enviar documento"}</Button></form> : null}
      {error ? <p className="mt-5 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
      <p className="mt-6 text-xs text-muted-foreground">Não encaminhe este link a outras pessoas. Se precisar reenviar ou trocar o arquivo, solicite um novo link ao escritório.</p>
    </>}
  </section></main>;
}
