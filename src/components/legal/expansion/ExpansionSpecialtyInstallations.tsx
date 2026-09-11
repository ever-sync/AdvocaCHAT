import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  readSpecialtyInstallation,
  updateSpecialtyItem,
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
  EXPANSION_CATEGORIES,
  EXPANSION_STATES,
  expansionCaseAccess,
  expansionCategoryAccess,
  expansionDate,
  expansionKey,
  type ExpansionProps,
} from "./expansion-ui";
import { SuccessionNotice } from "./ExpansionSuccessionFields";
import { SuccessionReviewDialog } from "./ExpansionSuccessionActions";
import { ExpansionSpecialtyTask } from "./ExpansionSpecialtyTask";
export function ExpansionSpecialtyInstallations({
  props,
}: {
  props: ExpansionProps;
}) {
  const access =
    expansionCaseAccess(props) &&
    props.context.user_id === props.workspace.user_id &&
    props.context.tenant_id === props.workspace.tenant_id;
  const edit = access && props.canEdit && props.context.can_edit;
  const list = useExpansionList(props, "installations", access);
  const [selected, setSelected] = useState<string | null>(null);
  const [change, setChange] = useState<{
    id: string;
    state: "open" | "completed" | "disabled";
  } | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const row = list.rows.find((item) => item.id === selected);
  const read = useQuery({
    queryKey: [...expansionKey(props, "specialty-installation"), selected],
    queryFn: ({ signal }) => readSpecialtyInstallation(selected!, signal),
    enabled: access && Boolean(row),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 15000,
  });
  const full =
    access &&
    row &&
    read.isFetchedAfterMount &&
    !read.isError &&
    read.data?.installation.id === row.id &&
    read.data.installation.case_id === props.legalCase.id &&
    read.data.installation.tenant_id === props.workspace.tenant_id
      ? read.data
      : null;
  const items = (full?.items ?? []).filter(
    (item) =>
      item.case_id === props.legalCase.id &&
      expansionCategoryAccess(props, item.category),
  );
  const changing = items.find((item) => item.id === change?.id);
  const task = items.find(
    (item) =>
      item.id === taskId &&
      item.kind === "task_template" &&
      item.state === "open" &&
      !item.task_id,
  );
  const action = useLegalAction();
  const key = `${props.workspace.user_id}:${props.workspace.tenant_id}:${props.legalCase.id}:${edit}:${Boolean(props.member?.can_view_medical)}:${Boolean(props.member?.can_view_fiscal)}`;
  if (!access) return null;
  return (
    <OperationPanel
      title="Pacotes aplicados ao caso"
      description="Cada instalação preserva a versão usada e o histórico de seus itens."
    >
      <OperationRecords
        pending={list.query.isPending}
        error={list.query.error}
        count={list.rows.length}
        retry={() => void list.query.refetch()}
        empty="Nenhum pacote foi aplicado a este caso."
      >
        {list.rows.map((item) => (
          <article
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded border p-4"
          >
            <div className="min-w-0">
              <h3 className="break-words font-medium">
                {item.title || "Instalação organizacional"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Aplicada em {expansionDate(item.created_at)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setChange(null);
                setTaskId(null);
                setSelected(item.id);
              }}
            >
              Examinar itens aplicados
            </Button>
          </article>
        ))}
      </OperationRecords>
      <ExpansionPagination
        {...list}
        pending={list.query.isFetching}
        onChange={list.setOffset}
      />
      {selected && row && !change && !taskId && (
        <ExpansionDialog
          title="Itens da instalação"
          description="Concluir um item indica acompanhamento organizacional. Isso não decide o caso nem comprova ato externo."
          onClose={() => setSelected(null)}
        >
          {read.isError ? (
            <ExpansionAccessNotice />
          ) : !full ? (
            <SuccessionNotice>Conferindo acesso à instalação…</SuccessionNotice>
          ) : (
            <div className="space-y-3">
              {items.length === 0 && (
                <SuccessionNotice>
                  Nenhum item disponível com as permissões atuais.
                </SuccessionNotice>
              )}
              {items.map((item) => (
                <article key={item.id} className="space-y-2 rounded border p-3">
                  <h4 className="break-words font-medium">
                    {"label" in item.payload
                      ? item.payload.label
                      : item.payload.title}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {EXPANSION_CATEGORIES[item.category]} ·{" "}
                    {EXPANSION_STATES[item.state]} ·{" "}
                    {item.kind === "stage"
                      ? "Etapa"
                      : item.kind === "checklist"
                        ? "Verificação"
                        : "Modelo de tarefa"}
                  </p>
                  {"description" in item.payload && (
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {item.payload.description}
                    </p>
                  )}
                  {item.note && (
                    <p className="whitespace-pre-wrap break-words text-sm">
                      Acompanhamento: {item.note}
                    </p>
                  )}
                  {item.task_id && (
                    <p className="text-sm">
                      Tarefa operacional criada e vinculada. Acompanhe-a na
                      rotina do caso.
                    </p>
                  )}
                  {edit && (
                    <div className="flex flex-wrap gap-2">
                      {item.state !== "completed" && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            setChange({ id: item.id, state: "completed" })
                          }
                        >
                          Registrar item concluído
                        </Button>
                      )}
                      {item.state !== "open" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setChange({ id: item.id, state: "open" })
                          }
                        >
                          Reabrir item
                        </Button>
                      )}
                      {item.state !== "disabled" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setChange({ id: item.id, state: "disabled" })
                          }
                        >
                          Desativar item
                        </Button>
                      )}
                      {item.kind === "task_template" &&
                        item.state === "open" &&
                        !item.task_id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setTaskId(item.id)}
                          >
                            Criar tarefa com data escolhida
                          </Button>
                        )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </ExpansionDialog>
      )}
      {edit && change && changing && (
        <SuccessionReviewDialog
          key={`${key}:${changing.id}:${change.state}`}
          title="Atualizar acompanhamento do item"
          description="O histórico e as respostas anteriores permanecem preservados. Esta ação não altera prazo jurídico."
          actionLabel={
            change.state === "completed"
              ? "Confirmar conclusão organizacional"
              : change.state === "disabled"
                ? "Confirmar desativação"
                : "Confirmar reabertura"
          }
          pending={action.pending}
          onClose={() => setChange(null)}
          onSave={async (note) => {
            if (
              await action.run(
                () => updateSpecialtyItem(changing.id, change.state, note),
                "Acompanhamento do item registrado",
              )
            )
              setChange(null);
          }}
        />
      )}
      {edit && task && (
        <ExpansionSpecialtyTask
          key={`${key}:${task.id}`}
          props={props}
          item={task}
          onClose={() => setTaskId(null)}
        />
      )}
    </OperationPanel>
  );
}
