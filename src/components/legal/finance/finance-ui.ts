import { requiredMoney, formatIrMoney } from "../ir/financial/financial-ui";
export { formatIrMoney as money };
export const canonicalMoney = (value: string) => { const result = requiredMoney(value); if (result === null) throw new Error("Informe o valor em reais, com no máximo duas casas decimais."); return result; };
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const OWNERS: Record<string, string> = { external: "Fora da custódia do escritório", client: "Recursos do cliente", office: "Recursos do escritório" };
export const CATEGORIES: Record<string, string> = { fee: "Honorários", cost: "Custas", reimbursement: "Reembolso", advance: "Adiantamento do cliente", client_transfer: "Repasse ao cliente" };
export const STATES: Record<string, string> = { draft: "Rascunho", approved: "Aprovado", rejected: "Não aprovado", returned: "Devolvido para ajuste", cancelled: "Cancelado", not_configured: "Não configurado", ready: "Configurado", disabled: "Desabilitado", sending: "Enviando", provider_accepted: "Cobrança criada", unknown: "Resultado incerto — conferir provedor", failed: "Falha — revisar", reconciled: "Conciliado", needs_reconciliation: "Conferência documental pendente" };
export type Option = { value: string; label: string };
export type FormValues = Record<string, string>;
export interface FinanceField { key: string; label: string; kind?: "text" | "date" | "textarea" | "select" | "money" | "checkbox"; initial?: string; required?: boolean; hint?: string; options?: Option[] | ((values: FormValues) => Option[]); when?: (values: FormValues) => boolean }
export const options = (values: Record<string, string>): Option[] => Object.entries(values).map(([value, label]) => ({ value, label }));

export const noteField: FinanceField = { key: "note", label: "Justificativa da conferência", kind: "textarea" };
