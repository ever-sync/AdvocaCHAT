import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export const CASE_STATUSES = { ativo: "Em andamento", aguardando: "Aguardando", encerrado: "Encerrado" } as const;
export const CASE_TYPES = { consultivo: "Consultivo", extrajudicial: "Extrajudicial", judicial: "Judicial" } as const;
export const DOCUMENT_CATEGORIES = { general: "Geral", medical: "Saúde", fiscal: "Fiscal" } as const;
export const OAB_STATES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
export const selectClassName = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function legalDate(value?: string | null, withTime = false) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return date.toLocaleString("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" });
}

export function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function useLegalAction() {
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  async function run(action: () => Promise<unknown>, title: string) {
    setPending(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["legal"] });
      toast({ title });
      return true;
    } catch (error) {
      toast({ title: "Não foi possível concluir", description: legalErrorMessage(error), variant: "destructive" });
      return false;
    } finally {
      setPending(false);
    }
  }
  return { pending, run };
}

export function legalErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível concluir. Tente novamente.";
  const messages: Record<string, string> = {
    "Active profile required": "É necessário um perfil ativo neste escritório.",
    "Only the active workspace administrator can change this feature": "Somente um administrador deste escritório pode alterar a habilitação.",
    "Case creation not permitted": "Seu perfil não está autorizado a criar casos neste escritório.",
    "Negotiation not found in workspace": "A negociação não está disponível neste escritório.",
    "Converted case access denied": "Esta negociação já possui um caso ao qual você não tem acesso. Solicite acesso ao responsável.",
    "Customer must match the negotiation": "O cliente deve ser o mesmo da negociação de origem.",
    "Customer not found in workspace": "O cliente não está disponível neste escritório.",
    "Case edit denied": "Seu acesso não permite editar este caso.",
    "Only the case owner manages members": "Somente o responsável pelo caso pode alterar os participantes.",
    "Member must be another active profile in this workspace": "Escolha outro participante ativo deste escritório.",
    "Invalid CNJ number format": "Informe os 20 dígitos do número CNJ, com ou sem pontuação.",
    "Invalid CNJ checksum": "O dígito verificador do número CNJ é inválido. Confira o número do processo.",
    "Active legal workspace required": "Habilite a área jurídica antes de salvar seus dados profissionais.",
    "Provide both OAB number and state": "Informe o número da OAB e a UF juntos.",
    "Document upload denied": "Seu acesso não permite enviar documentos nesta categoria.",
    "Document must contain 1 byte to 10 MiB": "Escolha um arquivo não vazio de até 10 MB.",
    "Case document limit of 200 MiB exceeded": "Este caso atingiu o limite de 200 MB de documentos.",
    "Upload authorization was revoked": "Sua autorização foi revogada durante o envio. O arquivo não foi disponibilizado.",
    "Document download denied": "Seu acesso a este documento não está autorizado.",
    "Only the case owner manages retention": "Somente o responsável pelo caso pode alterar a preservação.",
    "Removing a hold requires a reason": "Informe a justificativa para encerrar a preservação.",
    "Reason too long": "A justificativa deve ter até 500 caracteres.",
  };
  if (messages[message]) return messages[message];
  if (message.includes("duplicate key")) return "Este registro já existe no caso. Atualize a página para consultá-lo.";
  if (message.includes("check constraint")) return "Confira o preenchimento dos campos e tente novamente.";
  if (message.includes("row-level security") || message.includes("permission denied")) return "Seu acesso a esta operação não está autorizado.";
  return message;
}
