import { requireSupabase } from "@/lib/supabase";

export async function getCurrentUserId() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error("Sessão inválida. Faça login novamente.");
  }

  return data.user.id;
}

export async function getCurrentTenantId() {
  const supabase = requireSupabase();
  await getCurrentUserId();
  const { data, error } = await supabase.rpc("current_tenant_id");

  if (error) {
    throw new Error(
      "Não foi possível resolver o tenant ativo. Confirme se as migrations de contexto da plataforma foram aplicadas no Supabase.",
    );
  }

  if (!data) {
    throw new Error("O usuário autenticado ainda não possui tenant associado.");
  }

  return String(data);
}
