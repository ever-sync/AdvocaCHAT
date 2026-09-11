import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  getPrevidas,
  updatePrevidas,
  PREVIDAS_LABELS,
  PREVIDAS_NEXT,
  type PrevidasRow,
} from "@/lib/api/previdas";

function PrevidasItem({ row }: { row: PrevidasRow }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState("");
  const overdue =
    row.next_action_at && new Date(row.next_action_at).getTime() < Date.now();
  const options = [
    ...(["requested", "reschedule"].includes(row.status)
      ? [["scheduled", "Confirmar consulta"]]
      : []),
    ...(["requested", "scheduled", "awaiting_report"].includes(row.status)
      ? [["reschedule", "Registrar falta / reagendamento"]]
      : []),
    ...(row.status === "scheduled"
      ? [["awaiting_report", "Confirmar avaliação realizada"]]
      : []),
    ...(row.status !== "report_received" && row.documents.length
      ? [["report_received", "Vincular laudo recebido"]]
      : []),
  ];
  return (
    <li className="space-y-3 border-b py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{row.display_name || "Contato"}</strong>
        <Badge variant="secondary">{PREVIDAS_LABELS[row.status]}</Badge>
        {overdue && <Badge variant="destructive">Ação atrasada</Badge>}
      </div>
      <p className="text-sm">Próxima ação: {PREVIDAS_NEXT[row.status]}</p>
      {row.next_action_at && (
        <p className="text-sm">
          Prazo: {new Date(row.next_action_at).toLocaleString("pt-BR")}
        </p>
      )}
      {row.availability && (
        <p className="text-sm">Disponibilidade: {row.availability}</p>
      )}
      {row.appointment_at && (
        <p className="text-sm">
          Consulta: {new Date(row.appointment_at).toLocaleString("pt-BR")} ·{" "}
          {row.modality}
        </p>
      )}
      {row.confirmation_ref && (
        <p className="break-words text-sm">
          Referência: {row.confirmation_ref}
        </p>
      )}
      {!!options.length && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditing(!editing);
            setAction(options[0][0]);
          }}
        >
          Registrar evento confirmado
        </Button>
      )}
      {editing && (
        <form
          className="space-y-3 rounded-md border p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError("");
            const values = Object.fromEntries(
              new FormData(event.currentTarget),
            );
            try {
              await updatePrevidas(row, {
                ...values,
                appointment_at: values.appointment_at
                  ? new Date(String(values.appointment_at)).toISOString()
                  : null,
                next_action_at: values.next_action_at
                  ? new Date(String(values.next_action_at)).toISOString()
                  : null,
              });
              setEditing(false);
              await queryClient.invalidateQueries({ queryKey: ["previdas"] });
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Não foi possível salvar",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <p className="text-sm text-muted-foreground">
            Registro interno de informação confirmada fora do app. Não realiza
            agendamento nem envia mensagens ao parceiro.
          </p>
          <label className="block text-sm">
            Evento
            <select
              className="mt-1 block w-full rounded-md border bg-background p-2"
              name="status"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              {options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {action === "scheduled" && (
            <>
              <label className="block text-sm">
                Data e hora da consulta
                <Input type="datetime-local" name="appointment_at" required />
              </label>
              <label className="block text-sm">
                Modalidade
                <select
                  name="modality"
                  className="ml-2 rounded border bg-background p-2"
                >
                  <option value="online">Online</option>
                  <option value="presencial">Presencial</option>
                </select>
              </label>
            </>
          )}
          {["scheduled", "awaiting_report"].includes(action) && (
            <label className="block text-sm">
              Referência da confirmação do parceiro
              <Input
                name="confirmation_ref"
                maxLength={300}
                required
                placeholder="Protocolo ou referência da confirmação"
              />
            </label>
          )}
          {action === "report_received" ? (
            <label className="block text-sm">
              Documento recebido
              <select
                name="report_document_id"
                required
                className="mt-1 block w-full rounded border bg-background p-2"
              >
                {row.documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    Anexo recebido em{" "}
                    {new Date(doc.received_at).toLocaleString("pt-BR")} ·{" "}
                    {doc.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-sm">
              Prazo da próxima ação
              <Input name="next_action_at" type="datetime-local" required />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar registro"}
          </Button>
        </form>
      )}
      {!!row.events.length && (
        <details className="text-sm">
          <summary>Histórico de eventos</summary>
          <ul className="mt-2 space-y-1">
            {row.events.map((event, i) => (
              <li key={`${event.created_at}-${i}`}>
                {new Date(event.created_at).toLocaleString("pt-BR")} ·{" "}
                {PREVIDAS_LABELS[event.status]} ·{" "}
                {event.source === "agent"
                  ? "Agente"
                  : "Registro administrativo"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export function PrevidasPanel({ customerId }: { customerId?: string }) {
  const { profile } = useAuth();
  const query = useQuery({
    queryKey: ["previdas", profile?.id, customerId],
    queryFn: () => getPrevidas(customerId),
    enabled: profile?.role === "admin",
    refetchInterval: 30000,
  });
  if (profile?.role !== "admin") return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pré Vidas</CardTitle>
        <CardDescription>
          Avaliação médica com empresa parceira. Acompanhamento interno;
          integração da agenda e lembretes automáticos pendentes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <p>Carregando acompanhamento…</p>
        ) : query.error ? (
          <p role="alert">Não foi possível carregar: {query.error.message}</p>
        ) : query.data?.length ? (
          <ul>
            {query.data.map((row) => (
              <PrevidasItem key={`${row.chat_id}-${row.revision}`} row={row} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum encaminhamento registrado. A falta de laudo identificada pelo
            SDR abre uma pendência para o closer confirmar interesse na
            avaliação.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
