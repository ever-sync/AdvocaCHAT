import { useState } from "react";
import type { LegalCaseDocument } from "@/types/legal";
import type { JudicialRuleBody, JudicialRuleInput, JudicialRuleVersion } from "@/types/legal-judicial";
import { createJudicialRule } from "@/lib/api/legal-judicial";
import { useLegalAction } from "../legal-ui";
import { JudicialCheck, JudicialDialog, JudicialSelect, JudicialText } from "./JudicialShared";
import { JudicialChoice, JudicialScopeFields, JudicialSourcesFields } from "./JudicialCatalogFields";

type RuleDraft = Omit<JudicialRuleBody, "marker_offset_count" | "exclude_marker" | "apply_suspensions"> & { marker_offset_count: string; exclude_marker: boolean | null; apply_suspensions: boolean | null };
const dayOptions = [{ value: "business_days", label: "Dias úteis" }, { value: "calendar_days", label: "Dias corridos" }];
const adjustmentOptions = [{ value: "none", label: "Sem deslocamento" }, { value: "next_business_day", label: "Próximo dia com expediente permitido" }];

export function JudicialRuleForm({ original, documents, onClose }: { original?: JudicialRuleVersion; documents: LegalCaseDocument[]; onClose(): void }) {
  const action = useLegalAction();
  const [form, setForm] = useState<Omit<JudicialRuleInput, "body">>(() => original ? { rule_key: original.rule_key, title: original.title, scope: { ...original.scope }, valid_from: original.valid_from, valid_until: original.valid_until, sources: structuredClone(original.sources) } : { rule_key: `rule_${crypto.randomUUID().replace(/-/g, "")}`, title: "", scope: { court: "", degree: "", unit: "", territory: "" }, valid_from: "", valid_until: "", sources: [] });
  const [body, setBody] = useState<RuleDraft>(() => original ? { ...original.body, marker_offset_count: String(original.body.marker_offset_count), transition_resolved: false } : { regime: "", nature: "", modality: "", recipient_kind: "", conditions: "", exclusions: "", validity_note: "", transition_resolved: false, input_kind: "" as RuleDraft["input_kind"], anchor_kind: "", marker_offset_count: "", marker_offset_unit: "" as RuleDraft["marker_offset_unit"], marker_adjustment: "" as RuleDraft["marker_adjustment"], exclude_marker: null, count_unit: "" as RuleDraft["count_unit"], apply_suspensions: null, due_adjustment: "" as RuleDraft["due_adjustment"], due_time: "" });
  function change(patch: Partial<typeof form>) { setForm((value) => ({ ...value, ...patch })); }
  function rule(patch: Partial<RuleDraft>) { setBody((value) => ({ ...value, ...patch })); }
  const countValid = /^(?:[0-9]|[1-5][0-9]|60)$/.test(body.marker_offset_count);
  const explicit = countValid && body.exclude_marker !== null && body.apply_suspensions !== null && /^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(body.due_time);
  async function save() {
    if (!explicit || body.exclude_marker === null || body.apply_suspensions === null) return;
    const payload: JudicialRuleInput = { ...form, title: form.title.trim(), body: { ...body, marker_offset_count: Number(body.marker_offset_count), exclude_marker: body.exclude_marker, apply_suspensions: body.apply_suspensions } };
    if (await action.run(() => createJudicialRule(payload), "Regra salva como rascunho para revisão")) onClose();
  }
  return <JudicialDialog title={original ? "Nova versão da regra" : "Cadastrar regra para revisão"} description="Registre a interpretação examinada e seus limites. O sistema não aprova uma regra por ela citar uma fonte oficial." onClose={onClose} onSubmit={save} pending={action.pending} disabled={!explicit}>
    <JudicialText label="Título da regra" value={form.title} onChange={(title) => change({ title })} required maxLength={200} />
    <JudicialScopeFields value={form.scope} onChange={(scope) => change({ scope })} />
    <div className="grid gap-3 sm:grid-cols-2"><JudicialText label="Vigência inicial" type="date" value={form.valid_from} onChange={(valid_from) => change({ valid_from })} required /><JudicialText label="Vigência final" type="date" value={form.valid_until} onChange={(valid_until) => change({ valid_until })} required /></div>
    <div className="grid gap-3 sm:grid-cols-2"><JudicialSelect label="Regime jurídico" value={body.regime} onChange={(regime) => rule({ regime })} required options={[{ value: "civil_procedure", label: "Processo civil" }, { value: "other", label: "Outro — contagem ainda sem cobertura" }]} /><JudicialSelect label="Natureza do prazo" value={body.nature} onChange={(nature) => rule({ nature })} required options={[{ value: "procedural", label: "Processual" }, { value: "material", label: "Material — contagem ainda sem cobertura" }, { value: "administrative", label: "Administrativo — contagem ainda sem cobertura" }]} /></div>
    <p className="text-xs text-muted-foreground">O contador desta fase cobre operações em dias no processo civil. Outros regimes, prazos materiais, administrativos ou em horas, meses e anos exigem análise própria e não recebem vencimento calculado.</p>
    <div className="grid gap-3 sm:grid-cols-2"><JudicialText label="Modalidade da comunicação" value={body.modality} onChange={(modality) => rule({ modality })} required maxLength={200} hint="Por exemplo: publicação no DJEN, citação eletrônica ou intimação pessoal. A modalidade deve ser comprovada." /><JudicialText label="Espécie de destinatário" value={body.recipient_kind} onChange={(recipient_kind) => rule({ recipient_kind })} required maxLength={200} /></div>
    <JudicialText label="Condições para aplicar a regra" value={body.conditions} onChange={(conditions) => rule({ conditions })} required multiline />
    <JudicialText label="Exclusões e situações fora da regra" value={body.exclusions} onChange={(exclusions) => rule({ exclusions })} required multiline />
    <JudicialText label="Vigência, transição e fundamento examinado" value={body.validity_note} onChange={(validity_note) => rule({ validity_note })} required multiline />
    <JudicialCheck label="Conferi a incidência temporal e resolvi a transição normativa desta versão" checked={body.transition_resolved} onChange={(transition_resolved) => rule({ transition_resolved })} hint="Deixar desmarcado mantém a transição pendente e impede a contagem. Uma versão copiada exige nova conferência." />
    <fieldset className="space-y-3 rounded-lg border p-3"><legend className="px-1 font-medium">Marco e contagem</legend>
      <JudicialSelect label="Formato da prova do marco" value={body.input_kind} onChange={(value) => rule({ input_kind: value as RuleDraft["input_kind"] })} required options={[{ value: "civil_date", label: "Data civil comprovada" }, { value: "timestamp", label: "Instante com fuso explícito" }]} />
      <JudicialSelect label="Marco documental exigido pela regra" value={body.anchor_kind} onChange={(anchor_kind) => rule({ anchor_kind })} required options={[{ value: "made_available_on", label: "Disponibilização no diário" }, { value: "published_on", label: "Publicação no diário" }, { value: "awareness_effective_on", label: "Ciência efetiva comprovada" }, { value: "decision_signed_at", label: "Assinatura da decisão" }, { value: "communication_sent_at", label: "Envio da comunicação" }, { value: "source_consulted_at", label: "Consulta efetiva à origem" }, { value: "manual_verified", label: "Outro marco conferido — justificativa e prova em cada caso" }]} hint="Disponibilização, publicação e ciência são eventos distintos. Esta escolha identifica a prova exigida; não pratica ciência nem presume sua data." />
      <div className="grid gap-3 sm:grid-cols-2"><JudicialText label="Deslocamento até o marco legal (0 a 60)" value={body.marker_offset_count} onChange={(marker_offset_count) => rule({ marker_offset_count })} required maxLength={2} hint="Informe 0 quando não houver deslocamento. Nenhum número é preenchido automaticamente." /><JudicialSelect label="Unidade do deslocamento" value={body.marker_offset_unit} onChange={(value) => rule({ marker_offset_unit: value as RuleDraft["marker_offset_unit"] })} options={dayOptions} required /></div>
      <JudicialSelect label="Ajuste do marco sem expediente" value={body.marker_adjustment} onChange={(value) => rule({ marker_adjustment: value as RuleDraft["marker_adjustment"] })} options={adjustmentOptions} required />
      <JudicialChoice label="Excluir o dia do marco da contagem?" value={body.exclude_marker} onChange={(exclude_marker) => rule({ exclude_marker })} />
      <JudicialSelect label="Unidade da duração do prazo" value={body.count_unit} onChange={(value) => rule({ count_unit: value as RuleDraft["count_unit"] })} options={dayOptions} required />
      <JudicialChoice label="Aplicar as suspensões do calendário?" value={body.apply_suspensions} onChange={(apply_suspensions) => rule({ apply_suspensions })} />
      <JudicialSelect label="Ajuste do vencimento sem expediente" value={body.due_adjustment} onChange={(value) => rule({ due_adjustment: value as RuleDraft["due_adjustment"] })} options={adjustmentOptions} required />
      <JudicialText label="Horário local de vencimento (HH:MM:SS)" value={body.due_time} onChange={(due_time) => rule({ due_time })} required maxLength={8} hint="Informe o horário sustentado pela regra e pelo órgão. O sistema não presume 23:59:59." />
    </fieldset>
    <JudicialSourcesFields value={form.sources} onChange={(sources) => change({ sources })} onRemove={(index) => change({ sources: form.sources.filter((_, i) => i !== index) })} documents={documents} />
  </JudicialDialog>;
}
