export interface NormalizedPhone {
  raw: string;
  digits: string;
  e164: string | null;
  jid: string | null;
}

function isValidBrazilianDdd(twoDigits: string) {
  if (twoDigits.length !== 2) return false;
  const ddd = Number.parseInt(twoDigits, 10);
  return Number.isFinite(ddd) && ddd >= 11 && ddd <= 99;
}

function trimNationalDigits(digits: string): string | null {
  if (digits.length < 10) return null;
  if (digits.length === 10 || digits.length === 11) return digits;

  /* Caso 1: prefixo de operadora (ex.: "0 21 11 98765-4321"). Já entra aqui
   * sem o "0" inicial, então testamos remover só o par de operadora e ver se o
   * resto vira um nacional válido (10 ou 11 dígitos com DDD valido). */
  const withoutCarrier = digits.slice(2);
  if (
    (withoutCarrier.length === 10 || withoutCarrier.length === 11) &&
    isValidBrazilianDdd(withoutCarrier.slice(0, 2))
  ) {
    return withoutCarrier;
  }

  /* Caso 2: importações com lixo no fim (extensão/ID interno). Preferimos a
   * janela INICIAL se ela começar com DDD válido. */
  const head11 = digits.slice(0, 11);
  if (isValidBrazilianDdd(head11.slice(0, 2))) return head11;

  const head10 = digits.slice(0, 10);
  if (isValidBrazilianDdd(head10.slice(0, 2))) return head10;

  /* Caso 3: fallback legado. */
  return digits.slice(-11);
}

function canonicalizeBrazilianPhoneDigits(rawDigits: string) {
  if (rawDigits.startsWith("55")) {
    const nationalDigits = trimNationalDigits(rawDigits.slice(2));
    return nationalDigits ? `55${nationalDigits}` : null;
  }

  const nationalDigits = trimNationalDigits(rawDigits.replace(/^0+/, ""));
  return nationalDigits ? `55${nationalDigits}` : null;
}

export function normalizePhone(rawPhone: string): NormalizedPhone {
  const rawDigits = rawPhone.replace(/\D/g, "");

  if (!rawDigits) {
    return {
      raw: rawPhone,
      digits: "",
      e164: null,
      jid: null,
    };
  }

  const digits = canonicalizeBrazilianPhoneDigits(rawDigits);

  if (!digits) {
    return {
      raw: rawPhone,
      digits: "",
      e164: null,
      jid: null,
    };
  }

  return {
    raw: rawPhone,
    digits,
    e164: `+${digits}`,
    jid: `${digits}@s.whatsapp.net`,
  };
}

export function buildChatDisplayName(name?: string | null, phone?: string | null) {
  return name?.trim() || phone?.trim() || "Sem nome";
}
