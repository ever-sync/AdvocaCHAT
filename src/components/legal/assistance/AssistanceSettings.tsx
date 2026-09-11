import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments } from "@/lib/api/legal";
import {
  configureAssistanceAi,
  configureAssistanceOcr,
  reviewAssistancePolicy,
} from "@/lib/api/legal-assistance";
import type { AssistancePolicy } from "@/types/legal-assistance";
import { useLegalAction } from "../legal-ui";
import { OperationPanel, OperationRecords } from "../operations/OperationPanel";
import {
  AssistanceAccessNotice,
  AssistanceDialog,
  AssistanceNotice,
  AssistancePagination,
  AssistanceSelect,
} from "./AssistanceShared";
import {
  AssistanceCatalogCheck,
  AssistanceCatalogText,
  AssistanceSourceLink,
} from "./AssistanceKnowledgeFields";
import { AssistanceSettingsPolicyForm } from "./AssistanceSettingsPolicyForm";
import { assistancePolicyUrl } from "./AssistanceSettingsValidation";
import { useAssistanceList } from "./assistance-hooks";
import {
  assistanceCaseAccess,
  assistanceDate,
  assistanceKey,
  type AssistanceProps,
} from "./assistance-ui";

const states = {
  draft: "Rascunho",
  approved: "Política aprovada",
  rejected: "Rejeitada",
  revoked: "Revogada",
};
export function AssistanceSettings(props: AssistanceProps) {
  const access =
    assistanceCaseAccess(props) &&
    props.context.tenant_id === props.workspace.tenant_id &&
    props.context.user_id === props.workspace.user_id;
  const manage = access && props.context.can_manage;
  const [editing, setEditing] = useState<string | null>(null);
  const [review, setReview] = useState<{
    id: string;
    decision: "approved" | "rejected" | "revoked";
  } | null>(null);
  const policies = useAssistanceList(props, "ai_policies", access);
  const original = policies.rows.find((row) => row.id === editing);
  const reviewing = policies.rows.find((row) => row.id === review?.id);
  const docs = useQuery({
    queryKey: assistanceKey(props, "policy-documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
    enabled: manage,
    retry: false,
  });
  const documents =
    access && !docs.isError
      ? (docs.data ?? []).filter(
          (doc) =>
            doc.case_id === props.legalCase.id &&
            doc.category === "general" &&
            doc.status === "ready",
        )
      : [];
  const dialogKey = `${props.workspace.user_id}:${props.workspace.tenant_id}:${props.legalCase.id}:${manage}`;
  if (!access) return <AssistanceAccessNotice />;
  return (
    <div className="space-y-4">
      <OperationPanel
        title="Reconhecimento e consumo do escritório"
        description="OCR é processamento privado. Geração externa exige uma política aprovada e configuração compatível."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border p-3">
            <h3 className="font-medium">Páginas de OCR</h3>
            <p>
              {props.context.ocr_usage.charged_pages} consideradas no limite de{" "}
              {props.context.ocr_usage.monthly_limit}
            </p>
            <p className="text-xs text-muted-foreground">
              Mês: {assistanceDate(props.context.ocr_usage.month)}. Inclui
              reservas conservadoras de trabalhos iniciados.
            </p>
          </div>
          <div className="rounded border p-3">
            <h3 className="font-medium">Orçamento da geração externa</h3>
            {props.context.ai_usage ? (
              <>
                <p>
                  USD {props.context.ai_usage.quota_cost.replace(".", ",")}{" "}
                  considerados no limite de USD{" "}
                  {props.context.ai_usage.monthly_budget.replace(".", ",")}
                </p>
                <p className="text-xs text-muted-foreground">
                  Mês: {assistanceDate(props.context.ai_usage.month)}. A reserva
                  e o consumo incerto não representam cobrança confirmada.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sem orçamento de IA configurado. Nenhum custo zero foi
                presumido.
              </p>
            )}
          </div>
        </div>
        {manage ? (
          <OcrSettings
            key={`${dialogKey}:${props.context.settings.updated_at}`}
            props={props}
          />
        ) : (
          <p className="text-sm">
            OCR{" "}
            {props.context.settings.ocr_enabled ? "habilitado" : "desabilitado"}
            ; até {props.context.settings.ocr_max_pages} páginas por documento.
            Alterações exigem administração do escritório.
          </p>
        )}
      </OperationPanel>
      <OperationPanel
        title="Políticas de geração externa"
        description="Finalidade, retenção, categorias permitidas, tarifas e vigência com revisão nominal."
        actions={
          manage && (
            <Button onClick={() => setEditing("new")}>
              Nova política de IA
            </Button>
          )
        }
      >
        <OperationRecords
          pending={policies.query.isPending}
          error={policies.query.error}
          retry={() => void policies.query.refetch()}
          count={policies.rows.length}
          empty="Nenhuma política cadastrada ou disponível para consulta."
        >
          {policies.rows.map((row) => (
            <article key={row.id} className="space-y-3 rounded border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h3 className="break-words font-medium">{row.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    Versão {row.version_number} · modelo {row.model}
                  </p>
                </div>
                <Badge variant="outline">{states[row.state]}</Badge>
              </div>
              <PolicyDetails policy={row} />
              {manage && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(row.id)}
                  >
                    Criar nova versão
                  </Button>
                  {row.state === "draft" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          setReview({ id: row.id, decision: "approved" })
                        }
                      >
                        Revisar e aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setReview({ id: row.id, decision: "rejected" })
                        }
                      >
                        Rejeitar política
                      </Button>
                    </>
                  )}
                  {row.state === "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setReview({ id: row.id, decision: "revoked" })
                      }
                    >
                      Revogar política
                    </Button>
                  )}
                </div>
              )}
            </article>
          ))}
        </OperationRecords>
        <AssistancePagination
          {...policies}
          pending={policies.query.isFetching}
          onChange={policies.setOffset}
        />
      </OperationPanel>
      <AiConnection
        key={`${dialogKey}:${props.context.ai_connection?.id ?? "none"}:${props.context.ai_connection?.state ?? "none"}`}
        props={props}
        policies={policies.rows}
        manage={manage}
      />
      {manage && editing && (editing === "new" || original) && (
        <AssistanceSettingsPolicyForm
          key={`${dialogKey}:${editing}`}
          original={original}
          documents={documents}
          onClose={() => setEditing(null)}
        />
      )}
      {manage &&
        review &&
        reviewing &&
        (review.decision === "revoked"
          ? reviewing.state === "approved"
          : reviewing.state === "draft") && (
          <PolicyReview
            key={`${dialogKey}:${review.id}:${review.decision}`}
            policy={reviewing}
            decision={review.decision}
            onClose={() => setReview(null)}
          />
        )}
    </div>
  );
}

function OcrSettings({ props }: { props: AssistanceProps }) {
  const action = useLegalAction();
  const [enabled, setEnabled] = useState(props.context.settings.ocr_enabled);
  const [monthly, setMonthly] = useState(
    String(props.context.settings.ocr_monthly_page_limit),
  );
  const [maximum, setMaximum] = useState(
    String(props.context.settings.ocr_max_pages),
  );
  const [confirmed, setConfirmed] = useState(false);
  const month = /^[0-9]{1,6}$/.test(monthly) ? Number(monthly) : 0,
    document = /^[0-9]{1,2}$/.test(maximum) ? Number(maximum) : 0;
  const ready =
    confirmed &&
    month >= 1 &&
    month <= 100000 &&
    document >= 1 &&
    document <= 20;
  async function save() {
    if (ready)
      await action.run(
        () => configureAssistanceOcr(enabled, month, document),
        "Configuração de OCR registrada",
      );
  }
  return (
    <section className="space-y-3 rounded border p-4">
      <AssistanceCatalogCheck
        label="Habilitar OCR privado para este escritório"
        checked={enabled}
        onChange={setEnabled}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <AssistanceCatalogText
          label="Limite mensal de páginas de OCR"
          value={monthly}
          onChange={setMonthly}
          maxLength={6}
          required
        />
        <AssistanceCatalogText
          label="Máximo de páginas por documento"
          value={maximum}
          onChange={setMaximum}
          maxLength={2}
          required
          hint="De 1 a 20. Documentos maiores exigem tratamento apropriado."
        />
      </div>
      <AssistanceCatalogCheck
        label="Conferi os limites e a habilitação do OCR"
        checked={confirmed}
        onChange={setConfirmed}
      />
      <Button
        type="button"
        disabled={!ready || action.pending}
        onClick={() => void save()}
      >
        Salvar configuração de OCR
      </Button>
    </section>
  );
}

function PolicyDetails({ policy }: { policy: AssistancePolicy }) {
  return (
    <div className="space-y-2 text-sm">
      <p>
        Vigência: {assistanceDate(policy.valid_from)} a{" "}
        {assistanceDate(policy.valid_until)}. Consulta:{" "}
        {assistanceDate(policy.checked_on)}.
      </p>
      <p className="whitespace-pre-wrap break-words">
        Finalidade: {policy.purpose_note}
      </p>
      <p className="whitespace-pre-wrap break-words">
        Retenção e condições: {policy.retention_note}
      </p>
      <p>
        Dados de saúde:{" "}
        {policy.allow_medical ? "admitidos pela política" : "não admitidos"}.
        Dados fiscais:{" "}
        {policy.allow_fiscal ? "admitidos pela política" : "não admitidos"}.
      </p>
      <p>
        Entrada: USD {policy.input_rate.replace(".", ",")} e saída: USD{" "}
        {policy.output_rate.replace(".", ",")} por milhão de tokens. Limite
        mensal: USD {policy.monthly_budget.replace(".", ",")}. Máximo por
        solicitação: {policy.max_input_tokens} tokens de entrada e{" "}
        {policy.max_output_tokens} de saída.
      </p>
      <AssistanceSourceLink url={policy.source_url} />
      <p>
        {policy.source_document_id
          ? "Prova documental geral vinculada."
          : "Prova documental ainda ausente."}
      </p>
      {policy.reviewed_at && (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
          Revisão registrada em {assistanceDate(policy.reviewed_at)}.{" "}
          {policy.review_note}
        </p>
      )}
    </div>
  );
}

function PolicyReview({
  policy,
  decision,
  onClose,
}: {
  policy: AssistancePolicy;
  decision: "approved" | "rejected" | "revoked";
  onClose(): void;
}) {
  const action = useLegalAction();
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const sourceReady = Boolean(
    policy.source_document_id &&
    policy.checked_on &&
    policy.valid_from &&
    policy.valid_until &&
    assistancePolicyUrl(policy.source_url),
  );
  const ready =
    confirmed &&
    note.trim().length >= 3 &&
    (decision !== "approved" || sourceReady);
  async function save() {
    if (
      ready &&
      (await action.run(
        () => reviewAssistancePolicy(policy.id, decision, note.trim()),
        "Revisão da política registrada",
      ))
    )
      onClose();
  }
  const verb =
    decision === "approved"
      ? "Aprovar"
      : decision === "rejected"
        ? "Rejeitar"
        : "Revogar";
  return (
    <AssistanceDialog
      title={`${verb} política de IA`}
      description="A decisão fica vinculada ao seu usuário. Aprovar a política não contrata, configura nem aciona o provedor."
      onClose={onClose}
      onSubmit={save}
      pending={action.pending}
      disabled={!ready}
      actionLabel={`${verb} política`}
    >
      <PolicyDetails policy={policy} />
      {decision === "approved" && !sourceReady && (
        <AssistanceNotice error>
          Faltam prova geral, consulta, origem HTTPS ou vigência. Crie uma
          versão completa antes de aprovar.
        </AssistanceNotice>
      )}
      <AssistanceCatalogText
        label="Justificativa da revisão da política"
        value={note}
        onChange={setNote}
        multiline
        required
      />
      <AssistanceCatalogCheck
        label="Examinei a prova, retenção, finalidade, categorias, tarifas e limites desta política"
        checked={confirmed}
        onChange={setConfirmed}
      />
    </AssistanceDialog>
  );
}

function AiConnection({
  props,
  policies,
  manage,
}: {
  props: AssistanceProps;
  policies: AssistancePolicy[];
  manage: boolean;
}) {
  const action = useLegalAction();
  const [policyId, setPolicyId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const connection = props.context.ai_connection;
  const selected = policies.find(
    (policy) => policy.id === policyId && policy.state === "approved",
  );
  const labels = {
    not_configured: "Não configurada",
    enabled: "Habilitada",
    disabled: "Desabilitada",
    policy_required: "Política atual necessária",
  };
  async function configure(enabled: boolean) {
    const id = enabled ? selected?.id : connection?.policy_version_id;
    if (!manage || !id || (enabled && !confirmed)) return;
    await action.run(
      () => configureAssistanceAi(id, enabled),
      "Configuração da geração externa registrada",
    );
  }
  return (
    <OperationPanel
      title="Conexão da geração externa"
      description="A conta, a chave e o modelo são vinculados pelo servidor ao escritório."
    >
      <p>
        Estado: {connection ? labels[connection.state] : "Não configurada"}
        {connection ? ` · modelo ${connection.model}` : ""}.
      </p>
      <AssistanceNotice>
        Sem conta, modelo e política compatíveis, a geração permanece
        indisponível. Configurar esta conexão não envia documentos nem gera
        rascunhos automaticamente.
      </AssistanceNotice>
      {manage && (
        <div className="space-y-3">
          <AssistanceSelect
            label="Política aprovada para vincular"
            value={policyId}
            onChange={(id) => {
              setPolicyId(id);
              setConfirmed(false);
            }}
          >
            <option value="">
              Selecione uma política conferida nesta página
            </option>
            {policies
              .filter((policy) => policy.state === "approved")
              .map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.title} · v{policy.version_number} · {policy.model}
                </option>
              ))}
          </AssistanceSelect>
          <AssistanceCatalogCheck
            label="Conferi a política escolhida e autorizo a habilitação conforme a configuração do escritório"
            checked={confirmed}
            onChange={setConfirmed}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!selected || !confirmed || action.pending}
              onClick={() => void configure(true)}
            >
              Vincular política e habilitar
            </Button>
            {connection?.enabled && (
              <Button
                type="button"
                variant="outline"
                disabled={action.pending}
                onClick={() => void configure(false)}
              >
                Desabilitar geração externa
              </Button>
            )}
          </div>
        </div>
      )}
    </OperationPanel>
  );
}
export default AssistanceSettings;
