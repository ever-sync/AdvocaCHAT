import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export const CASE_STATUSES = { ativo: "Em andamento", aguardando: "Aguardando", encerrado: "Encerrado" } as const;
export const CASE_STATUS_VARIANTS = { ativo: "info", aguardando: "warning", encerrado: "neutral" } as const;
export const CASE_TYPES = { consultivo: "Consultivo", extrajudicial: "Extrajudicial", judicial: "Judicial" } as const;
export const DOCUMENT_CATEGORIES = { general: "Geral", medical: "Saúde", fiscal: "Fiscal" } as const;
export const OAB_STATES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
export const selectClassName = "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
    "Both medical and fiscal permissions required": "Esta análise exige acesso aos dados de saúde e fiscais do caso.",
    "A ready document from this case and category is required": "Escolha um documento disponível no mesmo caso e categoria.",
    "Unsupported payer fields": "Confira os campos da fonte pagadora.",
    "Payer access denied": "Seu acesso a esta fonte pagadora não está autorizado.",
    "Unsupported income source fields": "Confira os campos do rendimento.",
    "Income source access denied": "Seu acesso a este rendimento não está autorizado.",
    "Payer must belong to this case": "Escolha uma fonte pagadora deste caso.",
    "Benefit date must use YYYY-MM-DD": "Informe uma data válida para o início do benefício.",
    "Unsupported evidence fields": "Confira os campos do fato informado.",
    "Event type requires its protected category": "Esse tipo de fato precisa ser registrado na categoria protegida correspondente.",
    "Superseded evidence must belong to this case/category": "O fato corrigido precisa pertencer ao mesmo caso e categoria.",
    "Event date must use YYYY-MM-DD": "Informe uma data válida para o fato.",
    "Document access denied": "Seu acesso a este documento não está autorizado.",
    "Invalid documentary checks": "Confira os itens de verificação documental.",
    "Invalid documentary metadata": "Confira os dados de emissão e identificação do documento.",
    "Document review needs a reason": "Descreva a pendência ou divergência da conferência.",
    "Document dates must use YYYY-MM-DD": "Informe datas válidas para o documento.",
    "Reported disease onset requires medical category": "O início da doença deve permanecer na categoria de saúde.",
    "Rule authoring denied": "Seu perfil não permite cadastrar fundamentos para o escritório.",
    "Rule review denied": "Seu perfil não permite aprovar fundamentos do escritório.",
    "Rule access denied": "Esta referência não está disponível no escritório.",
    "Unsupported rule fields": "Confira os campos do fundamento jurídico.",
    "Provide official reference URLs for review": "Inclua os endereços das fontes oficiais examinadas.",
    "Reference must be an HTTPS URL": "Informe uma referência com endereço HTTPS válido.",
    "A draft and explicit professional review are required": "A revisão exige uma versão em rascunho e a manifestação expressa do profissional.",
    "Rule approval requires an explicit validity note": "Registre a vigência e as ressalvas em uma nova versão antes de aprovar.",
    "Every source requires an ISO checked_on date before approval": "Registre a data de consulta de todas as fontes em uma nova versão antes de aprovar.",
    "Checklist authoring denied": "Seu perfil não permite cadastrar modelos de checklist.",
    "Unsupported checklist fields": "Confira os campos do checklist.",
    "Invalid checklist items or payer types": "Confira os requisitos e tipos de fonte do checklist.",
    "Invalid checklist item": "Confira o título, categoria e etapa de cada requisito.",
    "Checklist access denied": "Este checklist não está disponível para seu acesso.",
    "Payer does not match checklist scope": "A fonte pagadora não corresponde ao escopo deste checklist.",
    "Checklist item access denied": "Seu acesso a este requisito não está autorizado.",
    "Request must match case and category": "Escolha uma solicitação do mesmo caso e categoria.",
    "A waiver requires a reason": "Informe o fundamento da dispensa do requisito.",
    "Unsupported representation fields": "Confira os campos da representação.",
    "Representation evidence denied": "O documento de poderes não está disponível para seu acesso.",
    "Representative must be a party of this case": "Cadastre o representante nas partes deste caso.",
    "A current approved power of attorney version is required": "Escolha a versão atual e aprovada da procuração.",
    "Power of attorney version is not current and approved": "A versão da procuração foi substituída ou não está aprovada. Revise o vínculo.",
    "Representation access denied": "Seu acesso a esta representação não está autorizado.",
    "Representation approval requires a current draft and review note": "A aprovação exige um rascunho válido e o registro da conferência do responsável.",
    "Revocation requires a reason": "Informe o motivo da revogação.",
    "Active representation from this case required": "Escolha uma representação ativa deste caso.",
    "Only a pending request may change representation": "A representação só pode ser alterada em uma solicitação pendente.",
    "Representation no longer authorizes this collection": "A representação deixou de autorizar esta coleta. Revise os poderes e a validade.",
    "Link expired or representation no longer authorizes this collection": "O link expirou ou a representação deixou de autorizar a coleta.",
    "One proposal per income source is required": "Prepare uma proposta para cada rendimento cadastrado.",
    "Every current source must appear once": "Os rendimentos mudaram. Reabra a nova análise e revise cada fonte uma vez.",
    "Invalid source proposal": "Confira a proposta e a fundamentação de cada rendimento.",
    "Proposal source must belong to this case": "A proposta deve se referir a um rendimento deste caso.",
    "Proposal references must be arrays": "Reabra a análise e selecione os fundamentos e evidências.",
    "Only human-approved rules from this workspace may be referenced": "Selecione fundamentos revisados e aprovados neste escritório.",
    "Evidence must be accessible and belong to this case": "Escolha fatos acessíveis da cronologia deste caso.",
    "Document must be ready and accessible in this case": "Escolha documentos disponíveis para seu acesso neste caso.",
    "A proposed conclusion requires reviewed sources and evidence": "A proposta individual precisa de fundamentos aprovados e evidências vinculadas.",
    "A proposed start date requires legal reasoning": "Explique o fundamento jurídico do marco inicial proposto.",
    "Proposed date must use YYYY-MM-DD": "Informe uma data válida para o marco proposto.",
    "Start date reasoning too long": "A fundamentação do marco deve ter até 4.000 caracteres.",
    "Assessment access denied": "Seu acesso a esta análise não está autorizado.",
    "Assessment changed or is stale; create a new version": "Os dados ou referências mudaram. Prepare uma nova versão da análise.",
    "Assessment is stale; create a new version": "Os dados ou referências mudaram. Prepare uma nova versão antes de aprovar.",
    "Assessment decision needs a pending review and a reason": "A decisão exige uma análise em revisão e a justificativa do responsável.",
    "Every source requires an explicit reviewed proposal before approval": "Ainda há rendimentos pendentes. Registre uma proposta individual em nova versão antes de aprovar.",
    "A draft and explicit review note are required": "A conferência exige uma situação compatível e a justificativa do responsável.",
    "A new strategy requires a current approved calculation": "Revise um cálculo atual antes de concluir esta estratégia.",
    "A new strategy requires the current approved legal assessment": "Conclua a análise jurídica atual antes de revisar a estratégia.",
    "A ready authorized document in the proper case/category is required": "Selecione um documento disponível neste caso e na categoria exigida.",
    "A recorded filing needs a receipt document and reference": "Anexe o recibo e informe sua referência para registrar a entrega efetiva.",
    "Adjustment must reference an included entry": "O ajuste deve corresponder a uma linha selecionada dentro do período.",
    "Allocation claim must belong to the case": "Selecione um pedido deste caso para vincular o principal.",
    "An effective event cannot be dated in the future (America/Sao_Paulo)": "Um fato efetivo não pode ter data futura. A conferência utiliza o fuso de Brasília.",
    "Assessment must belong to this case": "Selecione uma análise jurídica deste caso.",
    "Bracket bounds must rise and final bracket must be unbounded": "Informe limites crescentes e deixe a última faixa sem limite superior.",
    "Calculation review needs a current pending version and a reason": "A revisão exige uma versão atual em análise e uma justificativa.",
    "Calculation selections must be bounded arrays": "Limite a seleção a 500 itens por conjunto e confira os vínculos.",
    "Cessation source must belong to this case": "A conferência de retenção deve se referir a um rendimento deste caso.",
    "Claim references must belong to this case and assessment": "Os vínculos do pedido devem corresponder ao mesmo caso e análise.",
    "Coefficient requires a finite decimal with at most nine places": "Informe o coeficiente como decimal não negativo, com até nove casas.",
    "Compare two distinct payroll/benefit documents": "Selecione dois documentos distintos para comparar as retenções.",
    "Date requires YYYY-MM-DD": "Informe uma data válida.",
    "Deduction percentage must be a fraction": "Informe o percentual do desconto como fração entre zero e um.",
    "Do not overwrite a later return situation with an earlier stage": "A declaração já avançou para uma situação posterior. Preserve o histórico.",
    "Draft and explicit professional review required": "Selecione um rascunho e registre a revisão profissional.",
    "Draft references must match case and assessment": "Confira se os vínculos do rascunho correspondem ao caso e à análise.",
    "Duplicate selections are not allowed": "Remova seleções duplicadas antes de continuar.",
    "Each entry may be adjusted once": "Cada linha pode receber apenas um ajuste nesta versão.",
    "Explicit parameter validity note is required": "Descreva a vigência, o alcance da norma e suas ressalvas.",
    "Idempotency key already used with another allocation": "A tentativa anterior de reserva usou outros dados. Atualize o saldo antes de iniciar uma nova reserva.",
    "Idempotency key already used with another receipt": "A tentativa anterior de recebimento usou outros dados. Confira o histórico antes de registrar outra entrada.",
    "Import must belong to this case": "Selecione uma importação deste caso.",
    "Import requires 1-500 rows within 1MiB": "A importação deve conter de 1 a 500 linhas e até 1 MiB de dados.",
    "Import revision must reference a reviewed/rejected import in this case": "Selecione uma importação conferida ou rejeitada deste caso para criar a revisão.",
    "Income source must belong to this case": "Selecione um rendimento cadastrado neste caso.",
    "Independent examples must match before approval; fix divergent parameters in a new version": "A aprovação exige exemplos independentes coincidentes. Corrija divergências em uma nova versão dos parâmetros.",
    "Invalid calendar period": "Confira o ano e o mês do período informado.",
    "Invalid deterministic tax input": "Confira os valores tributáveis e as deduções do exemplo.",
    "Invalid fiscal adjustment": "Confira os valores, a linha de origem e a fundamentação do ajuste.",
    "Invalid period, mode, residence or completeness declaration": "Confira o período, a modalidade, a residência fiscal e a declaração de abrangência.",
    "Invalid reduction schema or boundary policy": "Confira a redução e o tratamento de seu limite superior.",
    "Invalid simplified deduction schema": "Confira a parcela fixa, o percentual e o teto do desconto simplificado.",
    "Invalid source reference": "Informe um link oficial HTTPS e a data em que foi consultado.",
    "Invalid tax bracket": "Confira o limite, a alíquota e a parcela a deduzir de cada faixa.",
    "Money requires a finite canonical decimal with at most two places": "Informe um valor não negativo com até duas casas decimais.",
    "Only a complete current draft may enter review": "Somente um cenário completo e atual pode ser enviado à revisão.",
    "Only a draft from this workspace can be validated": "A validação exige uma versão em rascunho deste escritório.",
    "Only a requirement or appeal may create a finite manual deadline": "O prazo manual deve estar vinculado a uma exigência ou recurso.",
    "Only draft preparation may change; preserve filed references": "A preparação só pode ser editada antes do protocolo. Preserve as referências do pedido já apresentado.",
    "Only final bracket may have no upper bound": "Apenas a última faixa pode ficar sem limite superior.",
    "Original import was already superseded": "A importação original já foi substituída. Atualize a lista para escolher a versão atual.",
    "Overlap requires two distinct claims in this case": "Selecione dois pedidos distintos deste caso para registrar sobreposição.",
    "Parameter authoring denied": "Seu perfil não permite cadastrar parâmetros neste escritório.",
    "Parameter review denied": "Seu perfil não permite aprovar parâmetros neste escritório.",
    "Parameter validation denied": "Seu perfil não permite registrar validações dos parâmetros.",
    "Parameter sources are required": "Inclua pelo menos uma fonte oficial e sua data de consulta.",
    "Payment source must belong to the case": "A fonte do pagamento deve estar cadastrada neste caso.",
    "Payment taxpayer must be linked to the case": "Vincule o contribuinte ao cliente ou às partes do caso.",
    "Payment verification needs a professional note": "Registre a conferência profissional do comprovante de pagamento.",
    "Period review requires a current approved legal assessment": "A revisão do período exige uma análise jurídica atual e aprovada.",
    "Period source must belong to this case": "Selecione um rendimento deste caso para revisar o período.",
    "Positive allocation, idempotency key and reason required": "Informe um valor de reserva maior que zero e sua fundamentação.",
    "Principal is unverified or already allocated/received; double appropriation denied": "O principal não foi conferido ou o valor excede o saldo disponível após reservas e recebimentos.",
    "Prior declaration must match this case and year": "A declaração anterior deve corresponder ao mesmo caso e ano.",
    "Proposed taxable cannot exceed documented gross": "O valor tributável proposto não pode superar o rendimento bruto documentado.",
    "Protocol receipt reference is required": "Informe a referência do recibo de protocolo.",
    "Protocol, appeal or decision requires documentary evidence": "Anexe a prova documental do protocolo, recurso ou decisão.",
    "Provide ordered tax brackets": "Cadastre as faixas de tributação em ordem crescente.",
    "Receipt exceeds active allocation or already consumed principal": "O recebimento supera a reserva ativa ou corresponde a principal já consumido.",
    "Receipt reference is required for an effective return status": "Informe o recibo para registrar uma situação efetiva da declaração.",
    "Record the amount recognized by the decision separately, including explicit zero for cessation-only": "Informe o valor reconhecido na decisão. Se houve apenas cessação sem crédito, registre zero explicitamente.",
    "Reduction range is invalid": "O limite final da redução deve superar o limite da redução integral.",
    "Release requires a reason": "Informe a justificativa para liberar o saldo ainda não recebido.",
    "Report requires both medical and fiscal access": "A memória de cálculo exige acesso às categorias médica e fiscal.",
    "Resolve missing facts, payment year and classifications before review": "Complete a identificação da fonte, datas, localização no original, natureza e valores antes de confirmar a conferência.",
    "Return status change needs a current record and note": "A mudança de situação exige a declaração atual e uma justificativa.",
    "Review jurisdiction, standing and strategy explicitly": "Registre a revisão do órgão competente, da legitimidade e da estratégia.",
    "Reviewed entries are immutable; create a revised import": "As linhas conferidas são imutáveis. Crie uma nova importação revisada para corrigir o conteúdo.",
    "Reviewer must explicitly confirm complete coverage": "Confirme explicitamente a abrangência integral antes de aprovar o cenário.",
    "Tax rate must be a fraction between zero and one": "Informe a alíquota como fração entre zero e um; por exemplo, 0,275 para 27,5%.",
    "Unsupported rounding policy": "Confira a política de arredondamento suportada por este motor.",
    "Unsupported tax parameter schema/coverage": "A cobertura disponível é o IR ordinário de residente fiscal no Brasil. Confira os parâmetros.",
  };
  if (messages[message]) return messages[message];
  if (message.includes("duplicate key")) return "Este registro já existe no caso. Atualize a página para consultá-lo.";
  if (message.includes("check constraint")) return "Confira o preenchimento dos campos e tente novamente.";
  if (message.includes("row-level security") || message.includes("permission denied")) return "Seu acesso a esta operação não está autorizado.";
  if (/access denied$/.test(message)) return "Seu acesso a este registro não está autorizado.";
  if (/^Unsupported .* fields$/.test(message)) return "Confira os campos e vínculos informados. Atualize a página antes de tentar novamente.";
  if (/values must be (decimal )?strings|must be a decimal string/.test(message)) return "Informe os valores monetários com até duas casas decimais e confira os separadores.";
  return message;
}
