import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LegalCaseDocument } from "@/types/legal";
import type { JudicialCalendarException, JudicialCalendarInput, JudicialCalendarSuspension, JudicialCalendarVersion } from "@/types/legal-judicial";
import { createJudicialCalendar } from "@/lib/api/legal-judicial";
import { useLegalAction } from "../legal-ui";
import { JudicialCheck, JudicialDialog, JudicialSelect, JudicialText } from "./JudicialShared";
import { JudicialChoice, JudicialScopeFields, JudicialSourcesFields } from "./JudicialCatalogFields";

export function JudicialCalendarForm({ original, documents, onClose }: { original?: JudicialCalendarVersion; documents: LegalCaseDocument[]; onClose(): void }) {
  const action = useLegalAction();
  const [form, setForm] = useState<JudicialCalendarInput>(() => original ? structuredClone(original) : { calendar_key: `calendar_${crypto.randomUUID().replace(/-/g, "")}`, title: "", scope: { court: "", degree: "", unit: "", territory: "" }, timezone: "", valid_from: "", valid_until: "", body: { working_weekdays: [], exceptions: [], suspensions: [] }, sources: [] });
  function change(patch: Partial<JudicialCalendarInput>) { setForm((value) => ({ ...value, ...patch })); }
  function body(patch: Partial<JudicialCalendarInput["body"]>) { setForm((value) => ({ ...value, body: { ...value.body, ...patch } })); }
  function removeSource(index: number) {
    const fix = <T extends { source_index: number }>(effect: T): T => ({ ...effect, source_index: effect.source_index === index ? -1 : effect.source_index > index ? effect.source_index - 1 : effect.source_index });
    setForm((value) => ({ ...value, sources: value.sources.filter((_, i) => i !== index), body: { ...value.body, exceptions: value.body.exceptions.map(fix), suspensions: value.body.suspensions.map(fix) } }));
  }
  const effectValid = [...form.body.exceptions, ...form.body.suspensions].every((item) => item.source_index >= 0 && item.source_index < form.sources.length && item.reason.trim());
  async function save() {
    const { calendar_key, title, scope, timezone, valid_from, valid_until, body, sources } = form;
    if (!effectValid || !body.working_weekdays.length) return;
    if (await action.run(() => createJudicialCalendar({ calendar_key, title: title.trim(), scope, timezone: timezone.trim(), valid_from, valid_until, body, sources }), "Calendário salvo como rascunho para revisão")) onClose();
  }
  const sourceOptions = form.sources.map((source, index) => ({ value: String(index), label: `${index + 1}. ${source.title || "Fonte sem título"}` }));
  const newEffect = () => ({ suspend_count: false, allow_start: false, allow_due: false, reason: "", source_index: -1 });
  return <JudicialDialog title={original ? "Nova versão do calendário" : "Cadastrar calendário para revisão"} description="Defina o órgão, a vigência e os efeitos dos atos examinados. Nada é considerado aprovado ao salvar." onClose={onClose} onSubmit={save} pending={action.pending} disabled={!effectValid || !form.body.working_weekdays.length}>
    <JudicialText label="Título do calendário" value={form.title} onChange={(title) => change({ title })} required maxLength={200} />
    <JudicialScopeFields value={form.scope} onChange={(scope) => change({ scope })} />
    <div className="grid gap-3 sm:grid-cols-2"><JudicialText label="Vigência inicial" type="date" value={form.valid_from} onChange={(valid_from) => change({ valid_from })} required /><JudicialText label="Vigência final" type="date" value={form.valid_until} onChange={(valid_until) => change({ valid_until })} required /></div>
    <JudicialText label="Fuso do órgão (IANA)" value={form.timezone} onChange={(timezone) => change({ timezone })} required maxLength={80} hint="Informe o fuso documentado, por exemplo America/Sao_Paulo. O fuso do computador não define o prazo." />
    <fieldset className="space-y-2 rounded-lg border p-3"><legend className="px-1 text-sm font-medium">Dias habituais de expediente</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"].map((label, index) => <JudicialCheck key={label} label={label} checked={form.body.working_weekdays.includes(index + 1)} onChange={(checked) => body({ working_weekdays: checked ? [...form.body.working_weekdays, index + 1].sort() : form.body.working_weekdays.filter((value) => value !== index + 1) })} />)}</div></fieldset>
    <JudicialSourcesFields value={form.sources} onChange={(sources) => change({ sources })} onRemove={removeSource} documents={documents} />
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Exceções por data</h3><Button type="button" variant="outline" size="sm" disabled={form.body.exceptions.length >= 1000} onClick={() => body({ exceptions: [...form.body.exceptions, { on: "", ...newEffect() }] })}><Plus className="mr-2 h-4 w-4" />Adicionar data</Button></div>
      <p className="text-xs text-muted-foreground">Feriado, ponto facultativo e suspensão não são equivalentes. Declare cada efeito e a fonte que o sustenta.</p>
      {form.body.exceptions.map((item, index) => <CalendarEffect key={index} item={item} index={index} kind="date" sourceOptions={sourceOptions} onChange={(patch) => body({ exceptions: form.body.exceptions.map((row, i) => i === index ? { ...row, ...patch } : row) })} onRemove={() => body({ exceptions: form.body.exceptions.filter((_, i) => i !== index) })} />)}
    </section>
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Suspensões por intervalo</h3><Button type="button" variant="outline" size="sm" disabled={form.body.suspensions.length >= 100} onClick={() => body({ suspensions: [...form.body.suspensions, { from: "", until: "", ...newEffect() }] })}><Plus className="mr-2 h-4 w-4" />Adicionar intervalo</Button></div>
      {form.body.suspensions.map((item, index) => <CalendarEffect key={index} item={item} index={index} kind="range" sourceOptions={sourceOptions} onChange={(patch) => body({ suspensions: form.body.suspensions.map((row, i) => i === index ? { ...row, ...patch } : row) })} onRemove={() => body({ suspensions: form.body.suspensions.filter((_, i) => i !== index) })} />)}
    </section>
    {!effectValid && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Selecione uma fonte e descreva o motivo de cada exceção ou suspensão.</p>}
  </JudicialDialog>;
}

function CalendarEffect({ item, index, kind, sourceOptions, onChange, onRemove }: { item: JudicialCalendarException | JudicialCalendarSuspension; index: number; kind: "date" | "range"; sourceOptions: { value: string; label: string }[]; onChange(patch: Partial<JudicialCalendarException & JudicialCalendarSuspension>): void; onRemove(): void }) {
  return <div className="space-y-3 rounded-lg border p-3"><div className="flex items-center justify-between"><h4 className="text-sm font-medium">{kind === "date" ? "Data" : "Intervalo"} {index + 1}</h4><Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remover ${kind === "date" ? "data" : "intervalo"} ${index + 1}`}><Trash2 className="h-4 w-4" /></Button></div>
    {"on" in item ? <div className="grid gap-3 sm:grid-cols-2"><JudicialText label="Data da exceção" type="date" value={item.on} onChange={(on) => onChange({ on })} required /><JudicialSelect label="Expediente nessa data" value={item.working_day === undefined ? "inherit" : item.working_day ? "yes" : "no"} onChange={(value) => onChange({ working_day: value === "inherit" ? undefined : value === "yes" })} options={[{ value: "inherit", label: "Manter expediente semanal" }, { value: "yes", label: "Há expediente" }, { value: "no", label: "Não há expediente" }]} required /></div> : <div className="grid gap-3 sm:grid-cols-2"><JudicialText label="Início do intervalo" type="date" value={item.from} onChange={(from) => onChange({ from })} required /><JudicialText label="Fim do intervalo (incluído)" type="date" value={item.until} onChange={(until) => onChange({ until })} required /></div>}
    <div className="grid gap-3 sm:grid-cols-3"><JudicialChoice label="Suspender o curso?" value={item.suspend_count} onChange={(suspend_count) => onChange({ suspend_count })} /><JudicialChoice label="Permitir início?" value={item.allow_start} onChange={(allow_start) => onChange({ allow_start })} /><JudicialChoice label="Permitir vencimento?" value={item.allow_due} onChange={(allow_due) => onChange({ allow_due })} /></div>
    <JudicialSelect label="Fonte que comprova o efeito" value={item.source_index < 0 ? "" : String(item.source_index)} onChange={(value) => onChange({ source_index: value === "" ? -1 : Number(value) })} options={sourceOptions} required />
    <JudicialText label="Motivo e alcance da exceção" value={item.reason} onChange={(reason) => onChange({ reason })} required multiline maxLength={1000} />
  </div>;
}
