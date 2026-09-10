import { createAdminClient } from "./supabase.ts";

type Admin = ReturnType<typeof createAdminClient>;

export async function recordFailedJob(
  admin: Admin,
  input: {
    tenantId: string | null;
    jobType: string;
    refTable?: string | null;
    refId?: string | null;
    payload?: Record<string, unknown>;
    errorMessage: string;
    attemptCount?: number;
  },
): Promise<void> {
  const msg = input.errorMessage.slice(0, 8000);
  const { error } = await admin.from("failed_jobs").insert({
    tenant_id: input.tenantId,
    job_type: input.jobType,
    ref_table: input.refTable ?? null,
    ref_id: input.refId ?? null,
    payload: input.payload ?? {},
    error_message: msg,
    attempt_count: input.attemptCount ?? 3,
  });

  if (error) {
    console.error("[failed_jobs]", error.message);
  }
}
