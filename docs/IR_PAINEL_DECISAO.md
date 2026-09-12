# Painel de decisão e dossiê de isenção de IR

Entrega de 12/09/2026. A aba **Visão geral** passa a abrir primeiro na área de
isenção de IR e reúne, sem alterar registros:

- índice de organização do caso;
- quantidade de fontes pagadoras e rendimentos acessíveis;
- itens obrigatórios do checklist ainda pendentes;
- documentos com divergência registrada;
- fatos da cronologia com datas não exatas;
- retenções que ainda precisam ser confirmadas;
- situação da análise profissional e próxima ação operacional sugerida.

O índice mede somente a completude dos registros acessíveis. Ele não representa
enquadramento, probabilidade de êxito, valor recuperável ou concessão externa. A
próxima ação segue uma ordem determinística: fonte pagadora, rendimento,
checklist obrigatório, divergência documental, retenção, análise atual e revisão
geral pelo responsável.

## Dossiê para revisão

O botão **Baixar dossiê** gera HTML estático e imprimível em PDF, com CSP
restritiva, conteúdo escapado e sem recursos remotos. Antes de coletar os dados,
o app consulta novamente o contexto autorizado. Depois da coleta, consulta o
contexto outra vez e cancela a exportação se revisão ou permissões médicas,
fiscais e de análise tiverem mudado.

O arquivo contém somente os registros retornados pelas políticas de acesso do
caso. Ele identifica a revisão de entrada e declara que a situação atual deve ser
conferida antes de qualquer providência. O arquivo não protocola pedido, não
envia mensagem, não calcula crédito e não substitui revisão jurídica ou fiscal.

## Validação

- Testes unitários cobrem conjunto completo, prioridade de pendências e escape
  de conteúdo privado/malicioso.
- TypeScript e ESLint verificam a integração do painel ao workspace existente.
- A suíte completa, builds e jornada de navegador devem ser executados antes da
  publicação, conforme o processo geral do projeto.
