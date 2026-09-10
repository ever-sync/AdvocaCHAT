import { createAdminClient } from "./supabase.ts";

type Admin = ReturnType<typeof createAdminClient>;

export function campaignDispatchLockKey(campaignId: string) {
  return `campaign_dispatch:${campaignId}`;
}

export function followupJobLockKey(jobId: string) {
  return `followup_job:${jobId}`;
}

export async function acquireWorkerLock(
  admin: Admin,
  lockKey: string,
  ttlSeconds: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("try_acquire_worker_lock", {
    p_lock_key: lockKey,
    p_ttl_seconds: ttlSeconds,
  });

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function releaseWorkerLock(admin: Admin, lockKey: string): Promise<void> {
  const { error } = await admin.from("worker_job_locks").delete().eq("lock_key", lockKey);

  if (error) {
    console.error("[worker_lock release]", error.message);
  }
}
