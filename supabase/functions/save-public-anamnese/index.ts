import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

function generateAnamneseHtml(data: Record<string, unknown>, signatureBase64: string): string {
  const formatCheck = (val: unknown) => (val === "sim" || val === true ? "✅ Sim" : "❌ Não");
  const formatValue = (val: unknown) => (val ? String(val) : "Não informado");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Ficha de Anamnese - ${data.nome || "Cliente"}</title>
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
    }
    .header h1 {
      margin: 0;
      font-size: 26px;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .header p {
      margin: 5px 0 0 0;
      color: #6b7280;
      font-size: 14px;
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
      font-size: 14px;
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
    .checkbox-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
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
    <p>Documento digital emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
  </div>

  <!-- Dados Pessoais -->
  <div class="section">
    <div class="section-title">Dados Pessoais</div>
    <div class="section-content">
      <div class="grid">
        <div class="field"><div class="label">Nome Completo</div><div class="value">${formatValue(data.nome)}</div></div>
        <div class="field"><div class="label">Data de Nascimento</div><div class="value">${formatValue(data.nasc)}</div></div>
        <div class="field"><div class="label">Ocupação</div><div class="value">${formatValue(data.ocupacao)}</div></div>
        <div class="field"><div class="label">Telefone</div><div class="value">${formatValue(data.telefone)}</div></div>
        <div class="field"><div class="label">Endereço</div><div class="value">${formatValue(data.endereco)}</div></div>
        <div class="field"><div class="label">CEP</div><div class="value">${formatValue(data.cep)}</div></div>
        <div class="field"><div class="label">RG</div><div class="value">${formatValue(data.rg)}</div></div>
        <div class="field"><div class="label">CPF</div><div class="value">${formatValue(data.cpf)}</div></div>
      </div>
    </div>
  </div>

  <!-- Tipo de Cabelo e Hábitos -->
  <div class="section">
    <div class="section-title">Tipo de Cabelo e Hábitos</div>
    <div class="section-content">
      <div class="grid">
        <div class="field"><div class="label">Tipo de Cabelo</div><div class="value">${formatValue(data.cabelo)}</div></div>
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

  <!-- Saúde e Histórico Médico -->
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

  <!-- Condições Identificadas -->
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

  <!-- Declaração e Assinatura -->
  <div class="signature-area">
    <p class="consent-text">
      Confirmo que todas as declarações acima são verdadeiras e não cabe ao profissional qualquer responsabilidade por informações omitidas nesta avaliação. Estou ciente e de acordo com os procedimentos indicados.
    </p>
    ${signatureBase64 ? `<img class="signature-img" src="${signatureBase64}" alt="Assinatura do Cliente" />` : `<div style="height: 60px; margin-bottom: 10px;"></div>`}
    <div class="label">${data.nome || "Assinatura do Cliente"}</div>
    <div style="font-size: 11px; color: #9ca3af;">IP: ${formatValue(data.ip_address)} · Dispositivo: ${formatValue(data.user_agent)}</div>
  </div>

</body>
</html>`;
}

// Helpers for PT-BR date formatting
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function format(date: Date, fmtStr: string, _opt?: unknown): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return fmtStr
    .replace("dd", dd)
    .replace("MM", mm)
    .replace("yyyy", String(yyyy))
    .replace("HH", hh)
    .replace("mm", min);
}
const ptBR = {};

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not supported" }, 405);
  }

  try {
    const body = await req.json();
    const { negotiationId, customerId, tenantId, clientData, signatureBase64 } = body;

    if (!negotiationId || !customerId || !tenantId || !clientData) {
      return jsonResponse({ error: "Missing required parameters" }, 400);
    }

    const admin = createAdminClient();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const userAgent = req.headers.get("user-agent") ?? "";

    // Enrich clientData with metadata
    clientData.ip_address = ip;
    clientData.user_agent = userAgent;

    // Fetch customer details to construct a nice display name
    const { data: customer } = await admin
      .from("customers")
      .select("nome")
      .eq("tenant_id", tenantId)
      .eq("id", customerId)
      .maybeSingle();

    const customerName = customer?.nome || "Cliente";

    // Generate HTML content
    const htmlContent = generateAnamneseHtml(clientData, signatureBase64);

    // Upload file to Supabase storage
    const storagePath = `${tenantId}/${negotiationId}/${crypto.randomUUID()}_anamnese.html`;

    const { error: uploadError } = await admin.storage
      .from("crm-lead-documents")
      .upload(storagePath, new Blob([htmlContent], { type: "text/html" }), {
        contentType: "text/html",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("[save-public-anamnese] upload error:", uploadError.message);
      return jsonResponse({ error: uploadError.message }, 500);
    }

    // Insert into crm_negotiation_documents
    const { data: doc, error: insertError } = await admin
      .from("crm_negotiation_documents")
      .insert({
        tenant_id: tenantId,
        negotiation_id: negotiationId,
        display_name: `[Anamnese] Ficha de Anamnese - ${customerName}`,
        storage_path: storagePath,
        file_name: `anamnese_${customerName.toLowerCase().replace(/\s+/g, "_")}.html`,
        mime_type: "text/html",
        file_size: htmlContent.length,
        uploaded_by: null, // Submitted by customer anonymously
      })
      .select()
      .single();

    if (insertError) {
      console.error("[save-public-anamnese] insert error:", insertError.message);
      // Try to cleanup file from storage
      await admin.storage.from("crm-lead-documents").remove([storagePath]);
      return jsonResponse({ error: insertError.message }, 500);
    }

    return jsonResponse({ success: true, document: doc });
  } catch (err) {
    console.error("[save-public-anamnese] exception:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});
