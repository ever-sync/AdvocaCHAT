import type { CaseFinancialData, FinancialStatement } from "@/types/legal-case-finance";
import { financeRpc } from "@/lib/api/legal-case-finance";
import type { CareMembership } from "../client-care/types";
import { FinanceForm, FinanceRecord } from "./FinanceShared";
import { CATEGORIES, money, noteField, OWNERS, today } from "./finance-ui";

export interface FinanceStatementsProps { caseId: string; data: CaseFinancialData; owner: boolean; memberships: CareMembership[] }

function StatementPreview({ statement }: { statement: FinancialStatement }) {
  const snapshot = statement.snapshot;
  return <details className="rounded-lg bg-muted/30 p-3"><summary className="cursor-pointer font-medium">Conferir conteúdo desta versão</summary><div className="mt-4 space-y-4 text-sm">
    <p className="whitespace-pre-wrap break-words">{statement.public_note}</p>
    <p className="text-muted-foreground">Os saldos e movimentos referem-se ao período informado. As obrigações mostram a posição na geração desta versão; alterações posteriores exigem outra versão.</p>
    <dl className="grid gap-3 sm:grid-cols-2">
      <div><dt>Recursos do cliente no início</dt><dd className="font-medium">{money(snapshot.opening.client)}</dd></div>
      <div><dt>Recursos do cliente no fim</dt><dd className="font-medium">{money(snapshot.closing.client)}</dd></div>
      <div><dt>Recursos do escritório no início</dt><dd className="font-medium">{money(snapshot.opening.office)}</dd></div>
      <div><dt>Recursos do escritório no fim</dt><dd className="font-medium">{money(snapshot.closing.office)}</dd></div>
    </dl>
    <section aria-label="Movimentos da prestação"><h5 className="font-medium">Movimentos comprovados</h5>{snapshot.movements.length ? <ul className="mt-2 space-y-2">{snapshot.movements.map((movement) => <li key={movement.id} className="rounded border p-3"><p className="break-words">{movement.date} · {movement.reference}</p><p>{OWNERS[movement.from_owner]} → {OWNERS[movement.to_owner]}</p><p className="font-medium">{money(movement.amount)}{movement.reverses_id ? " · Estorno documentado" : ""}</p></li>)}</ul> : <p className="text-muted-foreground">Nenhum movimento no período.</p>}</section>
    <section aria-label="Obrigações da prestação"><h5 className="font-medium">Obrigações na geração</h5>{snapshot.obligations.length ? <ul className="mt-2 space-y-2">{snapshot.obligations.map((obligation) => <li key={obligation.id} className="rounded border p-3"><p className="break-words font-medium">{obligation.title}</p><p>{CATEGORIES[obligation.category] ?? "Obrigação"} · {obligation.direction === "receivable" ? "A receber" : "A pagar"} · {OWNERS[obligation.funds_owner] ?? "Custódia registrada"}</p><p>Total {money(obligation.amount)} · Liquidado {money(obligation.paid)} · Restante {money(obligation.remaining)}</p><p>Vencimento {obligation.due_on}</p></li>)}</ul> : <p className="text-muted-foreground">Nenhuma obrigação aprovada.</p>}</section>
  </div></details>;
}

export function FinanceStatements({ caseId, data, owner, memberships }: FinanceStatementsProps) {
  const statements = data.statements.filter((statement) => statement.case_id === caseId).slice().sort((a, b) => b.version_number - a.version_number);
  const releases = data.releases.filter((release) => release.case_id === caseId);
  const recipients = memberships.filter((member) => member.case_id === caseId && member.state === "active" && member.allow_fiscal && member.scopes.includes("statements:read") && Date.parse(member.expires_at) > Date.now());
  const membershipName = (id: string) => memberships.find((member) => member.case_id === caseId && member.id === id)?.public_title ?? "Destinatário individual";
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Prepare a prestação, confira o conteúdo e libere uma versão aprovada para cada pessoa autorizada. A liberação aparece na conta individual do portal.</p>
    {owner ? <FinanceForm key={`create-${caseId}`} title="Preparar prestação de contas" description="A nova versão preserva o retrato financeiro do período. Não libera conteúdo automaticamente." fields={[
      { key: "title", label: "Título da prestação" }, { key: "start", label: "Início do período", kind: "date" }, { key: "end", label: "Fim do período", kind: "date", initial: today() },
      { key: "note", label: "Explicação para o destinatário", kind: "textarea", hint: "Este texto integra a versão que poderá ser liberada no portal." },
    ]} onSave={(values) => financeRpc("legal_create_financial_statement", { p_case_id: caseId, p_title: values.title.trim(), p_period_start: values.start, p_period_end: values.end, p_public_note: values.note.trim() })} /> : null}
    {!statements.length ? <p className="text-sm text-muted-foreground">Nenhuma prestação preparada.</p> : statements.map((statement) => <FinanceRecord key={statement.id} title={`${statement.title} · versão ${statement.version_number}`} status={statement.status}>
      <p className="text-sm text-muted-foreground">{statement.period_start} a {statement.period_end}</p>
      <StatementPreview statement={statement} />
      {owner && statement.status === "draft" ? <FinanceForm title="Revisar prestação" button="Registrar revisão" fields={[
        { key: "decision", label: "Resultado da conferência", kind: "select", options: [{ value: "approved", label: "Aprovar esta versão" }, { value: "returned", label: "Devolver para ajuste em nova versão" }] }, noteField,
      ]} onSave={(values) => financeRpc("legal_review_financial_statement", { p_statement_id: statement.id, p_decision: values.decision, p_note: values.note.trim() })} /> : null}
      {owner && statement.status === "approved" ? recipients.length ? <FinanceForm key={`release-${statement.id}-${recipients.map((member) => `${member.id}:${member.revision}`).join("-")}`} title="Liberar para uma pessoa" button="Liberar no portal" description="O servidor confere novamente a validade do acesso, os poderes do representante e a versão financeira antes de liberar." fields={[
        { key: "membership", label: "Conta individual autorizada", kind: "select", options: recipients.filter((member) => !releases.some((release) => release.statement_id === statement.id && release.membership_id === member.id && !release.revoked_at)).map((member) => ({ value: member.id, label: `${member.public_title} · ${member.verified_email}` })) },
        { key: "expires", label: "Validade até (00h, horário de Brasília)", kind: "date", hint: "Escolha uma data futura dentro da validade do acesso individual." }, { ...noteField, label: "Motivo e conferência da liberação" },
      ]} onSave={(values) => financeRpc("legal_release_financial_statement", { p_statement_id: statement.id, p_membership_id: values.membership, p_expires_at: `${values.expires}T00:00:00-03:00`, p_reason: values.note.trim() })} /> : <p className="text-sm text-muted-foreground">Cadastre um acesso individual ativo com permissão fiscal e de prestação de contas na aba Atendimento.</p> : null}
      {releases.filter((release) => release.statement_id === statement.id).map((release) => <div key={release.id} className="rounded border p-3 text-sm"><p className="break-words font-medium">{membershipName(release.membership_id)}</p><p>{release.revoked_at ? "Liberação revogada" : Date.parse(release.expires_at) <= Date.now() ? "Liberação expirada" : "Liberada no portal"} · até {new Date(release.expires_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>{owner && !release.revoked_at ? <div className="mt-3"><FinanceForm title="Revogar esta liberação" button="Revogar novas consultas" fields={[{ ...noteField, label: "Motivo da revogação" }]} onSave={(values) => financeRpc("legal_revoke_financial_statement_release", { p_release_id: release.id, p_reason: values.note.trim() })} /></div> : null}</div>)}
    </FinanceRecord>)}
  </div>;
}
export default FinanceStatements;
