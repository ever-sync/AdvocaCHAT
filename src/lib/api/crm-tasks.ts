import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { CrmTask, CrmTaskStatus } from "@/types/domain";

function asDbRow(row: unknown): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

const SELECT = [
  "id",
  "tenant_id",
  "negotiation_id",
  "customer_id",
  "assignee_id",
  "title",
  "due_at",
  "status",
  "notes",
  "template_id",
  "created_at",
  "updated_at",
].join(", ");

function mapCrmTaskRow(row: Record<string, unknown>): CrmTask {
  const status = row.status === "concluida" ? "concluida" : "aberta";
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    negotiationId: row.negotiation_id != null ? String(row.negotiation_id) : null,
    customerId: row.customer_id != null ? String(row.customer_id) : null,
    assigneeId: row.assignee_id != null ? String(row.assignee_id) : null,
    title: String(row.title),
    dueAt: row.due_at != null ? String(row.due_at) : null,
    status,
    notes: String(row.notes ?? ""),
    templateId: row.template_id != null ? String(row.template_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export type CrmTaskCreateInput = {
  title: string;
  negotiationId?: string | null;
  customerId?: string | null;
  assigneeId?: string | null;
  dueAt?: string | null;
  notes?: string;
  templateId?: string | null;
};

export type CrmTaskPatch = Partial<{
  title: string;
  dueAt: string | null;
  status: CrmTaskStatus;
  notes: string;
  assigneeId: string | null;
}>;

function patchToRow(p: CrmTaskPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.title !== undefined) row.title = p.title;
  if (p.dueAt !== undefined) row.due_at = p.dueAt;
  if (p.status !== undefined) row.status = p.status;
  if (p.notes !== undefined) row.notes = p.notes;
  if (p.assigneeId !== undefined) row.assignee_id = p.assigneeId;
  return row;
}

/** Atualiza `crm_negotiations.next_task_at` com o menor `due_at` entre tarefas abertas da negociação e tarefas “só cliente” (mesmo `customer_id`, sem `negotiation_id`). */
async function persistNegotiationNextTaskAtFromOpenTasks(negotiationId: string): Promise<void> {
  if (!isSupabaseConfigured) {
    return;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data: negRow, error: negErr } = await supabase
    .from("crm_negotiations")
    .select("customer_id")
    .eq("tenant_id", tenantId)
    .eq("id", negotiationId)
    .maybeSingle();
  if (negErr) {
    throw new Error(negErr.message);
  }
  if (!negRow) {
    return;
  }
  const customerId = negRow.customer_id != null ? String(negRow.customer_id) : null;

  const byNeg = await listCrmTasks({ negotiationId, status: "aberta" });
  const byCustomerOrphan = customerId
    ? await listCrmTasks({
        customerId,
        status: "aberta",
        negotiationUnlinkedOnly: true,
      })
    : [];

  const merged = new Map<string, CrmTask>();
  for (const t of byNeg) {
    merged.set(t.id, t);
  }
  for (const t of byCustomerOrphan) {
    merged.set(t.id, t);
  }
  const open = [...merged.values()];

  const withDue = open.map((t) => t.dueAt).filter((d): d is string => Boolean(d?.trim()));
  let next: string | null = null;
  if (withDue.length > 0) {
    next = withDue.reduce((best, cur) => {
      const tb = new Date(best).getTime();
      const tc = new Date(cur).getTime();
      if (Number.isNaN(tc)) {
        return best;
      }
      if (Number.isNaN(tb)) {
        return cur;
      }
      return tc < tb ? cur : best;
    });
  }
  const { error } = await supabase
    .from("crm_negotiations")
    .update({ next_task_at: next })
    .eq("tenant_id", tenantId)
    .eq("id", negotiationId);
  if (error) {
    throw new Error(error.message);
  }
}

async function persistNegotiationNextTaskAtForCustomer(customerId: string): Promise<void> {
  if (!isSupabaseConfigured || !customerId) {
    return;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_negotiations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId);
  if (error) {
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    await persistNegotiationNextTaskAtFromOpenTasks(String(row.id));
  }
}

export async function listCrmTasks(filters: {
  negotiationId?: string;
  customerId?: string;
  /** Com `customerId`: apenas linhas com `negotiation_id` nulo (tarefas globais do cliente). */
  negotiationUnlinkedOnly?: boolean;
  status?: CrmTaskStatus | "all";
}): Promise<CrmTask[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  let q = supabase.from("crm_tasks").select(SELECT).eq("tenant_id", tenantId);
  if (filters.negotiationId) {
    q = q.eq("negotiation_id", filters.negotiationId);
  }
  if (filters.customerId) {
    q = q.eq("customer_id", filters.customerId);
    if (filters.negotiationUnlinkedOnly) {
      q = q.is("negotiation_id", null);
    }
  }
  if (filters.status && filters.status !== "all") {
    q = q.eq("status", filters.status);
  }
  const { data, error } = await q.order("due_at", { ascending: true, nullsFirst: false }).order("created_at", {
    ascending: false,
  });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapCrmTaskRow(asDbRow(r)));
}

/** Tarefas com `due_at` dentro do período (para a Agenda). */
export async function listCrmTasksByDueRange(range: { from: Date; to: Date }): Promise<CrmTask[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_tasks")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .not("due_at", "is", null)
    .gte("due_at", range.from.toISOString())
    .lte("due_at", range.to.toISOString())
    .order("due_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapCrmTaskRow(asDbRow(r)));
}

/** Tarefas criadas no período (para a aba Tarefas dos Relatórios). */
export async function listCrmTasksForReport(range: { from: Date; to: Date }): Promise<CrmTask[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_tasks")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapCrmTaskRow(asDbRow(r)));
}

export async function createCrmTask(input: CrmTaskCreateInput): Promise<CrmTask> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const title = input.title.trim();
  if (!title) {
    throw new Error("Título da tarefa é obrigatório.");
  }
  const negId = input.negotiationId?.trim() || null;
  const custId = input.customerId?.trim() || null;
  if (!negId && !custId) {
    throw new Error("Informe negociação ou cliente para a tarefa.");
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const assigneeId = input.assigneeId?.trim() || null;
  const { data, error } = await supabase
    .from("crm_tasks")
    .insert({
      tenant_id: tenantId,
      negotiation_id: negId,
      customer_id: custId,
      assignee_id: assigneeId,
      title,
      due_at: input.dueAt?.trim() || null,
      notes: input.notes?.trim() ?? "",
      template_id: input.templateId?.trim() || null,
      status: "aberta",
    })
    .select(SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  const task = mapCrmTaskRow(asDbRow(data));
  if (negId) {
    await persistNegotiationNextTaskAtFromOpenTasks(negId);
  } else if (custId) {
    await persistNegotiationNextTaskAtForCustomer(custId);
  }
  return task;
}

/**
 * Cria a tarefa pronta configurada na etapa de destino, se ainda não existir uma aberta
 * do mesmo modelo para a negociação. Retorna true quando criou.
 */
export async function createStageTemplateTask(args: {
  negotiationId: string;
  customerId: string | null;
  assigneeId: string | null;
  template: { id: string; title: string; notes: string; defaultDueDays: number | null };
}): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return false;
  }
  const existing = await listCrmTasks({ negotiationId: args.negotiationId, status: "aberta" });
  if (existing.some((t) => t.templateId === args.template.id)) {
    return false;
  }
  const dueAt =
    args.template.defaultDueDays != null
      ? new Date(Date.now() + args.template.defaultDueDays * 86_400_000).toISOString()
      : null;
  await createCrmTask({
    title: args.template.title,
    negotiationId: args.negotiationId,
    customerId: args.customerId,
    assigneeId: args.assigneeId,
    dueAt,
    notes: args.template.notes,
    templateId: args.template.id,
  });
  return true;
}

export async function updateCrmTask(id: string, patch: CrmTaskPatch): Promise<CrmTask> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const row = patchToRow(patch);
  if (Object.keys(row).length === 0) {
    const { data: existing, error: fetchErr } = await supabase
      .from("crm_tasks")
      .select(SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) {
      throw new Error(fetchErr.message);
    }
    if (!existing) {
      throw new Error("Tarefa não encontrada.");
    }
    return mapCrmTaskRow(asDbRow(existing));
  }

  const { data, error } = await supabase
    .from("crm_tasks")
    .update(row)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  const updated = mapCrmTaskRow(asDbRow(data));
  if (updated.negotiationId) {
    await persistNegotiationNextTaskAtFromOpenTasks(updated.negotiationId);
  } else if (updated.customerId) {
    await persistNegotiationNextTaskAtForCustomer(updated.customerId);
  }
  return updated;
}

export async function deleteCrmTask(id: string): Promise<{
  negotiationId: string | null;
  customerId: string | null;
}> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data: existing, error: fetchErr } = await supabase
    .from("crm_tasks")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) {
    throw new Error(fetchErr.message);
  }
  if (!existing) {
    throw new Error("Tarefa não encontrada.");
  }
  const parsed = mapCrmTaskRow(asDbRow(existing));
  const { error } = await supabase.from("crm_tasks").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  if (parsed.negotiationId) {
    await persistNegotiationNextTaskAtFromOpenTasks(parsed.negotiationId);
  } else if (parsed.customerId) {
    await persistNegotiationNextTaskAtForCustomer(parsed.customerId);
  }
  return { negotiationId: parsed.negotiationId, customerId: parsed.customerId };
}

function invalidateTaskQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  opts: { negotiationId?: string | null; customerId?: string | null },
) {
  void queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
  if (opts.negotiationId) {
    void queryClient.invalidateQueries({ queryKey: ["crm-tasks", "negotiation", opts.negotiationId] });
    void queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
    void queryClient.invalidateQueries({ queryKey: ["crm-negotiations", opts.negotiationId] });
  }
  if (opts.customerId) {
    void queryClient.invalidateQueries({ queryKey: ["crm-tasks", "customer", opts.customerId] });
    void queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
  }
}

export function useCrmTasksForNegotiation(
  negotiationId: string | undefined,
  options?: Omit<UseQueryOptions<CrmTask[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: ["crm-tasks", "negotiation", negotiationId],
    queryFn: () => listCrmTasks({ negotiationId: negotiationId!, status: "all" }),
    enabled: Boolean(negotiationId) && isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 20_000,
  });
}

export function useCrmAgendaTasks(
  from: Date,
  to: Date,
  options?: Omit<UseQueryOptions<CrmTask[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: ["crm-tasks", "agenda", from.toISOString(), to.toISOString()],
    queryFn: () => listCrmTasksByDueRange({ from, to }),
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 20_000,
  });
}

export function useCrmTasksReport(
  from: Date,
  to: Date,
  options?: Omit<UseQueryOptions<CrmTask[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: ["crm-tasks", "report", from.toISOString(), to.toISOString()],
    queryFn: () => listCrmTasksForReport({ from, to }),
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 30_000,
  });
}

export type UseCrmTasksForCustomerOptions = Omit<UseQueryOptions<CrmTask[]>, "queryKey" | "queryFn"> & {
  /** Com `customerId`: apenas tarefas com `negotiation_id` nulo (globais do cliente). */
  negotiationUnlinkedOnly?: boolean;
};

export function useCrmTasksForCustomer(
  customerId: string | undefined,
  options?: UseCrmTasksForCustomerOptions,
) {
  const { enabled: enabledOption, negotiationUnlinkedOnly, ...rest } = options ?? {};
  const unlinkedOnly = Boolean(negotiationUnlinkedOnly);
  return useQuery({
    ...rest,
    queryKey: ["crm-tasks", "customer", customerId, unlinkedOnly ? "unlinked" : "all"],
    queryFn: () =>
      listCrmTasks({
        customerId: customerId!,
        status: "all",
        ...(unlinkedOnly ? { negotiationUnlinkedOnly: true } : {}),
      }),
    enabled: Boolean(customerId) && isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 20_000,
  });
}

export function useCreateCrmTask(
  options?: UseMutationOptions<CrmTask, Error, CrmTaskCreateInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCrmTask,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      invalidateTaskQueries(queryClient, {
        negotiationId: vars.negotiationId,
        customerId: vars.customerId,
      });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useUpdateCrmTask(
  options?: UseMutationOptions<
    CrmTask,
    Error,
    { id: string; patch: CrmTaskPatch; negotiationId?: string | null; customerId?: string | null }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => updateCrmTask(id, patch),
    ...options,
    onSuccess: async (data, vars, ctx) => {
      invalidateTaskQueries(queryClient, {
        negotiationId: vars.negotiationId ?? data.negotiationId,
        customerId: vars.customerId ?? data.customerId,
      });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useDeleteCrmTask(
  options?: UseMutationOptions<
    { negotiationId: string | null; customerId: string | null },
    Error,
    string
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCrmTask,
    ...options,
    onSuccess: async (data, taskId, ctx) => {
      invalidateTaskQueries(queryClient, {
        negotiationId: data.negotiationId,
        customerId: data.customerId,
      });
      await options?.onSuccess?.(data, taskId, ctx);
    },
  });
}
