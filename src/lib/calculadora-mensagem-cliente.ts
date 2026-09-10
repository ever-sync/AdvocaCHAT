import {
  HONORARIOS_PARCELAS,
  type HonorariosOferta,
  type RetroativoCalculo,
} from "@/lib/recuperei-honorarios";
import { formatBRL } from "@/lib/format";

function formatMoney(value: number): string {
  return formatBRL(value);
}

export type MensagemOfertaInput = {
  parcelaAtual: number;
  retroativo: RetroativoCalculo;
  oferta: HonorariosOferta;
};

/** Mensagem pronta para WhatsApp — destaca gasto atual, recuperação e custo dos honorários. */
export function buildMensagemOfertaCliente({
  parcelaAtual,
  retroativo,
  oferta,
}: MensagemOfertaInput): string {
  const { mesesElegiveis, valorRetroativo } = retroativo;
  const totalPerdidoNoPeriodo = Math.round(parcelaAtual * mesesElegiveis * 100) / 100;
  const saldoAposHonorarios =
    Math.round((valorRetroativo - oferta.total36x) * 100) / 100;
  const economiaMensalApos = parcelaAtual - oferta.parcelaMensal;

  const linhas = [
    "Olá! Segue o resumo da sua análise de isenção de IR por doença grave:",
    "",
    "📌 *O que você paga hoje*",
    `• Desconto mensal na folha: *${formatMoney(parcelaAtual)}*`,
    `• Nos últimos *${mesesElegiveis} meses*, isso representa cerca de *${formatMoney(totalPerdidoNoPeriodo)}* que você poderia ter deixado de pagar (ou recuperar).`,
    "",
    "💰 *O que você pode receber*",
    `• Valor retroativo estimado: *${formatMoney(valorRetroativo)}*`,
    retroativo.atingiuTeto
      ? `• (Cálculo no teto de ${mesesElegiveis} parcelas — doença há mais de 5 anos.)`
      : `• Referência: ${formatMoney(parcelaAtual)} × ${mesesElegiveis} meses.`,
    "",
    `✅ *Proposta — honorários ${oferta.label}*`,
    `• Parcela dos honorários: *${formatMoney(oferta.parcelaMensal)}/mês* em ${HONORARIOS_PARCELAS}x`,
    `• Total do serviço: *${formatMoney(oferta.total36x)}*`,
    "",
    "🎯 *Por que compensa fechar agora?*",
  ];

  if (economiaMensalApos > 0) {
    linhas.push(
      `• A parcela do serviço (*${formatMoney(oferta.parcelaMensal)}*) é *menor* que o IR que você já paga todo mês (*${formatMoney(parcelaAtual)}*).`,
    );
  } else {
    linhas.push(
      `• Investimento de *${formatMoney(oferta.parcelaMensal)}/mês* para buscar *${formatMoney(valorRetroativo)}* de retorno.`,
    );
  }

  linhas.push(
    `• Depois da isenção aprovada, você *para de pagar* esse desconto de IR na folha — economia de *${formatMoney(parcelaAtual)} todo mês*, para sempre.`,
  );

  if (saldoAposHonorarios > 0) {
    linhas.push(
      `• Mesmo descontando todos os honorários, o saldo estimado fica *positivo em ${formatMoney(saldoAposHonorarios)}* — o retorno é bem maior que a “parcelinha”.`,
    );
  }

  linhas.push(
    "",
    "Não é “pagar mais uma parcela”: é trocar um desconto que você já perde todo mês por um valor que volta para o seu bolso.",
    "",
    "Posso te explicar o passo a passo e já dar entrada no seu processo? 😊",
  );

  return linhas.join("\n");
}
