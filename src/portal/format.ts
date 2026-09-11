export const PORTAL_CATEGORIES = {
  general: "Geral",
  medical: "Saúde",
  fiscal: "Fiscal",
} as const;
export function portalDate(value: string | null | undefined) {
  if (!value) return "Não informado";
  const day = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) return `${day[3]}/${day[2]}/${day[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não disponível"
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}
export function portalDownload(result: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.filename;
  link.rel = "noreferrer";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
