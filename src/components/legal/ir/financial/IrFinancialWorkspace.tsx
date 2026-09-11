import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getIrFinancialContext } from "@/lib/api/legal-ir-calculations";
import { LegalError, LegalLoading } from "../../LegalShared";
import type { IrPanelProps } from "../ir-ui";
import { financialKey } from "./financial-ui";
import { IrTaxImports } from "./IrTaxImports";
import { IrParameters } from "./IrParameters";
import { IrPeriods } from "./IrPeriods";
import { IrCalculations } from "./IrCalculations";
import { IrTaxReturns } from "./IrTaxReturns";
import { IrClaims } from "./IrClaims";
import { IrCessation } from "./IrCessation";
import { IrReconciliation } from "./IrReconciliation";

export default function IrFinancialWorkspace(props: IrPanelProps) {
  const context = useQuery({
    queryKey: financialKey(props, "context"),
    queryFn: () => getIrFinancialContext(props.legalCase.id),
  });
  if (context.isPending) return <LegalLoading />;
  if (context.error)
    return (
      <LegalError error={context.error} retry={() => void context.refetch()} />
    );
  const shared = { ...props, financial: context.data };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Prepare a prova fiscal, confira parâmetros e períodos, depois examine os
        cenários e acompanhe os fatos comprovados de cada pedido.
      </p>
      <Tabs defaultValue="imports">
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList
            className="w-max justify-start"
            aria-label="Áreas financeiras de IR"
          >
            <TabsTrigger value="imports">Importações</TabsTrigger>
            <TabsTrigger value="parameters">Parâmetros</TabsTrigger>
            <TabsTrigger value="periods">Períodos jurídicos</TabsTrigger>
            <TabsTrigger value="calculations">Cenários</TabsTrigger>
            <TabsTrigger value="returns">Declarações</TabsTrigger>
            <TabsTrigger value="claims">Pedidos</TabsTrigger>
            <TabsTrigger value="cessation">Retenções</TabsTrigger>
            <TabsTrigger value="reconciliation">Conciliação</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="imports">
          <IrTaxImports {...shared} />
        </TabsContent>
        <TabsContent value="parameters">
          <IrParameters {...shared} />
        </TabsContent>
        <TabsContent value="periods">
          <IrPeriods {...shared} />
        </TabsContent>
        <TabsContent value="calculations">
          <IrCalculations {...shared} />
        </TabsContent>
        <TabsContent value="returns">
          <IrTaxReturns {...shared} />
        </TabsContent>
        <TabsContent value="claims">
          <IrClaims {...shared} />
        </TabsContent>
        <TabsContent value="cessation">
          <IrCessation {...shared} />
        </TabsContent>
        <TabsContent value="reconciliation">
          <IrReconciliation {...shared} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
