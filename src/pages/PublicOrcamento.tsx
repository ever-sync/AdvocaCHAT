import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eraser,
  TrendingUp,
  Lock,
} from "lucide-react";

import { requireSupabase } from "@/lib/supabase";
import { useDocumentTemplate, type DocumentTemplate } from "@/lib/api/crm-document-templates";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

function generateOrcamentoHtml(
  data: Record<string, unknown> & { answers?: Record<string, unknown> },
  signatureBase64: string,
  template?: DocumentTemplate | null
): string {
  const formatVal = (val: unknown) => (val ? String(val) : "Não informado");
  const formatCurrency = (val: unknown) => {
    if (!val) return "Não informado";
    const num = Number(val);
    if (isNaN(num)) return String(val);
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
  };

  let specsHtml = "";
  if (template && template.fields) {
    specsHtml = `
      <div class="grid">
        ${template.fields.map((field) => `
          <div class="field">
            <div class="label">${field.label}</div>
            <div class="value">${formatVal(data.answers?.[field.id])}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    specsHtml = `
      <div class="grid-3">
        <div class="field"><div class="label">Tamanho</div><div class="value">${formatVal(data.tamanho)}</div></div>
        <div class="field"><div class="label">Peso</div><div class="value">${formatVal(data.peso)}</div></div>
        <div class="field"><div class="label">Cabelo / Cor</div><div class="value">${formatVal(data.cabelo_cor)}</div></div>
      </div>
      <div class="field" style="margin-top: 15px;">
        <div class="label">Observações adicionais:</div>
        <div class="value" style="white-space: pre-wrap; min-height: 50px;">${formatVal(data.obs)}</div>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Orçamento Aprovado - ${data.nome || "Cliente"}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      line-height: 1.5;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 20px;
      margin-bottom: 30px;
      text-align: center;
      position: relative;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .header p {
      margin: 5px 0 0 0;
      color: #6b7280;
      font-size: 13px;
    }
    .section {
      margin-bottom: 25px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    .section-title {
      background-color: #f3f4f6;
      padding: 10px 15px;
      font-weight: 700;
      font-size: 13px;
      color: #374151;
      border-bottom: 1px solid #e5e7eb;
      text-transform: uppercase;
    }
    .section-content {
      padding: 15px;
    }
    .grid {
      display: grid;
      grid-template-cols: 1fr 1fr;
      gap: 15px;
    }
    .grid-3 {
      display: grid;
      grid-template-cols: 1fr 1fr 1fr;
      gap: 15px;
    }
    .field {
      font-size: 13px;
    }
    .label {
      font-weight: 600;
      color: #4b5563;
      margin-bottom: 3px;
    }
    .value {
      color: #111827;
      background-color: #f9fafb;
      padding: 6px 10px;
      border-radius: 4px;
      border: 1px solid #f3f4f6;
      min-height: 18px;
    }
    .total-container {
      margin-top: 25px;
      display: flex;
      justify-content: flex-end;
    }
    .total-box {
      border: 2px solid #3b82f6;
      border-radius: 8px;
      padding: 15px 30px;
      text-align: center;
      background-color: #eff6ff;
    }
    .total-title {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      color: #1d4ed8;
      letter-spacing: 0.5px;
    }
    .total-val {
      font-size: 24px;
      font-weight: 800;
      color: #1e3a8a;
      margin-top: 5px;
    }
    .signature-area {
      text-align: center;
      margin-top: 40px;
      border-top: 1px dashed #d1d5db;
      padding-top: 20px;
    }
    .signature-img {
      max-width: 300px;
      border-bottom: 1px solid #9ca3af;
      margin-bottom: 10px;
    }
    .consent-text {
      font-size: 11px;
      color: #6b7280;
      max-width: 600px;
      margin: 15px auto;
      line-height: 1.4;
    }
  </style>
</head>
<body>

  <div class="header">
    <h1>Orçamento & Proposta Comercial</h1>
    <p>Aprovado digitalmente pelo cliente em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
  </div>

  <!-- Dados do Cliente -->
  <div class="section">
    <div class="section-title">Identificação do Cliente</div>
    <div class="section-content">
      <div class="grid">
        <div class="field"><div class="label">Cliente</div><div class="value">${formatVal(data.nome)}</div></div>
        <div class="field"><div class="label">Telefone / Fone</div><div class="value">${formatVal(data.telefone)}</div></div>
        <div class="field"><div class="label">Endereço</div><div class="value">${formatVal(data.endereco)} ${data.numero ? `, Nº ${data.numero}` : ""}</div></div>
        <div class="field"><div class="label">Bairro</div><div class="value">${formatVal(data.bairro)}</div></div>
        <div class="field"><div class="label">CEP</div><div class="value">${formatVal(data.cep)}</div></div>
        <div class="field"><div class="label">Cidade / Estado</div><div class="value">${formatVal(data.cidade)}</div></div>
        <div class="field"><div class="label">CPF / CNPJ</div><div class="value">${formatVal(data.cpf)}</div></div>
        <div class="field"><div class="label">RG</div><div class="value">${formatVal(data.rg)}</div></div>
      </div>
    </div>
  </div>

  <!-- Detalhes do Orçamento -->
  <div class="section">
    <div class="section-title">Especificações do Serviço</div>
    <div class="section-content">
      ${specsHtml}
    </div>
  </div>

  <!-- Total Box -->
  <div class="total-container">
    <div class="total-box">
      <div class="total-title">Valor Total Proposto</div>
      <div class="total-val">${formatCurrency(data.valor_total)}</div>
    </div>
  </div>

  <!-- Declaração e Assinatura -->
  <div class="signature-area">
    <p class="consent-text">
      Aceito formalmente a presente proposta comercial e o orçamento correspondente para prestação de serviços. Autorizo a execução conforme as especificações detalhadas acima.
    </p>
    ${signatureBase64 ? `<img class="signature-img" src="${signatureBase64}" alt="Assinatura" />` : `<div style="height: 60px;">Sem Assinatura</div>`}
    <div class="label">${data.nome || "Assinatura do Cliente"}</div>
    <div style="font-size: 11px; color: #9ca3af; margin-top: 10px;">
      IP: ${data.ip_address || "Não rastreado"} · Dispositivo: ${data.user_agent || "Não rastreado"}
    </div>
  </div>

</body>
</html>`;
}

const maskPhone = (val: string) => {
  if (!val) return "";
  const clean = val.replace(/\D/g, "");
  if (clean.length < 10) return val;
  const len = clean.length;
  const ddd = clean.substring(len - 11, len - 9);
  const lastFour = clean.substring(len - 4);
  const country = clean.substring(0, len - 11);
  return `${country ? `+${country} ` : ""}(${ddd}) *****-${lastFour}`;
};

const maskCPF = (val: string) => {
  if (!val) return "";
  const clean = val.replace(/\D/g, "");
  if (clean.length !== 11) return val;
  return `***.***.***-${clean.substring(9)}`;
};

export default function PublicOrcamento() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Params from URL
  const negId = searchParams.get("neg") || "";
  const custId = searchParams.get("cust") || "";
  const tenantId = searchParams.get("tenant") || "";

  // Client Info (Prefilled)
  const nome = searchParams.get("nome") || "";
  const telefone = searchParams.get("fone") || "";
  const endereco = searchParams.get("endereco") || "";
  const numero = searchParams.get("numero") || "";
  const bairro = searchParams.get("bairro") || "";
  const cep = searchParams.get("cep") || "";
  const cidade = searchParams.get("cidade") || "";
  const cpf = searchParams.get("cpf") || "";
  const rg = searchParams.get("rg") || "";

  // Quote info (Prefilled)
  const tamanho = searchParams.get("tamanho") || "";
  const peso = searchParams.get("peso") || "";
  const cabeloCor = searchParams.get("cabelo_cor") || "";
  const obs = searchParams.get("obs") || "";
  const valorTotal = searchParams.get("valor_total") || "";
  const templateId = searchParams.get("templateId") || "";

  // Fetch dynamic template if present
  const isDefault = !templateId || templateId === "default";
  const { data: template, isLoading: templateLoading } = useDocumentTemplate(
    isDefault ? null : templateId
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!template?.fields) return;
    const initialAnswers: Record<string, string> = {};
    template.fields.forEach((field) => {
      const val = searchParams.get(field.id);
      if (val !== null) {
        initialAnswers[field.id] = val;
      }
    });
    setAnswers(initialAnswers);
  }, [template, searchParams]);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Status control
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [declarationChecked, setDeclarationChecked] = useState(false);
  const [securityChecked, setSecurityChecked] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  useEffect(() => {
    async function validateSecurity() {
      const sig = searchParams.get("sig") || "";
      const exp = searchParams.get("exp") || "";

      if (!sig || !exp) {
        setSecurityError("Assinatura de segurança ou expiração ausente.");
        setSecurityChecked(true);
        return;
      }

      if (Date.now() > Number(exp)) {
        setSecurityError("Este link expirou. Por segurança, solicite um novo link de orçamento.");
        setSecurityChecked(true);
        return;
      }

      const signParams: Record<string, string> = {
        neg: negId,
        cust: custId,
        tenant: tenantId,
        exp,
        templateId: templateId || "",
      };

      if (valorTotal) {
        signParams.valor_total = valorTotal;
      }

      const { verifyUrlParams } = await import("@/lib/security");
      const isValid = await verifyUrlParams(signParams, sig);

      if (!isValid) {
        setSecurityError("A assinatura digital do link está inválida ou foi modificada.");
      }
      setSecurityChecked(true);
    }
    validateSecurity();
  }, [searchParams, negId, custId, tenantId, templateId, valorTotal]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1e3a8a"; // Dark blue signature line color
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
  }, [submitted]);

  // Drawing handlers (Mouse)
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // Drawing handlers (Touch)
  const startDrawingTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    ctx.beginPath();
    ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
    setIsDrawing(true);
  };

  const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
    ctx.stroke();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleApprove = async () => {
    if (!negId || !custId || !tenantId) {
      toast({
        title: "Link inválido",
        description: "Não conseguimos localizar a proposta de orçamento no sistema.",
        variant: "destructive",
      });
      return;
    }
    if (!declarationChecked) {
      toast({
        title: "Atenção",
        description: "Você precisa aceitar os termos do orçamento antes de aprovar.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const supabase = requireSupabase();

      let signatureBase64 = "";
      const canvas = canvasRef.current;
      if (canvas) {
        signatureBase64 = canvas.toDataURL("image/png");
      }

      const clientData = {
        nome,
        telefone,
        endereco,
        numero,
        bairro,
        cep,
        cidade,
        cpf,
        rg,
        tamanho,
        peso,
        cabelo_cor: cabeloCor,
        obs,
        valor_total: valorTotal,
        answers,
        ip_address: "Aprovado online",
        user_agent: navigator.userAgent,
      };

      // Generate HTML contract/budget file
      const htmlContent = generateOrcamentoHtml(clientData, signatureBase64, template);

      // Upload file directly to Supabase Storage
      const path = `${tenantId}/${negId}/${crypto.randomUUID()}_orcamento_aprovado.html`;
      const file = new File([htmlContent], `orcamento_${nome.toLowerCase().replace(/\s+/g, "_")}.html`, {
        type: "text/html",
      });

      const { error: uploadError } = await supabase.storage.from("crm-lead-documents").upload(path, file);
      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      // Insert record in crm_negotiation_documents
      const { error: insertError } = await supabase.from("crm_negotiation_documents").insert({
        tenant_id: tenantId,
        negotiation_id: negId,
        display_name: `[Orçamento] Orçamento Aprovado - ${nome}`,
        storage_path: path,
        file_name: `orcamento_${nome.toLowerCase().replace(/\s+/g, "_")}.html`,
        mime_type: "text/html",
        file_size: htmlContent.length,
        uploaded_by: null,
      });

      if (insertError) {
        await supabase.storage.from("crm-lead-documents").remove([path]);
        throw new Error(`Erro ao salvar registro: ${insertError.message}`);
      }

      try {
        const docTitle = !isDefault && template ? `[Orçamento] ${template.name} - ${nome}` : `[Orçamento] Orçamento Aprovado - ${nome}`;
        let chatId = null;
        const { data: chatRow } = await supabase
          .from("whatsapp_chats")
          .select("id")
          .eq("customer_id", custId)
          .maybeSingle();

        if (chatRow) {
          chatId = chatRow.id;
          await supabase.from("chat_notes").insert({
            tenant_id: tenantId,
            chat_id: chatRow.id,
            body_text: `💰 ORÇAMENTO APROVADO: O cliente assinou digitalmente o orçamento "${docTitle}".`,
          });
        }

        await supabase.from("crm_activities").insert({
          tenant_id: tenantId,
          customer_id: custId,
          negotiation_id: negId,
          chat_id: chatId,
          activity_type: "document_signed",
          title: `💰 Orçamento Aprovado`,
          body: `O cliente assinou digitalmente a proposta comercial do orçamento "${docTitle}".`,
        });
      } catch (logErr) {
        console.error("Erro ao registrar atividade de orçamento:", logErr);
      }

      setSubmitted(true);
    } catch (err) {
      toast({
        title: "Falha ao aprovar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrencyLocal = (val: string) => {
    const num = Number(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <Card className="max-w-md w-full shadow-lg border-blue-500/20 bg-white">
          <CardHeader className="text-center pb-2">
            <CheckCircle2 className="h-16 w-16 text-blue-600 mx-auto mb-4 animate-bounce" />
            <CardTitle className="text-2xl font-bold text-zinc-900">Orçamento Aprovado!</CardTitle>
            <CardDescription className="text-sm text-zinc-500 mt-2">
              Sua aprovação foi registrada com sucesso e o documento assinado foi anexado ao prontuário.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-4">
            <p className="text-xs text-zinc-400">
              Você já pode fechar esta guia. A equipe do salão iniciará o preparo conforme combinado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!securityChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <div className="flex flex-col items-center justify-center gap-3 text-zinc-500">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-semibold">Validando proposta segura...</p>
        </div>
      </div>
    );
  }

  if (securityError || !negId || !custId || !tenantId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <Card className="max-w-md w-full shadow-lg border-rose-500/20 bg-white">
          <CardHeader className="text-center pb-2">
            <AlertCircle className="h-16 w-16 text-rose-500 mx-auto mb-4" />
            <CardTitle className="text-2xl font-bold text-zinc-900">Acesso Bloqueado</CardTitle>
            <CardDescription className="text-sm text-zinc-500 mt-2">
              {securityError || "Proposta comercial inválida ou corrompida."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-4 border-t border-border mt-4">
            <p className="text-xs text-zinc-400">
              Para proteger seus dados comerciais e pessoais, este link é verificado por assinatura digital e expira automaticamente.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 md:px-8 flex justify-center">
      <Card className="max-w-2xl w-full shadow-xl border-border bg-white rounded-2xl overflow-hidden">
        {/* Banner */}
        <div className="bg-blue-500/5 border-b border-blue-500/10 p-6 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-800 tracking-tight uppercase">Orçamento & Proposta</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Revise os dados abaixo e realize a aprovação digital.</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Client fields (Read-only review) */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-zinc-800 border-l-2 border-blue-500 pl-2 uppercase tracking-wide">
              Identificação do Cliente
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-50/50 border border-border p-4 rounded-xl text-xs">
              <div><span className="font-semibold text-zinc-500 flex items-center gap-1">Nome <Lock className="h-2.5 w-2.5 text-zinc-400" />:</span> <span className="font-bold text-zinc-800">{nome || "Não informado"}</span></div>
              <div><span className="font-semibold text-zinc-500 flex items-center gap-1">Telefone <Lock className="h-2.5 w-2.5 text-zinc-400" />:</span> <span className="font-bold text-zinc-800">{telefone ? maskPhone(telefone) : "Não informado"}</span></div>
              <div className="sm:col-span-2"><span className="font-semibold text-zinc-500">Endereço:</span> <span className="font-bold text-zinc-800">{endereco || "Não informado"} {numero ? `, Nº ${numero}` : ""}</span></div>
              <div><span className="font-semibold text-zinc-500">Bairro:</span> <span className="font-bold text-zinc-800">{bairro || "Não informado"}</span></div>
              <div><span className="font-semibold text-zinc-500">CEP:</span> <span className="font-bold text-zinc-800">{cep || "Não informado"}</span></div>
              <div><span className="font-semibold text-zinc-500">Cidade/Estado:</span> <span className="font-bold text-zinc-800">{cidade || "Não informado"}</span></div>
              <div><span className="font-semibold text-zinc-500">CPF/CNPJ:</span> <span className="font-bold text-zinc-800">{cpf ? maskCPF(cpf) : "Não informado"}</span></div>
              <div><span className="font-semibold text-zinc-500">RG:</span> <span className="font-bold text-zinc-800">{rg || "Não informado"}</span></div>
            </div>
          </div>

          {/* Quote details (Read-only review) */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-zinc-800 border-l-2 border-blue-500 pl-2 uppercase tracking-wide">
              Especificações do Serviço
            </h2>
            {!isDefault && template ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-50/50 border border-border p-4 rounded-xl text-xs">
                {template.fields.map((field) => (
                  <div key={field.id} className="flex flex-col">
                    <span className="font-semibold text-zinc-500 flex items-center justify-between">
                      <span>{field.label}:</span>
                      {searchParams.has(field.id) && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-zinc-400 font-normal">
                          <Lock className="h-2.5 w-2.5" /> Fixado
                        </span>
                      )}
                    </span>
                    <span className="font-bold text-zinc-800 mt-1 bg-white p-2 border border-border rounded">
                      {answers[field.id] || "Não informado"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-50/50 border border-border p-4 rounded-xl text-xs">
                <div><span className="font-semibold text-zinc-500">Tamanho do Cabelo:</span> <span className="font-bold text-zinc-800 block mt-1 bg-white p-2 border border-border rounded">{tamanho || "Não informado"}</span></div>
                <div><span className="font-semibold text-zinc-500">Peso:</span> <span className="font-bold text-zinc-800 block mt-1 bg-white p-2 border border-border rounded">{peso || "Não informado"}</span></div>
                <div><span className="font-semibold text-zinc-500">Cabelo / Cor:</span> <span className="font-bold text-zinc-800 block mt-1 bg-white p-2 border border-border rounded">{cabeloCor || "Não informado"}</span></div>
                <div className="sm:col-span-3 mt-2"><span className="font-semibold text-zinc-500">Observações:</span> <span className="font-bold text-zinc-800 block mt-1 bg-white p-3 border border-border rounded min-h-[60px] whitespace-pre-wrap">{obs || "Sem observações adicionais"}</span></div>
              </div>
            )}
          </div>

          {/* Total Box */}
          <div className="flex justify-end pt-2">
            <div className="border-2 border-blue-500 bg-blue-500/5 rounded-2xl px-6 py-4 text-right shadow-sm">
              <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">Valor Total Proposto</span>
              <div className="text-3xl font-extrabold text-blue-900 mt-0.5">{formatCurrencyLocal(valorTotal)}</div>
            </div>
          </div>

          {/* Signature and Approval */}
          <div className="space-y-4 pt-4 border-t border-border/80">
            <h2 className="text-xs font-bold text-zinc-800 border-l-2 border-blue-500 pl-2 uppercase tracking-wide">
              Assinatura e Visto
            </h2>

            <div className="space-y-2">
              <Label className="text-zinc-500 text-xs">Desenhe seu visto/assinatura abaixo:</Label>
              <div className="border border-border rounded-xl overflow-hidden bg-zinc-50/80 relative flex flex-col items-center">
                <canvas
                  ref={canvasRef}
                  width={540}
                  height={150}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawingTouch}
                  onTouchMove={drawTouch}
                  onTouchEnd={stopDrawing}
                  className="w-full max-w-[540px] h-[150px] bg-white cursor-crosshair touch-none"
                />
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="absolute bottom-2 right-2 flex items-center gap-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-800 text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors"
                >
                  <Eraser className="h-3 w-3" />
                  Limpar Traço
                </button>
              </div>
            </div>

            <div className="flex items-start space-x-2.5 mt-2 bg-blue-50/30 border border-blue-500/10 p-3.5 rounded-xl">
              <input
                id="declare-checkbox"
                type="checkbox"
                checked={declarationChecked}
                onChange={(e) => setDeclarationChecked(e.target.checked)}
                className="mt-1 h-4.5 w-4.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                required
              />
              <label htmlFor="declare-checkbox" className="text-xs text-zinc-600 font-semibold leading-relaxed cursor-pointer select-none">
                Estou de acordo com a proposta comercial descrita acima e autorizo a execução do serviço pelo valor estipulado.
              </label>
            </div>

            <div className="pt-2">
              <Button
                onClick={handleApprove}
                disabled={submitting}
                className="w-full h-12 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                Aprovar Orçamento
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
