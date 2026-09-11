import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LegalField } from "../LegalShared";
import { selectClassName } from "../legal-ui";

export type InterviewQuestion = { key: string; label: string; type: "text" | "number" | "date" | "boolean"; required: boolean };
export type InterviewAnswersValue = Record<string, string | number | boolean>;

export function InterviewQuestionsEditor({ questions, onChange, disabled }: { questions: InterviewQuestion[]; onChange: (questions: InterviewQuestion[]) => void; disabled?: boolean }) {
  const change = (index: number, patch: Partial<InterviewQuestion>) => onChange(questions.map((question, current) => current === index ? { ...question, ...patch } : question));
  return <fieldset disabled={disabled} className="space-y-3"><legend className="mb-2 text-sm font-medium">Perguntas do roteiro</legend>{questions.map((question, index) => <div key={question.key} className="space-y-3 rounded-lg border p-3"><div className="grid gap-3 sm:grid-cols-[1fr_9rem]"><LegalField label={`Pergunta ${index + 1}`}>{(id) => <Input id={id} required maxLength={200} value={question.label} onChange={(event) => change(index, { label: event.target.value })} />}</LegalField><LegalField label="Tipo de resposta">{(id) => <select id={id} className={selectClassName} value={question.type} onChange={(event) => change(index, { type: event.target.value as InterviewQuestion["type"] })}><option value="text">Texto</option><option value="number">Número</option><option value="date">Data</option><option value="boolean">Sim ou não</option></select>}</LegalField></div><div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input className="h-4 w-4 accent-primary" type="checkbox" checked={question.required} onChange={(event) => change(index, { required: event.target.checked })} />Resposta obrigatória</label><Button type="button" size="sm" variant="ghost" onClick={() => onChange(questions.filter((_, current) => current !== index))}><Trash2 className="mr-1 h-4 w-4" aria-hidden />Remover<span className="sr-only"> pergunta {index + 1}</span></Button></div></div>)}<Button type="button" size="sm" variant="outline" disabled={questions.length >= 30} onClick={() => onChange([...questions, { key: `q_${crypto.randomUUID().replace(/-/g, "")}`, label: "", type: "text", required: false }])}><Plus className="mr-2 h-4 w-4" aria-hidden />Adicionar pergunta</Button></fieldset>;
}

export function InterviewAnswers({ questions, answers, onChange, disabled }: { questions: InterviewQuestion[]; answers: InterviewAnswersValue; onChange: (answers: InterviewAnswersValue) => void; disabled?: boolean }) {
  function setAnswer(key: string, value: string | number | boolean | undefined) {
    const updated = { ...answers };
    if (value === undefined) delete updated[key]; else updated[key] = value;
    onChange(updated);
  }
  return <fieldset disabled={disabled} className="space-y-4">{questions.map((question) => <LegalField key={question.key} label={`${question.label}${question.required ? " *" : ""}`}>{(id) => question.type === "boolean" ? <select id={id} className={selectClassName} required={question.required} value={answers[question.key] === undefined ? "" : String(answers[question.key])} onChange={(event) => setAnswer(question.key, event.target.value === "" ? undefined : event.target.value === "true")}><option value="">Selecione</option><option value="true">Sim</option><option value="false">Não</option></select> : question.type === "text" ? <Textarea id={id} required={question.required} maxLength={2000} value={String(answers[question.key] ?? "")} onChange={(event) => setAnswer(question.key, event.target.value)} /> : <Input id={id} type={question.type} required={question.required} step={question.type === "number" ? "any" : undefined} value={String(answers[question.key] ?? "")} onChange={(event) => setAnswer(question.key, event.target.value === "" ? undefined : question.type === "number" ? Number(event.target.value) : event.target.value)} />}</LegalField>)}</fieldset>;
}
