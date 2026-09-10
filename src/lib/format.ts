// Formatadores de exibição compartilhados. Evita reimplementar o mesmo
// Intl.NumberFormat/toLocaleString espalhado pelas telas e reusa uma única
// instância de formatter (mais barato que recriar a cada chamada).

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formata um valor em reais como moeda BRL (ex.: 1234.5 -> "R$ 1.234,50"). */
export function formatBRL(value: number | null | undefined): string {
  return brlFormatter.format(value ?? 0);
}

/**
 * Dispara o download de um Blob no navegador. Centraliza a mecânica
 * (object URL + âncora + revoke) usada nas exportações de CSV.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
