import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CalendarClock, Plus, Scale, Settings2, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLegalCase, getLegalWorkspaceContext, listLegalCases } from "@/lib/api/legal";
import type { LegalCaseStatus } from "@/types/legal";
import { LegalCaseDetail } from "@/components/legal/LegalCaseDetail";
import { LegalWorkspaceSettings, NewLegalCaseDialog } from "@/components/legal/LegalCaseForms";
import { LegalEmpty, LegalError, LegalField, LegalLoading } from "@/components/legal/LegalShared";
import { CASE_STATUS_VARIANTS, CASE_STATUSES, CASE_TYPES, legalDate, selectClassName } from "@/components/legal/legal-ui";

export default function LegalCases() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const customerId = params.get("cliente") || undefined;
  const negotiationId = params.get("negociacao") || undefined;
  const showSettings = params.get("configuracoes") === "1";
  const [search, setSearch] = useState("");
  const [pageState, setPageState] = useState({filter:"",page:0});
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState<LegalCaseStatus | "all">("all");
  const filterKey = JSON.stringify([deferredSearch,status,customerId]);
  const page = pageState.filter === filterKey ? pageState.page : 0;
  const movePage = (next:number) => setPageState({filter:filterKey,page:next});
  const [newCaseOpen, setNewCaseOpen] = useState(Boolean(negotiationId));
  const context = useQuery({ queryKey: ["legal", profile?.id, "context"], queryFn: getLegalWorkspaceContext, enabled: Boolean(profile?.id) });
  const workspace = context.data;
  const cases = useQuery({
    queryKey: ["legal", workspace?.user_id, workspace?.tenant_id, "cases", deferredSearch, status, customerId, page],
    queryFn: () => listLegalCases({ search: deferredSearch, status, customer_id: customerId, offset:page*25 }),
    enabled: Boolean(workspace?.enabled && !id && !showSettings),
  });
  const detail = useQuery({
    queryKey: ["legal", workspace?.user_id, workspace?.tenant_id, "case", id],
    queryFn: () => getLegalCase(id!),
    enabled: Boolean(workspace?.enabled && id),
  });

  function settings(open: boolean) {
    const next = new URLSearchParams(params);
    if (open) next.set("configuracoes", "1"); else next.delete("configuracoes");
    setParams(next);
  }

  return <PageShell contentClassName="max-w-6xl space-y-6">
    {context.isPending ? <LegalLoading /> : context.error ? <LegalError error={context.error} retry={() => void context.refetch()} /> : workspace ? <>
      {workspace.enabled && id ? detail.isPending ? <LegalLoading /> : detail.error ? <LegalError error={detail.error} retry={() => void detail.refetch()} /> : detail.data ? <LegalCaseDetail key={detail.data.id} legalCase={detail.data} workspace={workspace} /> : <LegalEmpty title="Caso indisponível">O caso não foi encontrado ou seu acesso não está autorizado.<div className="mt-4"><Button asChild variant="outline"><Link to="/casos">Voltar aos casos</Link></Button></div></LegalEmpty> : <>
        <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><Scale className="h-4 w-4" aria-hidden />AdvocaCHAT Jurídico</p><Button asChild variant="link" className="mb-2 p-0"><Link to="/juridico/operacao">Indicadores e operação</Link></Button><h1 className="text-2xl font-semibold tracking-tight">{showSettings ? "Escritório e registro profissional" : "Casos"}</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">{showSettings ? "Gerencie a habilitação da área jurídica e sua identificação profissional." : "Acompanhe cada cliente, seus processos, documentos e a próxima providência."}</p></div><div className="flex flex-wrap gap-2">{showSettings ? <Button variant="outline" onClick={() => settings(false)}><ArrowLeft className="mr-2 h-4 w-4" aria-hidden />Voltar aos casos</Button> : <Button variant="outline" onClick={() => settings(true)}><Settings2 className="mr-2 h-4 w-4" aria-hidden />Escritório</Button>}{workspace.enabled && workspace.can_create && !showSettings ? <Button onClick={() => setNewCaseOpen(true)}><Plus className="mr-2 h-4 w-4" aria-hidden />Novo caso</Button> : null}</div></header>
        {!workspace.enabled || showSettings ? <>
          {!workspace.enabled ? <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><div><p className="font-medium">A área jurídica está desabilitada</p><p className="mt-1 text-sm text-muted-foreground">{workspace.can_activate ? "Revise as condições abaixo para habilitar os casos neste escritório." : "Um administrador deste escritório pode habilitar a área jurídica."}</p></div></div> : null}
          <LegalWorkspaceSettings key={`${workspace.user_id}:${workspace.enabled}:${workspace.professional_profile?.oab_number ?? ""}:${workspace.professional_profile?.oab_state ?? ""}`} workspace={workspace} />
        </> : <>
          {customerId ? <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm"><span className="flex-1">Mostrando os casos vinculados a este cliente.</span><Button asChild size="sm" variant="outline"><Link to={`/clientes/${customerId}`}>Ficha do cliente</Link></Button><Button size="sm" variant="ghost" onClick={() => { const next = new URLSearchParams(params); next.delete("cliente"); next.delete("negociacao"); setParams(next); }}><X className="mr-1 h-4 w-4" aria-hidden />Limpar filtro</Button></div> : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_14rem]"><LegalField label="Buscar caso">{(fieldId) => <Input id={fieldId} placeholder="Buscar pelo título" value={search} onChange={(event) => setSearch(event.target.value)} />}</LegalField><LegalField label="Situação">{(fieldId) => <select id={fieldId} className={selectClassName} value={status} onChange={(event) => setStatus(event.target.value as LegalCaseStatus | "all")}><option value="all">Todas as situações</option>{Object.entries(CASE_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</LegalField></div>
          {cases.isPending ? <LegalLoading /> : cases.error ? <LegalError error={cases.error} retry={() => void cases.refetch()} /> : cases.data?.length ? <div className="space-y-3"><p className="text-sm text-muted-foreground">{Math.min(cases.data.length,25)} casos nesta página{cases.isFetching ? " · Atualizando…" : ""}</p><div className="grid gap-3 lg:grid-cols-2">{cases.data.slice(0,25).map((legalCase) => <Card key={legalCase.id} className="transition-colors hover:border-primary/40"><CardContent className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><Link className="min-w-0 flex-1 break-words font-semibold hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to={`/casos/${legalCase.id}`}>{legalCase.title}</Link><ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /></div><div className="flex flex-wrap gap-2"><Badge variant={CASE_STATUS_VARIANTS[legalCase.status]}>{CASE_STATUSES[legalCase.status]}</Badge><Badge variant="outline">{CASE_TYPES[legalCase.case_type]}</Badge>{legalCase.area ? <span className="text-sm text-muted-foreground">{legalCase.area}</span> : null}</div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs font-medium text-muted-foreground">Próxima providência</p><p className="mt-1 break-words text-sm">{legalCase.next_action || "Definir próxima providência"}</p>{legalCase.next_action_due_at ? <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" aria-hidden />{legalDate(legalCase.next_action_due_at, true)}</p> : null}</div>{legalCase.status === "aguardando" && legalCase.wait_reason ? <p className="text-sm text-muted-foreground">Aguardando: {legalCase.wait_reason}</p> : null}</CardContent></Card>)}</div><div className="flex items-center gap-3"><Button variant="outline" disabled={page===0} onClick={()=>movePage(page-1)}>Anterior</Button><span>Página {page+1}</span><Button variant="outline" disabled={cases.data.length<=25} onClick={()=>movePage(page+1)}>Próxima</Button></div></div> : <LegalEmpty title={search || status !== "all" ? "Nenhum caso encontrado" : "Seu primeiro caso começa aqui"}>{search || status !== "all" ? "Ajuste a busca ou a situação selecionada." : "Os casos aos quais você receber acesso aparecerão nesta área."}{workspace.can_create ? <div className="mt-4"><Button onClick={() => setNewCaseOpen(true)}><Plus className="mr-2 h-4 w-4" aria-hidden />Criar caso</Button></div> : null}</LegalEmpty>}
        </>}
      </>}
      {workspace.enabled && workspace.can_create ? <NewLegalCaseDialog key={`${customerId ?? "none"}:${negotiationId ?? "none"}:${newCaseOpen}`} open={newCaseOpen} onOpenChange={setNewCaseOpen} workspace={workspace} customerId={customerId} negotiationId={negotiationId} onCreated={(caseId) => navigate(`/casos/${caseId}`)} /> : null}
    </> : null}
  </PageShell>;
}
