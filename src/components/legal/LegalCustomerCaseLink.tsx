import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getLegalWorkspaceContext } from "@/lib/api/legal";

export function LegalCustomerCaseLink({ customerId, negotiationId }: { customerId: string; negotiationId?: string }) {
  const { profile } = useAuth();
  const context = useQuery({ queryKey: ["legal", profile?.id, "context"], queryFn: getLegalWorkspaceContext, enabled: Boolean(profile?.id), retry: false });
  if (!context.data?.enabled) return null;
  const query = new URLSearchParams({ cliente: customerId });
  if (negotiationId && context.data.can_create) query.set("negociacao", negotiationId);
  return <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-2 md:px-6"><span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground"><Scale className="h-4 w-4 shrink-0 text-primary" aria-hidden />Acompanhamento jurídico do cliente</span><Button size="sm" variant="outline" asChild><Link to={`/casos?${query.toString()}`}>{negotiationId && context.data.can_create ? "Criar ou abrir caso jurídico" : "Ver casos jurídicos"}</Link></Button></div>;
}
