// Endpoint público de auto-agendamento (link compartilhável / embed).
//  GET  ?slug=<slug>                                  -> config + serviços + prestadores
//  GET  ?slug=&serviceId=&providerId=&from=&to=        -> horários livres
//  POST { slug, serviceId, providerId, startsAt, customer{nome,telefone,email}, _hp }
//                                                      -> cria o agendamento
// Sem JWT (verify_jwt=false). Protegido por is_active, honeypot e rate-limit.
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { computeAvailability } from "../_shared/scheduling.ts";

const rateBuckets = new Map<string, number[]>();
function allowRate(key: string, limit: number): boolean {
  const now = Date.now();
  const previous = (rateBuckets.get(key) ?? []).filter((t) => now - t < 60_000);
  if (previous.length >= limit) return false;
  previous.push(now);
  rateBuckets.set(key, previous);
  return true;
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

async function loadConfig(admin: ReturnType<typeof createAdminClient>, slug: string) {
  const { data } = await admin
    .from("scheduling_public_config")
    .select("tenant_id, slug, is_active, titulo, descricao, theme")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  const admin = createAdminClient();
  const ip = clientIp(request);

  try {
    const url = new URL(request.url);

    if (request.method === "GET") {
      const slug = url.searchParams.get("slug") ?? "";
      if (!slug) return jsonResponse({ error: "slug obrigatório." }, 400);
      if (!allowRate(`get:${slug}:${ip}`, 120)) {
        return jsonResponse({ error: "Muitas requisições. Tente em instantes." }, 429);
      }
      const config = await loadConfig(admin, slug);
      if (!config) return jsonResponse({ error: "Página de agendamento não encontrada." }, 404);
      const tenantId = String(config.tenant_id);

      const providerId = url.searchParams.get("providerId");
      const serviceId = url.searchParams.get("serviceId");
      const serviceIdsParam = url.searchParams.get("serviceIds");
      const serviceIds = serviceIdsParam
        ? serviceIdsParam.split(",")
        : url.searchParams.getAll("serviceId").filter(Boolean);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");

      // Modo disponibilidade.
      if (providerId && from && to) {
        const result = await computeAvailability(admin, tenantId, {
          providerId,
          serviceId,
          serviceIds: serviceIds.length > 0 ? serviceIds : null,
          from,
          to,
        });
        return jsonResponse(result);
      }

      // Retired anonymous lookup: possession of a phone number does not authorize
      // reading a client's name/email. Older embeds receive an empty result.
      if (url.searchParams.has("telefone")) {
        const response = jsonResponse({ cliente: null });
        response.headers.set("Cache-Control", "no-store");
        return response;
      }

      // Modo config: serviços agendáveis + prestadores que os realizam.
      const { data: services } = await admin
        .from("products")
        .select("id, nome, duracao_min, preco_venda")
        .eq("tenant_id", tenantId)
        .eq("tipo", "servico")
        .eq("agendavel", true)
        .eq("status", "ativo");

      const { data: links } = await admin
        .from("scheduling_services")
        .select("product_id, provider_id, duracao_min")
        .eq("tenant_id", tenantId)
        .eq("ativo", true);

      // Bloqueia apenas os prestadores que desativaram explicitamente o agendamento online.
      // Caso não possuam registro nas configurações, assume true por padrão.
      const { data: settings } = await admin
        .from("scheduling_provider_settings")
        .select("provider_id, accepts_online_booking")
        .eq("tenant_id", tenantId);
      const disabledProviders = new Set(
        (settings ?? [])
          .filter((s) => s.accepts_online_booking === false)
          .map((s) => String(s.provider_id)),
      );

      const providerIds = [...new Set((links ?? []).map((l) => String(l.provider_id)))];
      const { data: profiles } = providerIds.length
        ? await admin.from("profiles").select("id, nome").in("id", providerIds)
        : { data: [] as { id: string; nome: string }[] };
      const nameById = new Map((profiles ?? []).map((p) => [String(p.id), String(p.nome ?? "Prestador")]));

      const servicesOut = (services ?? []).map((s) => {
        const provs = (links ?? [])
          .filter((l) => String(l.product_id) === String(s.id) && !disabledProviders.has(String(l.provider_id)))
          .map((l) => ({
            id: String(l.provider_id),
            name: nameById.get(String(l.provider_id)) ?? "Prestador",
            duracaoMin: Number(l.duracao_min ?? s.duracao_min ?? 30),
          }));
        return {
          id: String(s.id),
          nome: String(s.nome),
          duracaoMin: Number(s.duracao_min ?? 30),
          preco: s.preco_venda != null ? Number(s.preco_venda) : null,
          providers: provs,
        };
      }).filter((s) => s.providers.length > 0);

      return jsonResponse({
        config: { titulo: config.titulo, descricao: config.descricao, theme: config.theme },
        services: servicesOut,
      });
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const slug = String(body.slug ?? "");
      if (!slug) return jsonResponse({ error: "slug obrigatório." }, 400);
      if (!allowRate(`post:${slug}:${ip}`, 10)) {
        return jsonResponse({ error: "Muitas tentativas. Tente em instantes." }, 429);
      }
      // honeypot
      if (body._hp) return jsonResponse({ ok: true });

      const config = await loadConfig(admin, slug);
      if (!config) return jsonResponse({ error: "Página de agendamento não encontrada." }, 404);
      const tenantId = String(config.tenant_id);

      const providerId = String(body.providerId ?? "");
      const serviceIds = Array.isArray(body.serviceIds)
        ? body.serviceIds.map(String)
        : body.serviceId
        ? [String(body.serviceId)]
        : [];
      const startsAt = String(body.startsAt ?? "");
      const customer = (body.customer ?? {}) as { nome?: string; telefone?: string; email?: string };
      const nome = String(customer.nome ?? "").trim();
      const telefone = String(customer.telefone ?? "").trim();
      const email = String(customer.email ?? "").trim();

      if (!providerId || !startsAt || !nome) {
        return jsonResponse({ error: "Dados incompletos." }, 400);
      }

      // Valida que os serviços/prestador são públicos e elegíveis.
      if (serviceIds.length > 0) {
        const { data: links } = await admin
          .from("scheduling_services")
          .select("product_id")
          .eq("tenant_id", tenantId)
          .eq("provider_id", providerId)
          .in("product_id", serviceIds)
          .eq("ativo", true);
        const linkedIds = new Set((links ?? []).map((l) => String(l.product_id)));
        const allLinked = serviceIds.every((id) => linkedIds.has(id));
        if (!allLinked) {
          return jsonResponse({ error: "Um ou mais serviços escolhidos estão indisponíveis para este prestador." }, 400);
        }
      }

      // Anti-tamper: o horário precisa existir como slot livre agora.
      const day = startsAt.slice(0, 10);
      const avail = await computeAvailability(admin, tenantId, {
        providerId,
        serviceId: serviceIds[0] ?? null,
        serviceIds: serviceIds.length > 0 ? serviceIds : null,
        from: day,
        to: day,
      });
      const slot = avail.days.flatMap((d) => d.slots).find((s) => s.startsAt === startsAt);
      if (!slot) return jsonResponse({ error: "Horário não está mais disponível." }, 409);

      // find-or-create customer (dedup por telefone/email).
      let customerId: string | null = null;
      const phoneDigits = telefone.replace(/\D/g, "");
      if (phoneDigits || email) {
        let dup = admin.from("customers").select("id").eq("tenant_id", tenantId).limit(1);
        if (phoneDigits) dup = dup.filter("telefone", "ilike", `%${phoneDigits.slice(-8)}%`);
        else if (email) dup = dup.ilike("email", email);
        const { data: existing } = await dup;
        if (existing && existing.length > 0) customerId = String(existing[0].id);
      }
      if (!customerId) {
        const { data: created, error: custErr } = await admin
          .from("customers")
          .insert({ tenant_id: tenantId, nome, telefone, email, origem: "organico" })
          .select("id")
          .single();
        if (custErr) return jsonResponse({ error: custErr.message }, 500);
        customerId = String(created.id);
      }

      // Snapshot do serviço.
      let serviceNome: string | null = null;
      let preco: number | null = null;
      let stackedServicesJson: Array<{
        id: string;
        nome: string;
        duracaoMin: number;
        preco: number | null;
      }> | null = null;

      if (serviceIds.length > 0) {
        const { data: svcs } = await admin
          .from("products")
          .select("id, nome, duracao_min, preco_venda")
          .eq("tenant_id", tenantId)
          .in("id", serviceIds);

        if (svcs && svcs.length > 0) {
          const svcMap = new Map(svcs.map((s) => [String(s.id), s]));
          const orderedSvcs = serviceIds.map((id) => svcMap.get(id)).filter(Boolean);

          serviceNome = orderedSvcs.map((s) => s.nome).join(" + ");
          preco = orderedSvcs.reduce((acc, s) => acc + Number(s.preco_venda ?? 0), 0);
          stackedServicesJson = orderedSvcs.map((s) => ({
            id: s.id,
            nome: s.nome,
            duracaoMin: s.duracao_min ?? 30,
            preco: s.preco_venda != null ? Number(s.preco_venda) : null,
          }));
        }
      }

      const { data: appt, error: apptErr } = await admin
        .from("scheduling_appointments")
        .insert({
          tenant_id: tenantId,
          provider_id: providerId,
          service_id: serviceIds[0] ?? null,
          customer_id: customerId,
          starts_at: slot.startsAt,
          ends_at: slot.endsAt,
          status: "agendado",
          origin: "publico",
          customer_nome: nome,
          customer_telefone: telefone || null,
          service_nome: serviceNome,
          preco,
          stacked_services: stackedServicesJson,
        })
        .select("id")
        .single();

      if (apptErr) {
        const overlap = apptErr.code === "23P01" || /no_overlap|exclusion/i.test(apptErr.message ?? "");
        if (overlap) return jsonResponse({ error: "Horário acabou de ser ocupado. Escolha outro." }, 409);
        return jsonResponse({ error: apptErr.message }, 500);
      }

      return jsonResponse({ ok: true, appointmentId: appt.id });
    }

    return jsonResponse({ error: "Método não suportado." }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    return jsonResponse({ error: message }, 500);
  }
});
