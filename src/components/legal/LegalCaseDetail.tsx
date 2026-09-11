import { lazy, Suspense, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, FileLock2, Link2, Plus, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  addLegalNote, addLegalParty, addLegalProceeding, downloadLegalDocument,
  listLegalDocuments, listLegalEvents, listLegalMembers, listLegalParties,
  listLegalProceedings, removeLegalMember, setLegalDocumentHold, setLegalMember,
  updateLegalCase, uploadLegalDocument,
} from "@/lib/api/legal";
import type { LegalCase, LegalCaseDocument, LegalCaseMember, LegalCasePatch, LegalWorkspaceContext } from "@/types/legal";
import { LegalEmpty, LegalError, LegalField, LegalLoading } from "./LegalShared";
import { CASE_STATUSES, CASE_TYPES, DOCUMENT_CATEGORIES, legalDate, localDateTime, selectClassName, useLegalAction } from "./legal-ui";

const LegalCaseOperations = lazy(() => import("./operations/LegalCaseOperations"));
const LegalIrWorkspace = lazy(() => import("./ir/LegalIrWorkspace"));

type CasePanelProps = { legalCase: LegalCase; workspace: LegalWorkspaceContext; canEdit: boolean };
const caseKey = (workspace: LegalWorkspaceContext, caseId: string, section: string) => ["legal", workspace.user_id, workspace.tenant_id, "case", caseId, section];

function CaseOverview({ legalCase, canEdit }: CasePanelProps) {
  const [form, setForm] = useState({ title: legalCase.title, area: legalCase.area, case_type: legalCase.case_type, status: legalCase.status, next_action: legalCase.next_action, next_action_due_at: localDateTime(legalCase.next_action_due_at), wait_reason: legalCase.wait_reason });
  const action = useLegalAction();
  async function save(event: FormEvent) {
    event.preventDefault();
    const patch: LegalCasePatch = { ...form, title: form.title.trim(), next_action_due_at: form.next_action_due_at ? new Date(form.next_action_due_at).toISOString() : null, wait_reason: form.status === "aguardando" ? form.wait_reason : "" };
    await action.run(() => updateLegalCase(legalCase.id, patch), "Caso atualizado");
  }
  return <Card><CardHeader><CardTitle className="text-lg">Visão geral</CardTitle><CardDescription>Defina a situação do caso e a próxima providência da equipe.</CardDescription></CardHeader><CardContent><form onSubmit={(event) => void save(event)} className="space-y-4">
    <fieldset disabled={!canEdit || action.pending} className="space-y-4">
      <LegalField label="Título do caso">{(id) => <Input id={id} required minLength={3} maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />}</LegalField>
      <div className="grid gap-4 sm:grid-cols-3"><LegalField label="Área do Direito">{(id) => <Input id={id} maxLength={100} value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} />}</LegalField><LegalField label="Natureza">{(id) => <select id={id} className={selectClassName} value={form.case_type} onChange={(event) => setForm({ ...form, case_type: event.target.value as LegalCase["case_type"] })}>{Object.entries(CASE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</LegalField><LegalField label="Situação">{(id) => <select id={id} className={selectClassName} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as LegalCase["status"] })}>{Object.entries(CASE_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</LegalField></div>
      {form.status === "aguardando" ? <LegalField label="Motivo da espera">{(id) => <Input id={id} required maxLength={500} placeholder="Ex.: Documentos solicitados ao cliente" value={form.wait_reason} onChange={(event) => setForm({ ...form, wait_reason: event.target.value })} />}</LegalField> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]"><LegalField label="Próxima providência">{(id) => <Input id={id} required maxLength={500} placeholder="Ex.: Revisar os documentos recebidos" value={form.next_action} onChange={(event) => setForm({ ...form, next_action: event.target.value })} />}</LegalField><LegalField label="Data da providência" hint="Data interna de acompanhamento.">{(id) => <Input id={id} type="datetime-local" value={form.next_action_due_at} onChange={(event) => setForm({ ...form, next_action_due_at: event.target.value })} />}</LegalField></div>
    </fieldset>
    {canEdit ? <Button disabled={action.pending} type="submit">{action.pending ? "Salvando…" : "Salvar caso"}</Button> : <p className="text-sm text-muted-foreground">Seu acesso a este caso permite consulta.</p>}
  </form></CardContent></Card>;
}

function CaseParties({ legalCase, workspace, canEdit }: CasePanelProps) {
  const query = useQuery({ queryKey: caseKey(workspace, legalCase.id, "parties"), queryFn: () => listLegalParties(legalCase.id) });
  const [name, setName] = useState("");
  const [role, setRole] = useState("cliente");
  const action = useLegalAction();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await action.run(() => addLegalParty(legalCase.id, { name: name.trim(), party_role: role }), "Parte adicionada")) setName("");
  }
  return <div className="space-y-4"><Card><CardHeader><CardTitle className="text-lg">Partes e pessoas relacionadas</CardTitle><CardDescription>Adicionar uma pessoa como parte não concede acesso à área jurídica.</CardDescription></CardHeader><CardContent className="space-y-4">
    {query.isPending ? <LegalLoading /> : query.error ? <LegalError error={query.error} retry={() => void query.refetch()} /> : query.data?.length ? <ul className="divide-y">{query.data.map((party) => <li key={party.id} className="flex flex-wrap items-center gap-3 py-3"><UserRound className="h-4 w-4 text-muted-foreground" aria-hidden /><span className="min-w-0 flex-1 break-words font-medium">{party.name}</span><Badge variant="secondary">{party.party_role}</Badge>{party.customer_id ? <Button asChild size="sm" variant="ghost"><Link to={`/clientes/${party.customer_id}`}>Ficha do cliente</Link></Button> : null}</li>)}</ul> : <LegalEmpty title="Nenhuma parte adicionada" />}
    {canEdit ? <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => void save(event)}><div className="grid gap-3 sm:grid-cols-[1fr_12rem]"><LegalField label="Nome da pessoa ou empresa">{(id) => <Input id={id} value={name} onChange={(event) => setName(event.target.value)} required maxLength={180} />}</LegalField><LegalField label="Papel no caso">{(id) => <select id={id} className={selectClassName} value={role} onChange={(event) => setRole(event.target.value)}><option value="cliente">Cliente</option><option value="parte_contraria">Parte contrária</option><option value="representante">Representante</option><option value="testemunha">Testemunha</option><option value="outro">Outro</option></select>}</LegalField></div><Button type="submit" size="sm" disabled={action.pending || !name.trim()}><Plus className="mr-2 h-4 w-4" aria-hidden />Adicionar parte</Button></form> : null}
  </CardContent></Card></div>;
}

function CaseProceedings({ legalCase, workspace, canEdit }: CasePanelProps) {
  const query = useQuery({ queryKey: caseKey(workspace, legalCase.id, "proceedings"), queryFn: () => listLegalProceedings(legalCase.id) });
  const [form, setForm] = useState({ cnj_number: "", court: "", division: "", description: "" });
  const action = useLegalAction();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await action.run(() => addLegalProceeding(legalCase.id, form), "Processo cadastrado")) setForm({ cnj_number: "", court: "", division: "", description: "" });
  }
  return <Card><CardHeader><CardTitle className="text-lg">Processos vinculados</CardTitle><CardDescription>Cadastro manual. Os movimentos e as intimações dos tribunais ainda não são sincronizados.</CardDescription></CardHeader><CardContent className="space-y-4">
    {query.isPending ? <LegalLoading /> : query.error ? <LegalError error={query.error} retry={() => void query.refetch()} /> : query.data?.length ? <ul className="space-y-3">{query.data.map((proceeding) => <li key={proceeding.id} className="rounded-lg border p-4"><p className="break-all font-medium">{proceeding.cnj_number}</p><p className="mt-1 text-sm text-muted-foreground">{[proceeding.court, proceeding.division].filter(Boolean).join(" · ") || "Órgão não informado"}</p>{proceeding.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">{proceeding.description}</p> : null}</li>)}</ul> : <LegalEmpty title="Nenhum processo vinculado">Casos consultivos ou extrajudiciais podem seguir sem processo judicial.</LegalEmpty>}
    {canEdit ? <form onSubmit={(event) => void save(event)} className="space-y-3 rounded-lg border p-4"><LegalField label="Número CNJ">{(id) => <Input id={id} placeholder="0000000-00.0000.0.00.0000" required maxLength={25} value={form.cnj_number} onChange={(event) => setForm({ ...form, cnj_number: event.target.value })} />}</LegalField><div className="grid gap-3 sm:grid-cols-2"><LegalField label="Tribunal">{(id) => <Input id={id} placeholder="Ex.: TJSP" maxLength={120} value={form.court} onChange={(event) => setForm({ ...form, court: event.target.value })} />}</LegalField><LegalField label="Vara ou órgão julgador">{(id) => <Input id={id} maxLength={180} value={form.division} onChange={(event) => setForm({ ...form, division: event.target.value })} />}</LegalField></div><LegalField label="Observação">{(id) => <Textarea id={id} maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />}</LegalField><Button size="sm" type="submit" disabled={action.pending || !form.cnj_number.trim()}>Vincular processo</Button></form> : null}
  </CardContent></Card>;
}

function MemberPermissions({ member, name, canManage, onSave, onRemove, pending }: { member: LegalCaseMember; name: string; canManage: boolean; onSave: (member: LegalCaseMember) => Promise<boolean>; onRemove: () => void; pending: boolean }) {
  const [draft, setDraft] = useState(member);
  return <div className="rounded-lg border p-4"><p className="mb-3 font-medium">{name}</p><fieldset disabled={!canManage || pending} className="flex flex-wrap gap-x-5 gap-y-3 text-sm">{([
    ["can_edit", "Editar o caso"], ["can_view_medical", "Acessar documentos de saúde"], ["can_view_fiscal", "Acessar documentos fiscais"],
  ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })} />{label}</label>)}</fieldset>{canManage ? <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => void onSave(draft)}>Salvar permissões</Button><Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={onRemove}>Revogar acesso</Button></div> : null}</div>;
}

function CaseTeam({ legalCase, workspace, members, canManage }: { legalCase: LegalCase; workspace: LegalWorkspaceContext; members: LegalCaseMember[]; canManage: boolean }) {
  const [selected, setSelected] = useState("");
  const [confirmRemoval, setConfirmRemoval] = useState<LegalCaseMember | null>(null);
  const action = useLegalAction();
  const names = new Map(workspace.collaborators.map((person) => [person.id, person.nome]));
  const available = workspace.collaborators.filter((person) => person.id !== legalCase.owner_id && !members.some((member) => member.profile_id === person.id));
  const owner = names.get(legalCase.owner_id) ?? "Responsável pelo caso";
  return <Card><CardHeader><CardTitle className="text-lg">Equipe e acesso</CardTitle><CardDescription>Somente o responsável pode conceder e revogar acesso. A participação vale apenas para este caso.</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden /><div><p className="font-medium">{owner}</p><p className="text-sm text-muted-foreground">Responsável · administra o caso e seus documentos</p></div></div>
    {members.filter((member) => member.profile_id !== legalCase.owner_id).map((member) => <MemberPermissions key={`${member.profile_id}:${member.can_edit}:${member.can_view_medical}:${member.can_view_fiscal}`} member={member} name={names.get(member.profile_id) ?? "Participante do escritório"} canManage={canManage} pending={action.pending} onSave={(draft) => action.run(() => setLegalMember(legalCase.id, draft), "Permissões atualizadas")} onRemove={() => setConfirmRemoval(member)} />)}
    {canManage ? <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => { event.preventDefault(); void action.run(() => setLegalMember(legalCase.id, { profile_id: selected, can_edit: false, can_view_medical: false, can_view_fiscal: false }), "Participante adicionado com acesso de consulta").then((saved) => { if (saved) setSelected(""); }); }}><LegalField label="Adicionar participante do escritório" hint="Acesso inicial de consulta a dados do caso e documentos gerais. Permissões adicionais devem ser marcadas e salvas individualmente.">{(id) => <select id={id} required className={selectClassName} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Escolha um participante</option>{available.map((person) => <option value={person.id} key={person.id}>{person.nome}</option>)}</select>}</LegalField><Button size="sm" type="submit" disabled={action.pending || !selected}>Conceder acesso de consulta</Button></form> : null}
    <Dialog open={Boolean(confirmRemoval)} onOpenChange={(open) => { if (!open && !action.pending) setConfirmRemoval(null); }}><DialogContent><DialogHeader><DialogTitle>Revogar acesso ao caso</DialogTitle><DialogDescription>{names.get(confirmRemoval?.profile_id ?? "") ?? "Este participante"} deixará de acessar os dados e documentos deste caso. As ações já registradas permanecem na auditoria.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={action.pending} onClick={() => setConfirmRemoval(null)}>Cancelar</Button><Button variant="destructive" disabled={action.pending} onClick={() => { if (confirmRemoval) void action.run(() => removeLegalMember(legalCase.id, confirmRemoval.profile_id), "Acesso revogado").then((saved) => { if (saved) setConfirmRemoval(null); }); }}>Revogar acesso</Button></DialogFooter></DialogContent></Dialog>
  </CardContent></Card>;
}

function CaseDocuments({ legalCase, workspace, canEdit, member }: CasePanelProps & { member?: LegalCaseMember }) {
  const query = useQuery({ queryKey: caseKey(workspace, legalCase.id, "documents"), queryFn: () => listLegalDocuments(legalCase.id) });
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState<LegalCaseDocument["category"]>("general");
  const [holdDocument, setHoldDocument] = useState<LegalCaseDocument | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const action = useLegalAction();
  const isOwner = legalCase.owner_id === workspace.user_id;
  const allowedCategories = Object.entries(DOCUMENT_CATEGORIES).filter(([value]) => value === "general" || isOwner || (value === "medical" ? member?.can_view_medical : member?.can_view_fiscal));
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (await action.run(() => uploadLegalDocument(legalCase.id, { file, category, display_name: displayName.trim() || file.name }), "Documento guardado no caso")) { setFile(null); setDisplayName(""); setFileInputKey((value) => value + 1); }
  }
  return <Card><CardHeader><CardTitle className="text-lg">Documentos do caso</CardTitle><CardDescription>Documentos privados, organizados por categoria. A lista exibe apenas as categorias autorizadas para você.</CardDescription></CardHeader><CardContent className="space-y-4">
    {query.isPending ? <LegalLoading /> : query.error ? <LegalError error={query.error} retry={() => void query.refetch()} /> : query.data?.length ? <ul className="divide-y">{query.data.map((document) => <li key={document.id} className="flex flex-wrap items-center gap-3 py-4"><FileLock2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden /><div className="min-w-0 flex-1 basis-40"><p className="break-words font-medium">{document.display_name}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{DOCUMENT_CATEGORIES[document.category]}</span><span>· {(document.size_bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MB</span><span>· {legalDate(document.created_at)}</span>{document.retention_hold ? <Badge variant="secondary">Preservação ativa</Badge> : null}</div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={action.pending} onClick={() => void action.run(() => downloadLegalDocument(document), "Download iniciado")}><Download className="mr-2 h-4 w-4" aria-hidden />Baixar<span className="sr-only"> {document.display_name}</span></Button>{isOwner ? <Button size="sm" variant="ghost" onClick={() => { setHoldDocument(document); setHoldReason(""); }}>{document.retention_hold ? "Rever preservação" : "Preservar"}<span className="sr-only"> {document.display_name}</span></Button> : null}</div></li>)}</ul> : <LegalEmpty title="Nenhum documento disponível">Envie os documentos necessários nas categorias adequadas.</LegalEmpty>}
    {canEdit ? <form onSubmit={(event) => void upload(event)} className="space-y-3 rounded-lg border p-4"><div className="grid gap-3 sm:grid-cols-[1fr_12rem]"><LegalField label="Nome do documento">{(id) => <Input id={id} maxLength={180} placeholder="Ex.: Procuração assinada" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />}</LegalField><LegalField label="Categoria">{(id) => <select id={id} className={selectClassName} value={category} onChange={(event) => setCategory(event.target.value as LegalCaseDocument["category"])}>{allowedCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</LegalField></div><LegalField label="Arquivo" hint="PDF, JPG, PNG ou TXT, até 10 MB por arquivo. Laudos devem usar Saúde; declarações e comprovantes fiscais devem usar Fiscal.">{(id) => <Input key={fileInputKey} id={id} type="file" required accept=".pdf,.jpg,.jpeg,.png,.txt" onChange={(event) => { const selectedFile = event.target.files?.[0] ?? null; event.target.setCustomValidity(selectedFile && (selectedFile.size === 0 || selectedFile.size > 10 * 1024 * 1024) ? "Escolha um arquivo não vazio de até 10 MB." : ""); setFile(selectedFile); }} className="h-auto min-h-10" />}</LegalField><Button size="sm" type="submit" disabled={action.pending || !file}>{action.pending ? "Enviando…" : "Guardar documento"}</Button></form> : null}
    <Dialog open={Boolean(holdDocument)} onOpenChange={(open) => { if (!open && !action.pending) setHoldDocument(null); }}><DialogContent><DialogHeader><DialogTitle>{holdDocument?.retention_hold ? "Encerrar bloqueio de preservação" : "Preservar documento"}</DialogTitle><DialogDescription>{holdDocument?.retention_hold ? "O documento continuará guardado. Registre por que o bloqueio de descarte não é mais necessário." : "Bloqueie o descarte enquanto houver necessidade de preservar este documento. A justificativa será auditada."}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (holdDocument) void action.run(() => setLegalDocumentHold(holdDocument.id, !holdDocument.retention_hold, holdReason.trim()), "Preservação atualizada").then((saved) => { if (saved) setHoldDocument(null); }); }}><LegalField label="Justificativa">{(id) => <Textarea id={id} required minLength={5} maxLength={500} value={holdReason} onChange={(event) => setHoldReason(event.target.value)} />}</LegalField><DialogFooter><Button type="button" variant="outline" disabled={action.pending} onClick={() => setHoldDocument(null)}>Cancelar</Button><Button type="submit" disabled={action.pending || holdReason.trim().length < 5}>Salvar preservação</Button></DialogFooter></form></DialogContent></Dialog>
  </CardContent></Card>;
}

const EVENT_LABELS: Record<string, string> = { case_created: "Caso criado", case_updated: "Caso atualizado", party_added: "Parte adicionada", proceeding_added: "Processo vinculado", member_granted: "Permissões de acesso atualizadas", member_revoked: "Acesso revogado", document_prepared: "Envio de documento iniciado", document_ready: "Documento guardado", document_abandoned: "Envio de documento interrompido", document_download: "Documento acessado", retention_changed: "Preservação atualizada", manual: "Nota da equipe", operation_updated: "Etapa jurídica atualizada", interview_submitted: "Entrevista registrada", conflict_reviewed: "Conflito de interesses revisado", document_requested: "Documento solicitado", document_request_updated: "Solicitação de documento atualizada", instrument_created: "Instrumento criado", instrument_version_created: "Versão de instrumento criada", instrument_reviewed: "Instrumento revisado", external_signature_recorded: "Evidência externa registrada", task_updated: "Tarefa atualizada", appointment_updated: "Compromisso atualizado", ir_fact_changed: "Dados da triagem atualizados", ir_evidence_added: "Cronologia atualizada", ir_document_reviewed: "Conferência documental registrada", ir_checklist_changed: "Checklist atualizado", ir_assessment_changed: "Análise profissional atualizada", representation_changed: "Representação atualizada" };

function CaseTimeline({ legalCase, workspace, canEdit }: CasePanelProps) {
  const query = useQuery({ queryKey: caseKey(workspace, legalCase.id, "events"), queryFn: () => listLegalEvents(legalCase.id) });
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("all");
  const action = useLegalAction();
  const names = new Map(workspace.collaborators.map((person) => [person.id, person.nome]));
  const events = (query.data ?? []).filter((event) => filter === "all" || (filter === "notes" ? event.event_type === "manual" : event.event_type !== "manual"));
  async function save(event: FormEvent) { event.preventDefault(); if (await action.run(() => addLegalNote(legalCase.id, note.trim()), "Nota registrada")) setNote(""); }
  return <Card><CardHeader><CardTitle className="text-lg">Linha do tempo e auditoria</CardTitle><CardDescription>Histórico de acompanhamento e ações registradas neste caso.</CardDescription></CardHeader><CardContent className="space-y-4">
    {canEdit ? <form onSubmit={(event) => void save(event)} className="space-y-3"><LegalField label="Nova nota interna" hint="Registre o acompanhamento. Informações de saúde e fiscais devem ficar nos documentos com acesso restrito.">{(id) => <Textarea id={id} required maxLength={2000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: Cliente enviou a documentação solicitada; revisão agendada." />}</LegalField><Button size="sm" type="submit" disabled={action.pending || !note.trim()}>Registrar nota</Button></form> : null}
    <div className="max-w-xs"><LegalField label="Exibir registros">{(id) => <select id={id} className={selectClassName} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todos os registros</option><option value="notes">Notas da equipe</option><option value="audit">Auditoria de ações</option></select>}</LegalField></div>
    {query.isPending ? <LegalLoading /> : query.error ? <LegalError error={query.error} retry={() => void query.refetch()} /> : events.length ? <ol className="space-y-4 border-l pl-5">{events.map((event) => <li className="relative rounded-lg bg-muted/30 p-4" key={event.id}><span className="absolute -left-[1.55rem] top-5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden /><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{EVENT_LABELS[event.event_type] ?? "Alteração registrada"}</p><time className="text-xs text-muted-foreground" dateTime={event.created_at}>{legalDate(event.created_at, true)}</time></div>{event.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">{event.description}</p> : null}{event.event_type === "member_granted" ? <div className="mt-2 space-y-1 text-xs text-muted-foreground"><p>Participante: {names.get(typeof event.metadata.profile_id === "string" ? event.metadata.profile_id : "") ?? "Participante do escritório"}</p><p>Editar caso: {event.metadata.can_edit === true ? "permitido" : "não permitido"} · Saúde: {event.metadata.can_view_medical === true ? "autorizado" : "não autorizado"} · Fiscal: {event.metadata.can_view_fiscal === true ? "autorizado" : "não autorizado"}</p></div> : null}<p className="mt-2 text-xs text-muted-foreground">{names.get(event.actor_id ?? "") ?? (event.actor_id ? "Participante do escritório" : "Registro do sistema")}</p></li>)}</ol> : <LegalEmpty title="Nenhum registro neste filtro" />}
  </CardContent></Card>;
}

export function LegalCaseDetail({ legalCase, workspace }: { legalCase: LegalCase; workspace: LegalWorkspaceContext }) {
  const members = useQuery({ queryKey: caseKey(workspace, legalCase.id, "members"), queryFn: () => listLegalMembers(legalCase.id) });
  const [tab, setTab] = useState("overview");
  const myMember = members.data?.find((member) => member.profile_id === workspace.user_id);
  const isOwner = legalCase.owner_id === workspace.user_id;
  const canEdit = isOwner || Boolean(myMember?.can_edit);
  const shared = { legalCase, workspace, canEdit };
  return <div className="space-y-5"><Button asChild size="sm" variant="ghost" className="-ml-3"><Link to={legalCase.customer_id ? `/casos?cliente=${legalCase.customer_id}` : "/casos"}><ArrowLeft className="mr-2 h-4 w-4" aria-hidden />Voltar aos casos</Link></Button>
    <header className="space-y-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Caso jurídico</p><h1 className="break-words text-2xl font-semibold tracking-tight">{legalCase.title}</h1></div><Badge variant={legalCase.status === "ativo" ? "default" : "secondary"}>{CASE_STATUSES[legalCase.status]}</Badge></div><div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span>{CASE_TYPES[legalCase.case_type]}</span>{legalCase.area ? <><span>·</span><span>{legalCase.area}</span></> : null}{legalCase.customer_id ? <Button asChild size="sm" variant="outline"><Link to={`/clientes/${legalCase.customer_id}`}><UserRound className="mr-2 h-4 w-4" aria-hidden />Ficha do cliente</Link></Button> : null}{legalCase.negotiation_id ? <Button asChild size="sm" variant="outline"><Link to={`/crm/negociacao/${legalCase.negotiation_id}`}><Link2 className="mr-2 h-4 w-4" aria-hidden />Negociação de origem</Link></Button> : null}</div></header>
    {members.error ? <LegalError error={members.error} retry={() => void members.refetch()} /> : null}
    <Tabs value={tab} onValueChange={setTab} className="min-w-0"><div className="max-w-full overflow-x-auto pb-1"><TabsList className="w-max justify-start"><TabsTrigger value="overview">Visão geral</TabsTrigger><TabsTrigger value="operations">Atendimento e trabalho</TabsTrigger><TabsTrigger value="ir">Isenção de IR</TabsTrigger><TabsTrigger value="parties">Partes</TabsTrigger><TabsTrigger value="proceedings">Processos</TabsTrigger><TabsTrigger value="documents">Documentos</TabsTrigger><TabsTrigger value="team">Equipe</TabsTrigger><TabsTrigger value="timeline">Histórico</TabsTrigger></TabsList></div>
      <TabsContent value="overview"><CaseOverview key={legalCase.updated_at} {...shared} /></TabsContent>
      <TabsContent value="operations"><Suspense fallback={<LegalLoading />}><LegalCaseOperations {...shared} member={myMember} members={members.data ?? []} /></Suspense></TabsContent>
      <TabsContent value="ir"><Suspense fallback={<LegalLoading />}><LegalIrWorkspace {...shared} member={myMember} members={members.data ?? []} /></Suspense></TabsContent>
      <TabsContent value="parties"><CaseParties {...shared} /></TabsContent>
      <TabsContent value="proceedings"><CaseProceedings {...shared} /></TabsContent>
      <TabsContent value="documents">{members.isPending && !isOwner ? <LegalLoading /> : <CaseDocuments {...shared} member={myMember} />}</TabsContent>
      <TabsContent value="team">{members.isPending ? <LegalLoading /> : <CaseTeam legalCase={legalCase} workspace={workspace} members={members.data ?? []} canManage={isOwner} />}</TabsContent>
      <TabsContent value="timeline"><CaseTimeline {...shared} /></TabsContent>
    </Tabs>
  </div>;
}
