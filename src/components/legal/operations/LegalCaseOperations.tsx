import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { configureLegalOperations, getLegalCaseOperation, getLegalOperationSettings, setLegalCaseOperation } from "@/lib/api/legal-operations";
import type { LegalCaseOperation, LegalOperationSettings } from "@/types/legal-operations";
import { LegalError, LegalField, LegalLoading } from "../LegalShared";
import { selectClassName, useLegalAction } from "../legal-ui";
import { OperationPanel } from "./OperationPanel";
import { operationsKey, type LegalOperationsProps } from "./operations-ui";
import { LegalInterviews } from "./LegalInterviews";
import { LegalDocumentRequests } from "./LegalDocumentRequests";
import { LegalInstruments } from "./LegalInstruments";
import { LegalCaseWork } from "./LegalCaseWork";

function CaseStageForm({ settings, current, ...props }: LegalOperationsProps & { settings: LegalOperationSettings; current: LegalCaseOperation | null }) {
  const [form, setForm] = useState({ service_name: current?.service_name ?? "", stage_name: current?.stage_name ?? "", closure_reason: current?.closure_reason ?? "" });
  const action = useLegalAction();
  return <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void action.run(() => setLegalCaseOperation(props.legalCase.id, form), "Etapa jurídica atualizada"); }}><fieldset disabled={!props.canEdit || action.pending} className="grid gap-3 sm:grid-cols-3">{([["service_name", "Serviço jurídico", settings.services], ["stage_name", "Etapa jurídica", settings.pipeline_stages], ["closure_reason", "Motivo de encerramento", settings.closure_reasons]] as const).map(([key, label, options]) => <LegalField key={key} label={label}>{(id) => <select id={id} className={selectClassName} value={form[key]} required={key !== "closure_reason"} onChange={(event) => setForm({ ...form, [key]: event.target.value })}><option value="">{key === "closure_reason" ? "Não se aplica" : "Selecione"}</option>{form[key] && !options.includes(form[key]) ? <option>{form[key]}</option> : null}{options.map((value) => <option key={value}>{value}</option>)}</select>}</LegalField>)}</fieldset>{props.canEdit ? <Button type="submit" size="sm" disabled={action.pending}>Salvar etapa jurídica</Button> : null}</form>;
}

function OperationSettings({ current }: { current: LegalOperationSettings | null }) {
  const [services, setServices] = useState((current?.services ?? ["Consultoria jurídica", "Acompanhamento processual"]).join("\n"));
  const [stages, setStages] = useState((current?.pipeline_stages ?? ["Triagem", "Análise", "Contratação", "Em andamento", "Encerrado"]).join("\n"));
  const [reasons, setReasons] = useState((current?.closure_reasons ?? ["Concluído", "Desistência do cliente", "Conflito de interesses"]).join("\n"));
  const action = useLegalAction();
  const split = (value: string) => [...new Set(value.split("\n").map((item) => item.trim()).filter(Boolean))];
  async function save(event: FormEvent) { event.preventDefault(); await action.run(() => configureLegalOperations({ services: split(services), pipeline_stages: split(stages), closure_reasons: split(reasons) }), "Configuração jurídica salva para o escritório"); }
  return <form onSubmit={(event) => void save(event)} className="space-y-3 rounded-lg border bg-muted/20 p-4"><p className="text-sm font-medium">Configuração deste escritório</p><p className="text-xs text-muted-foreground">Uma opção por linha. A configuração vale para os casos jurídicos do escritório.</p><div className="grid gap-3 sm:grid-cols-3">{([["Serviços jurídicos", services, setServices], ["Etapas jurídicas", stages, setStages], ["Motivos de encerramento", reasons, setReasons]] as const).map(([label, value, setValue]) => <LegalField key={label} label={label}>{(id) => <Textarea id={id} required rows={5} maxLength={2000} value={value} onChange={(event) => setValue(event.target.value)} />}</LegalField>)}</div><Button size="sm" type="submit" disabled={action.pending}>Salvar configuração do escritório</Button></form>;
}

export default function LegalCaseOperations(props: LegalOperationsProps) {
  const settings = useQuery({ queryKey: ["legal", props.workspace.user_id, props.workspace.tenant_id, "operation-settings"], queryFn: getLegalOperationSettings });
  const operation = useQuery({ queryKey: operationsKey(props, "stage"), queryFn: () => getLegalCaseOperation(props.legalCase.id) });
  const [configure, setConfigure] = useState(false);
  return <div className="space-y-4"><OperationPanel title="Etapa do atendimento jurídico" description="Acompanhe a contratação e a execução do serviço sem alterar o histórico da negociação." actions={props.workspace.can_activate ? <Button variant="outline" size="sm" onClick={() => setConfigure(!configure)}>{configure ? "Fechar configuração" : "Configurar etapas"}</Button> : null}>
    {settings.isPending || operation.isPending ? <LegalLoading /> : settings.error || operation.error ? <LegalError error={settings.error ?? operation.error} retry={() => { void settings.refetch(); void operation.refetch(); }} /> : settings.data ? <CaseStageForm key={JSON.stringify(operation.data)} {...props} settings={settings.data} current={operation.data ?? null} /> : <p className="text-sm text-muted-foreground">Um administrador precisa configurar os serviços e as etapas jurídicas deste escritório.</p>}
    {props.workspace.can_activate && (configure || (!settings.isPending && !settings.error && !settings.data)) ? <OperationSettings current={settings.data ?? null} /> : null}
  </OperationPanel><Tabs defaultValue="interviews"><div className="overflow-x-auto"><TabsList className="w-max justify-start"><TabsTrigger value="interviews">Entrevista e conflitos</TabsTrigger><TabsTrigger value="requests">Documentos solicitados</TabsTrigger><TabsTrigger value="instruments">Instrumentos</TabsTrigger><TabsTrigger value="work">Tarefas e agenda</TabsTrigger></TabsList></div><TabsContent value="interviews"><LegalInterviews {...props} /></TabsContent><TabsContent value="requests"><LegalDocumentRequests {...props} /></TabsContent><TabsContent value="instruments"><LegalInstruments {...props} /></TabsContent><TabsContent value="work"><LegalCaseWork {...props} /></TabsContent></Tabs></div>;
}
