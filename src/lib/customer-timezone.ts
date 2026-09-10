/**
 * Infere o fuso horário do cliente a partir do telefone em formato E164 (ou só dígitos).
 *
 * Brasil é tratado em granularidade de DDD (3 fusos efetivos: BRT, AMT, ACT).
 * Outros países usam um único fuso "principal" do país — fica errado em
 * países com vários fusos (US, RU, AU, CA, CN considerada UTC+8 oficial),
 * mas é o suficiente pra um indicador visual que avisa "atenção, esse cara
 * pode estar em outro horário".
 *
 * Retorna null quando:
 *  - sem dígitos suficientes
 *  - DDD inválido (Brasil)
 *  - DDI desconhecido
 */

export type CustomerTimezone = {
  /** IANA timezone (ex.: "America/Sao_Paulo"). */
  timezone: string;
  /** Rótulo curto pra UI (ex.: "Manaus", "Lisboa"). */
  label: string;
};

/** DDDs brasileiros que NÃO seguem America/Sao_Paulo. */
const BRAZIL_DDD_OVERRIDES: Record<string, CustomerTimezone> = {
  // Acre — UTC-5
  "68": { timezone: "America/Rio_Branco", label: "Rio Branco" },
  // Amazonas — UTC-4
  "92": { timezone: "America/Manaus", label: "Manaus" },
  "97": { timezone: "America/Manaus", label: "Manaus" },
  // Roraima — UTC-4
  "95": { timezone: "America/Boa_Vista", label: "Boa Vista" },
  // Rondônia — UTC-4
  "69": { timezone: "America/Porto_Velho", label: "Porto Velho" },
  // Mato Grosso — UTC-4
  "65": { timezone: "America/Cuiaba", label: "Cuiabá" },
  "66": { timezone: "America/Cuiaba", label: "Cuiabá" },
  // Mato Grosso do Sul — UTC-4
  "67": { timezone: "America/Campo_Grande", label: "Campo Grande" },
};

/**
 * DDIs comuns → fuso "padrão" do país.
 * Ordenado pelo prefixo mais longo primeiro pra evitar match parcial.
 */
const COUNTRY_DI_TIMEZONES: ReadonlyArray<{ di: string; timezone: string; label: string }> = [
  // Reino Unido (44) precisa vir antes de 4? — não há DDI "4" isolado.
  { di: "351", timezone: "Europe/Lisbon", label: "Portugal" },
  { di: "353", timezone: "Europe/Dublin", label: "Irlanda" },
  { di: "590", timezone: "America/Guadeloupe", label: "Guadalupe" },
  { di: "591", timezone: "America/La_Paz", label: "Bolívia" },
  { di: "595", timezone: "America/Asuncion", label: "Paraguai" },
  { di: "598", timezone: "America/Montevideo", label: "Uruguai" },
  { di: "971", timezone: "Asia/Dubai", label: "Dubai" },
  { di: "972", timezone: "Asia/Jerusalem", label: "Israel" },
  { di: "27", timezone: "Africa/Johannesburg", label: "África do Sul" },
  { di: "31", timezone: "Europe/Amsterdam", label: "Holanda" },
  { di: "32", timezone: "Europe/Brussels", label: "Bélgica" },
  { di: "33", timezone: "Europe/Paris", label: "França" },
  { di: "34", timezone: "Europe/Madrid", label: "Espanha" },
  { di: "39", timezone: "Europe/Rome", label: "Itália" },
  { di: "41", timezone: "Europe/Zurich", label: "Suíça" },
  { di: "43", timezone: "Europe/Vienna", label: "Áustria" },
  { di: "44", timezone: "Europe/London", label: "Reino Unido" },
  { di: "45", timezone: "Europe/Copenhagen", label: "Dinamarca" },
  { di: "46", timezone: "Europe/Stockholm", label: "Suécia" },
  { di: "47", timezone: "Europe/Oslo", label: "Noruega" },
  { di: "48", timezone: "Europe/Warsaw", label: "Polônia" },
  { di: "49", timezone: "Europe/Berlin", label: "Alemanha" },
  { di: "51", timezone: "America/Lima", label: "Peru" },
  { di: "52", timezone: "America/Mexico_City", label: "México" },
  { di: "53", timezone: "America/Havana", label: "Cuba" },
  { di: "54", timezone: "America/Argentina/Buenos_Aires", label: "Argentina" },
  // 55 é Brasil — tratado separadamente
  { di: "56", timezone: "America/Santiago", label: "Chile" },
  { di: "57", timezone: "America/Bogota", label: "Colômbia" },
  { di: "58", timezone: "America/Caracas", label: "Venezuela" },
  { di: "60", timezone: "Asia/Kuala_Lumpur", label: "Malásia" },
  { di: "61", timezone: "Australia/Sydney", label: "Austrália" },
  { di: "62", timezone: "Asia/Jakarta", label: "Indonésia" },
  { di: "64", timezone: "Pacific/Auckland", label: "Nova Zelândia" },
  { di: "81", timezone: "Asia/Tokyo", label: "Japão" },
  { di: "82", timezone: "Asia/Seoul", label: "Coreia do Sul" },
  { di: "86", timezone: "Asia/Shanghai", label: "China" },
  { di: "91", timezone: "Asia/Kolkata", label: "Índia" },
  { di: "1", timezone: "America/New_York", label: "EUA/Canadá" },
  { di: "7", timezone: "Europe/Moscow", label: "Rússia" },
];

/** Remove tudo que não for dígito. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Para um telefone brasileiro (com DDI 55), retorna o fuso pelo DDD.
 * Default America/Sao_Paulo.
 */
function brazilianTimezone(digits: string): CustomerTimezone {
  // Esperado: 55 + DDD(2) + número(8 ou 9). Se vier curto, ainda usamos default.
  const ddd = digits.slice(2, 4);
  return BRAZIL_DDD_OVERRIDES[ddd] ?? { timezone: "America/Sao_Paulo", label: "Brasília" };
}

export function inferCustomerTimezone(phone: string | null | undefined): CustomerTimezone | null {
  if (!phone) return null;
  const digits = onlyDigits(phone);
  if (digits.length < 7) return null;

  if (digits.startsWith("55")) {
    return brazilianTimezone(digits);
  }

  const match = COUNTRY_DI_TIMEZONES.find((entry) => digits.startsWith(entry.di));
  if (!match) return null;
  return { timezone: match.timezone, label: match.label };
}

/**
 * Formata a hora atual no fuso indicado (ex.: "14:32").
 * Retorna null se o fuso for inválido ou o ambiente não suportar Intl.
 */
export function formatLocalTime(timezone: string, now: Date = new Date()): string | null {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(now);
  } catch {
    return null;
  }
}
