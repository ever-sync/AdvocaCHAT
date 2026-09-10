import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type CrmRealtimePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

type CrmRealtimeOptions = {
  /**
   * Chamado em cada mudança de `crm_negotiations` (sempre ativo, independente da
   * rota). Permite que features que antes abriam o próprio canal (ex.:
   * notificações de pool) reusem esta subscription em vez de duplicá-la.
   */
  onNegotiationEvent?: (payload: CrmRealtimePayload) => void;
  /**
   * Liga o sync pesado das demais tabelas do CRM. Deixe `false` fora das telas
   * de CRM para não montar 7 subscriptions por sessão que não as usa
   * (ex.: atendente só no Inbox). `crm_negotiations` continua sempre ativo
   * porque o Inbox e as notificações dependem dele.
   */
  enabled?: boolean;
};

type TableSpec = {
  table: string;
  invalidate: (queryClient: QueryClient) => void;
};

function bulkInvalidate(queryClient: QueryClient, keys: readonly (readonly unknown[])[]) {
  for (const key of keys) {
    void queryClient.invalidateQueries({ queryKey: key as unknown[] });
  }
}

/**
 * Invalidações disparadas por mudança em `crm_negotiations`. Inclui chaves que
 * o Inbox consome (`inbox-chats`, `chat-negotiation`), por isso roda app-wide.
 */
export function invalidateCrmNegotiationCaches(queryClient: QueryClient) {
  bulkInvalidate(queryClient, [
    ["crm-negotiations"],
    ["crm-negotiation-stages"],
    ["chat-negotiation"],
    ["inbox-chats"],
  ]);
}

// Demais tabelas do CRM: relevantes só dentro das telas de CRM, montadas sob
// demanda (gated por rota). `crm_negotiations` fica de fora — tem canal próprio
// sempre ativo (ver useEffect abaixo).
const SYNC_SPECS: TableSpec[] = [
  {
    table: "crm_activities",
    invalidate: (qc) => bulkInvalidate(qc, [["crm-activities"]]),
  },
  {
    table: "crm_tasks",
    invalidate: (qc) => bulkInvalidate(qc, [["crm-tasks"], ["crm-negotiations"]]),
  },
  {
    table: "crm_negotiation_documents",
    invalidate: (qc) => bulkInvalidate(qc, [["crm-negotiation-documents"]]),
  },
  {
    table: "customers",
    invalidate: (qc) =>
      bulkInvalidate(qc, [["customers"], ["crm-negotiations"], ["chat-negotiation"]]),
  },
  {
    table: "tenant_crm_funnel_config",
    invalidate: (qc) =>
      bulkInvalidate(qc, [["tenant-crm-funnel-config"], ["crm-negotiations"]]),
  },
  {
    table: "customer_custom_field_values",
    invalidate: (qc) => bulkInvalidate(qc, [["customer-custom-field-values"]]),
  },
  {
    table: "customer_custom_fields",
    invalidate: (qc) => bulkInvalidate(qc, [["customer-custom-fields"]]),
  },
];

/**
 * Assinatura de mudanças nas tabelas do CRM via Supabase Realtime.
 *
 * - `crm_negotiations`: canal próprio, SEMPRE ativo (notificações de pool e
 *   frescura do Inbox dependem dele).
 * - demais tabelas: canal `crm-realtime`, montado só quando `enabled` (rota de
 *   CRM), evitando 7 subscriptions ociosas por sessão que não usa o CRM.
 *
 * Requer que cada tabela esteja na publication `supabase_realtime`. Tabelas
 * fora da publication simplesmente não recebem eventos (no-op).
 */
export function useCrmRealtimeSync(options?: CrmRealtimeOptions) {
  const queryClient = useQueryClient();
  const enabled = options?.enabled ?? true;
  // Ref para o callback ficar fora das deps do effect (não re-subscreve a cada
  // render quando o handler muda de identidade).
  const onNegotiationEventRef = useRef(options?.onNegotiationEvent);
  onNegotiationEventRef.current = options?.onNegotiationEvent;

  // crm_negotiations: sempre ativo (app-wide).
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const sb = requireSupabase();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let cancelled = false;

    void getCurrentTenantId()
      .then((tenantId) => {
        if (cancelled || !tenantId) return;
        channel = sb
          .channel(`crm-negotiations:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "crm_negotiations",
              filter: `tenant_id=eq.${tenantId}`,
            },
            (payload) => {
              invalidateCrmNegotiationCaches(queryClient);
              onNegotiationEventRef.current?.(payload as CrmRealtimePayload);
            },
          )
          .subscribe();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (channel) {
        void sb.removeChannel(channel);
      }
    };
  }, [queryClient]);

  // Demais tabelas do CRM: só quando habilitado (rota de CRM).
  useEffect(() => {
    if (!isSupabaseConfigured || !enabled) return;

    const sb = requireSupabase();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let cancelled = false;

    void getCurrentTenantId()
      .then((tenantId) => {
        if (cancelled || !tenantId) return;
        const filter = `tenant_id=eq.${tenantId}`;
        let builder = sb.channel(`crm-realtime:${tenantId}`);
        for (const spec of SYNC_SPECS) {
          builder = builder.on(
            "postgres_changes",
            { event: "*", schema: "public", table: spec.table, filter },
            () => spec.invalidate(queryClient),
          );
        }
        channel = builder.subscribe();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (channel) {
        void sb.removeChannel(channel);
      }
    };
  }, [queryClient, enabled]);
}
