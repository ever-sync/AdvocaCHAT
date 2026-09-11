import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createSpecialty,
  readSpecialty,
  reviewSpecialty,
} from "@/lib/api/legal-expansion";
import { useLegalAction } from "../legal-ui";
import { OperationPanel, OperationRecords } from "../operations/OperationPanel";
import {
  ExpansionAccessNotice,
  ExpansionDialog,
  ExpansionPagination,
} from "./ExpansionShared";
import { useExpansionList } from "./expansion-hooks";
import {
  EXPANSION_STATES,
  expansionCaseAccess,
  expansionKey,
  expansionOwner,
  type ExpansionProps,
} from "./expansion-ui";
import { ExpansionSpecialtyForm } from "./ExpansionSpecialtyForm";
import { ExpansionSpecialtyDetails } from "./ExpansionSpecialtyDetails";
import { ExpansionSpecialtyPreview } from "./ExpansionSpecialtyPreview";
import { ExpansionSpecialtyInstallations } from "./ExpansionSpecialtyInstallations";
import { SuccessionNotice } from "./ExpansionSuccessionFields";
import { SuccessionReviewDialog } from "./ExpansionSuccessionActions";
export default function ExpansionSpecialty(props: ExpansionProps) {
  const access =
    expansionCaseAccess(props) &&
    props.context.user_id === props.workspace.user_id &&
    props.context.tenant_id === props.workspace.tenant_id;
  const manage = access && props.context.can_manage;
  const owner = access && expansionOwner(props) && props.context.can_review;
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "copy" | "preview" | null>(null);
  const [decision, setDecision] = useState<"reviewed" | "revoked" | null>(null);
  const list = useExpansionList(props, "packages", access);
  const row = list.rows.find((item) => item.id === selected);
  const read = useQuery({
    queryKey: [...expansionKey(props, "specialty-read"), selected, row?.state],
    queryFn: ({ signal }) => readSpecialty(selected!, signal),
    enabled: access && Boolean(row) && row?.state !== "revoked",
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchInterval: 15000,
  });
  const full =
    access &&
    row &&
    read.isFetchedAfterMount &&
    !read.isError &&
    read.data?.version.id === row.id &&
    read.data.version.tenant_id === props.workspace.tenant_id
      ? read.data
      : null;
  const action = useLegalAction();
  const key = `${props.workspace.user_id}:${props.workspace.tenant_id}:${props.legalCase.id}:${manage}:${owner}:${Boolean(props.member?.can_view_medical)}:${Boolean(props.member?.can_view_fiscal)}`;
  const closeAction = () => {
    setMode(null);
    setDecision(null);
  };
  if (!access) return <ExpansionAccessNotice />;
  return (
    <div className="space-y-4">
      <OperationPanel
        title="Pacotes de especialidade"
        description="Catálogo versionado de etapas, verificações e modelos organizacionais do escritório."
        actions={
          manage && (
            <Button onClick={() => setMode("new")}>
              Novo pacote de especialidade
            </Button>
          )
        }
      >
        <SuccessionNotice>
          Pacotes organizam o trabalho. Cada referência jurídica, cálculo,
          documento e prazo continua com sua revisão própria.
        </SuccessionNotice>
        <OperationRecords
          pending={list.query.isPending}
          error={list.query.error}
          count={list.rows.length}
          retry={() => void list.query.refetch()}
          empty="Nenhum pacote cadastrado."
        >
          {list.rows.map((item) => (
            <article key={item.id} className="space-y-3 rounded border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="min-w-0 break-words font-medium">
                  {item.title} · versão {item.version_number}
                </h3>
                <Badge variant="outline">
                  {EXPANSION_STATES[item.state] ?? item.state}
                </Badge>
              </div>
              {item.state !== "revoked" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    closeAction();
                    setSelected(item.id);
                  }}
                >
                  Examinar pacote
                </Button>
              )}
            </article>
          ))}
        </OperationRecords>
        <ExpansionPagination
          {...list}
          pending={list.query.isFetching}
          onChange={list.setOffset}
        />
        {selected &&
          row &&
          row.state !== "revoked" &&
          mode === null &&
          decision === null && (
            <ExpansionDialog
              title="Pacote de especialidade"
              description="Leia o conteúdo e as referências antes de revisar ou aplicar a versão."
              onClose={() => setSelected(null)}
            >
              {read.isError ? (
                <ExpansionAccessNotice />
              ) : !full ? (
                <SuccessionNotice>
                  Conferindo acesso ao pacote…
                </SuccessionNotice>
              ) : (
                <>
                  <ExpansionSpecialtyDetails data={full} />
                  <div className="flex flex-wrap gap-2">
                    {manage && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setMode("copy")}
                      >
                        Criar nova versão do pacote
                      </Button>
                    )}
                    {manage && full.version.state === "draft" && (
                      <Button
                        type="button"
                        onClick={() => setDecision("reviewed")}
                      >
                        Conferir pacote
                      </Button>
                    )}
                    {manage && full.version.state === "reviewed" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDecision("revoked")}
                      >
                        Revogar pacote
                      </Button>
                    )}
                    {owner &&
                      full.version.state === "reviewed" &&
                      full.is_current && (
                        <Button
                          type="button"
                          onClick={() => setMode("preview")}
                        >
                          Ver prévia no caso
                        </Button>
                      )}
                  </div>
                </>
              )}
            </ExpansionDialog>
          )}
        {manage && mode === "new" && (
          <ExpansionSpecialtyForm
            key={`${key}:new`}
            pending={action.pending}
            onClose={closeAction}
            onSave={async (payload) => {
              if (
                await action.run(
                  () => createSpecialty(payload),
                  "Rascunho do pacote criado",
                )
              )
                closeAction();
            }}
          />
        )}
        {manage && mode === "copy" && full && (
          <ExpansionSpecialtyForm
            key={`${key}:${full.version.id}:copy`}
            original={{
              ...full.version,
              previous_version_id: full.version.previous_version_id ?? null,
            }}
            pending={action.pending}
            onClose={closeAction}
            onSave={async (payload) => {
              if (
                await action.run(
                  () => createSpecialty(payload),
                  "Nova versão do pacote criada",
                )
              )
                closeAction();
            }}
          />
        )}
        {manage &&
          decision &&
          full &&
          (decision === "reviewed"
            ? full.version.state === "draft"
            : full.version.state === "reviewed") && (
            <SuccessionReviewDialog
              key={`${key}:${full.version.id}:${decision}`}
              title={
                decision === "reviewed"
                  ? "Conferir pacote organizacional"
                  : "Revogar pacote"
              }
              description="A revisão não aprova teses nem cria tarefas com prazo jurídico. Instalações antigas ficam preservadas."
              actionLabel={
                decision === "reviewed"
                  ? "Registrar pacote conferido"
                  : "Confirmar revogação do pacote"
              }
              missing={
                decision === "reviewed" &&
                (!full.version.checked_on ||
                  !full.version.source_url ||
                  !full.version.validity_note)
                  ? ["Conferir fonte, data de consulta e validade"]
                  : []
              }
              pending={action.pending}
              onClose={closeAction}
              onSave={async (note) => {
                if (
                  await action.run(
                    () => reviewSpecialty(full.version.id, decision, note),
                    "Revisão do pacote registrada",
                  )
                )
                  closeAction();
              }}
            />
          )}
        {owner &&
          mode === "preview" &&
          full?.version.state === "reviewed" &&
          full.is_current && (
            <ExpansionSpecialtyPreview
              key={`${key}:${full.version.id}:preview`}
              props={props}
              versionId={full.version.id}
              onClose={closeAction}
            />
          )}
      </OperationPanel>
      <ExpansionSpecialtyInstallations props={props} />
    </div>
  );
}
export { ExpansionSpecialty };
