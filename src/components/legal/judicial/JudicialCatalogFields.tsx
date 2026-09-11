import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LegalCaseDocument } from "@/types/legal";
import type { JudicialScope, JudicialSource } from "@/types/legal-judicial";
import { JudicialSelect, JudicialText } from "./JudicialShared";

export function JudicialScopeFields({ value, onChange }: { value: JudicialScope; onChange(value: JudicialScope): void }) {
  return <div className="grid gap-3 sm:grid-cols-2">{([
    ["court", "Tribunal ou órgão competente"], ["degree", "Instância ou grau"], ["unit", "Unidade, comarca ou seção"], ["territory", "Abrangência territorial"],
  ] as const).map(([key, label]) => <JudicialText key={key} label={label} required value={value[key]} onChange={(text) => onChange({ ...value, [key]: text })} maxLength={200} />)}</div>;
}
export function JudicialSourcesFields({ value, onChange, onRemove, documents }: { value: JudicialSource[]; onChange(value: JudicialSource[]): void; onRemove(index: number): void; documents: LegalCaseDocument[] }) {
  return <section className="space-y-3" aria-label="Fontes e provas do catálogo">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Fontes examinadas</h3><Button type="button" variant="outline" size="sm" disabled={value.length >= 20} onClick={() => onChange([...value, { title: "", url: "", checked_on: "", document_id: "" }])}><Plus className="mr-2 h-4 w-4" />Adicionar fonte</Button></div>
    <p className="text-xs text-muted-foreground">Anexe o ato oficial na categoria Geral do caso. Data de consulta e prova documental serão exigidas na aprovação. Não inclua dados de clientes no catálogo do escritório.</p>
    {!value.length && <p className="text-sm text-muted-foreground">Rascunho sem fontes: ainda não poderá ser aprovado.</p>}
    {value.map((source, index) => {
      const update = (patch: Partial<JudicialSource>) => onChange(value.map((item, i) => i === index ? { ...item, ...patch } : item));
      const known = documents.some((item) => item.id === source.document_id);
      return <div key={index} className="space-y-3 rounded-lg border p-3"><div className="flex items-center justify-between"><h4 className="text-sm font-medium">Fonte {index + 1}</h4><Button type="button" variant="ghost" size="icon" aria-label={`Remover fonte ${index + 1}`} onClick={() => onRemove(index)}><Trash2 className="h-4 w-4" /></Button></div>
        <JudicialText label={`Título da fonte ${index + 1}`} value={source.title} onChange={(title) => update({ title })} required maxLength={200} />
        <JudicialText label={`Endereço oficial da fonte ${index + 1}`} type="url" value={source.url} onChange={(url) => update({ url })} required maxLength={2000} />
        <div className="grid gap-3 sm:grid-cols-2"><JudicialText label={`Consultada em — fonte ${index + 1}`} type="date" value={source.checked_on} onChange={(checked_on) => update({ checked_on })} required />
          <JudicialSelect label={`Documento comprobatório — fonte ${index + 1}`} value={source.document_id} onChange={(document_id) => update({ document_id })} required options={[...documents.map((doc) => ({ value: doc.id, label: doc.display_name })), ...(!known && source.document_id ? [{ value: source.document_id, label: "Prova da versão anterior — conferir acesso" }] : [])]} /></div>
        <JudicialText label={`Vigência ou versão da fonte ${index + 1}`} value={source.version_note ?? ""} onChange={(version_note) => update({ version_note })} maxLength={1000} />
      </div>;
    })}
  </section>;
}
export function JudicialChoice({ label, value, onChange, yes = "Sim", no = "Não", hint }: { label: string; value: boolean | null; onChange(value: boolean): void; yes?: string; no?: string; hint?: string }) {
  return <JudicialSelect label={label} value={value === null ? "" : value ? "yes" : "no"} onChange={(value) => { if (value) onChange(value === "yes"); }} options={[{ value: "yes", label: yes }, { value: "no", label: no }]} required hint={hint} />;
}
