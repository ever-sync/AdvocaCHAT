import type { IrDossierData } from './legal-ir-dossier';

export type IrAutomationAction = {
  id: string;
  title: string;
  detail: string;
  tab: 'checklist' | 'evidence' | 'assessment' | 'financial';
};

/** Recomputed from currently accessible records; no stored approval or outbound side effect. */
export function deriveIrAutomationActions(data: IrDossierData): IrAutomationAction[] {
  const actions: IrAutomationAction[] = [];
  const allowed = (category: string) => category === 'general' ||
    (category === 'medical' && data.context.can_medical) ||
    (category === 'fiscal' && data.context.can_fiscal);
  const states = new Map(data.context.checklist_states.map(item => [item.item_id, item.state]));
  for (const item of data.checklist) {
    if (!allowed(item.category) || !item.required || ['approved', 'waived'].includes(states.get(item.id) ?? 'pending')) continue;
    actions.push({ id: `checklist:${item.id}`, title: item.title,
      detail: states.get(item.id) === 'submitted' ? 'Documento recebido: conferir antes de aprovar.' : 'Resolver a pendência documental no checklist.', tab: 'checklist' });
  }
  for (const review of data.reviews) {
    if (!allowed(review.category) || review.result === 'sufficient') continue;
    actions.push({ id: `review:${review.id}`, title: review.result === 'inconsistent' ? 'Conferir divergência documental' : 'Concluir conferência documental', detail: review.review_note || 'Abra a documentação e confira as evidências.', tab: 'evidence' });
  }
  if (data.context.can_fiscal) {
    const incomplete = (data.taxEntries ?? []).filter(item => !item.source_id || (!item.calendar_year && !item.competence) || item.withheld == null);
    if (incomplete.length) actions.push({ id: 'fiscal:incomplete', title: `Conferir ${incomplete.length} lançamento(s) incompleto(s)`, detail: 'Fonte, período ou retenção ausente. Valor não informado não equivale a zero.', tab: 'financial' });
    for (const calculation of data.calculations ?? []) {
      if (!data.context.can_medical || !['incomplete', 'draft', 'in_review'].includes(calculation.status)) continue;
      actions.push({ id: `calculation:${calculation.id}`, title: `Revisar cálculo ${calculation.version_number}`, detail: 'Conferir parâmetros, memória e resultados antes da aprovação profissional.', tab: 'financial' });
    }
  }
  if (data.context.can_assess && (!data.context.latest_assessment_id || !data.context.assessment_is_current)) {
    actions.push({ id: 'assessment:current', title: 'Preparar análise profissional atualizada', detail: 'Revisar os fatos e as fontes atuais antes de definir a estratégia.', tab: 'assessment' });
  }
  return [...new Map(actions.map(action => [action.id, action])).values()];
}
