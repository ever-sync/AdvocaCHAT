import { requireSupabase } from "@/lib/supabase";

export type SalesWorkflowConfig = {
  enabled: boolean;
  sdr_name: string;
  closer_name: string;
  sdr_instructions: string;
  closer_instructions: string;
  contract_template: string;
  fee_terms: string;
  template_approved: boolean;
  revision: number;
};
export const DEFAULT_SALES_WORKFLOW: SalesWorkflowConfig = {
  enabled: false,
  sdr_name: "Davi",
  closer_name: "Clara",
  sdr_instructions: "",
  closer_instructions: "",
  contract_template: "",
  fee_terms: "",
  template_approved: false,
  revision: 0,
};
export type SalesWorkflowRow = {
  chat_id: string;
  display_name: string | null;
  phase: "sdr" | "closer" | "paused";
  updated_at: string;
  documents_received: number;
  draft_id: string | null;
};
export async function getSalesWorkflowConfig(): Promise<SalesWorkflowConfig> {
  // RLS uses the actual admin identity, never the platform's impersonated tenant.
  const { data, error } = await requireSupabase()
    .from("ai_sales_workflow_config")
    .select(
      "enabled,sdr_name,closer_name,sdr_instructions,closer_instructions,contract_template,fee_terms,template_approved,revision",
    )
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? DEFAULT_SALES_WORKFLOW;
}
export async function saveSalesWorkflowConfig(
  config: SalesWorkflowConfig,
): Promise<SalesWorkflowConfig> {
  const { data, error } = await requireSupabase().rpc(
    "ai_sales_workflow_save",
    { p_config: config, p_expected_revision: config.revision },
  );
  if (error) throw new Error(error.message);
  return data;
}
export async function getSalesWorkflowOverview(): Promise<SalesWorkflowRow[]> {
  const { data, error } = await requireSupabase().rpc(
    "ai_sales_workflow_overview",
  );
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function downloadSalesContract(id: string): Promise<void> {
  const { data, error } = await requireSupabase().rpc(
    "ai_sales_contract_content",
    { p_draft_id: id },
  );
  if (error) throw new Error(error.message);
  const url = URL.createObjectURL(
    new Blob([String(data)], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `contrato-rascunho-${id}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
