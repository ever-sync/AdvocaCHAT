import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import {
  applyIrChecklist,
  createIrChecklistVersion,
  linkIrChecklistRequest,
  listIrChecklistItems,
  listIrChecklistVersions,
  listIrPayers,
  waiveIrChecklistItem,
} from "@/lib/api/legal-ir";
import { listLegalDocumentRequests } from "@/lib/api/legal-operations";
import type {
  IrChecklistItem,
  IrChecklistPayload,
  IrChecklistTemplateItem,
  IrChecklistVersion,
  IrPayerType,
} from "@/types/legal-ir";
import type { LegalDocumentCategory } from "@/types/legal";
import { LegalError, LegalField } from "../LegalShared";
import {
  DOCUMENT_CATEGORIES,
  selectClassName,
  useLegalAction,
} from "../legal-ui";
import {
  OperationPanel,
  OperationReasonDialog,
  OperationRecords,
} from "../operations/OperationPanel";
import { IrDialog, IrSelection } from "./IrShared";
import {
  CHECKLIST_STAGES,
  CHECKLIST_STATES,
  PAYER_TYPES,
  irCategoryAllowed,
  irKey,
  irWorkspaceKey,
  isIrOwner,
  personName,
  type IrPanelProps,
} from "./ir-ui";

function ChecklistVersionDialog({
  original,
  onClose,
}: {
  original?: IrChecklistVersion;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(original?.title ?? "");
  const [route, setRoute] = useState<IrChecklistPayload["route"]>(
    original?.route ?? "both",
  );
  const [payers, setPayers] = useState<string[]>(original?.payer_types ?? []);
  const [items, setItems] = useState<IrChecklistTemplateItem[]>(
    original?.items ?? [
      {
        key: `item_${crypto.randomUUID().replace(/-/g, "")}`,
        title: "",
        category: "general",
        gating_stage: "intake",
        required: true,
      },
    ],
  );
  const action = useLegalAction();
  const change = (index: number, patch: Partial<IrChecklistTemplateItem>) =>
    setItems(
      items.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      await action.run(
        () =>
          createIrChecklistVersion({
            template_key:
              original?.template_key ??
              `checklist_${crypto.randomUUID().replace(/-/g, "")}`,
            title: title.trim(),
            payer_types: payers as IrPayerType[],
            route,
            items: items.map((item) => ({ ...item, title: item.title.trim() })),
          }),
        "Versão do checklist registrada",
      )
    )
      onClose();
  }
  return (
    <IrDialog
      wide
      title={
        original ? "Nova versão do checklist" : "Novo checklist do escritório"
      }
      description="Defina documentos, categorias e etapa de conferência. As versões já aplicadas aos casos ficam preservadas."
      onClose={onClose}
      pending={action.pending}
    >
      <form className="space-y-4" onSubmit={(event) => void save(event)}>
        <LegalField label="Nome do checklist">
          {(id) => (
            <Input
              id={id}
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </LegalField>
        <LegalField label="Rota do checklist">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={route}
              onChange={(event) =>
                setRoute(event.target.value as IrChecklistPayload["route"])
              }
            >
              <option value="both">Administrativa e judicial</option>
              <option value="administrative">Administrativa</option>
              <option value="judicial">Judicial</option>
            </select>
          )}
        </LegalField>
        <IrSelection
          label="Tipos de fonte pagadora"
          values={Object.entries(PAYER_TYPES).map(([id, label]) => ({
            id,
            label,
          }))}
          selected={payers}
          onChange={setPayers}
        />
        <p className="text-xs text-muted-foreground">
          Sem seleção de pagador, o modelo fica disponível para qualquer tipo.
        </p>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">Itens a conferir</legend>
          {items.map((item, index) => (
            <div key={item.key} className="space-y-3 rounded-lg border p-3">
              <LegalField label={`Documento ou requisito ${index + 1}`}>
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={200}
                    value={item.title}
                    onChange={(event) =>
                      change(index, { title: event.target.value })
                    }
                  />
                )}
              </LegalField>
              <div className="grid gap-3 sm:grid-cols-2">
                <LegalField label={`Categoria do item ${index + 1}`}>
                  {(id) => (
                    <select
                      id={id}
                      className={selectClassName}
                      value={item.category}
                      onChange={(event) =>
                        change(index, {
                          category: event.target.value as LegalDocumentCategory,
                        })
                      }
                    >
                      {Object.entries(DOCUMENT_CATEGORIES).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  )}
                </LegalField>
                <LegalField label={`Etapa de conferência do item ${index + 1}`}>
                  {(id) => (
                    <select
                      id={id}
                      className={selectClassName}
                      value={item.gating_stage}
                      onChange={(event) =>
                        change(index, {
                          gating_stage: event.target
                            .value as IrChecklistTemplateItem["gating_stage"],
                        })
                      }
                    >
                      {Object.entries(CHECKLIST_STAGES).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  )}
                </LegalField>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={item.required}
                    onChange={(event) =>
                      change(index, { required: event.target.checked })
                    }
                  />
                  Obrigatório nesta etapa
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setItems(items.filter((_, current) => current !== index))
                  }
                >
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                  Remover item {index + 1}
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={items.length >= 50}
            onClick={() =>
              setItems([
                ...items,
                {
                  key: `item_${crypto.randomUUID().replace(/-/g, "")}`,
                  title: "",
                  category: "general",
                  gating_stage: "intake",
                  required: true,
                },
              ])
            }
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Adicionar requisito
          </Button>
        </fieldset>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              action.pending ||
              !title.trim() ||
              !items.length ||
              items.some((item) => !item.title.trim())
            }
          >
            Salvar versão do checklist
          </Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}

export function IrChecklists(props: IrPanelProps) {
  const versions = useQuery({
    queryKey: irWorkspaceKey(props, "checklist-versions"),
    queryFn: listIrChecklistVersions,
  });
  const items = useQuery({
    queryKey: irKey(props, "checklist-items"),
    queryFn: () => listIrChecklistItems(props.legalCase.id),
  });
  const requests = useQuery({
    queryKey: irKey(props, "checklist-requests"),
    queryFn: () => listLegalDocumentRequests(props.legalCase.id),
  });
  const payers = useQuery({
    queryKey: irKey(props, "payers"),
    queryFn: () => listIrPayers(props.legalCase.id),
    enabled: props.ir.can_fiscal,
  });
  const [form, setForm] = useState<IrChecklistVersion | "new" | null>(null);
  const [applying, setApplying] = useState(false);
  const [versionId, setVersionId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [link, setLink] = useState<IrChecklistItem | null>(null);
  const [requestId, setRequestId] = useState("");
  const [waive, setWaive] = useState<IrChecklistItem | null>(null);
  const action = useLegalAction();
  const visibleItems = (items.data ?? []).filter((item) =>
    irCategoryAllowed(props, item.category),
  );
  const selected = versions.data?.find((version) => version.id === versionId);
  const availableVersions =
    versions.data?.filter((version) =>
      version.items.every((item) => irCategoryAllowed(props, item.category)),
    ) ?? [];
  return (
    <div className="space-y-4">
      <OperationPanel
        title="Checklist deste caso"
        description="Acompanhe itens por fonte e etapa. Um arquivo recebido só conclui a conferência após revisão, ou dispensa expressa do responsável."
        actions={
          props.canEdit ? (
            <Button
              size="sm"
              disabled={!availableVersions.length}
              onClick={() => {
                setApplying(true);
                setVersionId("");
                setPayerId("");
              }}
            >
              Aplicar checklist
            </Button>
          ) : null
        }
      >
        <OperationRecords
          pending={items.isPending}
          error={items.error}
          retry={() => void items.refetch()}
          empty="Nenhum checklist aplicado ao caso"
          count={visibleItems.length}
        >
          {visibleItems.map((item) => {
            const state =
              props.ir.checklist_states.find(
                (entry) => entry.item_id === item.id,
              )?.state ?? "pending";
            return (
              <div key={item.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-words font-medium">{item.title}</p>
                  <Badge variant="outline">{CHECKLIST_STATES[state]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {DOCUMENT_CATEGORIES[item.category]} ·{" "}
                  {CHECKLIST_STAGES[item.gating_stage]} ·{" "}
                  {item.required ? "Obrigatório" : "Complementar"}
                  {item.payer_id
                    ? ` · ${props.ir.can_fiscal ? (payers.data?.find((payer) => payer.id === item.payer_id)?.name ?? "Fonte do caso") : "Fonte vinculada"}`
                    : ""}
                </p>
                {item.waiver_reason ? (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    Dispensa: {item.waiver_reason} ·{" "}
                    {personName(props, item.waived_by)}
                  </p>
                ) : null}
                {props.canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setLink(item);
                        setRequestId(item.document_request_id ?? "");
                      }}
                    >
                      Vincular solicitação
                    </Button>
                    {isIrOwner(props) && !item.waiver_reason ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setWaive(item)}
                      >
                        Dispensar com justificativa
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </OperationRecords>
      </OperationPanel>
      <OperationPanel
        title="Modelos de checklist"
        description="Cada versão delimita a rota, os pagadores e o momento de conferência dos requisitos."
        actions={
          props.workspace.can_create ? (
            <Button size="sm" variant="outline" onClick={() => setForm("new")}>
              Novo modelo de checklist
            </Button>
          ) : null
        }
      >
        <OperationRecords
          pending={versions.isPending}
          error={versions.error}
          retry={() => void versions.refetch()}
          empty="O escritório ainda não cadastrou modelos de checklist"
          count={versions.data?.length ?? 0}
        >
          {versions.data?.map((version) => (
            <details
              key={version.id}
              className="space-y-3 rounded-lg border p-4"
            >
              <summary className="cursor-pointer font-medium">
                {version.title} · versão {version.version_number}
              </summary>
              <div className="space-y-3 pt-2">
                <p className="text-xs text-muted-foreground">
                  Rota{" "}
                  {version.route === "both"
                    ? "administrativa e judicial"
                    : version.route === "judicial"
                      ? "judicial"
                      : "administrativa"}{" "}
                  ·{" "}
                  {version.payer_types
                    .map((type) => PAYER_TYPES[type])
                    .join(", ") || "Todos os tipos de pagador"}
                </p>
                <ul className="space-y-2">
                  {version.items.map((item) => (
                    <li key={item.key} className="text-sm">
                      {item.title} · {DOCUMENT_CATEGORIES[item.category]} ·{" "}
                      {CHECKLIST_STAGES[item.gating_stage]}
                      {item.required ? " · obrigatório" : ""}
                    </li>
                  ))}
                </ul>
                {props.workspace.can_create ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setForm(version)}
                  >
                    Nova versão do modelo
                  </Button>
                ) : null}
              </div>
            </details>
          ))}
        </OperationRecords>
      </OperationPanel>
      {form ? (
        <ChecklistVersionDialog
          original={form === "new" ? undefined : form}
          onClose={() => setForm(null)}
        />
      ) : null}
      {applying ? (
        <IrDialog
          title="Aplicar checklist ao caso"
          description="Escolha a versão e a fonte pagadora. Os requisitos serão acompanhados individualmente."
          onClose={() => setApplying(false)}
          pending={action.pending}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void action
                .run(
                  () =>
                    applyIrChecklist(
                      props.legalCase.id,
                      versionId,
                      payerId || undefined,
                    ),
                  "Checklist aplicado ao caso",
                )
                .then((saved) => {
                  if (saved) setApplying(false);
                });
            }}
          >
            <LegalField label="Versão do checklist">
              {(id) => (
                <select
                  id={id}
                  className={selectClassName}
                  required
                  value={versionId}
                  onChange={(event) => {
                    setVersionId(event.target.value);
                    setPayerId("");
                  }}
                >
                  <option value="">Selecione a versão</option>
                  {availableVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.title} · versão {version.version_number}
                    </option>
                  ))}
                </select>
              )}
            </LegalField>
            {props.ir.can_fiscal ? (
              <LegalField label="Fonte a acompanhar">
                {(id) => (
                  <select
                    id={id}
                    className={selectClassName}
                    value={payerId}
                    onChange={(event) => setPayerId(event.target.value)}
                  >
                    <option value="">Checklist geral do caso</option>
                    {payers.data
                      ?.filter(
                        (payer) =>
                          !selected?.payer_types.length ||
                          selected.payer_types.includes(payer.payer_type),
                      )
                      .map((payer) => (
                        <option key={payer.id} value={payer.id}>
                          {payer.name}
                        </option>
                      ))}
                  </select>
                )}
              </LegalField>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setApplying(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={action.pending || !versionId}>
                Aplicar esta versão
              </Button>
            </DialogFooter>
          </form>
        </IrDialog>
      ) : null}
      {link && irCategoryAllowed(props, link.category) ? (
        <IrDialog
          title="Vincular solicitação ao requisito"
          description="Selecione uma solicitação da mesma categoria. Novas solicitações podem ser criadas em Atendimento e trabalho → Documentos solicitados."
          onClose={() => setLink(null)}
          pending={action.pending}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void action
                .run(
                  () => linkIrChecklistRequest(link.id, requestId),
                  "Solicitação vinculada ao requisito",
                )
                .then((saved) => {
                  if (saved) setLink(null);
                });
            }}
          >
            <p className="text-sm font-medium">{link.title}</p>
            {requests.error ? (
              <LegalError
                error={requests.error}
                retry={() => void requests.refetch()}
              />
            ) : (
              <LegalField label="Solicitação correspondente">
                {(id) => (
                  <select
                    id={id}
                    className={selectClassName}
                    required
                    value={requestId}
                    onChange={(event) => setRequestId(event.target.value)}
                  >
                    <option value="">Selecione uma solicitação</option>
                    {requests.data
                      ?.filter((request) => request.category === link.category)
                      .map((request) => (
                        <option key={request.id} value={request.id}>
                          {request.title}
                        </option>
                      ))}
                  </select>
                )}
              </LegalField>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLink(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={action.pending || !requestId}>
                Vincular ao checklist
              </Button>
            </DialogFooter>
          </form>
        </IrDialog>
      ) : null}
      <OperationReasonDialog
        key={waive?.id}
        open={Boolean(waive && irCategoryAllowed(props, waive.category))}
        onClose={() => setWaive(null)}
        title="Dispensar requisito deste caso"
        description="Registre o fundamento da dispensa. A obrigação e sua decisão permanecem no histórico."
        pending={action.pending}
        onSave={(reason) =>
          waive
            ? action.run(
                () => waiveIrChecklistItem(waive.id, reason),
                "Dispensa registrada pelo responsável",
              )
            : Promise.resolve(false)
        }
      />
    </div>
  );
}
