import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { LegalField } from "../../LegalShared";
import { selectClassName } from "../../legal-ui";
import type { IrTaxComputation } from "@/types/legal-ir-calculations";
import { formatIrMoney } from "./financial-ui";

export function MoneyField({
  label,
  value,
  onChange,
  required = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <LegalField
      label={label}
      hint={hint ?? "Em reais. Ex.: 1.234,56. Vazio significa não informado."}
    >
      {(id) => (
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          maxLength={24}
          autoComplete="off"
        />
      )}
    </LegalField>
  );
}
export function FinancialSelect({
  label,
  value,
  onChange,
  children,
  required = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <LegalField label={label} hint={hint}>
      {(id) => (
        <select
          id={id}
          className={selectClassName}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        >
          {children}
        </select>
      )}
    </LegalField>
  );
}
export function ComputationDetails({
  value,
  title,
}: {
  value: IrTaxComputation;
  title: string;
}) {
  const rows = [
    ["Rendimento tributável", value.taxable],
    ["Deduções legais", value.legal_deductions],
    ["Desconto simplificado", value.simplified_deduction],
    ["Dedução utilizada", value.deduction_used],
    ["Base de cálculo", value.base],
    ["Parcela a deduzir", value.bracket_deduction],
    ["Imposto antes da redução", value.tax_before_reduction],
    ["Redução aplicada", value.reduction_used],
    ["Imposto apurado", value.tax_due],
  ];
  return (
    <section className="min-w-0 space-y-2 rounded-lg border p-3">
      <h4 className="font-medium">{title}</h4>
      <dl className="space-y-1 text-sm">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex flex-wrap justify-between gap-x-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all font-mono">{formatIrMoney(amount)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Desconto simplificado antes do arredondamento:{" "}
        {value.simplified_deduction_raw}. Alíquota em fração: {value.rate}.
        Redução antes do arredondamento: {value.reduction_raw}. Resíduo no
        limite: {value.boundary_formula_residual}.
      </p>
      <p className="text-xs text-muted-foreground">
        Arredondamento decimal de metade para cima, 2 casas; imposto{" "}
        {value.rounding.tax_stage === "before_reduction"
          ? "arredondado antes da redução"
          : "arredondado ao final"}
        ; redução{" "}
        {value.rounding.reduction_stage === "round"
          ? "arredondada"
          : "mantida exata até o imposto final"}
        .
      </p>
    </section>
  );
}
