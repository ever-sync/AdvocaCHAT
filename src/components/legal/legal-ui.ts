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
    "Legal operation denied": "Seu acesso não permite esta operação neste caso ou categoria.",
    "Provide 1 to 50 interview questions": "Inclua de 1 a 50 perguntas na entrevista.",
    "Invalid or duplicate interview question": "Confira as perguntas da entrevista e remova campos duplicados.",
    "Assignee must be an active participant of this case": "Escolha um participante ativo deste caso como responsável ou substituto.",
    "Case access denied": "Seu acesso a este caso não está autorizado.",
    "Instrument access denied": "Seu acesso a este instrumento não está autorizado.",
    "Only the current draft can be reviewed": "Somente o rascunho da versão atual pode ser encaminhado para revisão.",
    "Invalid instrument review transition": "A situação desta versão mudou. Atualize a página antes de revisar.",
    "Current approved version required": "Selecione a versão atual aprovada para registrar a evidência.",
    "A ready document in the same case/category is required": "Escolha um documento disponível no mesmo caso e categoria.",
    "Template edit denied": "Seu acesso não permite alterar este modelo.",
    "Template access denied": "Seu acesso a este modelo não está autorizado.",
    "Unsupported task fields": "Confira os campos da tarefa e tente novamente.",
    "Task access denied": "Seu acesso a esta tarefa não está autorizado.",
    "Unsupported appointment fields": "Confira os campos do compromisso e tente novamente.",
    "Appointment access denied": "Seu acesso a este compromisso não está autorizado.",
    "Workspace administrator required": "Somente um administrador deste escritório pode alterar esta configuração.",
    "Invalid operation settings": "Confira os serviços, etapas e motivos informados.",
    "Template creation denied": "Seu acesso não permite criar modelos neste escritório.",
    "Invalid interview answers": "Confira as respostas da entrevista.",
    "Unknown interview answer": "Uma resposta não pertence a esta versão da entrevista. Reabra o formulário.",
    "A required answer is missing": "Responda todas as perguntas obrigatórias.",
    "Answer type does not match question": "Confira o formato das respostas da entrevista.",
    "Invalid answer date": "Informe uma data válida na entrevista.",
    "Document request access denied": "Seu acesso a esta solicitação não está autorizado.",
    "Request cannot receive a document in this state": "A situação desta solicitação não permite anexar outro documento.",
    "Request access denied": "Seu acesso a esta solicitação não está autorizado.",
    "Invalid document review transition": "A situação desta solicitação mudou. Atualize a página antes de revisar.",
    "Cancellation requires a reason and a pending request": "Informe uma justificativa para cancelar uma solicitação pendente.",
    "Invalid request link or expiry": "O link não pôde ser gerado. Confira se a solicitação está aberta.",
    "Invalid or expired document link": "Este link de envio é inválido ou expirou.",
    "Document quota exceeded": "Este caso atingiu o limite disponível para documentos.",
    "Upload request expired or cancelled": "A solicitação expirou ou foi cancelada durante o envio.",
    "Service, stage or reason is not configured": "Escolha um serviço, etapa e motivo cadastrados neste escritório.",
  };
  if (messages[message]) return messages[message];
  if (message.includes("duplicate key")) return "Este registro já existe no caso. Atualize a página para consultá-lo.";
  if (message.includes("check constraint")) return "Confira o preenchimento dos campos e tente novamente.";
  if (message.includes("row-level security") || message.includes("permission denied")) return "Seu acesso a esta operação não está autorizado.";
  return message;
}
