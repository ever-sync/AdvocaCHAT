import type { AssistancePageTextEdit } from "@/types/legal-assistance";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LegalField } from "../LegalShared";
import { AssistanceAccessNotice, AssistanceNotice } from "./AssistanceShared";
export function AssistancePageTextEditor({
  canRead,
  canEdit,
  documentName,
  value,
  pagesTotal,
  onChange,
  busy = false,
}: {
  canRead: boolean;
  canEdit: boolean;
  documentName: string;
  value: AssistancePageTextEdit;
  pagesTotal: number | null;
  onChange(value: AssistancePageTextEdit): void;
  busy?: boolean;
}) {
  if (!canRead) return <AssistanceAccessNotice />;
  const disabled = !canEdit || busy;
  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold">
          {value.mode === "manual"
            ? "Transcrição manual proposta"
            : "Correção proposta do reconhecimento"}
        </h2>
        <p className="break-words text-sm text-muted-foreground">
          {documentName}
        </p>
      </header>
      <AssistanceNotice>
        A edição compõe uma nova versão do texto. O original e as versões
        anteriores permanecem preservados; a pesquisa só poderá usar páginas
        explicitamente revisadas.
      </AssistanceNotice>
      <fieldset disabled={disabled} className="space-y-4">
        <div className="max-w-xs">
          <LegalField
            label="Página do documento original"
            hint={
              pagesTotal === null
                ? "O total de páginas não foi determinado pelo reconhecimento."
                : `O original possui ${pagesTotal} páginas.`
            }
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={pagesTotal ?? undefined}
                step={1}
                required
                readOnly={value.mode === "correction"}
                value={value.page || ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    page: event.target.value ? Number(event.target.value) : 0,
                  })
                }
              />
            )}
          </LegalField>
        </div>
        <LegalField label="Texto proposto para esta página">
          {(id) => (
            <Textarea
              id={id}
              rows={14}
              value={value.text}
              onChange={(event) =>
                onChange({ ...value, text: event.target.value })
              }
            />
          )}
        </LegalField>
        <LegalField
          label="Fundamento da transcrição ou correção"
          hint="Indique o trecho conferido no original e o que foi corrigido, sem converter os valores em fatos aprovados automaticamente."
        >
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={value.note}
              onChange={(event) =>
                onChange({ ...value, note: event.target.value })
              }
            />
          )}
        </LegalField>
      </fieldset>
    </section>
  );
}
export default AssistancePageTextEditor;
