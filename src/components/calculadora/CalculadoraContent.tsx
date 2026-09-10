import { useId, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { buildMensagemOfertaCliente } from "@/lib/calculadora-mensagem-cliente";
import { formatBRL } from "@/lib/format";
import {
  maskCurrencyInputChange,
  parseCurrencyInput,
} from "@/lib/currency-input";
import {
  HONORARIOS_PARCELAS,
  RETROATIVO_MAX_MESES,
  calcularRetroativo,
  honorariosOfertasPorParcela,
  retroativoTetoMaximo,
  type HonorariosOferta,
} from "@/lib/recuperei-honorarios";
import { cn } from "@/lib/utils";

function formatMoney(value: number) {
  return formatBRL(value);
}

type CalculadoraContentProps = {
  compact?: boolean;
};

export function CalculadoraContent({ compact = false }: CalculadoraContentProps) {
  const uid = useId();
  const idData = `${uid}-data-doenca`;
  const idParcela = `${uid}-parcela`;

  const [dataDoenca, setDataDoenca] = useState("");
  const [parcelaStr, setParcelaStr] = useState("");

  const parcelaMensal = parseCurrencyInput(parcelaStr);
  const pronto = Boolean(dataDoenca.trim() && parcelaMensal > 0);

  const retroativo = useMemo(() => {
    if (!pronto) return null;
    const parsed = new Date(`${dataDoenca}T12:00:00`);
    return calcularRetroativo(parcelaMensal, parsed);
  }, [dataDoenca, parcelaMensal, pronto]);

  const ofertasHonorarios = useMemo(() => {
    if (!pronto) return null;
    return honorariosOfertasPorParcela(parcelaMensal);
  }, [parcelaMensal, pronto]);

  const tetoMaximo = parcelaMensal > 0 ? retroativoTetoMaximo(parcelaMensal) : 0;

  async function copiarMensagemOferta(oferta: HonorariosOferta) {
    if (!retroativo || retroativo.dataInvalida) return;
    const texto = buildMensagemOfertaCliente({
      parcelaAtual: parcelaMensal,
      retroativo,
      oferta,
    });
    try {
      await navigator.clipboard.writeText(texto);
      toast({
        title: "Mensagem copiada",
        description: `Proposta ${oferta.label} pronta para colar no chat.`,
      });
    } catch {
      toast({
        title: "Não foi possível copiar",
        description: "Permita o acesso à área de transferência do navegador.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className={cn("space-y-4", compact && "text-sm")}>
      <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
        Retroativo: parcela × meses (máx. {RETROATIVO_MAX_MESES}). Honorários: 20%, 25% e 30% em{" "}
        {HONORARIOS_PARCELAS}x.
      </p>

      <div className={cn("grid gap-3", !compact && "sm:grid-cols-2")}>
        <div className="space-y-1.5">
          <Label htmlFor={idData} className={compact ? "text-xs" : undefined}>
            Data da doença
          </Label>
          <Input
            id={idData}
            type="date"
            className={compact ? "h-9 text-sm" : undefined}
            value={dataDoenca}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDataDoenca(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={idParcela} className={compact ? "text-xs" : undefined}>
            Parcela mensal (já descontada)
          </Label>
          <Input
            id={idParcela}
            inputMode="numeric"
            placeholder="R$ 0,00"
            className={compact ? "h-9 text-sm" : undefined}
            value={parcelaStr}
            onChange={(e) => setParcelaStr(maskCurrencyInputChange(e.target.value))}
          />
        </div>
      </div>

      {retroativo?.dataInvalida === "futura" ? (
        <p className="text-sm text-destructive">A data da doença não pode ser no futuro.</p>
      ) : null}

      {pronto && retroativo && !retroativo.dataInvalida && ofertasHonorarios ? (
        <div className="space-y-4 border-t border-border pt-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Valor retroativo
            </h3>
            <div className="grid gap-2 grid-cols-2">
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-[10px] font-medium text-muted-foreground">Meses</p>
                <p className={cn("font-semibold text-foreground", compact ? "text-lg" : "text-xl")}>
                  {retroativo.mesesElegiveis}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    / {RETROATIVO_MAX_MESES}
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <p className="text-[10px] font-medium text-muted-foreground">Total</p>
                <p className={cn("font-semibold text-primary", compact ? "text-lg" : "text-xl")}>
                  {formatMoney(retroativo.valorRetroativo)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatMoney(parcelaMensal)} × {retroativo.mesesElegiveis}
                </p>
              </div>
            </div>
            {retroativo.atingiuTeto ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                Teto de {RETROATIVO_MAX_MESES} meses aplicado.
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Honorários
            </h3>
            <div className="space-y-2">
              {ofertasHonorarios.map((oferta) => (
                <div
                  key={oferta.tier}
                  className="space-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{oferta.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {oferta.label} de {formatMoney(parcelaMensal)} ·{" "}
                        {formatMoney(oferta.parcelaMensal)}/mês
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-primary">
                        {formatMoney(oferta.total36x)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{HONORARIOS_PARCELAS}x</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 w-full text-xs"
                    onClick={() => copiarMensagemOferta(oferta)}
                  >
                    <Copy className="mr-1.5 h-3 w-3" aria-hidden />
                    Copiar mensagem
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
          Preencha os dois campos para calcular.
          {parcelaMensal > 0 ? (
            <>
              {" "}
              Teto: {formatMoney(tetoMaximo)}.
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
