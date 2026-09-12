import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  costDocuments,
  recordOperationalCost,
} from "@/lib/api/legal-readiness";
const kindLabels = {
  actual: "Efetivo documentado",
  estimate: "Estimativa",
  budget: "Orçamento",
};
export function OperationalCostForm({
  caseId,
  onSaved,
}: {
  caseId: string;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [kind, setKind] = useState("estimate");
  const controller = useRef<AbortController | null>(null),
    last = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const documents = useQuery({
    queryKey: ["legal", caseId, "cost-documents"],
    queryFn: ({ signal }) => costDocuments(caseId, signal),
  });
  return (
    <form
      className="grid gap-3 border-t pt-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = Object.fromEntries(
            new FormData(e.currentTarget).entries(),
          ),
          body = {
            ...data,
            evidence_document_id: data.evidence_document_id || null,
          };
        const encoded = JSON.stringify(body);
        if (last.current?.body !== encoded)
          last.current = { body: encoded, key: crypto.randomUUID() };
        controller.current?.abort();
        const c = new AbortController();
        controller.current = c;
        setBusy(true);
        setMessage("");
        void recordOperationalCost(
          caseId,
          { ...body, idempotency_key: last.current.key },
          c.signal,
        )
          .then(() => {
            if (!c.signal.aborted) {
              setMessage(
                "Custo registrado. Correções devem ser documentadas antes de registrar novo lançamento.",
              );
              onSaved();
            }
          })
          .catch((e) => {
            if (!c.signal.aborted) setMessage((e as Error).message);
          })
          .finally(() => {
            if (!c.signal.aborted) setBusy(false);
          });
      }}
    >
      <h3 className="font-medium sm:col-span-2">Registrar custo do caso</h3>
      <label className="space-y-1 text-sm">
        Natureza
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="w-full rounded border bg-background p-2"
        >
          {Object.entries(kindLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        Categoria
        <select
          name="category"
          className="w-full rounded border bg-background p-2"
        >
          {Object.entries({
            infrastructure: "Infraestrutura",
            storage: "Armazenamento",
            monitoring: "Monitoramento",
            signature: "Assinatura",
            messages: "Mensagens",
            ai: "IA",
            other: "Outro",
          }).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        Valor
        <Input
          name="amount"
          inputMode="decimal"
          pattern="[0-9]+([.][0-9]{1,2})?"
          placeholder="0.00"
          required
        />
      </label>
      <label className="space-y-1 text-sm">
        Moeda
        <Input
          name="currency"
          defaultValue="BRL"
          pattern="[A-Z]{3}"
          maxLength={3}
          required
        />
      </label>
      <label className="space-y-1 text-sm">
        Início do período
        <Input type="date" name="period_start" required />
      </label>
      <label className="space-y-1 text-sm">
        Fim do período
        <Input type="date" name="period_end" required />
      </label>
      <label className="space-y-1 text-sm">
        Fonte da cobrança ou tarifa
        <Input name="source" maxLength={1000} required />
      </label>
      <label className="space-y-1 text-sm">
        Critério de atribuição ao caso
        <Input name="allocation_method" maxLength={2000} required />
      </label>
      <label className="space-y-1 text-sm sm:col-span-2">
        Comprovante do caso
        <select
          name="evidence_document_id"
          required={kind === "actual"}
          className="w-full rounded border bg-background p-2"
        >
          <option value="">
            {kind === "actual"
              ? "Selecione o comprovante obrigatório"
              : "Sem comprovante (estimativa/orçamento)"}
          </option>
          {(!documents.error ? documents.data : [])?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </select>
      </label>
      {documents.error ? (
        <p role="alert" className="text-sm sm:col-span-2">
          {documents.error.message}
        </p>
      ) : null}
      <Button className="sm:col-span-2" disabled={busy || !!documents.error}>
        Registrar custo
      </Button>
      {message ? (
        <p role="status" className="text-sm sm:col-span-2">
          {message}
        </p>
      ) : null}
    </form>
  );
}
