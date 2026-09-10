// Inteligência de captura compartilhada pela edge function de formulários:
//  - lead scoring (portado de ai-lead-score.ts)
//  - parser leve de user-agent (sem dependência externa)
//  - enriquecimento via ipinfo.io
//  - seleção ponderada de variante A/B

export interface ScoringFactor {
  name: string;
  impact: number;
  description: string;
}

export interface LeadScoreInput {
  data: Record<string, unknown>;
  emailDomain: string;
  phoneValid: boolean;
  timeToCompleteSeconds: number;
  deviceType: string;
  isVPN: boolean;
  isProxy: boolean;
  allRequiredFieldsFilled: boolean;
  isDuplicate: boolean;
  hasUtmSource: boolean;
  fieldsFilledCount: number;
  totalFieldsCount: number;
}

const FREE_EMAIL_PROVIDERS = [
  "gmail.com",
  "hotmail.com",
  "yahoo.com",
  "outlook.com",
  "bol.com.br",
  "uol.com.br",
  "live.com",
  "icloud.com",
];

export function calculateLeadScore(input: LeadScoreInput): { score: number; factors: ScoringFactor[] } {
  const factors: ScoringFactor[] = [];
  let score = 0;

  const isCorporateEmail = input.emailDomain && !FREE_EMAIL_PROVIDERS.some((p) => input.emailDomain.endsWith(p));
  if (isCorporateEmail) {
    score += 20;
    factors.push({ name: "E-mail corporativo", impact: 20, description: `Domínio ${input.emailDomain} indica empresa` });
  } else if (input.emailDomain) {
    score += 8;
    factors.push({ name: "E-mail pessoal", impact: 8, description: "E-mail gratuito detectado" });
  }

  if (input.phoneValid) {
    score += 15;
    factors.push({ name: "Telefone válido", impact: 15, description: "Número de telefone fornecido" });
  }

  const t = input.timeToCompleteSeconds;
  if (t >= 60 && t <= 240) {
    score += 12;
    factors.push({ name: "Tempo ideal", impact: 12, description: `Preencheu em ${t}s — engajamento alto` });
  } else if (t >= 30 && t < 60) {
    score += 6;
    factors.push({ name: "Preenchimento rápido", impact: 6, description: `Preencheu em ${t}s` });
  } else if (t > 240 && t <= 600) {
    score += 4;
    factors.push({ name: "Preenchimento lento", impact: 4, description: `Preencheu em ${t}s — pode indicar hesitação` });
  } else if (t > 0) {
    score += 2;
    factors.push({ name: "Tempo atípico", impact: 2, description: `Tempo de ${t}s fora do padrão` });
  }

  if (input.deviceType === "desktop") {
    score += 8;
    factors.push({ name: "Desktop", impact: 8, description: "Acesso via computador" });
  } else {
    score += 4;
    factors.push({ name: "Dispositivo móvel", impact: 4, description: `Acesso via ${input.deviceType}` });
  }

  if (input.isVPN || input.isProxy) {
    score -= 15;
    factors.push({ name: "VPN/Proxy detectado", impact: -15, description: "Uso de VPN ou proxy pode indicar anonimato" });
  }

  if (input.allRequiredFieldsFilled) {
    score += 10;
    factors.push({ name: "Campos obrigatórios", impact: 10, description: "Todos os campos obrigatórios preenchidos" });
  }

  const fillRatio = input.totalFieldsCount > 0 ? input.fieldsFilledCount / input.totalFieldsCount : 0;
  if (fillRatio >= 0.9) {
    score += 10;
    factors.push({ name: "Formulário completo", impact: 10, description: `${Math.round(fillRatio * 100)}% dos campos preenchidos` });
  } else if (fillRatio >= 0.7) {
    score += 5;
    factors.push({ name: "Formulário parcial", impact: 5, description: `${Math.round(fillRatio * 100)}% dos campos preenchidos` });
  }

  if (input.hasUtmSource) {
    score += 5;
    factors.push({ name: "Campanha rastreada", impact: 5, description: "Lead veio de campanha com UTM" });
  }

  if (input.isDuplicate) {
    score -= 30;
    factors.push({ name: "Lead duplicado", impact: -30, description: "Este lead já foi capturado anteriormente" });
  }

  const name = String(input.data.name ?? input.data.nome ?? "");
  if (name.length > 3 && name.includes(" ")) {
    score += 5;
    factors.push({ name: "Nome completo", impact: 5, description: "Nome com sobrenome fornecido" });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    factors: factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
  };
}

export interface ParsedUserAgent {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  deviceType: string;
  isMobile: boolean;
}

/** Parser leve de UA (sem ua-parser-js): cobre os casos comuns. */
export function parseUserAgent(ua: string): ParsedUserAgent {
  const s = ua || "";
  const isMobile = /Mobile|Android|iPhone|iPod|Windows Phone/i.test(s);
  const isTablet = /iPad|Tablet/i.test(s);

  let browser: string | null = null;
  let browserVersion: string | null = null;
  const browserMatchers: Array<[string, RegExp]> = [
    ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/i],
    ["Opera", /(?:OPR|Opera)\/([\d.]+)/i],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/i],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/i],
    ["Safari", /Version\/([\d.]+).*Safari/i],
  ];
  for (const [name, re] of browserMatchers) {
    const m = s.match(re);
    if (m) {
      browser = name;
      browserVersion = m[1] ?? null;
      break;
    }
  }

  let os: string | null = null;
  if (/Windows NT/i.test(s)) os = "Windows";
  else if (/Android/i.test(s)) os = "Android";
  else if (/(iPhone|iPad|iPod)/i.test(s)) os = "iOS";
  else if (/Mac OS X/i.test(s)) os = "macOS";
  else if (/Linux/i.test(s)) os = "Linux";

  const deviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";
  return { browser, browserVersion, os, deviceType, isMobile: isMobile && !isTablet };
}

export interface IpEnrichment {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  isp: string | null;
  org: string | null;
  isVpn: boolean;
  isProxy: boolean;
  isHosting: boolean;
}

/** Consulta ipinfo.io (token opcional via IPINFO_TOKEN). Retorna null em falha. */
export async function fetchIpEnrichment(ip: string): Promise<IpEnrichment | null> {
  if (!ip || ip === "0.0.0.0" || ip === "127.0.0.1") return null;
  const token = Deno.env.get("IPINFO_TOKEN");
  try {
    const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json${token ? `?token=${token}` : ""}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const loc = typeof data.loc === "string" ? data.loc.split(",") : [];
    const privacy = (data.privacy as Record<string, unknown> | undefined) ?? {};
    return {
      city: (data.city as string) ?? null,
      region: (data.region as string) ?? null,
      country: (data.country as string) ?? null,
      countryCode: (data.country as string) ?? null,
      latitude: loc[0] ? Number(loc[0]) : null,
      longitude: loc[1] ? Number(loc[1]) : null,
      timezone: (data.timezone as string) ?? null,
      isp: (data.org as string) ?? null,
      org: (data.org as string) ?? null,
      isVpn: Boolean(privacy.vpn),
      isProxy: Boolean(privacy.proxy),
      isHosting: Boolean(privacy.hosting),
    };
  } catch (_err) {
    return null;
  }
}

export interface WeightedVariant {
  id: string;
  weight: number | null;
}

/** Seleção aleatória ponderada pelo peso da variante. */
export function pickWeightedVariant<T extends WeightedVariant>(variants: T[]): T | null {
  if (variants.length === 0) return null;
  const total = variants.reduce((sum, v) => sum + (v.weight ?? 50), 0);
  if (total <= 0) return variants[0];
  let r = Math.random() * total;
  for (const v of variants) {
    r -= v.weight ?? 50;
    if (r <= 0) return v;
  }
  return variants[0];
}

const PHONE_DIGITS_MIN = 10;
const PHONE_DIGITS_MAX = 15;

export function isPhoneValueValid(value: unknown): boolean {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < PHONE_DIGITS_MIN || digits.length > PHONE_DIGITS_MAX) return false;
  return !/^(\d)\1+$/.test(digits);
}
