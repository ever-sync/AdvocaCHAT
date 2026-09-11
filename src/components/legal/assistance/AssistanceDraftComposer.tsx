import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAssistanceDraft,
  enqueueAssistanceAi,
} from "@/lib/api/legal-assistance";
import type {
  AssistanceCategory,
  AssistanceCitation,
  AssistanceDraftBody,
  AssistanceDraftKind,
  AssistanceDraftRead,
} from "@/types/legal-assistance";
import { LegalField } from "../LegalShared";
import { useLegalAction } from "../legal-ui";
import { AssistanceDraftEditor } from "./AssistanceDraftEditor";
import {
  AssistanceAccessNotice,
  AssistanceCategoryField,
  AssistanceDialog,
  AssistanceNotice,
  AssistanceSelect,
} from "./AssistanceShared";
import {
  ASSISTANCE_DRAFT_KINDS,
  assistanceCaseAccess,
  assistanceCategoryAccess,
  assistanceChoice,
  type AssistanceProps,
} from "./assistance-ui";
const emptyBody = (): AssistanceDraftBody => ({
  title: "",
  sections: [{ heading: "", text: "", citation_ids: [] }],
  missing_facts: [],
  divergences: [],
});
export function AssistanceDraftComposer({
  props,
  citations,
  previous,
  onClose,
}: {
  props: AssistanceProps;
  citations: AssistanceCitation[];
  previous?: AssistanceDraftRead;
  onClose(): void;
}) {
  const [draftKey, setDraftKey] = useState(previous?.version.draft_key ?? ""),
    [kind, setKind] = useState<AssistanceDraftKind>(
      previous?.version.kind ?? "summary",
    );
  const [category, setCategory] = useState<AssistanceCategory>(
      previous?.version.category ?? "restricted",
    ),
    [purpose, setPurpose] = useState(previous?.version.purpose ?? "");
  const [body, setBody] = useState<AssistanceDraftBody>(() =>
    previous ? structuredClone(previous.version.body) : emptyBody(),
  );
  const [aiConfirm, setAiConfirm] = useState(false),
    [tokens, setTokens] = useState(""),
    [idempotency] = useState(() => crypto.randomUUID());
  const action = useLegalAction();
  const allReadable = citations.every(
    (citation) =>
      citation.case_id === props.legalCase.id &&
      assistanceCategoryAccess(props, citation.category),
  );
  if (!assistanceCaseAccess(props) || !props.context.can_edit || !allReadable)
    return <AssistanceAccessNotice />;
  const categoryAllowed = assistanceCategoryAccess(props, category);
  const allReferenced = [
    ...new Set(body.sections.flatMap((section) => section.citation_ids)),
  ];
  const referenced = citations.filter((citation) =>
    allReferenced.includes(citation.id),
  );
  const compatible = (refs: AssistanceCitation[]) =>
    refs.every(
      (citation) =>
        category === "restricted" ||
        citation.category === "general" ||
        citation.category === category,
    );
  const validBody =
    body.title.trim() &&
    body.title.length <= 200 &&
    body.sections.length > 0 &&
    body.sections.length <= 12 &&
    body.sections.every(
      (section) =>
        section.heading.trim() &&
        section.heading.length <= 200 &&
        section.text.trim() &&
        section.text.length <= 6000,
    ) &&
    body.missing_facts.length <= 20 &&
    body.divergences.length <= 20 &&
    [...body.missing_facts, ...body.divergences].every(
      (text) => text.trim() && text.length <= 2000,
    ) &&
    new TextEncoder().encode(JSON.stringify(body)).length <= 96000;
  const canSave =
    categoryAllowed &&
    purpose.trim().length > 0 &&
    draftKey.trim().length > 0 &&
    validBody &&
    allReferenced.length <= 12 &&
    referenced.length === allReferenced.length &&
    compatible(referenced);
  const connection = props.context.ai_connection;
  const aiReady = connection?.enabled && connection.state === "enabled";
  const canGenerate =
    aiReady &&
    categoryAllowed &&
    purpose.trim() &&
    draftKey.trim() &&
    citations.length > 0 &&
    citations.length <= 12 &&
    compatible(citations) &&
    (!previous || previous.is_current) &&
    Number.isInteger(Number(tokens)) &&
    Number(tokens) >= 256 &&
    Number(tokens) <= 4000;
  return (
    <AssistanceDialog
      title={previous ? "Nova versão do rascunho" : "Preparar rascunho interno"}
      description="Descreva a finalidade e examine as fontes. Salvar, solicitar geração e encaminhar para revisão são ações distintas."
      onClose={onClose}
      pending={action.pending}
      disabled={!canSave}
      actionLabel="Salvar rascunho manual"
      onSubmit={async () => {
        if (
          await action.run(
            () =>
              createAssistanceDraft(props.legalCase.id, {
                draft_key: draftKey.trim(),
                kind,
                category,
                purpose: purpose.trim(),
                body,
                citation_ids: allReferenced,
                previous_version_id: previous?.version.id,
              }),
            "Rascunho manual salvo para conferência",
          )
        )
          onClose();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <LegalField
          label="Identificador estável do rascunho"
          hint="Use o mesmo identificador apenas para versões deste texto."
        >
          {(id) => (
            <Input
              id={id}
              value={draftKey}
              required
              readOnly={Boolean(previous)}
              maxLength={80}
              onChange={(event) => setDraftKey(event.target.value)}
            />
          )}
        </LegalField>
        <AssistanceSelect
          label="Tipo do rascunho"
          value={kind}
          onChange={(value) => setKind(value as AssistanceDraftKind)}
          required
        >
          {Object.entries(ASSISTANCE_DRAFT_KINDS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </AssistanceSelect>
      </div>
      <AssistanceCategoryField
        props={props}
        value={category}
        onChange={setCategory}
        disabled={Boolean(previous)}
      />
      {previous && (
        <p className="text-sm text-muted-foreground">
          As versões desta série preservam a categoria original. Para outra
          categoria, prepare um rascunho separado.
        </p>
      )}
      {!categoryAllowed && (
        <AssistanceNotice>
          Selecione uma categoria autorizada para o conteúdo que vai preparar.
        </AssistanceNotice>
      )}
      <LegalField label="Finalidade e limites do rascunho">
        {(id) => (
          <Textarea
            id={id}
            value={purpose}
            required
            maxLength={2000}
            rows={3}
            onChange={(event) => setPurpose(event.target.value)}
          />
        )}
      </LegalField>
      {previous && !previous.is_current && (
        <AssistanceNotice error>
          A versão anterior tem fontes desatualizadas. Reexamine cada
          referência, remova vínculos que não possam ser usados e busque
          novamente os trechos atuais. Nenhuma referência será substituída
          automaticamente.
        </AssistanceNotice>
      )}
      {categoryAllowed && (
        <AssistanceDraftEditor
          canRead
          canEdit
          value={body}
          citations={citations.map((citation) =>
            assistanceChoice(citation, previous?.is_current ?? true),
          )}
          onChange={setBody}
          busy={action.pending}
        />
      )}
      {!compatible(referenced) && (
        <AssistanceNotice error>
          As referências incluem categorias que não cabem no acesso selecionado.
          Conteúdo médico e fiscal combinado exige acesso conjunto.
        </AssistanceNotice>
      )}
      <p className="text-xs text-muted-foreground">
        Título e títulos de seção: até 200 caracteres. Até 12 seções de 6.000
        caracteres, 12 referências e 20 pendências/divergências de 2.000
        caracteres cada. Preencha ou remova campos vazios antes de salvar.
      </p>
      <details className="space-y-3 rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Geração opcional por IA
        </summary>
        <div className="mt-4 space-y-3">
          {!aiReady ? (
            <AssistanceNotice>
              IA não configurada ou não autorizada. É possível continuar com a
              redação manual. Nenhuma chamada ao provedor será feita por esta
              tela sem configuração e solicitação explícita.
            </AssistanceNotice>
          ) : (
            <>
              <p className="text-sm">
                Modelo autorizado: {connection.model}. Serão enviados a
                finalidade e {citations.length} trechos selecionados. A resposta
                permanecerá rascunho não revisado; o texto manual acima não é
                enviado como fonte.
              </p>
              <LegalField
                label="Limite autorizado de tokens de saída"
                hint="De 256 a 4.000. O servidor reserva custo conforme a política e o orçamento atuais."
              >
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={256}
                    max={4000}
                    step={1}
                    value={tokens}
                    onChange={(event) => setTokens(event.target.value)}
                  />
                )}
              </LegalField>
              <Button
                type="button"
                variant="outline"
                disabled={!canGenerate || action.pending}
                onClick={() => setAiConfirm(true)}
              >
                Examinar solicitação de geração
              </Button>
            </>
          )}
        </div>
      </details>
      {aiConfirm && canGenerate && (
        <AssistanceDialog
          title="Confirmar geração com as fontes selecionadas"
          description="Esta operação pode consumir tokens e orçamento do provedor configurado. A finalidade e os trechos autorizados são enviados conforme a política revisada."
          onClose={() => setAiConfirm(false)}
          pending={action.pending}
          actionLabel="Solicitar rascunho por IA"
          onSubmit={async () => {
            if (
              await action.run(
                () =>
                  enqueueAssistanceAi(props.legalCase.id, {
                    draft_key: draftKey.trim(),
                    kind,
                    category,
                    purpose: purpose.trim(),
                    citation_ids: citations.map((citation) => citation.id),
                    max_output_tokens: Number(tokens),
                    idempotency_key: idempotency,
                  }),
                "Solicitação de geração registrada",
              )
            )
              onClose();
          }}
        >
          <p className="text-sm">
            {citations.length} referências · modelo {connection?.model} · até{" "}
            {tokens} tokens de saída. A solicitação não envia mensagem ao
            cliente, publica conteúdo nem pratica ato no tribunal.
          </p>
        </AssistanceDialog>
      )}
    </AssistanceDialog>
  );
}
