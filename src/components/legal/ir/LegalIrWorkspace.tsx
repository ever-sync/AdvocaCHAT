import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getIrCaseContext } from "@/lib/api/legal-ir";
import { LegalError, LegalLoading } from "../LegalShared";
import { OperationPanel } from "../operations/OperationPanel";
import type { LegalOperationsProps } from "../operations/operations-ui";
import { WORKFLOW_STATUS, irKey } from "./ir-ui";
import { IrIncome } from "./IrIncome";
import { IrEvidence } from "./IrEvidence";
import { IrCatalog } from "./IrCatalog";
import { IrChecklists } from "./IrChecklists";
import { IrAssessments } from "./IrAssessments";
import { IrRepresentations } from "./IrRepresentations";

export default function LegalIrWorkspace(props: LegalOperationsProps) {
  const context = useQuery({
    queryKey: irKey(props, "context"),
    queryFn: () => getIrCaseContext(props.legalCase.id),
  });
  if (context.isPending) return <LegalLoading />;
  if (context.error)
    return (
      <LegalError error={context.error} retry={() => void context.refetch()} />
    );
  const shared = { ...props, ir: context.data };
  return (
    <div className="space-y-4">
      <OperationPanel
        title="Triagem assistida de isenção de IR"
        description="Organize os fatos informados, a documentação e a análise individual do advogado."
        actions={
          <Badge variant="outline">
            {WORKFLOW_STATUS[context.data.control.workflow_status]}
          </Badge>
        }
      >
        <p className="text-sm text-muted-foreground">
          Cada rendimento recebe sua própria análise. O registro de uma decisão
          profissional é distinto de uma concessão externa e não informa valores
          recuperáveis.
        </p>
        {context.data.assessment_is_current === false ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Há informações ou referências novas desde a última análise. A
            revisão anterior foi preservada; prepare uma nova versão para
            continuar.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Acesso a dados fiscais:{" "}
          {context.data.can_fiscal ? "autorizado" : "não autorizado"} · Acesso a
          dados de saúde:{" "}
          {context.data.can_medical ? "autorizado" : "não autorizado"}
        </p>
      </OperationPanel>
      <Tabs defaultValue={context.data.can_fiscal ? "income" : "evidence"}>
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList
            aria-label="Áreas da triagem de IR"
            className="w-max justify-start"
          >
            <TabsTrigger value="income">Rendimentos</TabsTrigger>
            <TabsTrigger value="evidence">Dossiê e cronologia</TabsTrigger>
            <TabsTrigger value="checklist">Checklists</TabsTrigger>
            <TabsTrigger value="assessment">Análise do advogado</TabsTrigger>
            <TabsTrigger value="catalog">Catálogo</TabsTrigger>
            <TabsTrigger value="representation">Representação</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="income">
          <IrIncome {...shared} />
        </TabsContent>
        <TabsContent value="evidence">
          <IrEvidence {...shared} />
        </TabsContent>
        <TabsContent value="checklist">
          <IrChecklists {...shared} />
        </TabsContent>
        <TabsContent value="assessment">
          <IrAssessments {...shared} />
        </TabsContent>
        <TabsContent value="catalog">
          <IrCatalog {...shared} />
        </TabsContent>
        <TabsContent value="representation">
          <IrRepresentations {...shared} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
