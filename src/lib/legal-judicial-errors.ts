export function judicialErrorMessage(error: {
  message?: string;
  code?: string;
}) {
  const message = error.message ?? "";
  const rules: [RegExp, string][] = [
    [
      /capacity reached/i,
      "A capacidade de originais deste escritório foi atingida. Solicite a revisão do armazenamento.",
    ],
    [
      /Multi-candidate/i,
      "Este original reúne vários candidatos. Registre um recorte documentado deste caso, preservando o original restrito.",
    ],
    [
      /New deadline version must|No previous deadline/i,
      "Abra a versão mais recente deste prazo e use Nova versão para preservar o histórico correto.",
    ],
    [
      /Source administration|Coverage administration|administrator review/i,
      "Esta ação exige um administrador ativo do escritório.",
    ],
    [
      /Candidate CNJ|matching CNJ/i,
      "O número CNJ da origem não corresponde ao processo selecionado. Confira o vínculo.",
    ],
    [
      /Same-case proceeding|Same-case judicial proceeding/i,
      "Selecione um processo já cadastrado neste caso.",
    ],
    [
      /Same-case|case access|access denied|Current original category|Current case participants/i,
      "Seu acesso atual não permite esta ação ou o registro pertence a outro caso. Recarregue e confira as permissões com o responsável.",
    ],
    [
      /Explicit inscription type|OAB number/i,
      "Informe número, UF e tipo de inscrição OAB conforme o cadastro da fonte.",
    ],
    [
      /appearance budget|explicit origins|Invalid diary origin/i,
      "Confira o limite de aparições e os identificadores dos diários autorizados.",
    ],
    [
      /Monitor must have a verified reference|Known monitor ID/i,
      "A conciliação exige um monitor já identificado nesta conta e neste caso, com tipo confirmado.",
    ],
    [
      /unknown|ambiguous|sending|lease/i,
      "O resultado da operação ainda não está confirmado. Concilie a solicitação antes de repeti-la.",
    ],
    [
      /Approval requires|approval requires|approve.*source|checked documentation/i,
      "A aprovação exige prova acessível, fonte consultada, vigência, escopo e condições completos. Confira os campos da versão.",
    ],
    [
      /complete current draft|Current reviewed|snapshot|stale|current.*review/i,
      "Os elementos da proposta mudaram ou há pendências. Prepare e confira uma nova versão antes de aprovar.",
    ],
    [
      /permission proof|general.*proof|document.*required|evidence.*required/i,
      "Selecione uma prova documental pronta e autorizada para esta categoria e finalidade.",
    ],
    [
      /explicit.*time|timestamp|civil date|Invalid date|finite validity/i,
      "Confira as datas, a vigência e os horários com fuso explícito. Datas desconhecidas devem permanecer vazias.",
    ],
    [
      /rate|quota|budget|consumption/i,
      "A operação excede a cota ou exige autorização de consumo. Confira os limites e a solicitação.",
    ],
  ];
  for (const [pattern, text] of rules) if (pattern.test(message)) return text;
  if (error.code === "42501")
    return "Seu acesso atual não permite esta operação. Confira o responsável e as permissões do caso.";
  if (["22023", "22P02", "23514", "23502"].includes(error.code ?? ""))
    return "Confira os campos obrigatórios, formatos e limites da operação. Nenhuma alteração foi concluída.";
  return "Não foi possível concluir a operação judicial. Recarregue os dados e tente novamente; se persistir, informe o responsável pelo sistema.";
}
