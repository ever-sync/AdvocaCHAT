import { getCurrentTenantId } from "@/lib/api/tenant";
import {
  isSupabaseConfigured,
  requireSupabase,
} from "@/lib/supabase";

const BUCKET = "marketing-forms";

/**
 * Faz upload de uma imagem pública para formulários/marketing.
 */
export async function uploadMarketingImage(file: File): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não está configurado.");
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("Usuário não autenticado ou sem tenant.");

  const supabase = requireSupabase();

  // Gerar um nome único e seguro para o arquivo
  const ext = file.name.split(".").pop() || "png";
  const safeName = Math.random().toString(36).substring(2, 15);
  const path = `${tenantId}/forms/${Date.now()}_${safeName}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    throw new Error(`Erro ao fazer upload da imagem: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
