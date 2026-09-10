import type { createAdminClient } from "./supabase.ts";
import { getInstanceById } from "./domain.ts";

type InstanceRow = {
  id: string;
  tenant_id: string;
  display_name: string;
  uazapi_instance_name: string;
  uazapi_base_url: string;
  encrypted_apikey: string;
  phone_number: string | null;
  status: string;
  is_default: boolean;
  webhook_token: string;
  archived_at?: string | null;
};

export async function resolveWhatsappInstance(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  instanceId?: string | null,
): Promise<InstanceRow> {
  if (instanceId) {
    const instance = await getInstanceById(admin, instanceId);
    if (instance.tenant_id !== tenantId) {
      throw new Error("WhatsApp instance not found.");
    }
    return instance;
  }

  const { data, error } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error("No active WhatsApp instance for tenant.");
  }

  return data as InstanceRow;
}

export function phoneToRemoteJid(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  const national = digits.startsWith("55") ? digits : `55${digits.replace(/^0+/, "").slice(-11)}`;
  return `${national}@s.whatsapp.net`;
}
