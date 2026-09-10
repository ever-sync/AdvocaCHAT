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
  Lock,
} from "lucide-react";

import { requireSupabase } from "@/lib/supabase";
import {
  useDocumentTemplate,
  type DocumentTemplateField,
} from "@/lib/api/crm-document-templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// Helper to format values for HTML output
const formatValue = (val: unknown) => {
  if (val === undefined || val === null || val === "") return "Não informado";
  if (val === true || val === "sim") return "✅ Sim";
  if (val === false || val === "nao") return "❌ Não";
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
};

// Generates the customized HTML report based on dynamic questions
function generateDynamicAnamneseHtml(
  templateName: string,
  nome: string,
  telefone: string,
  nasc: string,
  answers: Record<string, unknown>,
  fields: DocumentTemplateField[],
  signatureBase64: string,
  meta: { ip: string; ua: string }
): string {
  const fieldsHtml = fields
    .map((field) => {
      const ans = answers[field.id];
      return `
      <div class="field">
        <div class="label">${field.label}</div>
        <div class="value">${formatValue(ans)}</div>
      </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Ficha de Anamnese - ${nome || "Cliente"}</title>
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
      border-bottom: 2px solid #10b981;
      padding-bottom: 20px;
      margin-bottom: 30px;
      text-align: center;
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
    .field {
      font-size: 13px;
      margin-bottom: 10px;
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
    <h1>${templateName || "Ficha de Anamnese"}</h1>
    <p>Preenchido digitalmente pelo cliente em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
  </div>

  <div class="section">
    <div class="section-title">Dados Pessoais do Cliente</div>
    <div class="section-content">
      <div class="grid">
        <div class="field"><div class="label">Nome Completo</div><div class="value">${formatValue(nome)}</div></div>
        <div class="field"><div class="label">Telefone</div><div class="value">${formatValue(telefone)}</div></div>
        <div class="field"><div class="label">Data de Nascimento</div><div class="value">${formatValue(nasc)}</div></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Respostas da Avaliação</div>
    <div class="section-content">
      <div class="grid">
        ${fieldsHtml}
      </div>
    </div>
  </div>

  <div class="signature-area">
    <p class="consent-text">
      Declaro que as informações descritas acima são verdadeiras e completas. Autorizo a execução dos procedimentos necessários informados pela equipe técnica.
    </p>
    ${signatureBase64 ? `<img class="signature-img" src="${signatureBase64}" alt="Assinatura" />` : `<div style="height: 60px;">Sem Assinatura</div>`}
    <div class="label">${nome || "Assinatura do Cliente"}</div>
    <div style="font-size: 11px; color: #9ca3af; margin-top: 10px;">
      IP: ${meta.ip || "Não rastreado"} · Dispositivo: ${meta.ua || "Não rastreado"}
    </div>
  </div>

</body>
</html>`;
}

// Default Fallback Aline Ferreira Hair Anamnese Layout Form Content
function generateDefaultAnamneseHtml(data: Record<string, unknown>, signatureBase64: string): string {
  const formatCheck = (val: unknown) => (val === "sim" || val === true ? "✅ Sim" : "❌ Não");
  const formatVal = (val: unknown) => (val ? String(val) : "Não informado");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Ficha de Anamnese Capilar - ${data.nome || "Cliente"}</title>
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
      border-bottom: 2px solid #10b981;
      padding-bottom: 20px;
      margin-bottom: 30px;
      text-align: center;
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
    <h1>Ficha de Anamnese Capilar</h1>
    <p>Preenchido digitalmente pelo cliente em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
  </div>

  <div class="section">
    <div class="section-title">Dados Pessoais</div>
    <div class="section-content">
      <div class="grid">
        <div class="field"><div class="label">Nome Completo</div><div class="value">${formatVal(data.nome)}</div></div>
        <div class="field"><div class="label">Data de Nascimento</div><div class="value">${formatVal(data.nasc)}</div></div>
        <div class="field"><div class="label">Ocupação</div><div class="value">${formatVal(data.ocupacao)}</div></div>
        <div class="field"><div class="label">Telefone</div><div class="value">${formatVal(data.telefone)}</div></div>
        <div class="field"><div class="label">Endereço</div><div class="value">${formatVal(data.endereco)}</div></div>
        <div class="field"><div class="label">CEP</div><div class="value">${formatVal(data.cep)}</div></div>
        <div class="field"><div class="label">RG</div><div class="value">${formatVal(data.rg)}</div></div>
        <div class="field"><div class="label">CPF</div><div class="value">${formatVal(data.cpf)}</div></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Tipo de Cabelo e Hábitos</div>
    <div class="section-content">
      <div class="grid">
        <div class="field"><div class="label">Tipo de Cabelo</div><div class="value">${formatVal(data.cabelo)}</div></div>
        <div class="field">
          <div class="label">Uso Freqüente de Equipamentos</div>
          <div class="value">
            ${data.uso_secador ? "Secador " : ""}${data.uso_chapinha ? "Chapinha " : ""}${data.uso_babyliss ? "Babyliss " : ""}${data.uso_outros ? `Outros (${data.uso_outros})` : ""}
            ${!data.uso_secador && !data.uso_chapinha && !data.uso_babyliss && !data.uso_outros ? "Nenhum" : ""}
          </div>
        </div>
        <div class="field"><div class="label">Realiza Penteados com Freqüência?</div><div class="value">${formatCheck(data.penteados)} ${data.penteados_detalhe ? `(${data.penteados_detalhe})` : ""}</div></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Saúde e Histórico Clínico</div>
    <div class="section-content">
      <div class="grid">
        <div class="field"><div class="label">Alguma alergia?</div><div class="value">${formatCheck(data.alergia)} ${data.alergia_detalhe ? `- ${data.alergia_detalhe}` : ""}</div></div>
        <div class="field"><div class="label">Tem alguma química ativa?</div><div class="value">${formatCheck(data.quimica)} ${data.quimica_detalhe ? `- ${data.quimica_detalhe}` : ""}</div></div>
        <div class="field"><div class="label">Fez cirurgia recentemente?</div><div class="value">${formatCheck(data.cirurgia)} ${data.cirurgia_detalhe ? `- ${data.cirurgia_detalhe}` : ""}</div></div>
        <div class="field"><div class="label">Oleosidade capilar excessiva?</div><div class="value">${formatCheck(data.oleosidade)} ${data.oleosidade_detalhe ? `- ${data.oleosidade_detalhe}` : ""}</div></div>
        <div class="field"><div class="label">Pratica esportes?</div><div class="value">${formatCheck(data.esportes)} ${data.esportes_detalhe ? `- ${data.esportes_detalhe}` : ""}</div></div>
        <div class="field"><div class="label">Toma algum medicamento contínuo?</div><div class="value">${formatCheck(data.medicamento)} ${data.medicamento_detalhe ? `- ${data.medicamento_detalhe}` : ""}</div></div>
        <div class="field"><div class="label">Apresenta sensibilidade a dor?</div><div class="value">${formatCheck(data.sensibilidade)} ${data.sensibilidade_detalhe ? `- ${data.sensibilidade_detalhe}` : ""}</div></div>
        <div class="field"><div class="label">Gestante?</div><div class="value">${formatCheck(data.gestante)} ${data.gestante_semanas ? `(${data.gestante_semanas} semanas)` : ""}</div></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Condições Capilares e Sintomas Relatados</div>
    <div class="section-content">
      <div class="grid-3">
        <div class="field"><div class="label">Hipertensão/Hipotensão?</div><div class="value">${formatCheck(data.hipertensao)}</div></div>
        <div class="field"><div class="label">Seborreia?</div><div class="value">${formatCheck(data.seborreia)}</div></div>
        <div class="field"><div class="label">Alopécia?</div><div class="value">${formatCheck(data.alopecia)}</div></div>
        <div class="field"><div class="label">Foliculite?</div><div class="value">${formatCheck(data.foliculite)}</div></div>
        <div class="field"><div class="label">Psoríase?</div><div class="value">${formatCheck(data.psoriase)}</div></div>
        <div class="field"><div class="label">Queda Capilar?</div><div class="value">${formatCheck(data.queda)}</div></div>
      </div>
      <div class="field" style="margin-top: 15px;">
        <div class="label">Outros tratamentos ou procedimentos realizados recentemente:</div>
        <div class="value">${formatCheck(data.outro_tratamento)} ${data.outro_tratamento_detalhe ? `- ${data.outro_tratamento_detalhe}` : ""}</div>
      </div>
    </div>
  </div>

  <div class="signature-area">
    <p class="consent-text">
      Declaro que as informações descritas acima são verdadeiras e completas. Autorizo a execução dos procedimentos necessários informados pela equipe técnica.
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

export default function PublicAnamnese() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Params from URL
  const negId = searchParams.get("neg") || "";
  const custId = searchParams.get("cust") || "";
  const tenantId = searchParams.get("tenant") || "";
  const initialNome = searchParams.get("nome") || "";
  const initialFone = searchParams.get("fone") || "";
  const templateId = searchParams.get("templateId") || "";

  // Fetch dynamic template if parameter present
  const isDefault = !templateId || templateId === "default";
  const { data: template, isLoading: templateLoading, error: templateError } = useDocumentTemplate(
    isDefault ? null : templateId
  );

  // Signature canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Status control
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
        setSecurityError("Este link expirou. Por segurança, solicite um novo link de preenchimento.");
        setSecurityChecked(true);
        return;
      }

      const signParams = {
        neg: negId,
        cust: custId,
        tenant: tenantId,
        exp,
        templateId: templateId || "",
      };

      const { verifyUrlParams } = await import("@/lib/security");
      const isValid = await verifyUrlParams(signParams, sig);

      if (!isValid) {
        setSecurityError("A assinatura digital do link está inválida ou foi modificada.");
      }
      setSecurityChecked(true);
    }
    validateSecurity();
  }, [searchParams, negId, custId, tenantId, templateId]);

  // Form states (common)
  const [nome, setNome] = useState(initialNome);
  const [telefone, setTelefone] = useState(initialFone);
  const [nasc, setNasc] = useState("");

  // Answers dictionary for dynamic template
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  // Prefill dynamic fields from URL query params
  useEffect(() => {
    if (!template?.fields) return;
    const initialAnswers: Record<string, unknown> = {};
    template.fields.forEach((field) => {
      const val = searchParams.get(field.id);
      if (val !== null) {
        if (field.type === "checkbox") {
          initialAnswers[field.id] = val.split(",");
        } else {
          initialAnswers[field.id] = val;
        }
      }
    });
    if (Object.keys(initialAnswers).length > 0) {
      setAnswers((prev) => ({ ...prev, ...initialAnswers }));
    }
  }, [template, searchParams]);

  // Fallback / Default Form states (Aline Ferreira)
  const [ocupacao, setOcupacao] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cep, setCep] = useState("");
  const [rg, setRg] = useState("");
  const [cpf, setCpf] = useState("");
  const [cabelo, setCabelo] = useState("liso");
  const [alergia, setAlergia] = useState("nao");
  const [alergiaDetalhe, setAlergiaDetalhe] = useState("");
  const [quimica, setQuimica] = useState("nao");
  const [quimicaDetalhe, setQuimicaDetalhe] = useState("");
  const [cirurgia, setCirurgia] = useState("nao");
  const [cirurgiaDetalhe, setCirurgiaDetalhe] = useState("");
  const [oleosidade, setOleosidade] = useState("nao");
  const [oleosidadeDetalhe, setOleosidadeDetalhe] = useState("");
  const [esportes, setEsportes] = useState("nao");
  const [esportesDetalhe, setEsportesDetalhe] = useState("");
  const [medicamento, setMedicamento] = useState("nao");
  const [medicamentoDetalhe, setMedicamentoDetalhe] = useState("");
  const [sensibilidade, setSensibilidade] = useState("nao");
  const [sensibilidadeDetalhe, setSensibilidadeDetalhe] = useState("");
  const [gestante, setGestante] = useState("nao");
  const [gestanteSemanas, setGestanteSemanas] = useState("");
  const [hipertensao, setHipertensao] = useState("nao");
  const [seborreia, setSeborreia] = useState("nao");
  const [alopecia, setAlopecia] = useState("nao");
  const [foliculite, setFoliculite] = useState("nao");
  const [psoriase, setPsoriase] = useState("nao");
  const [queda, setQueda] = useState("nao");
  const [outroTratamento, setOutroTratamento] = useState("nao");
  const [outroTratamentoDetalhe, setOutroTratamentoDetalhe] = useState("");
  const [usoSecador, setUsoSecador] = useState(false);
  const [usoChapinha, setUsoChapinha] = useState(false);
  const [usoBabyliss, setUsoBabyliss] = useState(false);
  const [usoOutros, setUsoOutros] = useState("");
  const [penteados, setPenteados] = useState("nao");
  const [penteadosDetalhe, setPenteadosDetalhe] = useState("");

  const [declarationChecked, setDeclarationChecked] = useState(false);

  // Initialize Canvas context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
  }, [submitted, templateLoading]);

  // Drawing handlers (Desktop Mouse)
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

  // Drawing handlers (Mobile Touch)
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

  // Handle dynamic text input change
  const handleDynamicChange = (fieldId: string, value: unknown) => {
    setAnswers({ ...answers, [fieldId]: value });
  };

  // Handle dynamic checkbox selection
  const handleDynamicCheckboxChange = (fieldId: string, option: string, checked: boolean) => {
    const current = (answers[fieldId] as string[]) || [];
    let updated: string[];
    if (checked) {
      updated = [...current, option];
    } else {
      updated = current.filter((o) => o !== option);
    }
    setAnswers({ ...answers, [fieldId]: updated });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!negId || !custId || !tenantId) {
      toast({
        title: "Link inválido",
        description: "Não conseguimos localizar sua ficha ou profissional associado no sistema.",
        variant: "destructive",
      });
      return;
    }
    if (!declarationChecked) {
      toast({
        title: "Atenção",
        description: "Você deve aceitar o termo de responsabilidade antes de enviar.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const supabase = requireSupabase();

      // Get signature data URL
      let signatureDataUrl = "";
      const canvas = canvasRef.current;
      if (canvas) {
        signatureDataUrl = canvas.toDataURL("image/png");
      }

      let htmlContent = "";
      if (!isDefault && template) {
        // Fetch metadata to print on dynamic form footer
        const meta = {
          ip: "Preenchido online",
          ua: navigator.userAgent,
        };
        htmlContent = generateDynamicAnamneseHtml(
          template.name,
          nome,
          telefone,
          nasc,
          answers,
          template.fields,
          signatureDataUrl,
          meta
        );
      } else {
        const clientData = {
          nome,
          nasc,
          ocupacao,
          telefone,
          endereco,
          cep,
          rg,
          cpf,
          cabelo,
          alergia,
          alergia_detalhe: alergiaDetalhe,
          quimica,
          quimica_detalhe: quimicaDetalhe,
          cirurgia,
          cirurgia_detalhe: cirurgiaDetalhe,
          oleosidade,
          oleosidade_detalhe: oleosidadeDetalhe,
          esportes,
          esportes_detalhe: esportesDetalhe,
          medicamento,
          medicamento_detalhe: medicamentoDetalhe,
          sensibilidade,
          sensibilidade_detalhe: sensibilidadeDetalhe,
          gestante,
          gestante_semanas: gestanteSemanas,
          hipertensao,
          seborreia,
          alopecia,
          foliculite,
          psoriase,
          queda,
          outro_tratamento: outroTratamento,
          outro_tratamento_detalhe: outroTratamentoDetalhe,
          uso_secador: usoSecador,
          uso_chapinha: usoChapinha,
          uso_babyliss: usoBabyliss,
          uso_outros: usoOutros,
          penteados,
          penteados_detalhe: penteadosDetalhe,
          ip_address: "Preenchido online",
          user_agent: navigator.userAgent,
        };
        htmlContent = generateDefaultAnamneseHtml(clientData, signatureDataUrl);
      }

      // Upload file directly to Supabase Storage
      const path = `${tenantId}/${negId}/${crypto.randomUUID()}_anamnese.html`;
      const file = new File([htmlContent], `anamnese_${nome.toLowerCase().replace(/\s+/g, "_")}.html`, {
        type: "text/html",
      });

      const { error: uploadError } = await supabase.storage.from("crm-lead-documents").upload(path, file);
      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      // Insert document record in crm_negotiation_documents
      const docTitle = !isDefault && template ? `[Anamnese] ${template.name} - ${nome}` : `[Anamnese] Ficha de Anamnese - ${nome}`;
      const { error: insertError } = await supabase.from("crm_negotiation_documents").insert({
        tenant_id: tenantId,
        negotiation_id: negId,
        display_name: docTitle,
        storage_path: path,
        file_name: `anamnese_${nome.toLowerCase().replace(/\s+/g, "_")}.html`,
        mime_type: "text/html",
        file_size: htmlContent.length,
        uploaded_by: null,
      });

      if (insertError) {
        await supabase.storage.from("crm-lead-documents").remove([path]);
        throw new Error(`Erro ao salvar registro: ${insertError.message}`);
      }

      try {
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
            body_text: `📝 ANAMNESE RECEBIDA: O documento "${docTitle}" foi preenchido e assinado digitalmente pelo cliente.`,
          });
        }

        await supabase.from("crm_activities").insert({
          tenant_id: tenantId,
          customer_id: custId,
          negotiation_id: negId,
          chat_id: chatId,
          activity_type: "document_signed",
          title: `📝 Anamnese Preenchida`,
          body: `O cliente preencheu e assinou digitalmente o documento "${docTitle}".`,
        });
      } catch (logErr) {
        console.error("Erro ao registrar atividade de anamnese:", logErr);
      }

      setSubmitted(true);
    } catch (err) {
      toast({
        title: "Falha ao enviar",
        description: err instanceof Error ? err.message : "Tente novamente ou fale com nossa equipe.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <Card className="max-w-md w-full shadow-lg border-emerald-500/20 bg-white">
          <CardHeader className="text-center pb-2">
            <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4 animate-bounce" />
            <CardTitle className="text-2xl font-bold text-zinc-900">Enviado com Sucesso!</CardTitle>
            <CardDescription className="text-sm text-zinc-500 mt-2">
              Sua ficha de anamnese foi recebida e já está anexada com segurança ao seu prontuário.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-4">
            <p className="text-xs text-zinc-400">
              Você já pode fechar esta guia. A equipe entrará em contato para os próximos passos.
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
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm font-semibold">Validando link de segurança...</p>
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
              {securityError || "Link de preenchimento inválido ou corrompido."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-4 border-t border-border mt-4">
            <p className="text-xs text-zinc-400">
              Para proteger seus dados pessoais, este link é verificado por assinatura digital e expira automaticamente.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isDefault && templateLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <div className="flex flex-col items-center justify-center gap-3 text-zinc-500">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm font-semibold">Carregando ficha de avaliação...</p>
        </div>
      </div>
    );
  }

  if (!isDefault && (templateError || !template)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <Card className="max-w-md w-full shadow-md border-red-500/20">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle className="text-lg font-bold text-zinc-900">Modelo não Encontrado</CardTitle>
            <CardDescription className="text-xs mt-1">
              O formulário solicitado não existe mais ou foi excluído pelo profissional. Entre em contato para gerar um novo link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 md:px-8 flex justify-center">
      <Card className="max-w-2xl w-full shadow-xl border-border bg-white rounded-2xl overflow-hidden">
        {/* Banner */}
        <div className="bg-emerald-500/5 border-b border-emerald-500/10 p-6 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-800 tracking-tight uppercase">
              {!isDefault && template ? template.name : "Ficha de Anamnese"}
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">Preencha com atenção todos os campos solicitados.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-800 border-l-2 border-emerald-500 pl-2 uppercase tracking-wide">
              1. Identificação do Cliente
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="nome" className="flex items-center gap-1.5 justify-between">
                  <span>Nome Completo</span>
                  {initialNome && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400 font-normal bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                      <Lock className="h-2.5 w-2.5" /> Fixado
                    </span>
                  )}
                </Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  readOnly={Boolean(initialNome)}
                  className={initialNome ? "bg-zinc-100 cursor-not-allowed text-zinc-500 font-semibold" : ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="telefone" className="flex items-center gap-1.5 justify-between">
                  <span>Telefone para Contato</span>
                  {initialFone && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400 font-normal bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                      <Lock className="h-2.5 w-2.5" /> Fixado
                    </span>
                  )}
                </Label>
                <Input
                  id="telefone"
                  value={initialFone ? maskPhone(telefone) : telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  required
                  readOnly={Boolean(initialFone)}
                  className={initialFone ? "bg-zinc-100 cursor-not-allowed text-zinc-500 font-semibold" : ""}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="nasc">Data de Nascimento</Label>
                <Input id="nasc" type="date" value={nasc} onChange={(e) => setNasc(e.target.value)} required />
              </div>
            </div>
          </div>

          {/* Dynamic Questions Render (if custom template loaded) */}
          {!isDefault && template ? (
            <div className="space-y-6 pt-4 border-t border-border/80">
              <h2 className="text-sm font-bold text-zinc-800 border-l-2 border-emerald-500 pl-2 uppercase tracking-wide">
                2. Informações de Avaliação
              </h2>

              <div className="space-y-6">
                {template.fields.map((field) => {
                  const answer = answers[field.id];
                  const answerValue =
                    typeof answer === "string" || typeof answer === "number" ? answer : "";
                  const answerText = typeof answer === "string" ? answer : "";
                  return (
                    <div key={field.id} className="space-y-2 border border-border p-4 rounded-xl bg-zinc-50/30">
                      <Label className="text-sm font-bold text-zinc-700 flex items-center justify-between">
                        <span>{field.label} {field.required && <span className="text-destructive">*</span>}</span>
                        {searchParams.has(field.id) && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400 font-normal bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                            <Lock className="h-2.5 w-2.5" /> Fixado
                          </span>
                        )}
                      </Label>

                      {/* Text Input */}
                      {field.type === "text" && (
                        <Input
                          value={answerValue}
                          onChange={(e) => handleDynamicChange(field.id, e.target.value)}
                          required={field.required}
                          readOnly={searchParams.has(field.id)}
                          className={searchParams.has(field.id) ? "bg-zinc-100 cursor-not-allowed text-zinc-500 font-semibold" : ""}
                        />
                      )}

                      {/* Textarea Input */}
                      {field.type === "textarea" && (
                        <Textarea
                          value={answerValue}
                          onChange={(e) => handleDynamicChange(field.id, e.target.value)}
                          required={field.required}
                          rows={3}
                          readOnly={searchParams.has(field.id)}
                          className={searchParams.has(field.id) ? "bg-zinc-100 cursor-not-allowed text-zinc-500 font-semibold" : ""}
                        />
                      )}

                      {/* Number Input */}
                      {field.type === "number" && (
                        <Input
                          type="number"
                          value={answerValue}
                          onChange={(e) => handleDynamicChange(field.id, e.target.value)}
                          required={field.required}
                          readOnly={searchParams.has(field.id)}
                          className={searchParams.has(field.id) ? "bg-zinc-100 cursor-not-allowed text-zinc-500 font-semibold" : ""}
                        />
                      )}

                      {/* Radio / Selection unique */}
                      {field.type === "radio" && (
                        <RadioGroup
                          value={answerText}
                          onValueChange={(val) => handleDynamicChange(field.id, val)}
                          className="flex flex-wrap gap-4 mt-1"
                          disabled={searchParams.has(field.id)}
                        >
                          {(field.options || ["Sim", "Não"]).map((opt: string) => (
                            <div key={opt} className="flex items-center space-x-2">
                              <RadioGroupItem value={opt.toLowerCase()} id={`opt-${field.id}-${opt}`} />
                              <label htmlFor={`opt-${field.id}-${opt}`} className="text-xs font-semibold text-zinc-700 cursor-pointer">
                                {opt}
                              </label>
                            </div>
                          ))}
                        </RadioGroup>
                      )}

                      {/* Checkboxes / Multi selection */}
                      {field.type === "checkbox" && (
                        <div className="flex flex-wrap gap-4 mt-1">
                          {(field.options || []).map((opt: string) => {
                            const checked = ((answers[field.id] as string[]) || []).includes(opt);
                            return (
                              <label key={opt} className="flex items-center gap-1.5 text-xs text-zinc-600 font-semibold cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => handleDynamicCheckboxChange(field.id, opt, e.target.checked)}
                                  disabled={searchParams.has(field.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 disabled:opacity-75 disabled:cursor-not-allowed"
                                />
                                {opt}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Fallback Default Anamnese Layout (Aline Ferreira) */
            <>
              {/* Fallback Section 2: Características e Hábitos */}
              <div className="space-y-4 pt-4 border-t border-border/80">
                <h2 className="text-sm font-bold text-zinc-800 border-l-2 border-emerald-500 pl-2 uppercase tracking-wide">
                  2. Características do Cabelo e Hábitos
                </h2>

                <div className="space-y-2">
                  <Label>Qual o seu tipo de cabelo natural?</Label>
                  <RadioGroup value={cabelo} onValueChange={setCabelo} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {["Liso", "Ondulado", "Cacheado", "Afro", "Sem definição"].map((item) => (
                      <div key={item} className="flex items-center space-x-2 border border-border p-2.5 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors">
                        <RadioGroupItem value={item.toLowerCase()} id={`cabelo-${item}`} />
                        <label htmlFor={`cabelo-${item}`} className="text-xs font-semibold text-zinc-700 cursor-pointer w-full">
                          {item}
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label>Uso freqüente de aparelhos térmicos:</Label>
                    <div className="flex flex-wrap gap-4 mt-1">
                      <label className="flex items-center gap-1.5 text-xs text-zinc-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={usoSecador} onChange={(e) => setUsoSecador(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
                        Secador
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={usoChapinha} onChange={(e) => setUsoChapinha(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
                        Chapinha
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={usoBabyliss} onChange={(e) => setUsoBabyliss(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
                        Babyliss
                      </label>
                    </div>
                    <Input placeholder="Outros equipamentos..." value={usoOutros} onChange={(e) => setUsoOutros(e.target.value)} className="text-xs h-9 mt-1" />
                  </div>

                  <div className="space-y-2">
                    <Label>Realiza penteados com freqüência? (Coques, tranças, etc.)</Label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-zinc-600 font-semibold cursor-pointer">
                        <input type="radio" checked={penteados === "sim"} onChange={() => setPenteados("sim")} className="h-4 w-4 text-emerald-500" />
                        Sim
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-600 font-semibold cursor-pointer">
                        <input type="radio" checked={penteados === "nao"} onChange={() => setPenteados("nao")} className="h-4 w-4 text-emerald-500" />
                        Não
                      </label>
                    </div>
                    {penteados === "sim" && (
                      <Input placeholder="Quais penteados realiza?" value={penteadosDetalhe} onChange={(e) => setPenteadosDetalhe(e.target.value)} className="text-xs h-9 mt-1" />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <Label htmlFor="ocupacao">Ocupação / Profissão</Label>
                    <Input id="ocupacao" placeholder="Ex: Advogada, Estudante" value={ocupacao} onChange={(e) => setOcupacao(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="endereco">Endereço Completo</Label>
                    <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 md:col-span-2">
                    <div className="space-y-1">
                      <Label htmlFor="cep">CEP</Label>
                      <Input id="cep" placeholder="00000-000" value={cep} onChange={(e) => setCep(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="rg">RG</Label>
                      <Input id="rg" value={rg} onChange={(e) => setRg(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cpf">CPF</Label>
                      <Input id="cpf" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Fallback Section 3: Saúde e Histórico Clínico */}
              <div className="space-y-4 pt-4 border-t border-border/80">
                <h2 className="text-sm font-bold text-zinc-800 border-l-2 border-emerald-500 pl-2 uppercase tracking-wide">
                  3. Histórico de Saúde
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 border border-border p-3 rounded-xl bg-zinc-50/50">
                    <Label>Apresenta alguma alergia?</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={alergia === "sim"} onChange={() => setAlergia("sim")} /> Sim</label>
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={alergia === "nao"} onChange={() => setAlergia("nao")} /> Não</label>
                    </div>
                    {alergia === "sim" && <Input placeholder="Especifique..." value={alergiaDetalhe} onChange={(e) => setAlergiaDetalhe(e.target.value)} className="h-8 text-xs" />}
                  </div>

                  <div className="space-y-2 border border-border p-3 rounded-xl bg-zinc-50/50">
                    <Label>Tem alguma química ativa no cabelo?</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={quimica === "sim"} onChange={() => setQuimica("sim")} /> Sim</label>
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={quimica === "nao"} onChange={() => setQuimica("nao")} /> Não</label>
                    </div>
                    {quimica === "sim" && <Input placeholder="Progressiva, descoloração..." value={quimicaDetalhe} onChange={(e) => setQuimicaDetalhe(e.target.value)} className="h-8 text-xs" />}
                  </div>

                  <div className="space-y-2 border border-border p-3 rounded-xl bg-zinc-50/50">
                    <Label>Fez alguma cirurgia recentemente?</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={cirurgia === "sim"} onChange={() => setCirurgia("sim")} /> Sim</label>
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={cirurgia === "nao"} onChange={() => setCirurgia("nao")} /> Não</label>
                    </div>
                    {cirurgia === "sim" && <Input placeholder="Especifique..." value={cirurgiaDetalhe} onChange={(e) => setCirurgiaDetalhe(e.target.value)} className="h-8 text-xs" />}
                  </div>

                  <div className="space-y-2 border border-border p-3 rounded-xl bg-zinc-50/50">
                    <Label>Sente excesso de oleosidade capilar?</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={oleosidade === "sim"} onChange={() => setOleosidade("sim")} /> Sim</label>
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={oleosidade === "nao"} onChange={() => setOleosidade("nao")} /> Não</label>
                    </div>
                    {oleosidade === "sim" && <Input placeholder="Especifique..." value={oleosidadeDetalhe} onChange={(e) => setOleosidadeDetalhe(e.target.value)} className="h-8 text-xs" />}
                  </div>

                  <div className="space-y-2 border border-border p-3 rounded-xl bg-zinc-50/50">
                    <Label>Pratica atividades físicas / esportes?</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={esportes === "sim"} onChange={() => setEsportes("sim")} /> Sim</label>
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={esportes === "nao"} onChange={() => setEsportes("nao")} /> Não</label>
                    </div>
                    {esportes === "sim" && <Input placeholder="Quais..." value={esportesDetalhe} onChange={(e) => setEsportesDetalhe(e.target.value)} className="h-8 text-xs" />}
                  </div>

                  <div className="space-y-2 border border-border p-3 rounded-xl bg-zinc-50/50">
                    <Label>Faz uso de medicação contínua?</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={medicamento === "sim"} onChange={() => setMedicamento("sim")} /> Sim</label>
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={medicamento === "nao"} onChange={() => setMedicamento("nao")} /> Não</label>
                    </div>
                    {medicamento === "sim" && <Input placeholder="Especifique..." value={medicamentoDetalhe} onChange={(e) => setMedicamentoDetalhe(e.target.value)} className="h-8 text-xs" />}
                  </div>

                  <div className="space-y-2 border border-border p-3 rounded-xl bg-zinc-50/50">
                    <Label>Apresenta sensibilidade a dor no couro?</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={sensibilidade === "sim"} onChange={() => setSensibilidade("sim")} /> Sim</label>
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={sensibilidade === "nao"} onChange={() => setSensibilidade("nao")} /> Não</label>
                    </div>
                    {sensibilidade === "sim" && <Input placeholder="Especifique..." value={sensibilidadeDetalhe} onChange={(e) => setSensibilidadeDetalhe(e.target.value)} className="h-8 text-xs" />}
                  </div>

                  <div className="space-y-2 border border-border p-3 rounded-xl bg-zinc-50/50">
                    <Label>Está grávida / gestante?</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={gestante === "sim"} onChange={() => setGestante("sim")} /> Sim</label>
                      <label className="flex items-center gap-1 text-xs"><input type="radio" checked={gestante === "nao"} onChange={() => setGestante("nao")} /> Não</label>
                    </div>
                    {gestante === "sim" && <Input placeholder="Semanas..." value={gestanteSemanas} onChange={(e) => setGestanteSemanas(e.target.value)} className="h-8 text-xs" />}
                  </div>
                </div>
              </div>

              {/* Fallback Section 4: Sintomas e Patologias */}
              <div className="space-y-4 pt-4 border-t border-border/80">
                <h2 className="text-sm font-bold text-zinc-800 border-l-2 border-emerald-500 pl-2 uppercase tracking-wide">
                  4. Sintomas e Patologias (Apresenta algum destes?)
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { label: "Hipertensão / Hipotensão", state: hipertensao, setter: setHipertensao },
                    { label: "Seborreia / Caspa", state: seborreia, setter: setSeborreia },
                    { label: "Alopécia / Calvície", state: alopecia, setter: setAlopecia },
                    { label: "Foliculite capilar", state: foliculite, setter: setFoliculite },
                    { label: "Psoríase no couro", state: psoriase, setter: setPsoriase },
                    { label: "Queda de cabelo", state: queda, setter: setQueda },
                  ].map((item) => (
                    <div key={item.label} className="border border-border p-3 rounded-xl flex flex-col justify-between gap-2 bg-zinc-50/40">
                      <span className="text-xs font-semibold text-zinc-700">{item.label}</span>
                      <div className="flex gap-3">
                        <label className="flex items-center gap-1 text-[11px] font-medium"><input type="radio" checked={item.state === "sim"} onChange={() => item.setter("sim")} /> Sim</label>
                        <label className="flex items-center gap-1 text-[11px] font-medium"><input type="radio" checked={item.state === "nao"} onChange={() => item.setter("nao")} /> Não</label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 border border-border p-3 rounded-xl bg-zinc-50/50 pt-2">
                  <Label>Realiza outro procedimento ou tratamento capilar recente?</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1 text-xs"><input type="radio" checked={outroTratamento === "sim"} onChange={() => setOutroTratamento("sim")} /> Sim</label>
                    <label className="flex items-center gap-1 text-xs"><input type="radio" checked={outroTratamento === "nao"} onChange={() => setOutroTratamento("nao")} /> Não</label>
                  </div>
                  {outroTratamento === "sim" && <Input placeholder="Especifique..." value={outroTratamentoDetalhe} onChange={(e) => setOutroTratamentoDetalhe(e.target.value)} className="h-8 text-xs mt-1" />}
                </div>
              </div>
            </>
          )}

          {/* Assinatura (common) */}
          <div className="space-y-4 pt-4 border-t border-border/80">
            <h2 className="text-sm font-bold text-zinc-800 border-l-2 border-emerald-500 pl-2 uppercase tracking-wide">
              {!isDefault && template ? "3. Assinatura Digital" : "5. Assinatura Digital"}
            </h2>

            <div className="space-y-2">
              <Label>Desenhe sua assinatura no campo abaixo:</Label>
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
                  Limpar Assinatura
                </button>
              </div>
            </div>

            <div className="flex items-start space-x-2.5 mt-2 bg-emerald-50/20 border border-emerald-500/10 p-3.5 rounded-xl">
              <input
                id="declare-checkbox"
                type="checkbox"
                checked={declarationChecked}
                onChange={(e) => setDeclarationChecked(e.target.checked)}
                className="mt-1 h-4.5 w-4.5 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                required
              />
              <label htmlFor="declare-checkbox" className="text-xs text-zinc-600 font-semibold leading-relaxed cursor-pointer select-none">
                Declaro que as informações acima são verdadeiras e completas, autorizando a execução dos procedimentos.
              </label>
            </div>
          </div>

          {/* Submitting button */}
          <div className="pt-4">
            <Button
              id="btn-submit-anamnese"
              type="submit"
              disabled={submitting}
              className="w-full h-12 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
              Enviar Respostas da Ficha
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
