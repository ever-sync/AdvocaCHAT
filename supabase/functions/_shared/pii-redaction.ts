// Redação de PII antes de mandar texto pro provedor de LLM (Anthropic/OpenAI).
// Foco em alto-risco regulatório no Brasil: CPF, CNPJ, RG, CNH e cartão de
// crédito. Telefone e e-mail NÃO são mascarados — a IA precisa deles pra
// chamar set_custom_field e create_task com o dado real do cliente.
//
// Estratégia: validar dígito verificador antes de mascarar (evita falso
// positivo em ID interno, código de pedido, etc.). Cartão usa Luhn.

const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const RG_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dXx]\b/g;
// CNH = 11 dígitos. Sem ponto/hífen, mas validação por DV protege.
const CNH_RE = /\b\d{11}\b/g;
// Cartão: 13-19 dígitos contíguos, com espaços ou hífens opcionais entre grupos.
const CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function isValidCpf(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (slice: string, factor: number) => {
    let sum = 0;
    for (const c of slice) {
      sum += Number(c) * factor;
      factor--;
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(d.slice(0, 9), 10) === Number(d[9]) &&
    calc(d.slice(0, 10), 11) === Number(d[10]);
}

function isValidCnpj(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const calc = (slice: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) sum += Number(slice[i]) * weights[i];
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return calc(d.slice(0, 12), w1) === Number(d[12]) &&
    calc(d.slice(0, 13), w2) === Number(d[13]);
}

function isValidCnh(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum1 = 0, sum2 = 0;
  for (let i = 0, w = 9; i < 9; i++, w--) sum1 += Number(d[i]) * w;
  let dv1 = sum1 % 11;
  let dsc = 0;
  if (dv1 >= 10) {
    dv1 = 0;
    dsc = 2;
  }
  for (let i = 0, w = 1; i < 9; i++, w++) sum2 += Number(d[i]) * w;
  let dv2 = (sum2 % 11) - dsc;
  if (dv2 < 0) dv2 += 11;
  if (dv2 >= 10) dv2 = 0;
  return dv1 === Number(d[9]) && dv2 === Number(d[10]);
}

function isValidLuhn(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

// RG não tem algoritmo de DV padrão entre estados; aceita formato "9.999.999-X"
// (com pontuação) como indicativo. Sem pontuação dá falso positivo demais.
function looksLikeRgFormatted(raw: string): boolean {
  return /\d{1,2}\.\d{3}\.\d{3}-[\dXx]/.test(raw);
}

/**
 * Mascara PII no texto. Cada match validado vira um placeholder fixo —
 * não geramos IDs porque o LLM não precisa reconciliar (a operação humana
 * faz isso no handoff).
 */
export function redactPii(text: string): string {
  if (!text) return text;
  let out = text;
  // CNPJ antes de CPF (CPF não tem barra, evita ambiguidade).
  out = out.replace(CNPJ_RE, (m) => (isValidCnpj(m) ? "[CNPJ]" : m));
  out = out.replace(CPF_RE, (m) => (isValidCpf(m) ? "[CPF]" : m));
  out = out.replace(RG_RE, (m) => (looksLikeRgFormatted(m) ? "[RG]" : m));
  // CARD antes de CNH (cartão pode ter 11+ dígitos; Luhn é o filtro).
  out = out.replace(CARD_RE, (m) => (isValidLuhn(m) ? "[CARD]" : m));
  out = out.replace(CNH_RE, (m) => (isValidCnh(m) ? "[CNH]" : m));
  return out;
}
