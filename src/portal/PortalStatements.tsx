import { useQuery } from "@tanstack/react-query";
import { portalAccess } from "./api";
import { PortalNotice } from "./ui";
import { portalDate } from "./format";
import type { PortalMembership } from "./types";
type Owner = "client" | "office" | "external";
type PortalStatement = {
  id: string;
  title: string;
  version_number: number;
  period_start: string;
  period_end: string;
  public_note: string;
  published_at: string;
  expires_at: string;
  snapshot: {
    currency: "BRL";
    opening: { client: string; office: string };
    closing: { client: string; office: string };
    movements: {
      id: string;
      date: string;
      from_owner: Owner;
      to_owner: Owner;
      amount: string;
      reference: string;
      reverses_id: string | null;
    }[];
    obligations: {
      id: string;
      title: string;
      category: string;
      direction: string;
      funds_owner: Owner;
      amount: string;
      paid: string;
      remaining: string;
      due_on: string | null;
    }[];
    generated_at: string;
  };
};
const OWNERS = {
  client: "Recursos do cliente",
  office: "Recursos do escritório",
  external: "Origem ou destino externo",
};
function money(value: string) {
  if (!/^-?\d+\.\d{2}$/.test(value)) return "Valor não disponível";
  const [integer, cents] = value.split(".");
  return `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}
export function PortalStatements({
  membership,
  identityId,
}: {
  membership: PortalMembership;
  identityId: string;
}) {
  const allowed =
    membership.scopes.includes("statements:read") &&
    membership.allow_fiscal &&
    membership.access_kind !== "accountant" &&
    Date.parse(membership.expires_at) > Date.now();
  const query = useQuery({
    queryKey: [
      "portal",
      identityId,
      "statements",
      membership.id,
      membership.revision,
    ],
    queryFn: ({ signal }) =>
      portalAccess<PortalStatement[]>(
        { action: "statements", membership_id: membership.id },
        signal,
      ),
    enabled: allowed,
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    retry: false,
  });
  if (!allowed)
    return (
      <PortalNotice>
        Demonstrativos não estão disponíveis nas permissões deste acesso.
      </PortalNotice>
    );
  if (query.isPending)
    return <PortalNotice>Consultando demonstrativos liberados…</PortalNotice>;
  if (query.isError)
    return <PortalNotice error>{query.error.message}</PortalNotice>;
  const rows = query.data.filter((s) => Date.parse(s.expires_at) > Date.now());
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Demonstrativos revisados e liberados para você. Os valores registram a
        situação do período apresentado e preservam a versão publicada.
      </p>
      {rows.length ? (
        rows.map((row) => (
          <article
            key={row.id}
            className="space-y-5 rounded-xl border p-4 sm:p-5"
          >
            <div>
              <h2 className="break-words text-lg font-semibold">{row.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Versão {row.version_number} · Período {row.period_start} a{" "}
                {row.period_end} · Publicado em {portalDate(row.published_at)}
              </p>
            </div>
            {row.public_note && (
              <p className="whitespace-pre-wrap break-words text-sm">
                {row.public_note}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {(["client", "office"] as const).map((owner) => (
                <div
                  key={owner}
                  className="space-y-2 rounded-lg bg-muted/40 p-4"
                >
                  <h3 className="font-medium">{OWNERS[owner]}</h3>
                  <p className="text-sm">
                    Saldo inicial: {money(row.snapshot.opening[owner])}
                  </p>
                  <p className="text-sm font-semibold">
                    Saldo final: {money(row.snapshot.closing[owner])}
                  </p>
                </div>
              ))}
            </div>
            <section className="space-y-3">
              <h3 className="font-semibold">Movimentações registradas</h3>
              {row.snapshot.movements.length ? (
                row.snapshot.movements.map((m) => (
                  <div
                    className="space-y-1 rounded-lg border p-3 text-sm"
                    key={m.id}
                  >
                    <p className="font-medium">{money(m.amount)}</p>
                    <p>
                      {OWNERS[m.from_owner]} → {OWNERS[m.to_owner]}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      {portalDate(m.date)} · Referência: {m.reference}
                      {m.reverses_id &&
                        " · Reversão vinculada a movimento anterior"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma movimentação no período.
                </p>
              )}
            </section>
            <section className="space-y-3">
              <h3 className="font-semibold">Valores a receber ou pagar</h3>
              {row.snapshot.obligations.length ? (
                row.snapshot.obligations.map((o) => (
                  <div
                    key={o.id}
                    className="space-y-2 rounded-lg border p-3 text-sm"
                  >
                    <p className="break-words font-medium">{o.title}</p>
                    <p>
                      {o.direction === "receivable" ? "A receber" : "A pagar"} ·{" "}
                      {OWNERS[o.funds_owner]}
                    </p>
                    <p>
                      Total: {money(o.amount)} · Liquidado: {money(o.paid)} ·
                      Restante: {money(o.remaining)}
                    </p>
                    {o.due_on && (
                      <p className="text-xs text-muted-foreground">
                        Vencimento: {portalDate(o.due_on)}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum valor a receber ou pagar nesta versão.
                </p>
              )}
            </section>
          </article>
        ))
      ) : (
        <PortalNotice>
          Nenhum demonstrativo foi liberado para este acesso.
        </PortalNotice>
      )}
    </div>
  );
}
