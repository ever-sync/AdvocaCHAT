import { normalizePhone } from "@/lib/phone";

/**
 * Considera "nome valido" qualquer string com pelo menos duas letras seguidas.
 * Strings como "Tel.: 11 99999-9999", "+55 (11) 9.9999-9999", "📱 11 ..." nao passam.
 */
function isMeaningfulCustomerName(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("@s.whatsapp.net") ||
    lower.includes("@lid") ||
    lower.includes("@g.us")
  ) {
    return false;
  }
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length >= 10) {
    return /\p{L}{2,}/u.test(trimmed);
  }
  return /\p{L}/u.test(trimmed) || trimmed.length > 0;
}

/**
 * Nome exibível quando o cadastro não traz nome (import em massa, lead só WhatsApp).
 * Mesma lógica usada ao criar cliente pelo inbox (Edge).
 */
export function fallbackCustomerDisplayName(telefone: string, explicitNome?: string | null): string {
  const trimmed = (explicitNome ?? "").trim();
  if (isMeaningfulCustomerName(trimmed)) {
    return trimmed;
  }

  const normalized = normalizePhone(telefone);
  const digits = normalized.digits.replace(/^55/, "");
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const prefix = digits.length === 11 ? digits.slice(2, 7) : digits.slice(2, 6);
    const suffix = digits.length === 11 ? digits.slice(7, 11) : digits.slice(6, 10);
    return `+55 ${ddd ? `(${ddd}) ` : ""}${prefix}-${suffix}`;
  }

  return "Contato WhatsApp";
}
