import { formatBRL } from "@/lib/format";

/** Tabela de honorários (parcela mensal × 36) — faixa por remuneração. */

export const HONORARIOS_PARCELAS = 36;

/** Teto da janela retroativa de IR (5 anos). */
export const RETROATIVO_MAX_MESES = 60;

export type HonorariosTierId = "20" | "25" | "30";

export type HonorariosFaixa = {
  min: number;
  max: number | null;
  parcelaMensal: number;
};

/** Faixas base (+20%). Outros percentuais podem usar multiplicador sobre a parcela. */
export const FAIXAS_BASE_20: HonorariosFaixa[] = [
  { min: 0, max: 6_500, parcelaMensal: 155 },
  { min: 6_500.01, max: 8_000, parcelaMensal: 300 },
  { min: 8_000.01, max: 10_000, parcelaMensal: 480 },
  { min: 10_000.01, max: 15_000, parcelaMensal: 660 },
  { min: 15_000.01, max: 20_000, parcelaMensal: 840 },
  { min: 20_000.01, max: 25_000, parcelaMensal: 905 },
  { min: 25_000.01, max: 30_000, parcelaMensal: 1_025 },
  { min: 30_000.01, max: 35_000, parcelaMensal: 1_210 },
  { min: 35_000.01, max: null, parcelaMensal: 1_330 },
];

/** Percentual dos honorários sobre a parcela mensal informada (ex.: 20% de R$ 300 = R$ 60). */
export const HONORARIOS_PERCENTUAL: Record<HonorariosTierId, number> = {
  "20": 0.2,
  "25": 0.25,
  "30": 0.3,
};

/** Ajuste entre faixas da tabela salarial (+20% / +25% / +30% sobre a parcela da tabela). */
const FAIXA_TIER_MULTIPLIER: Record<HonorariosTierId, number> = {
  "20": 1,
  "25": 1.25 / 1.2,
  "30": 1.3 / 1.2,
};

export const HONORARIOS_TIER_OPCOES: { id: HonorariosTierId; label: string }[] = [
  { id: "20", label: "20%" },
  { id: "25", label: "25%" },
  { id: "30", label: "30%" },
];

export type HonorariosOferta = {
  tier: HonorariosTierId;
  label: string;
  parcelaMensal: number;
  total36x: number;
};

export type HonorariosFaixaId =
  | "faixa-0"
  | "faixa-1"
  | "faixa-2"
  | "faixa-3"
  | "faixa-4"
  | "faixa-5"
  | "faixa-6"
  | "faixa-7"
  | "faixa-8";

export type HonorariosFaixaOpcao = {
  id: HonorariosFaixaId;
  label: string;
  faixa: HonorariosFaixa;
};

function formatFaixaMoeda(value: number): string {
  return formatBRL(value);
}

export function labelFaixaRemuneracao(faixa: HonorariosFaixa, index: number): string {
  if (index === 0 && faixa.max != null) {
    return `Até ${formatFaixaMoeda(faixa.max)}`;
  }
  if (faixa.max == null) {
    return `A partir de ${formatFaixaMoeda(faixa.min)}`;
  }
  return `${formatFaixaMoeda(faixa.min)} e ${formatFaixaMoeda(faixa.max)}`;
}

/** Opções do select de faixa salarial (remuneração). */
export const HONORARIOS_FAIXAS_OPCOES: HonorariosFaixaOpcao[] = FAIXAS_BASE_20.map(
  (faixa, index) => ({
    id: `faixa-${index}` as HonorariosFaixaId,
    label: labelFaixaRemuneracao(faixa, index),
    faixa,
  }),
);

export function honorariosPorFaixaId(
  faixaId: HonorariosFaixaId,
  tier: HonorariosTierId = "20",
): HonorariosFaixa | null {
  const opcao = HONORARIOS_FAIXAS_OPCOES.find((o) => o.id === faixaId);
  if (!opcao) {
    return null;
  }
  const mult = FAIXA_TIER_MULTIPLIER[tier];
  return {
    ...opcao.faixa,
    parcelaMensal: Math.round(opcao.faixa.parcelaMensal * mult * 100) / 100,
  };
}

/** Três ofertas (20%, 25%, 30% da parcela mensal) × 36 parcelas. */
export function honorariosOfertasPorParcela(parcelaAtual: number): HonorariosOferta[] | null {
  if (!Number.isFinite(parcelaAtual) || parcelaAtual <= 0) {
    return null;
  }
  return HONORARIOS_TIER_OPCOES.map(({ id, label }) => {
    const parcelaMensal =
      Math.round(parcelaAtual * HONORARIOS_PERCENTUAL[id] * 100) / 100;
    return {
      tier: id,
      label,
      parcelaMensal,
      total36x: totalHonorarios(parcelaMensal),
    };
  });
}

/** Três ofertas para a faixa salarial (usa parcela fixa da tabela, não % sobre IR). */
export function honorariosOfertasPorFaixaId(faixaId: HonorariosFaixaId): HonorariosOferta[] | null {
  const opcao = HONORARIOS_FAIXAS_OPCOES.find((o) => o.id === faixaId);
  if (!opcao) {
    return null;
  }
  return HONORARIOS_TIER_OPCOES.map(({ id, label }) => {
    const parcelaMensal =
      Math.round(opcao.faixa.parcelaMensal * FAIXA_TIER_MULTIPLIER[id] * 100) / 100;
    return {
      tier: id,
      label,
      parcelaMensal,
      total36x: totalHonorarios(parcelaMensal),
    };
  });
}

export function lookupHonorariosPorRemuneracao(
  remuneracao: number,
  tier: HonorariosTierId = "20",
): HonorariosFaixa | null {
  if (!Number.isFinite(remuneracao) || remuneracao < 0) {
    return null;
  }
  const mult = FAIXA_TIER_MULTIPLIER[tier];
  for (const faixa of FAIXAS_BASE_20) {
    const maxOk = faixa.max == null || remuneracao <= faixa.max;
    if (remuneracao >= faixa.min && maxOk) {
      return {
        ...faixa,
        parcelaMensal: Math.round(faixa.parcelaMensal * mult * 100) / 100,
      };
    }
  }
  return null;
}

export function totalHonorarios(parcelaMensal: number): number {
  return Math.round(parcelaMensal * HONORARIOS_PARCELAS * 100) / 100;
}

export type RetroativoCalculo = {
  /** Meses entre a data da doença e hoje, limitado a 60. */
  mesesElegiveis: number;
  /** Atingiu o teto de 60 meses (doença há mais de 5 anos). */
  atingiuTeto: boolean;
  valorRetroativo: number;
  /** Data da doença no futuro. */
  dataInvalida?: "futura";
};

/**
 * Meses corridos da data da doença até a referência (padrão: hoje).
 * Ex.: doença há 3 anos ≈ 36 meses → retroativo = parcela IR × 36 (máx. 60).
 */
export function mesesRetroativosElegiveis(
  dataDoenca: Date,
  referenceDate: Date = new Date(),
): number {
  if (Number.isNaN(dataDoenca.getTime()) || Number.isNaN(referenceDate.getTime())) {
    return 0;
  }
  if (dataDoenca > referenceDate) {
    return 0;
  }

  let months =
    (referenceDate.getFullYear() - dataDoenca.getFullYear()) * 12 +
    (referenceDate.getMonth() - dataDoenca.getMonth());

  if (referenceDate.getDate() < dataDoenca.getDate()) {
    months -= 1;
  }

  months = Math.max(0, months);

  return Math.min(RETROATIVO_MAX_MESES, months);
}

export function calcularRetroativo(
  irMensalParcela: number,
  dataDoenca: Date | null,
  referenceDate: Date = new Date(),
): RetroativoCalculo | null {
  if (!Number.isFinite(irMensalParcela) || irMensalParcela < 0) {
    return null;
  }
  if (!dataDoenca || Number.isNaN(dataDoenca.getTime())) {
    return null;
  }
  if (dataDoenca > referenceDate) {
    return {
      mesesElegiveis: 0,
      atingiuTeto: false,
      valorRetroativo: 0,
      dataInvalida: "futura",
    };
  }

  const mesesBrutos =
    (referenceDate.getFullYear() - dataDoenca.getFullYear()) * 12 +
    (referenceDate.getMonth() - dataDoenca.getMonth()) -
    (referenceDate.getDate() < dataDoenca.getDate() ? 1 : 0);
  const mesesBrutosPositivos = Math.max(0, mesesBrutos);
  const mesesElegiveis = Math.min(RETROATIVO_MAX_MESES, mesesBrutosPositivos);
  const atingiuTeto = mesesBrutosPositivos > RETROATIVO_MAX_MESES;

  return {
    mesesElegiveis,
    atingiuTeto,
    valorRetroativo: Math.round(irMensalParcela * mesesElegiveis * 100) / 100,
  };
}

/** Teto máximo (60 × parcela) — quando a doença é anterior a 5 anos. */
export function retroativoTetoMaximo(irMensalParcela: number): number {
  if (!Number.isFinite(irMensalParcela) || irMensalParcela < 0) {
    return 0;
  }
  return Math.round(irMensalParcela * RETROATIVO_MAX_MESES * 100) / 100;
}
