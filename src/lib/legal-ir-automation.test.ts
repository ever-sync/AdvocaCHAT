import { describe, expect, it } from 'vitest';
import { deriveIrAutomationActions } from './legal-ir-automation';
import { deriveIrFiscalOverview, type IrDossierData } from './legal-ir-dossier';
const data = {
  context: { can_fiscal: true, can_medical: true, can_assess: true, assessment_is_current: true, latest_assessment_id: 'a', checklist_states: [{ item_id: 'done', state: 'approved' }] },
  checklist: [{ id: 'done', category: 'medical', required: true }, { id: 'missing', category: 'medical', required: true, title: 'Laudo' }],
  reviews: [], taxEntries: [{ source_id: 'source', calendar_year: 2025, withheld: null }], calculations: [],
} as unknown as IrDossierData;
describe('automatic IR work queue', () => {
  it('detects missing values without reopening approved documents or duplicating work', () => {
    const actions = deriveIrAutomationActions(data);
    expect(actions.map(item => item.id)).toEqual(['checklist:missing', 'fiscal:incomplete']);
    expect(deriveIrAutomationActions(data)).toEqual(actions);
  });
  it('immediately drops restricted work when permissions are revoked', () => {
    expect(deriveIrAutomationActions({ ...data, context: { ...data.context, can_fiscal: false, can_medical: false, can_assess: false } })).toEqual([]);
  });
  it('uses latest competence per source instead of counting historical withholding alerts', () => {
    const cessations = [
      { id: 'old', source_id: 's', competence: '2025-01', status: 'ongoing' },
      { id: 'new', source_id: 's', competence: '2025-02', status: 'verified' },
      { id: 'other', source_id: 't', competence: '2025-02', status: 'reopened' },
    ] as IrDossierData['cessations'];
    expect(deriveIrFiscalOverview({ ...data, cessations }).activeWithholdingChecks).toBe(1);
  });
});
