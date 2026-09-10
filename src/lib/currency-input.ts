/** Entrada monetária BR: dígitos são centavos (ex.: digitar 15000 → R$ 150,00). */

export function parseCurrencyInput(value: string): number {
  const digits = value.replace(/\D/g, "");
  return Number(digits || 0) / 100;
}

export function formatCurrencyInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Atualiza o texto do input já formatado enquanto o usuário digita. */
export function maskCurrencyInputChange(raw: string): string {
  const amount = parseCurrencyInput(raw);
  return amount > 0 ? formatCurrencyInput(amount) : "";
}
