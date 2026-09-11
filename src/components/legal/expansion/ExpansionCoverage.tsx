import { useExpansionSources } from "./expansion-sources";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  readCoverage,
  reviewCoverage,
  recordHomologation,
  configureExpansionConnection,
} from "@/lib/api/legal-expansion";
import type {
  ExpansionMetadata,
  ExpansionCoverageRead,
  ExpansionHomologationInput,
} from "@/types/legal-expansion";
import { LegalError, LegalLoading } from "../LegalShared";
import { useLegalAction } from "../legal-ui";
import {
  OperationPanel,
  OperationRecords,
  OperationReasonDialog,
} from "../operations/OperationPanel";
import {
  ExpansionAccessNotice,
  ExpansionDialog,
  ExpansionNotice,
  ExpansionPagination,
  ExpansionSelect,
} from "./ExpansionShared";
import { useExpansionList } from "./expansion-hooks";
import {
  EXPANSION_STATES,
  expansionCaseAccess,
  expansionDate,
  expansionKey,
  type ExpansionProps,
} from "./expansion-ui";
import {
  ExpansionFacts,
  ExpansionCheck,
  ExpansionDocumentField,
  ExpansionText,
} from "./ExpansionFields";
import ExpansionCoverageForm from "./ExpansionCoverageForm";
import { OPERATION_LABELS } from "./expansion-labels";
export default function ExpansionCoverage(props: ExpansionProps) {
  const list = useExpansionList(props, "coverages", props.context.can_manage);
  const [create, setCreate] = useState(false),
    [selected, setSelected] = useState<ExpansionMetadata | null>(null);
  if (!expansionCaseAccess(props)) return <ExpansionAccessNotice />;
  if (!props.context.can_manage)
    return (
      <ExpansionNotice>
        A gestão da cobertura institucional exige administrador do escritório. A
        preparação de atos mantém suas próprias permissões no caso.
      </ExpansionNotice>
    );
  return (
    <OperationPanel
      title="Operações e cobertura institucional"
      description="Cada operação tem autorização, ambiente, prova e homologação próprios. Nenhum adaptador institucional está ativo nesta etapa."
      actions={
        <Button size="sm" onClick={() => setCreate(true)}>
          Registrar cobertura
        </Button>
      }
    >
      <OperationRecords
        pending={list.query.isPending}
        error={list.query.error}
        retry={() => void list.query.refetch()}
        empty="Nenhuma cobertura registrada. Não há autorização presumida."
        count={list.rows.length}
      >
        {list.rows.map((row) => (
          <article key={row.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="break-words font-medium">
                {row.title} · versão {row.version_number}
              </h3>
              <Badge variant="outline">
                {EXPANSION_STATES[row.state] ?? row.state}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Conferência institucional e execução são estados distintos.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelected(row)}
            >
              Examinar cobertura
            </Button>
          </article>
        ))}
      </OperationRecords>
      <ExpansionPagination
        offset={list.offset}
        limit={list.limit}
        hasMore={list.hasMore}
        pending={list.query.isFetching}
        onChange={list.setOffset}
      />
      {create && (
        <ExpansionCoverageForm props={props} onClose={() => setCreate(false)} />
      )}{" "}
      {selected && list.rows.some((x) => x.id === selected.id) && (
        <CoverageReader
          props={props}
          id={selected.id}
          onClose={() => setSelected(null)}
        />
      )}
    </OperationPanel>
  );
}
function CoverageReader({
  props,
  id,
  onClose,
}: {
  props: ExpansionProps;
  id: string;
  onClose(): void;
}) {
  const query = useQuery({
    queryKey: expansionKey(props, "coverage-" + id),
    queryFn: ({ signal }) => readCoverage(id, signal),
    enabled: props.context.can_manage && expansionCaseAccess(props),
    retry: false,
    gcTime: 0,
    refetchInterval: 15000,
  });
  const [bindingConfirmed, setBindingConfirmed] = useState(false);
  const [copy, setCopy] = useState(false),
    [test, setTest] = useState(false),
    [decision, setDecision] = useState<"reviewed" | "revoked" | null>(null);
  const action = useLegalAction(),
    data = query.isError ? undefined : query.data;
  if (!props.context.can_manage || !expansionCaseAccess(props)) return null;
  const v = data?.version;
  return (
    <ExpansionDialog
      title="Conferência da cobertura"
      description="A leitura revalida a prova. Revisar ou registrar homologação não habilita chamadas ao provedor."
      onClose={onClose}
    >
      {query.isPending ? (
        <LegalLoading />
      ) : query.isError ? (
        <LegalError error={query.error} retry={() => void query.refetch()} />
      ) : v && data ? (
        <>
          <ExpansionFacts
            items={[
              ["Operação", OPERATION_LABELS[v.operation]],
              ["Instituição", v.institution_reference],
              ["Tribunal ou órgão", v.court],
              ["Grau", v.degree],
              ["Canal", v.channel],
              ["Versão técnica", v.api_version],
              [
                "Ambiente",
                v.environment === "production" ? "Produção" : "Homologação",
              ],
              ["Consulta da fonte", expansionDate(v.checked_on)],
              [
                "Vigência",
                expansionDate(v.valid_from) +
                  " a " +
                  expansionDate(v.valid_until),
              ],
              [
                "Permissão",
                v.permission_state === "documented"
                  ? "Documentada"
                  : v.permission_state === "denied"
                    ? "Negada"
                    : "Não conferida",
              ],
              ["Limitações", v.limitations],
              ["Revisão", v.review_note],
            ]}
          />
          <a
            className="text-sm underline"
            href={v.documentation_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir documentação informada
          </a>
          <ExpansionNotice>
            Execução externa indisponível. Adaptador não implementado.
            Configuração:{" "}
            {data.connection?.configured
              ? "registrada no ambiente"
              : "não configurada"}
            . Permissão atual:{" "}
            {data.connection?.permission_current ? "conferida" : "pendente"}.
            Homologação da operação:{" "}
            {data.connection?.homologation_passed
              ? "cenário aprovado registrado"
              : "pendente"}
            .
          </ExpansionNotice>
          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">Configuração do ambiente</h3>
            <p className="text-sm text-muted-foreground">
              A instituição e a conta são conferidas pelo servidor. Vincular uma
              configuração não implementa nem ativa o adaptador externo.
            </p>
            <ExpansionCheck
              label="Conferi a cobertura e a configuração institucional correspondente"
              checked={bindingConfirmed}
              onChange={setBindingConfirmed}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!bindingConfirmed || !data.is_current || action.pending}
              onClick={() =>
                void action.run(async () => {
                  await configureExpansionConnection(
                    v.id,
                    !data.connection?.configured,
                  );
                  setBindingConfirmed(false);
                }, "Configuração registrada; execução externa permanece indisponível")
              }
            >
              {data.connection?.configured
                ? "Desvincular configuração"
                : "Vincular configuração do ambiente"}
            </Button>
          </section>
          {!data.is_current && (
            <ExpansionNotice>
              Esta cobertura ainda não é uma autorização vigente para uso.
              Confira estado, vigência, prova e versões posteriores.
            </ExpansionNotice>
          )}
          <section className="space-y-2">
            <h3 className="font-medium">Evidências de homologação</h3>
            {data.homologations.length ? (
              data.homologations.map((h) => (
                <article key={h.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{h.scenario}</p>
                  <p>
                    {h.result === "passed"
                      ? "Cenário passou"
                      : h.result === "failed"
                        ? "Cenário falhou"
                        : "Resultado inconclusivo"}{" "}
                    · {expansionDate(h.tested_on)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{h.note}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma homologação registrada.
              </p>
            )}
          </section>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setCopy(true)}>
              Criar nova versão
            </Button>
            <Button variant="outline" onClick={() => setTest(true)}>
              Registrar homologação
            </Button>
            {v.state === "draft" && (
              <Button
                disabled={
                  v.permission_state !== "documented" ||
                  !v.permission_document_id ||
                  !v.checked_on ||
                  !v.valid_from ||
                  !v.valid_until
                }
                onClick={() => setDecision("reviewed")}
              >
                Revisar autorização
              </Button>
            )}
            {v.state === "reviewed" && (
              <Button variant="outline" onClick={() => setDecision("revoked")}>
                Revogar cobertura
              </Button>
            )}
          </div>
          {copy && (
            <ExpansionCoverageForm
              props={props}
              previous={v}
              onClose={() => setCopy(false)}
            />
          )}{" "}
          {test && (
            <HomologationForm
              props={props}
              data={data}
              onClose={() => setTest(false)}
            />
          )}{" "}
          {decision &&
            ((decision === "reviewed" && v.state === "draft") ||
              (decision === "revoked" && v.state === "reviewed")) && (
              <OperationReasonDialog
                open
                title={
                  decision === "reviewed"
                    ? "Registrar conferência institucional"
                    : "Revogar cobertura"
                }
                description="Identifique o que foi conferido e os limites desta decisão. Nenhum envio ou ciência será executado."
                actionLabel={
                  decision === "reviewed"
                    ? "Confirmar autorização conferida"
                    : "Confirmar revogação"
                }
                pending={action.pending}
                onClose={() => setDecision(null)}
                onSave={(note) =>
                  action.run(
                    () => reviewCoverage(id, decision, note),
                    "Decisão registrada",
                  )
                }
              />
            )}
        </>
      ) : null}
    </ExpansionDialog>
  );
}
function HomologationForm({
  props,
  data,
  onClose,
}: {
  props: ExpansionProps;
  data: ExpansionCoverageRead;
  onClose(): void;
}) {
  const sources = useExpansionSources(props),
    action = useLegalAction();
  const [form, setForm] = useState<ExpansionHomologationInput>({
    scenario: "",
    result: "inconclusive",
    evidence_document_id: "",
    tested_on: "",
    note: "",
  });
  const set = <K extends keyof ExpansionHomologationInput>(
    k: K,
    v: ExpansionHomologationInput[K],
  ) => setForm((o) => ({ ...o, [k]: v }));
  return (
    <ExpansionDialog
      title="Registrar resultado de homologação"
      description="Registre o resultado real do cenário e sua prova. Este formulário não executa testes no serviço externo."
      pending={action.pending}
      onClose={onClose}
      onSubmit={() =>
        action.run(async () => {
          await recordHomologation(data.version.id, form);
          onClose();
        }, "Evidência de homologação registrada")
      }
    >
      <ExpansionText
        label="Cenário examinado"
        value={form.scenario}
        onChange={(v) => set("scenario", v)}
        required
        multiline
        maxLength={2000}
      />
      <ExpansionSelect
        label="Resultado observado"
        value={form.result}
        onChange={(v) =>
          set("result", v as ExpansionHomologationInput["result"])
        }
      >
        <option value="inconclusive">Inconclusivo</option>
        <option value="passed">Passou no cenário registrado</option>
        <option value="failed">Falhou no cenário registrado</option>
      </ExpansionSelect>
      <ExpansionText
        label="Data do teste"
        type="date"
        value={form.tested_on}
        onChange={(v) => set("tested_on", v)}
        required
      />
      <ExpansionDocumentField
        label="Prova geral do teste"
        docs={sources.docs.filter((d) => d.category === "general")}
        value={form.evidence_document_id}
        onChange={(v) => set("evidence_document_id", v)}
        required
      />
      <ExpansionText
        label="Método, limites e resultado conferidos"
        value={form.note}
        onChange={(v) => set("note", v)}
        required
        multiline
        maxLength={4000}
      />
    </ExpansionDialog>
  );
}
