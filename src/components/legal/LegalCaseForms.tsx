import { useDeferredValue, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Scale, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createLegalCase, listLegalCustomers, saveMyLegalProfessionalProfile, setLegalWorkspaceEnabled, type getLegalWorkspaceContext } from "@/lib/api/legal";
import { LegalError, LegalField } from "./LegalShared";
import { CASE_TYPES, OAB_STATES, selectClassName, useLegalAction } from "./legal-ui";

type Workspace = Awaited<ReturnType<typeof getLegalWorkspaceContext>>;

export function LegalWorkspaceSettings({ workspace }: { workspace: Workspace }) {
  const [number, setNumber] = useState(workspace.professional_profile?.oab_number ?? "");
  const [state, setState] = useState(workspace.professional_profile?.oab_state ?? "");
  const [activationReviewed, setActivationReviewed] = useState(false);
  const action = useLegalAction();

  async function save(event: FormEvent) {
    event.preventDefault();
    await action.run(() => saveMyLegalProfessionalProfile({ oab_number: number.trim(), oab_state: state }), "Dados profissionais atualizados");
  }

  return <div className="grid gap-4 lg:grid-cols-2">
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Scale className="h-5 w-5" aria-hidden />Meu registro profissional</CardTitle><CardDescription>A identificação na OAB não concede acesso a casos nem valida automaticamente a inscrição.</CardDescription></CardHeader><CardContent>
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <fieldset disabled={!workspace.enabled || action.pending} className="grid grid-cols-[1fr_6rem] gap-3"><LegalField label="Número da OAB">{(id) => <Input id={id} value={number} onChange={(event) => setNumber(event.target.value)} maxLength={30} placeholder="Ex.: 123456" required={Boolean(state)} />}</LegalField><LegalField label="UF">{(id) => <select id={id} className={selectClassName} value={state} onChange={(event) => setState(event.target.value)} required={Boolean(number.trim())}><option value="">UF</option>{OAB_STATES.map((uf) => <option key={uf}>{uf}</option>)}</select>}</LegalField></fieldset>
        {!workspace.enabled ? <p className="text-xs text-muted-foreground">Habilite a área jurídica para salvar o registro profissional.</p> : null}
        <Button type="submit" disabled={action.pending || !workspace.enabled}>{action.pending ? "Salvando…" : "Salvar registro"}</Button>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5" aria-hidden />Área jurídica do escritório</CardTitle><CardDescription>{workspace.enabled ? "A área jurídica está habilitada neste escritório." : "Organize casos e documentos com acesso concedido individualmente."}</CardDescription></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Cada novo caso começa com acesso apenas para seu responsável. Dados médicos e fiscais exigem autorização específica para os demais participantes.</p>
      {workspace.can_activate ? <>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={activationReviewed} onChange={(event) => setActivationReviewed(event.target.checked)} /><span>{workspace.enabled ? "Entendo que desabilitar suspende o acesso à área jurídica deste escritório e preserva os dados já cadastrados." : "Revisei o escopo: habilitar a área jurídica somente neste escritório, sem converter negociações ou compartilhar casos existentes."}</span></label>
        <Button variant={workspace.enabled ? "outline" : "default"} disabled={action.pending || !activationReviewed} onClick={() => void action.run(() => setLegalWorkspaceEnabled(!workspace.enabled), workspace.enabled ? "Área jurídica desabilitada" : "Área jurídica habilitada").then((saved) => { if (saved) setActivationReviewed(false); })}>{workspace.enabled ? "Desabilitar área jurídica" : "Habilitar área jurídica"}</Button>
      </> : <p className="text-sm">A habilitação é gerenciada por um administrador deste escritório.</p>}
    </CardContent></Card>
  </div>;
}

export function NewLegalCaseDialog({ open, onOpenChange, customerId, negotiationId, onCreated, workspace }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string | null;
  negotiationId?: string | null;
  onCreated: (id: string) => void;
  workspace: Workspace;
}) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [type, setType] = useState<keyof typeof CASE_TYPES>("consultivo");
  const [selectedCustomer, setSelectedCustomer] = useState(customerId ?? "");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const customers = useQuery({ queryKey: ["legal", workspace.user_id, workspace.tenant_id, "customer-options", deferredSearch], queryFn: () => listLegalCustomers(deferredSearch), enabled: open && !customerId });
  const action = useLegalAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    let caseId: string | undefined;
    const saved = await action.run(async () => {
      const result = await createLegalCase({ title: title.trim(), area: area.trim(), case_type: type, customer_id: selectedCustomer || null, negotiation_id: negotiationId || null });
      caseId = result.id;
    }, negotiationId ? "Caso vinculado à negociação" : "Caso criado");
    if (saved && caseId) { onOpenChange(false); onCreated(caseId); }
  }

  return <Dialog open={open} onOpenChange={(value) => { if (!action.pending) onOpenChange(value); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{negotiationId ? "Criar caso da negociação" : "Novo caso"}</DialogTitle><DialogDescription>{negotiationId ? "O caso terá acompanhamento próprio. A negociação e seu histórico serão preservados; repetir esta conversão abre o mesmo caso." : "Um caso pode ser consultivo, extrajudicial ou reunir vários processos."}</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={(event) => void submit(event)}>
      <LegalField label="Título do caso">{(id) => <Input id={id} autoFocus required minLength={3} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Revisão de contrato de locação" />}</LegalField>
      <div className="grid gap-3 sm:grid-cols-2"><LegalField label="Natureza">{(id) => <select id={id} className={selectClassName} value={type} onChange={(event) => setType(event.target.value as keyof typeof CASE_TYPES)}>{Object.entries(CASE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</LegalField><LegalField label="Área do Direito">{(id) => <Input id={id} maxLength={100} value={area} onChange={(event) => setArea(event.target.value)} placeholder="Ex.: Cível" />}</LegalField></div>
      {customerId ? <p className="rounded-lg bg-muted p-3 text-sm">Cliente da ficha de origem vinculado ao caso. <Link className="font-medium text-primary underline" to={`/clientes/${customerId}`}>Ver ficha do cliente</Link></p> : <div className="space-y-3"><LegalField label="Buscar cliente existente">{(id) => <Input id={id} value={search} onChange={(event) => { setSearch(event.target.value); setSelectedCustomer(""); }} placeholder="Digite o nome do cliente" />}</LegalField>{customers.error ? <LegalError error={customers.error} retry={() => void customers.refetch()} /> : <LegalField label="Cliente principal (opcional)">{(id) => <select id={id} className={selectClassName} value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}><option value="">Sem vínculo com cliente</option>{(customers.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.nome}</option>)}</select>}</LegalField>}</div>}
      <p className="text-xs text-muted-foreground">Você será o responsável inicial. Os demais participantes poderão ser adicionados na aba Equipe.</p>
      <DialogFooter><Button type="button" variant="outline" disabled={action.pending} onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={action.pending || title.trim().length < 3}>{action.pending ? "Criando…" : "Criar caso"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
