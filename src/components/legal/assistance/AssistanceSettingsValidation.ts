/** Positive decimal text only. No floating-point coercion of provider rates or budgets. */
export function assistancePolicyDecimal(
  value: string,
  scale: number,
  integerDigits: number,
): string | null {
  const normalized = value.trim().replace(",", ".");
  const expression = new RegExp(
    `^(?:0|[1-9][0-9]{0,${integerDigits - 1}})(?:\\.[0-9]{1,${scale}})?$`,
  );
  return expression.test(normalized) && /[1-9]/.test(normalized)
    ? normalized
    : null;
}
export function assistancePolicyUrl(value: string | null): boolean {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
