import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listLegalDocuments,
  listLegalParties,
  listLegalProceedings,
} from "@/lib/api/legal";
import { getIrCaseContext, listLegalRepresentations } from "@/lib/api/legal-ir";
import {
  createSuccession,
  readSuccession,
  submitSuccession,
  reviewSuccession,
  recordSuccessionAuthority,
  revokeSuccessionAuthority,
  recordSuccessionEvent,
} from "@/lib/api/legal-expansion";
import { useLegalAction } from "../legal-ui";
import { OperationPanel, OperationRecords } from "../operations/OperationPanel";
import {
  ExpansionDialog,
  ExpansionAccessNotice,
  ExpansionPagination,
} from "./ExpansionShared";
import { useExpansionList } from "./expansion-hooks";
import {
  EXPANSION_STATES,
  expansionCategoryAccess,
  expansionDate,
  expansionKey,
  expansionOwner,
  type ExpansionProps,
} from "./expansion-ui";
import { ExpansionSuccessionForm } from "./ExpansionSuccessionForm";
import {
  ExpansionSuccessionEventForm,
  SuccessionReviewDialog,
} from "./ExpansionSuccessionActions";
import { ExpansionSuccessionAuthority } from "./ExpansionSuccessionAuthority";
import { SuccessionNotice } from "./ExpansionSuccessionFields";
import { ExpansionSuccessionDetails } from "./ExpansionSuccessionDetails";

export default function ExpansionSuccession(props: ExpansionProps) {
  const access =
    expansionCategoryAccess(props, "restricted") &&
    props.context.user_id === props.workspace.user_id &&
    props.context.tenant_id === props.workspace.tenant_id;
  const edit = access && props.canEdit && props.context.can_edit;
  const owner = access && expansionOwner(props) && props.context.can_review;
  const list = useExpansionList(props, "succession", access);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<
    "new" | "copy" | "event" | "authority" | null
  >(null);
  const [decision, setDecision] = useState<
    "reviewed" | "returned" | "revoked" | null
  >(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const action = useLegalAction();
  const row = list.rows.find((item) => item.id === selected);
  const read = useQuery({
    queryKey: [...expansionKey(props, "succession-read"), selected, row?.state],
    queryFn: ({ signal }) => readSuccession(selected!, signal),
    enabled: access && Boolean(row) && row?.state !== "revoked",
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 15000,
  });
  const full =
    access &&
    row &&
    read.isFetchedAfterMount &&
    !read.isError &&
    read.data?.version.id === row.id &&
    read.data.version.case_id === props.legalCase.id &&
    read.data.version.tenant_id === props.workspace.tenant_id
      ? read.data
      : null;
  const refs = useQuery({
    queryKey: expansionKey(props, "succession-references"),
    queryFn: async () => {
      const [documents, parties, proceedings, representations, ir] =
        await Promise.all([
          listLegalDocuments(props.legalCase.id),
          listLegalParties(props.legalCase.id),
          listLegalProceedings(props.legalCase.id),
          listLegalRepresentations(props.legalCase.id),
          getIrCaseContext(props.legalCase.id),
        ]);
      return { documents, parties, proceedings, representations, ir };
    },
    enabled: access,
    retry: false,
    refetchInterval: 15000,
  });
  const available = access && !refs.isError ? refs.data : null;
  const documents = (available?.documents ?? []).filter(
    (document) =>
      document.case_id === props.legalCase.id &&
      document.status === "ready" &&
      expansionCategoryAccess(props, document.category),
  );
  const parties = (available?.parties ?? []).filter(
    (party) => party.case_id === props.legalCase.id,
  );
  const proceedings = (available?.proceedings ?? []).filter(
    (proceeding) => proceeding.case_id === props.legalCase.id,
  );
  const representations = (available?.representations ?? []).filter(
    (representation) =>
      representation.case_id === props.legalCase.id &&
      expansionCategoryAccess(props, representation.category),
  );
  const activeRepresentations = representations.filter((representation) =>
    available?.ir.representation_states.some(
      (state) =>
        state.id === representation.id && state.effective_status === "active",
    ),
  );
  const version = full?.version;
  const current = full?.is_current === true;
  const key = `${props.workspace.user_id}:${props.workspace.tenant_id}:${props.legalCase.id}:${access}:${edit}:${owner}`;
  const closeAction = () => {
    setMode(null);
    setDecision(null);
    setRevoking(null);
  };
  if (!access) return <ExpansionAccessNotice />;
  return (
    <OperationPanel
      title="Sucessores e representação"
      description="Dossiê privado com fatos declarados, provas e conferência nominal de poderes por operação."
      actions={
        edit && (
          <Button onClick={() => setMode("new")}>Novo dossiê sucessório</Button>
        )
      }
    >
      <SuccessionNotice>
        Herdeiro declarado, representação conferida e decisão externa são
        registros diferentes. Nada aqui transfere valores, procurações,
        clientes, prazos ou acesso ao portal automaticamente.
      </SuccessionNotice>
      <OperationRecords
        pending={list.query.isPending}
        error={list.query.error}
        count={list.rows.length}
        retry={() => void list.query.refetch()}
        empty="Nenhum dossiê sucessório neste caso."
      >
        {list.rows.map((item) => (
          <article key={item.id} className="space-y-3 rounded border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words font-medium">{item.title}</h3>
                <p className="text-xs text-muted-foreground">
                  Versão {item.version_number} ·{" "}
                  {expansionDate(item.created_at)}
                </p>
              </div>
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
                Examinar dossiê
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
        decision === null &&
        revoking === null && (
          <ExpansionDialog
            title="Dossiê sucessório"
            description="Leitura auditada com acesso conjunto a saúde e fiscal."
            onClose={() => setSelected(null)}
          >
            {read.isError ? (
              <ExpansionAccessNotice />
            ) : !full || !version ? (
              <SuccessionNotice>Conferindo acesso e versão…</SuccessionNotice>
            ) : (
              <>
                <ExpansionSuccessionDetails
                  data={full}
                  parties={parties}
                  documents={documents}
                  onRevokeAuthority={owner ? setRevoking : undefined}
                />
                <div className="flex flex-wrap gap-2">
                  {edit && current && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setMode("copy")}
                    >
                      Criar nova versão do dossiê
                    </Button>
                  )}
                  {edit &&
                    current &&
                    ["draft", "returned"].includes(version.state) && (
                      <Button
                        type="button"
                        disabled={action.pending}
                        onClick={() =>
                          void action.run(
                            () => submitSuccession(version.id),
                            "Dossiê encaminhado para conferência",
                          )
                        }
                      >
                        Encaminhar para conferência
                      </Button>
                    )}
                  {owner && current && version.state === "in_review" && (
                    <>
                      <Button
                        type="button"
                        onClick={() => setDecision("reviewed")}
                      >
                        Conferir dossiê
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDecision("returned")}
                      >
                        Devolver para ajuste
                      </Button>
                    </>
                  )}
                  {owner && version.state === "reviewed" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDecision("revoked")}
                    >
                      Revogar conferência do dossiê
                    </Button>
                  )}
                  {owner && current && version.state === "reviewed" && (
                    <Button type="button" onClick={() => setMode("authority")}>
                      Conferir poderes para uma operação
                    </Button>
                  )}
                  {edit && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setMode("event")}
                    >
                      Registrar ocorrência documentada
                    </Button>
                  )}
                </div>
              </>
            )}
          </ExpansionDialog>
        )}
      {edit && mode === "new" && (
        <ExpansionSuccessionForm
          key={`${key}:new`}
          parties={parties}
          documents={documents}
          proceedings={proceedings}
          representations={representations}
          pending={action.pending}
          onClose={closeAction}
          onSave={async (payload) => {
            if (
              await action.run(
                () => createSuccession(props.legalCase.id, payload),
                "Rascunho sucessório criado",
              )
            )
              closeAction();
          }}
        />
      )}
      {edit && mode === "copy" && full && current && (
        <ExpansionSuccessionForm
          key={`${key}:${full.version.id}:copy`}
          original={{
            ...full.version,
            previous_version_id: full.version.previous_version_id ?? null,
            death_on: full.version.death_on ?? null,
            death_document_id: full.version.death_document_id ?? null,
            proceeding_id: full.version.proceeding_id ?? null,
            persons: full.persons.map((person) => ({
              ...person,
              representation_id: person.representation_id ?? null,
            })),
          }}
          parties={parties}
          documents={documents}
          proceedings={proceedings}
          representations={representations}
          pending={action.pending}
          onClose={closeAction}
          onSave={async (payload) => {
            if (
              await action.run(
                () => createSuccession(props.legalCase.id, payload),
                "Nova versão sucessória criada",
              )
            )
              closeAction();
          }}
        />
      )}
      {owner &&
        decision &&
        full &&
        (decision === "revoked"
          ? version?.state === "reviewed"
          : current && version?.state === "in_review") && (
          <SuccessionReviewDialog
            key={`${key}:${version!.id}:${decision}`}
            title={
              decision === "reviewed"
                ? "Conferir dossiê sucessório"
                : decision === "returned"
                  ? "Devolver dossiê"
                  : "Revogar conferência"
            }
            description="Esta decisão registra conferência interna; não é habilitação processual nem autorização para pagamento."
            actionLabel={
              decision === "reviewed"
                ? "Registrar dossiê conferido"
                : decision === "returned"
                  ? "Devolver com pendências"
                  : "Confirmar revogação"
            }
            pending={action.pending}
            missing={decision === "reviewed" ? full.missing : []}
            onClose={closeAction}
            onSave={async (note) => {
              if (
                await action.run(
                  () => reviewSuccession(version!.id, decision, note),
                  "Revisão sucessória registrada",
                )
              )
                closeAction();
            }}
          />
        )}
      {edit && mode === "event" && full && (
        <ExpansionSuccessionEventForm
          key={`${key}:${version!.id}:event`}
          events={full.events}
          documents={documents}
          pending={action.pending}
          onClose={closeAction}
          onSave={async (payload) => {
            if (
              await action.run(
                () => recordSuccessionEvent(version!.id, payload),
                "Ocorrência registrada",
              )
            )
              closeAction();
          }}
        />
      )}
      {owner &&
        current &&
        mode === "authority" &&
        full &&
        version?.state === "reviewed" && (
          <ExpansionSuccessionAuthority
            key={`${key}:${version.id}:authority`}
            persons={full.persons}
            parties={parties}
            documents={documents}
            representations={activeRepresentations}
            pending={action.pending}
            onClose={closeAction}
            onSave={async (payload) => {
              if (
                await action.run(
                  () => recordSuccessionAuthority(version.id, payload),
                  "Conferência específica registrada",
                )
              )
                closeAction();
            }}
          />
        )}
      {owner &&
        revoking &&
        full?.authorities.some(
          (authority) =>
            authority.id === revoking && authority.decision === "reviewed",
        ) && (
          <SuccessionReviewDialog
            key={`${key}:${revoking}:revoke`}
            title="Revogar conferência de poderes"
            description="A revogação impede novos usos dependentes desta conferência e preserva o histórico."
            actionLabel="Revogar conferência específica"
            pending={action.pending}
            onClose={closeAction}
            onSave={async (note) => {
              if (
                await action.run(
                  () => revokeSuccessionAuthority(revoking, note),
                  "Conferência específica revogada",
                )
              )
                closeAction();
            }}
          />
        )}
    </OperationPanel>
  );
}
export { ExpansionSuccession };
