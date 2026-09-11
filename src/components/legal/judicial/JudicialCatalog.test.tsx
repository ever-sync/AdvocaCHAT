import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { JudicialCalendarVersion, JudicialRuleVersion } from "@/types/legal-judicial";
import type { LegalCaseDocument } from "@/types/legal";
import { createJudicialCalendar, createJudicialRule, reviewJudicialRule } from "@/lib/api/legal-judicial";
import { JudicialCatalog } from "./JudicialCatalog";
import { JudicialCalendarForm } from "./JudicialCalendarForm";
import { JudicialRuleForm } from "./JudicialRuleForm";
import { judicialKey, type JudicialProps } from "./judicial-ui";

vi.mock("@/lib/api/legal", () => ({ listLegalDocuments: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/api/legal-judicial", () => ({ createJudicialCalendar: vi.fn(), createJudicialRule: vi.fn(), reviewJudicialCalendar: vi.fn(), reviewJudicialRule: vi.fn() }));
vi.mock("../legal-ui", () => ({ selectClassName: "", useLegalAction: () => ({ pending: false, run: async (action: () => Promise<unknown>) => { await action(); return true; } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const version = { id: "version", tenant_id: "tenant", title: "Configuração sintética", version_number: 1, state: "draft" as const, created_by: "owner", created_at: "2026-09-11T12:00:00Z", reviewed_by: null, reviewed_at: null, review_note: "", valid_from: "2026-01-01", valid_until: "2026-12-31", scope: { court: "Órgão fictício", degree: "1", unit: "Unidade de teste", territory: "TEST" }, sources: [{ title: "Fonte sintética", url: "https://example.test/official", checked_on: "2026-09-11", document_id: "proof" }] };
const rule: JudicialRuleVersion = { ...version, rule_key: "rule", body: { regime: "civil_procedure", nature: "procedural", modality: "Teste", recipient_kind: "Teste", conditions: "Condições sintéticas", exclusions: "Sem outros ramos", validity_note: "Vigência da fixture", transition_resolved: true, input_kind: "civil_date", anchor_kind: "published_on", marker_offset_count: 0, marker_offset_unit: "business_days", marker_adjustment: "none", exclude_marker: true, count_unit: "business_days", apply_suspensions: true, due_adjustment: "next_business_day", due_time: "18:00:00" } };
const calendar: JudicialCalendarVersion = { ...version, id: "calendar", calendar_key: "calendar", timezone: "America/Sao_Paulo", body: { working_weekdays: [1, 2, 3, 4, 5], exceptions: [{ on: "2026-09-15", suspend_count: true, allow_start: false, allow_due: false, reason: "Efeito sintético", source_index: 0 }], suspensions: [] } };
const props: JudicialProps = {
  legalCase: { id: "case", tenant_id: "tenant", owner_id: "owner" } as JudicialProps["legalCase"],
  workspace: { user_id: "owner", tenant_id: "tenant", enabled: true, collaborators: [] } as unknown as JudicialProps["workspace"], canEdit: true,
  context: { tenant_id: "tenant", user_id: "owner", can_manage_sources: true, can_edit_catalog: true, can_approve_catalog: true, can_edit_case: true, can_review_case: true, sources: [], connections: [], coverages: [], jobs: [], inbox: [], triage: [], calendars: [], rules: [rule], deadlines: [], deadline_states: [] },
};
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(judicialKey(props, "catalog-documents"), []);
  return { client, wrap: (content: ReactNode) => <QueryClientProvider client={client}>{content}</QueryClientProvider> };
}

it("keeps read-only catalogs escaped and excludes other tenants and executable source URLs", () => {
  const { wrap } = setup();
  const injected = '<img src=x onerror="alert(1)">';
  const view = render(wrap(<JudicialCatalog {...props} context={{ ...props.context, can_edit_catalog: false, can_approve_catalog: false, rules: [{ ...rule, title: injected, sources: [{ ...rule.sources[0], url: "javascript:alert(1)" }] }, { ...rule, id: "other", tenant_id: "foreign", title: "Outro escritório" }] }} />));
  expect(screen.getByText(injected)).toBeInTheDocument();
  expect(view.container.querySelector("img")).toBeNull();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText("Outro escritório")).not.toBeInTheDocument();
});
it("removes an open review on permission revocation and hides stale context from a different identity", () => {
  const { wrap } = setup();
  const view = render(wrap(<JudicialCatalog {...props} />));
  fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
  fireEvent.change(screen.getByLabelText("Justificativa da revisão"), { target: { value: "Conferência em andamento" } });
  view.rerender(wrap(<JudicialCatalog {...props} context={{ ...props.context, can_approve_catalog: false }} />));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.rerender(wrap(<JudicialCatalog {...props} context={{ ...props.context, user_id: "other" }} />));
  expect(screen.queryByText(rule.title)).not.toBeInTheDocument();
  expect(reviewJudicialRule).not.toHaveBeenCalled();
});
it("requires an explicit human confirmation and note before approving a source-backed version", async () => {
  const { wrap } = setup();
  render(wrap(<JudicialCatalog {...props} />));
  fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
  const approve = screen.getByRole("button", { name: "Aprovar versão" });
  expect(approve).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Justificativa da revisão"), { target: { value: "Conferi a configuração sintética." } });
  expect(approve).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "Examinei as fontes, a vigência, o órgão e todos os efeitos desta versão" }));
  fireEvent.click(approve);
  await waitFor(() => expect(reviewJudicialRule).toHaveBeenCalledWith(rule.id, "approved", "Conferi a configuração sintética."));
});
it("does not prefill legal markers or due time and saves copied rules only as a new unreviewed draft", async () => {
  const close = vi.fn();
  const view = render(<JudicialRuleForm documents={[]} onClose={close} />);
  expect(screen.getByLabelText("Deslocamento até o marco legal (0 a 60)")).toHaveValue("");
  expect(screen.getByLabelText("Horário local de vencimento (HH:MM:SS)")).toHaveValue("");
  expect(screen.getByLabelText("Regime jurídico")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeDisabled();
  view.unmount();
  render(<JudicialRuleForm original={rule} documents={[]} onClose={close} />);
  expect(screen.getByRole("checkbox", { name: /^Conferi a incidência temporal e resolvi a transição normativa desta versão/ })).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
  await waitFor(() => expect(createJudicialRule).toHaveBeenCalledTimes(1));
  const payload = vi.mocked(createJudicialRule).mock.calls[0][0];
  expect(payload.body).toMatchObject({ transition_resolved: false, marker_offset_count: 0, exclude_marker: true, due_time: "18:00:00" });
  expect(payload).not.toHaveProperty("state"); expect(payload).not.toHaveProperty("reviewed_by");
});
it("removing a cited source requires an explicit replacement and never silently binds the next source", async () => {
  const second = { ...version.sources[0], title: "Segunda fonte", document_id: "proof-two" };
  const docs = [{ id: "proof", display_name: "Prova um" }, { id: "proof-two", display_name: "Prova dois" }] as LegalCaseDocument[];
  render(<JudicialCalendarForm original={{ ...calendar, sources: [version.sources[0], second] }} documents={docs} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Remover fonte 1" }));
  expect(screen.getByLabelText("Fonte que comprova o efeito")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Fonte que comprova o efeito"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
  await waitFor(() => expect(createJudicialCalendar).toHaveBeenCalledTimes(1));
  const payload = vi.mocked(createJudicialCalendar).mock.calls[0][0];
  expect(payload.sources).toEqual([second]); expect(payload.body.exceptions[0]).toMatchObject({ source_index: 0, suspend_count: true, allow_start: false, allow_due: false });
  expect(payload).not.toHaveProperty("state");
});
