# Automação supervisionada de IR

## Entrega desta iteração

A Visão geral deriva uma fila de providências dos dados acessíveis: checklist
obrigatório, conferências pendentes/divergentes, lançamentos fiscais incompletos,
cálculos para revisão e análise profissional desatualizada. Cada item tem chave
estável e atalho para a etapa correspondente. A fila é recalculada quando os
dados são atualizados. O responsável pode sincronizá-la com as tarefas
persistentes do caso. A operação é transacional e idempotente: repetições não
duplicam tarefas, pendências resolvidas encerram somente tarefas criadas pela
automação e conclusões/cancelamentos manuais não são reabertos.

Na conferência médica, o texto OCR atual é analisado por regras determinísticas
e apresenta indícios favoráveis, sinais de outro tipo documental, lacunas e as
páginas de origem. A sugestão não é gravada como conclusão. O responsável deve
confirmar se o original é laudo/relatório, atestado, exame, receita ou outro
documento antes de registrar a revisão.

Falhas de consulta suspendem a apresentação da fila e oferecem nova tentativa.
Permissões atuais filtram as pendências, inclusive com cache já preenchido.
O indicador de retenções considera a última competência por fonte, evitando
contar como ativo um acompanhamento histórico já sucedido por cessação verificada.

## Próximas entregas ainda não executadas

- Piloto profissional da classificação documental em amostra autorizada.
- Execução periódica no servidor; a persistência idempotente já pode ser acionada
  pelo responsável na Visão geral.
- Lembretes configuráveis com consentimento, templates e comprovantes de entrega.
- Integrações de assinatura, cobrança e calendário com credenciais de homologação.
- Monitoramento judicial contratado e preparação de protocolo com recibos.
- Sugestão fundamentada de enquadramento e estratégia, com revisão profissional.
- Tratamento de falhas dos provedores e reconciliação de resultados ambíguos.

As porcentagens de automação mencionadas na conversa eram estimativas sem medição;
não são indicadores comprovados. Aprovação técnica não homologa cálculo fiscal,
estratégia jurídica, envio externo ou operação financeira.
