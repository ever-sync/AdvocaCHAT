import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import {
  formatLocalTime,
  inferCustomerTimezone,
} from "@/lib/customer-timezone";

export type CustomerLocalTimeProps = {
  /** Telefone do contato em E164 ou só dígitos (qualquer dos campos do InboxChat serve). */
  phone: string | null | undefined;
  /**
   * Fuso do operador, geralmente inferido via Intl. Quando o cliente cair no
   * mesmo fuso, o componente esconde a si mesmo para não virar ruído.
   * Em testes, passe explicitamente.
   */
  viewerTimezone?: string;
  className?: string;
};

function resolveViewerTimezone(override?: string): string {
  if (override) return override;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  } catch {
    return "America/Sao_Paulo";
  }
}

/**
 * Mostra "🕐 14:32 · Manaus" ao lado do nome do contato, infere via DDD/DDI.
 * Re-renderiza a cada minuto para que o relógio acompanhe a passagem do tempo.
 *
 * Não renderiza nada quando:
 *  - sem telefone do contato
 *  - não foi possível inferir o fuso
 *  - o fuso é igual ao do operador (sem informação útil)
 *  - Intl falhar para esse fuso
 */
export function CustomerLocalTime({
  phone,
  viewerTimezone,
  className,
}: CustomerLocalTimeProps) {
  const inferred = useMemo(() => inferCustomerTimezone(phone), [phone]);

  // Tick por minuto. useState com Date.now() para forçar re-render sem precisar do valor.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!inferred) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, [inferred]);

  if (!inferred) return null;
  const viewer = resolveViewerTimezone(viewerTimezone);
  if (viewer === inferred.timezone) return null;

  const time = formatLocalTime(inferred.timezone);
  if (!time) return null;

  return (
    <span
      className={
        className ??
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-wchat-50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
      }
      title={`Horário local do cliente — ${inferred.label} (${inferred.timezone})`}
      aria-label={`Horário local do cliente: ${time}, ${inferred.label}`}
    >
      <Clock className="h-3 w-3" aria-hidden />
      <span className="tabular-nums">{time}</span>
      <span aria-hidden>·</span>
      <span className="truncate">{inferred.label}</span>
    </span>
  );
}
