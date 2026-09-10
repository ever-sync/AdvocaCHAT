import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTenantSettings, useUpsertTenantSettings } from "@/lib/api/integrations";
import {
  BUSINESS_TIMEZONES,
  WEEKDAY_LABELS,
  intervalsByWeekday,
  type BusinessHours,
} from "@/lib/business-hours";
import { useToast } from "@/hooks/use-toast";

type ChatBusinessHoursSettingsSectionProps = {
  canEdit: boolean;
};

type DayDraft = { weekday: number; open: boolean; start: string; end: string };

// Segunda → domingo, ordem comercial.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function toDayDrafts(hours: BusinessHours): DayDraft[] {
  const byDay = intervalsByWeekday(hours);
  return DISPLAY_ORDER.map((weekday) => {
    const first = byDay[weekday][0];
    return first
      ? { weekday, open: true, start: first.start, end: first.end }
      : { weekday, open: false, start: "09:00", end: "18:00" };
  });
}

export function ChatBusinessHoursSettingsSection({ canEdit }: ChatBusinessHoursSettingsSectionProps) {
  const { toast } = useToast();
  const { data: settings, isLoading } = useTenantSettings();
  const upsert = useUpsertTenantSettings();

  const [enabled, setEnabled] = useState(false);
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [slaMinutes, setSlaMinutes] = useState("15");
  const [days, setDays] = useState<DayDraft[]>(() => toDayDrafts({ enabled: false, timezone: "America/Sao_Paulo", intervals: [] }));

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.businessHours.enabled);
    setTimezone(settings.businessHours.timezone);
    setSlaMinutes(String(settings.slaFirstResponseMinutes));
    setDays(toDayDrafts(settings.businessHours));
  }, [settings]);

  const invalidDay = useMemo(
    () => days.some((d) => d.open && d.start >= d.end),
    [days],
  );
  const slaNumber = Number(slaMinutes);
  const slaInvalid = !Number.isFinite(slaNumber) || slaNumber < 1 || slaNumber > 1440;

  const updateDay = (weekday: number, patch: Partial<DayDraft>) => {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  };

  const save = () => {
    if (!canEdit) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel não tem permissão para alterar estas configurações.",
        variant: "destructive",
      });
      return;
    }
    if (slaInvalid) {
      toast({ title: "SLA inválido", description: "Use entre 1 e 1440 minutos.", variant: "destructive" });
      return;
    }
    if (invalidDay) {
      toast({
        title: "Horário inválido",
        description: "O fim deve ser maior que o início em cada dia ativo.",
        variant: "destructive",
      });
      return;
    }
    const businessHours: BusinessHours = {
      enabled,
      timezone,
      intervals: days
        .filter((d) => d.open)
        .map((d) => ({ weekday: d.weekday, start: d.start, end: d.end })),
    };
    void upsert
      .mutateAsync({ businessHours, slaFirstResponseMinutes: Math.trunc(slaNumber) })
      .then(() => toast({ title: "Configurações salvas" }))
      .catch((e: Error) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle>Horário de atendimento & SLA</CardTitle>
            <CardDescription>
              Defina o expediente da equipe e o tempo-alvo de 1ª resposta. Com o expediente ativo, o
              contador de SLA só corre dentro das janelas — não estoura de madrugada nem no fim de semana.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando configurações…</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sla-minutes">SLA de 1ª resposta (minutos)</Label>
                <Input
                  id="sla-minutes"
                  type="number"
                  min={1}
                  max={1440}
                  value={slaMinutes}
                  onChange={(e) => setSlaMinutes(e.target.value)}
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground">
                  Tempo-alvo para responder a 1ª mensagem do cliente. Usado nos alertas do inbox e nos relatórios.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bh-timezone">Fuso horário</Label>
                <Select value={timezone} onValueChange={setTimezone} disabled={!canEdit}>
                  <SelectTrigger id="bh-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="bh-enabled" className="text-sm font-medium">
                  Pausar SLA fora do horário
                </Label>
                <p className="text-xs text-muted-foreground">
                  Quando desativado, o SLA conta o tempo corrido (24/7).
                </p>
              </div>
              <Switch id="bh-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} />
            </div>

            <div className={enabled ? "space-y-2" : "space-y-2 opacity-50"}>
              <Label className="text-sm font-medium">Janelas de expediente</Label>
              {days.map((day) => (
                <div
                  key={day.weekday}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-2.5"
                >
                  <div className="flex w-32 items-center gap-2">
                    <Switch
                      checked={day.open}
                      onCheckedChange={(checked) => updateDay(day.weekday, { open: checked })}
                      disabled={!canEdit || !enabled}
                      aria-label={`Atender ${WEEKDAY_LABELS[day.weekday]}`}
                    />
                    <span className="text-sm font-medium">{WEEKDAY_LABELS[day.weekday]}</span>
                  </div>
                  {day.open ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Input
                        type="time"
                        value={day.start}
                        onChange={(e) => updateDay(day.weekday, { start: e.target.value })}
                        disabled={!canEdit || !enabled}
                        className="w-32"
                        aria-label={`Abertura ${WEEKDAY_LABELS[day.weekday]}`}
                      />
                      <span className="text-muted-foreground">às</span>
                      <Input
                        type="time"
                        value={day.end}
                        onChange={(e) => updateDay(day.weekday, { end: e.target.value })}
                        disabled={!canEdit || !enabled}
                        className="w-32"
                        aria-label={`Fechamento ${WEEKDAY_LABELS[day.weekday]}`}
                      />
                      {day.start >= day.end ? (
                        <span className="text-xs text-destructive">fim deve ser maior</span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Fechado</span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button
                className="rounded-xl"
                disabled={!canEdit || upsert.isPending || slaInvalid || invalidDay}
                onClick={save}
              >
                Salvar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
