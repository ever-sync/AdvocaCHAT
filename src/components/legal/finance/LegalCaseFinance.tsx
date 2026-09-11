import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LegalCase, LegalCaseMember, LegalWorkspaceContext } from "@/types/legal";
import { getCaseFinance, getFinanceReferences } from "@/lib/api/legal-case-finance";
import { LegalEmpty, LegalError, LegalLoading } from "../LegalShared";
import { getClientCareContext } from "../client-care/api";
import FinanceAgreements from "./FinanceAgreements";
import FinanceCash from "./FinanceCash";
import FinanceStatements from "./FinanceStatements";
import FinanceCharges from "./FinanceCharges";
import { money } from "./finance-ui";
export default function LegalCaseFinance({ legalCase, workspace, member, canEdit }: { legalCase: LegalCase; workspace: LegalWorkspaceContext; member?: LegalCaseMember; canEdit: boolean }) {
  const owner = legalCase.owner_id === workspace.user_id;
  const fiscal = owner || Boolean(member?.can_view_fiscal);
  // Permission is part of the key, and disabled queries never retain a prior
  // authorized projection after the membership query updates.
  const key = ["legal", workspace.user_id, workspace.tenant_id, "case", legalCase.id, "case-finance", fiscal, owner];
  const finance = useQuery({ queryKey: key, queryFn: ({ signal }) => getCaseFinance(legalCase.id, signal), enabled: fiscal });
  const references = useQuery({ queryKey: [...key, "references", Boolean(member?.can_view_medical)], queryFn: ({ signal }) => getFinanceReferences(legalCase.id, owner || Boolean(member?.can_view_medical), signal), enabled: fiscal });
  const care = useQuery({ queryKey: [...key, "recipients"], queryFn: () => getClientCareContext(legalCase.id), enabled: fiscal && owner });
  const [tab, setTab] = useState("cash");
  if (!fiscal) return <LegalEmpty title="Acesso financeiro restrito">O responsável pelo caso precisa autorizar seu acesso fiscal.</LegalEmpty>;
  if (finance.isPending || references.isPending) return <LegalLoading />;
  if (finance.error || references.error) return <LegalError error={finance.error ?? references.error} retry={() => { void finance.refetch(); void references.refetch(); }} />;
  if (!finance.data || !references.data) return <LegalEmpty title="Não foi possível carregar a posição financeira" />;
  const common = { caseId: legalCase.id, data: finance.data, owner };
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border bg-muted/30 p-4"><p className="text-sm text-muted-foreground">Recursos do cliente sob custódia</p><p className="break-words text-xl font-semibold">{money(finance.data.context.client_balance)}</p></div><div className="rounded-lg border bg-muted/30 p-4"><p className="text-sm text-muted-foreground">Recursos do escritório neste caso</p><p className="break-words text-xl font-semibold">{money(finance.data.context.office_balance)}</p></div></div><Tabs value={tab} onValueChange={setTab} className="min-w-0"><div className="max-w-full overflow-x-auto"><TabsList className="w-max"><TabsTrigger value="cash">Movimentos e obrigações</TabsTrigger><TabsTrigger value="agreements">Honorários</TabsTrigger><TabsTrigger value="statements">Prestação de contas</TabsTrigger><TabsTrigger value="charges">Cobranças</TabsTrigger></TabsList></div>
    <TabsContent value="cash"><FinanceCash {...common} references={references.data} canEdit={canEdit} /></TabsContent>
    <TabsContent value="agreements"><FinanceAgreements {...common} references={references.data} canEdit={canEdit} /></TabsContent>
    <TabsContent value="statements">{care.error && owner ? <LegalError error={care.error} retry={() => void care.refetch()} /> : <FinanceStatements {...common} memberships={care.data?.memberships ?? []} />}</TabsContent>
    <TabsContent value="charges"><FinanceCharges {...common} memberships={care.data?.memberships ?? []} workspaceAdmin={workspace.can_activate} /></TabsContent>
  </Tabs></div>;
}
