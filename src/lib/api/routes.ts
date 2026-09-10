import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { DeliveryRoute, DeliveryRouteUpsertInput } from "@/types/domain";

const ROUTES_STORAGE_KEY = "distribuibot-routes";
const ROUTES_SELECT = [
  "id",
  "nome",
  "regiao",
  "estado",
  "cidade",
  "zona",
  "horario_corte",
  "dias",
  "status",
  "observacoes",
  "created_at",
  "updated_at",
].join(", ");

type DeliveryRouteRow = {
  id: string;
  nome: string;
  regiao: string;
  estado: string | null;
  cidade: string | null;
  zona: string | null;
  horario_corte: string;
  dias: string[] | null;
  status: DeliveryRoute["status"];
  observacoes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function mapRowToRoute(row: DeliveryRouteRow, linkedCustomers = 0): DeliveryRoute {
  return {
    id: row.id,
    nome: row.nome,
    regiao: row.regiao,
    estado: row.estado ?? undefined,
    cidade: row.cidade ?? undefined,
    zona: row.zona ?? undefined,
    horarioCorte: row.horario_corte,
    dias: row.dias ?? [],
    clientesVinculados: linkedCustomers,
    status: row.status,
    observacoes: row.observacoes ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

function mapInputToRow(input: DeliveryRouteUpsertInput) {
  return {
    nome: input.nome,
    regiao: input.regiao,
    estado: input.estado ?? null,
    cidade: input.cidade ?? null,
    zona: input.zona ?? null,
    horario_corte: input.horarioCorte,
    dias: input.dias,
    status: input.status,
    observacoes: input.observacoes ?? null,
  };
}

function getSeedRoutes(): DeliveryRoute[] {
  return [];
}

function readLocalRoutes() {
  if (typeof window === "undefined") {
    return getSeedRoutes();
  }

  const storedRoutes = window.localStorage.getItem(ROUTES_STORAGE_KEY);
  if (!storedRoutes) {
    const seededRoutes = getSeedRoutes();
    window.localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(seededRoutes));
    return seededRoutes;
  }

  try {
    return JSON.parse(storedRoutes) as DeliveryRoute[];
  } catch {
    const seededRoutes = getSeedRoutes();
    window.localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(seededRoutes));
    return seededRoutes;
  }
}

function writeLocalRoutes(routes: DeliveryRoute[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(routes));
}

export async function listRoutes() {
  if (!isSupabaseConfigured) {
    return readLocalRoutes();
  }

  const supabase = requireSupabase();
  const [{ data: routes, error: routesError }, { data: customers, error: customersError }] =
    await Promise.all([
      supabase.from("delivery_routes").select(ROUTES_SELECT).order("nome"),
      supabase.from("customers").select("rota"),
    ]);

  if (routesError) {
    throw new Error(routesError.message);
  }

  if (customersError) {
    throw new Error(customersError.message);
  }

  const counts = (customers ?? []).reduce<Record<string, number>>((accumulator, customer) => {
    const routeName = typeof customer.rota === "string" ? customer.rota.trim() : "";
    if (!routeName) {
      return accumulator;
    }

    accumulator[routeName] = (accumulator[routeName] ?? 0) + 1;
    return accumulator;
  }, {});

  return (routes ?? []).map((row) =>
    mapRowToRoute(row as unknown as DeliveryRouteRow, counts[(row as unknown as DeliveryRouteRow).nome] ?? 0),
  );
}

export async function createRoute(input: DeliveryRouteUpsertInput) {
  if (!isSupabaseConfigured) {
    const routes = readLocalRoutes();
    const nextRoute: DeliveryRoute = {
      id: crypto.randomUUID(),
      ...input,
      clientesVinculados: 0,
    };

    writeLocalRoutes([nextRoute, ...routes]);
    return nextRoute;
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("delivery_routes")
    .insert({ ...mapInputToRow(input), tenant_id: tenantId })
    .select(ROUTES_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRowToRoute(data as unknown as DeliveryRouteRow, 0);
}

export async function updateRoute(id: string, input: DeliveryRouteUpsertInput) {
  if (!isSupabaseConfigured) {
    const routes = readLocalRoutes();
    const updatedRoutes = routes.map((route) =>
      route.id === id ? { ...route, ...input } : route,
    );

    writeLocalRoutes(updatedRoutes);
    return updatedRoutes.find((route) => route.id === id) ?? null;
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("delivery_routes")
    .update(mapInputToRow(input))
    .eq("id", id)
    .select(ROUTES_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const { count } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("rota", input.nome);

  return mapRowToRoute(data as unknown as DeliveryRouteRow, count ?? 0);
}

export function useRoutes(
  options?: Omit<UseQueryOptions<DeliveryRoute[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["delivery-routes"],
    queryFn: listRoutes,
    ...options,
  });
}

export function useCreateRoute(
  options?: UseMutationOptions<DeliveryRoute, Error, DeliveryRouteUpsertInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createRoute,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUpdateRoute(
  options?: UseMutationOptions<DeliveryRoute | null, Error, { id: string; input: DeliveryRouteUpsertInput }>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }) => updateRoute(id, input),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
