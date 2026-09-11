import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addLegalProceeding, listLegalProceedings } from "@/lib/api/legal";
import {
  LegalEmpty,
  LegalError,
  LegalField,
  LegalLoading,
} from "../LegalShared";
import { useLegalAction } from "../legal-ui";
import { OperationPanel } from "../operations/OperationPanel";
import type { LegalOperationsProps } from "../operations/operations-ui";
import { JudicialAccessNotice, JudicialDialog } from "./JudicialShared";
import { judicialCaseAccess, judicialKey } from "./judicial-ui";

export default function JudicialProceedings(props: LegalOperationsProps) {
  const allowed = judicialCaseAccess(props);
  const query = useQuery({
    queryKey: judicialKey(props, "proceedings"),
    queryFn: () => listLegalProceedings(props.legalCase.id),
    enabled: allowed,
  });
  const [creating, setCreating] = useState(false);
  const action = useLegalAction();
  const [form, setForm] = useState({
    cnj_number: "",
    court: "",
    division: "",
    description: "",
  });
  if (!allowed) return <JudicialAccessNotice />;
  return (
    <OperationPanel
      title="Processos do caso"
      description="Cadastre o número do processo e o órgão competente. O cadastro manual é preservado e não ativa monitoramento, consulta com ciência ou envio ao tribunal."
      actions={
        props.canEdit && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Cadastrar processo
          </Button>
        )
      }
    >
      {query.isPending ? (
        <LegalLoading />
      ) : query.error ? (
        <LegalError error={query.error} retry={() => void query.refetch()} />
      ) : query.data.length ? (
        query.data.map((proceeding) => (
          <article
            key={proceeding.id}
            className="space-y-2 rounded-lg border p-4"
          >
            <h3 className="break-all font-semibold">{proceeding.cnj_number}</h3>
            <p className="break-words text-sm text-muted-foreground">
              {[proceeding.court, proceeding.division]
                .filter(Boolean)
                .join(" · ") || "Órgão ainda não informado"}
            </p>
            {proceeding.description && (
              <p className="whitespace-pre-wrap break-words text-sm">
                {proceeding.description}
              </p>
            )}
          </article>
        ))
      ) : (
        <LegalEmpty title="Nenhum processo cadastrado">
          Casos consultivos e extrajudiciais podem seguir sem processo judicial.
        </LegalEmpty>
      )}
      {creating && props.canEdit && (
        <JudicialDialog
          title="Cadastrar processo no caso"
          description="Confira o número CNJ completo e o órgão. O vínculo é registrado manualmente, sem consulta externa automática."
          onClose={() => setCreating(false)}
          pending={action.pending}
          actionLabel="Cadastrar processo"
          onSubmit={async () => {
            if (
              await action.run(
                () => addLegalProceeding(props.legalCase.id, form),
                "Processo cadastrado no caso",
              )
            ) {
              setCreating(false);
              setForm({
                cnj_number: "",
                court: "",
                division: "",
                description: "",
              });
            }
          }}
        >
          <LegalField label="Número CNJ">
            {(id) => (
              <Input
                id={id}
                required
                maxLength={25}
                value={form.cnj_number}
                placeholder="0000000-00.0000.0.00.0000"
                onChange={(event) =>
                  setForm({ ...form, cnj_number: event.target.value })
                }
              />
            )}
          </LegalField>
          <div className="grid gap-4 sm:grid-cols-2">
            <LegalField label="Tribunal">
              {(id) => (
                <Input
                  id={id}
                  maxLength={120}
                  value={form.court}
                  onChange={(event) =>
                    setForm({ ...form, court: event.target.value })
                  }
                />
              )}
            </LegalField>
            <LegalField label="Vara ou órgão julgador">
              {(id) => (
                <Input
                  id={id}
                  maxLength={180}
                  value={form.division}
                  onChange={(event) =>
                    setForm({ ...form, division: event.target.value })
                  }
                />
              )}
            </LegalField>
          </div>
          <LegalField
            label="Observação do cadastro"
            hint="Use apenas informações gerais do processo. Conteúdo médico e fiscal deve permanecer nas áreas autorizadas."
          >
            {(id) => (
              <Textarea
                id={id}
                maxLength={1000}
                rows={3}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            )}
          </LegalField>
        </JudicialDialog>
      )}
    </OperationPanel>
  );
}
