import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addLegalInterviewVersion, createLegalInterviewTemplate, getLegalInterviewVersion, listLegalConflictReviews, listLegalInterviewSubmissions, listLegalInterviewTemplates, listLegalInterviewVersions, recordLegalConflictReview, submitLegalInterview } from "@/lib/api/legal-operations";
import type { LegalConflictDecision, LegalInterviewSubmission, LegalInterviewTemplate } from "@/types/legal-operations";
import type { LegalDocumentCategory } from "@/types/legal";
import { LegalError, LegalField, LegalLoading } from "../LegalShared";
import { DOCUMENT_CATEGORIES, legalDate, selectClassName, useLegalAction } from "../legal-ui";
import { OperationPanel, OperationRecords } from "./OperationPanel";
import { InterviewAnswers, InterviewQuestionsEditor, type InterviewAnswersValue, type InterviewQuestion } from "./InterviewQuestions";
import { canAccessOperationCategory, operationsKey, type LegalOperationsProps } from "./operations-ui";

function TemplateDialog({ open, onClose, template, questions: initialQuestions, props }: { open: boolean; onClose: () => void; template?: LegalInterviewTemplate; questions?: InterviewQuestion[]; props: LegalOperationsProps }) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [category, setCategory] = useState<LegalDocumentCategory>(template?.category ?? "general");
  const [questions, setQuestions] = useState<InterviewQuestion[]>(initialQuestions ?? [{ key: "objetivo", label: "Qual é o objetivo deste atendimento?", type: "text", required: true }]);
  const action = useLegalAction();
  async function save(event: FormEvent) { event.preventDefault(); if (await action.run(() => template ? addLegalInterviewVersion(template.id, questions) : createLegalInterviewTemplate({ title: title.trim(), category, questions }), template ? "Nova versão do roteiro criada" : "Roteiro de entrevista criado")) onClose(); }
  return <Dialog open={open} onOpenChange={(value) => { if (!value && !action.pending) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{template ? "Nova versão do roteiro" : "Criar roteiro de entrevista"}</DialogTitle><DialogDescription>As entrevistas já respondidas preservam a versão utilizada. Roteiros ficam disponíveis para o escritório conforme a categoria de acesso.</DialogDescription></DialogHeader><form onSubmit={(event) => void save(event)} className="space-y-4"><LegalField label="Nome do roteiro / especialidade">{(id) => <Input id={id} required maxLength={150} value={title} disabled={Boolean(template)} onChange={(event) => setTitle(event.target.value)} />}</LegalField><LegalField label="Categoria da entrevista">{(id) => <select id={id} className={selectClassName} value={category} disabled={Boolean(template)} onChange={(event) => setCategory(event.target.value as LegalDocumentCategory)}>{Object.entries(DOCUMENT_CATEGORIES).filter(([key]) => canAccessOperationCategory(props, key)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</LegalField><InterviewQuestionsEditor questions={questions} onChange={setQuestions} disabled={action.pending} /><DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={action.pending}>Cancelar</Button><Button type="submit" disabled={action.pending || !questions.length || questions.some((question) => !question.label.trim())}>Salvar versão do roteiro</Button></DialogFooter></form></DialogContent></Dialog>;
}

function InterviewSubmission({ submission, props }: { submission: LegalInterviewSubmission; props: LegalOperationsProps }) {
  const [expanded, setExpanded] = useState(false);
  const version = useQuery({ queryKey: operationsKey(props, `interview-version-${submission.template_version_id}`), queryFn: () => getLegalInterviewVersion(submission.template_version_id), enabled: expanded });
  return <details onToggle={(event) => setExpanded(event.currentTarget.open)} className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Entrevista de {legalDate(submission.created_at, true)} · {DOCUMENT_CATEGORIES[submission.category]}{version.data ? ` · versão ${version.data.version_number}` : ""}</summary><div className="mt-4 space-y-3">{version.isPending ? <LegalLoading /> : version.error ? <LegalError error={version.error} retry={() => void version.refetch()} /> : version.data ? version.data.questions.map((question) => <div key={question.key}><p className="text-sm font-medium">{question.label}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{submission.answers[question.key] == null || submission.answers[question.key] === "" ? "Não respondido" : typeof submission.answers[question.key] === "boolean" ? submission.answers[question.key] ? "Sim" : "Não" : String(submission.answers[question.key])}</p></div>) : <p className="text-sm text-muted-foreground">O roteiro desta entrevista não está disponível para seu acesso.</p>}</div></details>;
}

function InterviewForm({ template, props }: { template: LegalInterviewTemplate; props: LegalOperationsProps }) {
  const versions = useQuery({ queryKey: operationsKey(props, `interview-versions-${template.id}`), queryFn: () => listLegalInterviewVersions(template.id) });
  const [answerDraft, setAnswerDraft] = useState<{ versionId: string; values: InterviewAnswersValue }>({ versionId: "", values: {} });
  const [versionEditor, setVersionEditor] = useState(false);
  const action = useLegalAction();
  const latest = versions.data?.[0];
  const answers = answerDraft.versionId === latest?.id ? answerDraft.values : {};
  const setAnswers = (values: InterviewAnswersValue) => setAnswerDraft({ versionId: latest?.id ?? "", values });
  async function submit(event: FormEvent) { event.preventDefault(); if (latest && await action.run(() => submitLegalInterview(props.legalCase.id, latest.id, answers), "Entrevista registrada com sua versão")) setAnswers({}); }
  if (versions.isPending) return <LegalLoading />;
  if (versions.error) return <LegalError error={versions.error} retry={() => void versions.refetch()} />;
  if (!latest) return <p className="text-sm text-muted-foreground">Nenhuma versão disponível para este roteiro.</p>;
  return <div className="space-y-4 rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="secondary">{DOCUMENT_CATEGORIES[template.category]} · versão {latest.version_number}</Badge>{props.workspace.can_activate ? <Button size="sm" variant="outline" onClick={() => setVersionEditor(true)}>Criar nova versão do roteiro</Button> : null}</div><p className="text-xs text-muted-foreground">{template.category === "general" ? "Use apenas informações gerais. Dados de saúde e fiscais exigem roteiros nas respectivas categorias restritas." : "As respostas ficam restritas aos participantes autorizados para esta categoria."}</p><form onSubmit={(event) => void submit(event)} className="space-y-4"><InterviewAnswers questions={latest.questions} answers={answers} onChange={setAnswers} disabled={!props.canEdit || action.pending} />{props.canEdit ? <Button type="submit" disabled={action.pending}>Registrar entrevista</Button> : null}</form>{versionEditor ? <TemplateDialog open onClose={() => setVersionEditor(false)} template={template} questions={latest.questions} props={props} /> : null}</div>;
}

const CONFLICT_LABELS = { pending: "Análise pendente", clear: "Sem conflito identificado", potential: "Possível conflito", blocked: "Atendimento impedido" } as const;

export function LegalInterviews(props: LegalOperationsProps) {
  const templates = useQuery({ queryKey: ["legal", props.workspace.user_id, props.workspace.tenant_id, "interview-templates"], queryFn: listLegalInterviewTemplates });
  const submissions = useQuery({ queryKey: operationsKey(props, "interview-submissions"), queryFn: () => listLegalInterviewSubmissions(props.legalCase.id) });
  const conflicts = useQuery({ queryKey: operationsKey(props, "conflicts"), queryFn: () => listLegalConflictReviews(props.legalCase.id) });
  const [selected, setSelected] = useState("");
  const [createTemplate, setCreateTemplate] = useState(false);
  const [decision, setDecision] = useState<LegalConflictDecision>("pending");
  const [notes, setNotes] = useState("");
  const action = useLegalAction();
  const available = (templates.data ?? []).filter((template) => canAccessOperationCategory(props, template.category));
  const template = available.find((item) => item.id === selected);
  return <div className="space-y-4"><OperationPanel title="Entrevista do cliente" description="Escolha um roteiro e mantenha cada resposta vinculada à versão utilizada." actions={props.workspace.can_activate ? <Button variant="outline" size="sm" onClick={() => setCreateTemplate(true)}>Novo roteiro</Button> : null}>
    {templates.error ? <LegalError error={templates.error} retry={() => void templates.refetch()} /> : <LegalField label="Roteiro de entrevista">{(id) => <select id={id} className={selectClassName} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Selecione um roteiro</option>{available.map((item) => <option key={item.id} value={item.id}>{item.title} · {DOCUMENT_CATEGORIES[item.category]}</option>)}</select>}</LegalField>}
    {template ? <InterviewForm key={template.id} template={template} props={props} /> : null}
    <OperationRecords pending={submissions.isPending} error={submissions.error} retry={() => void submissions.refetch()} empty="Nenhuma entrevista registrada" count={submissions.data?.length ?? 0}>{submissions.data?.map((submission) => <InterviewSubmission key={submission.id} submission={submission} props={props} />)}</OperationRecords>
    {createTemplate ? <TemplateDialog open onClose={() => setCreateTemplate(false)} props={props} /> : null}
  </OperationPanel><OperationPanel title="Verificação de conflitos" description="Revisão manual pelo responsável. Cada decisão fica registrada no histórico do caso.">
    <OperationRecords pending={conflicts.isPending} error={conflicts.error} retry={() => void conflicts.refetch()} empty="A verificação de conflitos ainda não foi registrada" count={conflicts.data?.length ?? 0}>{conflicts.data?.map((review) => <div key={review.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><Badge variant={review.decision === "blocked" ? "destructive" : "secondary"}>{CONFLICT_LABELS[review.decision]}</Badge><time className="text-xs text-muted-foreground">{legalDate(review.created_at, true)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm">{review.notes}</p><p className="mt-2 text-xs text-muted-foreground">Revisado por {props.workspace.collaborators.find((person) => person.id === review.reviewer_id)?.nome ?? "Responsável pelo caso"}</p></div>)}</OperationRecords>
    {props.legalCase.owner_id === props.workspace.user_id ? <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => { event.preventDefault(); void action.run(() => recordLegalConflictReview(props.legalCase.id, decision, notes.trim()), "Revisão de conflitos registrada").then((saved) => { if (saved) setNotes(""); }); }}><LegalField label="Resultado da revisão">{(id) => <select id={id} className={selectClassName} value={decision} onChange={(event) => setDecision(event.target.value as LegalConflictDecision)}>{Object.entries(CONFLICT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</LegalField><LegalField label="Fundamento da revisão" hint="Descreva o resultado operacional, sem incluir dados médicos ou fiscais.">{(id) => <Textarea id={id} required maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />}</LegalField><Button type="submit" disabled={action.pending || !notes.trim()}>Registrar decisão do responsável</Button></form> : <p className="text-sm text-muted-foreground">Somente o responsável pelo caso pode registrar a decisão de conflitos.</p>}
  </OperationPanel></div>;
}
