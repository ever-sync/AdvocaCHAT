import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import {
  createIrRuleVersion,
  listIrRuleVersions,
  reviewIrRuleVersion,
} from "@/lib/api/legal-ir";
import type { IrOfficialSource, IrRuleVersion } from "@/types/legal-ir";
import { LegalField } from "../LegalShared";
import { legalDate, selectClassName, useLegalAction } from "../legal-ui";
import {
  OperationPanel,
  OperationReasonDialog,
  OperationRecords,
} from "../operations/OperationPanel";
import { IrDialog, IrSelection } from "./IrShared";
import {
  INCOME_KINDS,
  PAYER_TYPES,
  irWorkspaceKey,
  personName,
  safeReferenceUrl,
  type IrPanelProps,
} from "./ir-ui";

function RuleDialog({
  props,
  original,
  onClose,
}: {
  props: IrPanelProps;
  original?: IrRuleVersion;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(original?.title ?? "");
  const [criteria, setCriteria] = useState(original?.criteria ?? "");
  const [sources, setSources] = useState<IrOfficialSource[]>(
    original?.sources ?? [{ title: "", url: "" }],
  );
  const [payers, setPayers] = useState<string[]>(
    Array.isArray(original?.scope.payer_types)
      ? original.scope.payer_types.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );
  const [incomes, setIncomes] = useState<string[]>(
    Array.isArray(original?.scope.income_kinds)
      ? original.scope.income_kinds.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );
  const [route, setRoute] = useState(
    typeof original?.scope.route === "string" ? original.scope.route : "both",
  );
  const [validityNote, setValidityNote] = useState(
    typeof original?.scope.validity_note === "string"
      ? original.scope.validity_note
      : "",
  );
  const [scopeNotes, setScopeNotes] = useState(
    typeof original?.scope.notes === "string" ? original.scope.notes : "",
  );
  const action = useLegalAction();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      await action.run(
        () =>
          createIrRuleVersion({
            rule_key:
              original?.rule_key ??
              `fundamento_${crypto.randomUUID().replace(/-/g, "")}`,
            title: title.trim(),
            criteria: criteria.trim(),
            scope: {
              ...original?.scope,
              payer_types: payers,
              income_kinds: incomes,
              route,
              notes: scopeNotes.trim(),
              validity_note: validityNote.trim(),
            },
            sources: sources.map((source) => ({
              title: source.title?.trim(),
              url: safeReferenceUrl(source.url) ?? source.url.trim(),
              checked_on: source.checked_on || undefined,
              version_note: source.version_note?.trim() || undefined,
            })),
          }),
        "Referência salva como rascunho para revisão",
      )
    )
      onClose();
  }
  return (
    <IrDialog
      wide
      title={
        original
          ? "Nova versão do fundamento"
          : "Cadastrar fundamento para revisão"
      }
      description="Registre a fonte examinada e a interpretação do escritório. O catálogo não executa regras nem decide a elegibilidade de clientes."
      onClose={onClose}
      pending={action.pending}
    >
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <LegalField label="Título do fundamento">
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
        <LegalField label="Critérios, ressalvas e interpretação jurídica">
          {(id) => (
            <Textarea
              id={id}
              required
              rows={6}
              maxLength={12000}
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
            />
          )}
        </LegalField>
        <div className="grid gap-3 sm:grid-cols-2">
          <IrSelection
            label="Tipos de pagador abrangidos"
            values={Object.entries(PAYER_TYPES).map(([id, label]) => ({
              id,
              label,
            }))}
            selected={payers}
            onChange={setPayers}
          />
          <IrSelection
            label="Rendimentos abrangidos"
            values={Object.entries(INCOME_KINDS).map(([id, label]) => ({
              id,
              label,
            }))}
            selected={incomes}
            onChange={setIncomes}
          />
        </div>
        <LegalField label="Rota examinada">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={route}
              onChange={(event) => setRoute(event.target.value)}
            >
              <option value="both">Administrativa e judicial</option>
              <option value="administrative">Administrativa</option>
              <option value="judicial">Judicial</option>
            </select>
          )}
        </LegalField>
        <LegalField
          label="Limites de aplicação da referência"
          hint="Sem dados de clientes. Explique o escopo, os marcos documentais e os pontos que exigem revisão individual."
        >
          {(id) => (
            <Textarea
              id={id}
              maxLength={4000}
              value={scopeNotes}
              onChange={(event) => setScopeNotes(event.target.value)}
            />
          )}
        </LegalField>
        <LegalField
          label="Vigência, versão da norma e ressalvas"
          hint="Descreva a vigência aplicável e os limites da referência. Este campo será necessário para aprovar a versão."
        >
          {(id) => (
            <Textarea
              id={id}
              maxLength={4000}
              value={validityNote}
              onChange={(event) => setValidityNote(event.target.value)}
            />
          )}
        </LegalField>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">
            Fontes oficiais examinadas
          </legend>
          {sources.map((source, index) => (
            <div key={index} className="space-y-2 rounded-lg border p-3">
              <LegalField label={`Nome da fonte ${index + 1}`}>
                {(id) => (
                  <Input
                    id={id}
                    maxLength={200}
                    value={source.title ?? ""}
                    onChange={(event) =>
                      setSources(
                        sources.map((item, current) =>
                          current === index
                            ? { ...item, title: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                )}
              </LegalField>
              <LegalField
                label={`Endereço da fonte ${index + 1}`}
                hint="Informe o endereço HTTPS da página oficial que foi conferida."
              >
                {(id) => (
                  <Input
                    id={id}
                    type="url"
                    required
                    maxLength={2000}
                    placeholder="https://..."
                    value={source.url}
                    onChange={(event) =>
                      setSources(
                        sources.map((item, current) =>
                          current === index
                            ? { ...item, url: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                )}
              </LegalField>
              <div className="grid gap-3 sm:grid-cols-2">
                <LegalField
                  label={`Data de consulta da fonte ${index + 1}`}
                  hint="Informe quando você conferiu o conteúdo."
                >
                  {(id) => (
                    <Input
                      id={id}
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={source.checked_on ?? ""}
                      onChange={(event) =>
                        setSources(
                          sources.map((item, current) =>
                            current === index
                              ? { ...item, checked_on: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  )}
                </LegalField>
                <LegalField
                  label={`Versão ou observação da fonte ${index + 1}`}
                >
                  {(id) => (
                    <Input
                      id={id}
                      maxLength={500}
                      value={source.version_note ?? ""}
                      onChange={(event) =>
                        setSources(
                          sources.map((item, current) =>
                            current === index
                              ? { ...item, version_note: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  )}
                </LegalField>
              </div>
              {sources.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setSources(
                      sources.filter((_, current) => current !== index),
                    )
                  }
                >
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                  Remover fonte {index + 1}
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={sources.length >= 20}
            onClick={() => setSources([...sources, { title: "", url: "" }])}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Adicionar fonte
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
              !criteria.trim() ||
              sources.some((source) => !safeReferenceUrl(source.url))
            }
          >
            Salvar rascunho do fundamento
          </Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}

export function IrCatalog(props: IrPanelProps) {
  const rules = useQuery({
    queryKey: irWorkspaceKey(props, "rules"),
    queryFn: listIrRuleVersions,
  });
  const [form, setForm] = useState<IrRuleVersion | "new" | null>(null);
  const [review, setReview] = useState<{
    rule: IrRuleVersion;
    decision: "approved" | "rejected";
  } | null>(null);
  const action = useLegalAction();
  const reviewReady = (rule: IrRuleVersion) =>
    typeof rule.scope.validity_note === "string" &&
    Boolean(rule.scope.validity_note.trim()) &&
    rule.sources.every((source) =>
      /^\d{4}-\d{2}-\d{2}$/.test(source.checked_on ?? ""),
    );
  return (
    <OperationPanel
      title="Catálogo de fundamentos jurídicos"
      description="Referências versionadas do escritório, com fontes e revisão expressa. Nenhum fundamento vem aprovado de fábrica."
      actions={
        props.workspace.can_create ? (
          <Button size="sm" onClick={() => setForm("new")}>
            Novo fundamento
          </Button>
        ) : null
      }
    >
      <OperationRecords
        pending={rules.isPending}
        error={rules.error}
        retry={() => void rules.refetch()}
        empty="Cadastre e revise as referências que o escritório utilizará"
        count={rules.data?.length ?? 0}
      >
        {rules.data?.map((rule) => (
          <div key={rule.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="break-words font-medium">
                {rule.title} · versão {rule.version_number}
              </p>
              <Badge variant="outline">
                {rule.status === "approved"
                  ? "Referência revisada"
                  : rule.status === "rejected"
                    ? "Revisão não aprovada"
                    : "Rascunho sem homologação"}
              </Badge>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">
              {rule.criteria}
            </p>
            {typeof rule.scope.notes === "string" && rule.scope.notes ? (
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                Escopo: {rule.scope.notes}
              </p>
            ) : null}
            {typeof rule.scope.validity_note === "string" &&
            rule.scope.validity_note ? (
              <p className="whitespace-pre-wrap break-words text-sm">
                Vigência e ressalvas: {rule.scope.validity_note}
              </p>
            ) : null}
            <ul className="space-y-2">
              {rule.sources.map((source, index) => {
                const url = safeReferenceUrl(source.url);
                return (
                  <li key={index} className="min-w-0 break-words text-sm">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-start gap-1 text-primary underline underline-offset-2"
                      >
                        <span className="min-w-0 break-all">
                          {source.title || source.url}
                        </span>
                        <ExternalLink
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          aria-hidden
                        />
                      </a>
                    ) : (
                      "Referência com endereço inválido"
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Consulta:{" "}
                      {source.checked_on
                        ? legalDate(`${source.checked_on}T12:00:00`)
                        : "Ainda não registrada"}
                      {source.version_note ? ` · ${source.version_note}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
            {rule.review_note ? (
              <p className="whitespace-pre-wrap break-words text-sm">
                Revisão: {rule.review_note}
              </p>
            ) : null}
            {rule.approved_by ? (
              <p className="text-xs text-muted-foreground">
                {personName(props, rule.approved_by)} ·{" "}
                {legalDate(rule.reviewed_at, true)}
              </p>
            ) : null}
            {rule.status === "draft" && !reviewReady(rule) ? (
              <p className="text-xs text-muted-foreground">
                Para aprovar, registre a vigência e a data de consulta de cada
                fonte em uma nova versão.
              </p>
            ) : null}
            {props.workspace.can_create ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setForm(rule)}
                >
                  Nova versão deste fundamento
                </Button>
                {rule.status === "draft" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={!reviewReady(rule)}
                      onClick={() => setReview({ rule, decision: "approved" })}
                    >
                      Aprovar referência
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReview({ rule, decision: "rejected" })}
                    >
                      Solicitar ajuste da referência
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </OperationRecords>
      {form ? (
        <RuleDialog
          props={props}
          original={form === "new" ? undefined : form}
          onClose={() => setForm(null)}
        />
      ) : null}
      <OperationReasonDialog
        key={review?.rule.id + ":" + review?.decision}
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={
          review?.decision === "approved"
            ? "Aprovar referência para o escritório"
            : "Registrar necessidade de ajuste"
        }
        description="Declare as fontes conferidas, o escopo e as ressalvas da sua revisão profissional. Essa ação não aprova casos individuais."
        pending={action.pending}
        onSave={(note) =>
          review
            ? action.run(
                () =>
                  reviewIrRuleVersion(review.rule.id, review.decision, note),
                "Revisão da referência registrada",
              )
            : Promise.resolve(false)
        }
      />
    </OperationPanel>
  );
}
