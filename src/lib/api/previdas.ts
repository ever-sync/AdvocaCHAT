import { requireSupabase } from "@/lib/supabase";

export const PREVIDAS_LABELS = {
  needed: "Precisa de avaliação",
  requested: "Agendamento pendente",
  scheduled: "Consulta agendada",
  reschedule: "Reagendamento pendente",
  awaiting_report: "Aguardando laudo",
  report_received: "Laudo recebido • não revisado",
  declined: "Encaminhamento recusado",
} as const;
export type PrevidasStatus = keyof typeof PREVIDAS_LABELS;
export type PrevidasRow = {
  chat_id: string;
  display_name: string | null;
  status: PrevidasStatus;
  availability: string;
  appointment_at: string | null;
  modality: string | null;
  confirmation_ref: string | null;
  next_action_at: string | null;
  revision: number;
  documents: { id: string; received_at: string }[];
  events: { source: string; status: PrevidasStatus; created_at: string }[];
};
export const PREVIDAS_NEXT: Record<PrevidasStatus, string> = {
  needed: "Explicar avaliação e confirmar interesse",
  requested: "Obter confirmação do parceiro",
  scheduled: "Acompanhar comparecimento à consulta",
  reschedule: "Obter novo horário com o parceiro",
  awaiting_report: "Acompanhar disponibilização do laudo",
  report_received: "Retomar conferência documental",
  declined: "Verificar outra forma de obter a documentação",
};
export async function getPrevidas(customerId?: string): Promise<PrevidasRow[]> {
  const { data, error } = await requireSupabase().rpc("ai_previdas_overview", {
    p_customer_id: customerId ?? null,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function updatePrevidas(
  row: PrevidasRow,
  input: Record<string, unknown>,
) {
  const { error } = await requireSupabase().rpc("ai_previdas_update", {
    p_chat_id: row.chat_id,
    p_expected_revision: row.revision,
    p_input: input,
  });
  if (error) throw new Error(error.message);
}
