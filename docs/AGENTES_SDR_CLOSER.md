# Equipe SDR e closer

Esta entrega adiciona uma equipe ao orquestrador nativo do WhatsApp. A operação
comercial não constitui aprovação de prova médica, direito à isenção, estratégia
jurídica ou assinatura em nome do cliente.

## Implementado

- Aba `Agente IA > SDR e closer`, com configuração persistida por escritório,
  edição reservada ao administrador real e controle de revisão concorrente.
- Davi coleta respostas e autorização. O closer continua a organização documental
  e comercial. O estado fica no servidor por conversa, sem depender de o modelo
  lembrar qual agente atua. Correções explícitas podem atualizar respostas.
- A coleta completa transfere ao closer, inclusive com informações desconhecidas
  ou negativas. Não existe decisão automática de elegibilidade jurídica.
- Retirada de consentimento pausa a coleta. Retomada exige consentimento explícito.
- Anexo recebido pode ser registrado por ID, validado contra a conversa e marcado
  `received_unreviewed`. A ferramenta não lê o conteúdo nem aprova o documento.
- Modelo e honorários confirmados pelo administrador permitem preparar e guardar
  rascunhos. Alterações no formulário retiram a confirmação. O agente não edita
  cláusulas nem concede descontos. Campos suportados: nome, email, telefone e
  honorários; campos restantes bloqueiam o preparo.
- Operações são idempotentes por mensagem/ação/argumentos, usam revisão de estado,
  revalidam canal e tenant e registram eventos. Respostas médicas ficam em tabelas
  sem acesso direto do frontend; a visão operacional mostra apenas etapa e contagem.
- O fluxo restringe ferramentas comerciais gerais: não promove negociações nem
  cria memória médica global. Imagens não são encaminhadas à visão do modelo por
  este fluxo. O pedido explícito de atendente preserva o handoff existente.

## Dependências e limites explícitos

- O fluxo requer IA nativa, credenciais do modelo, canal habilitado e cota disponível.
  Não controla fluxos externos n8n. Habilitar a equipe substitui a persona geral/de
  canal para a operação nativa; desligá-la volta à configuração geral.
- Ainda não há conexão destas ferramentas com OCR/análise F7, criação do caso,
  aprovação profissional ou publicação de conteúdo do dossiê jurídico.
- Assinatura eletrônica não está configurada nesta entrega. Não há convite, link,
  callback ou alegação de assinatura. O arquivo preparado pode ser baixado pelo
  administrador como texto, mantendo a revisão da configuração de origem.
- Provedor de assinatura, modelo de contrato, honorários e limites comerciais
  precisam ser definidos pelo escritório. Não foi criado contrato fictício.
- O painel de teste geral continua usando a persona geral; não simula esta equipe.
  A equipe é exercitada pelas regressões e pelo orquestrador nativo em canais reais.
- O scheduler existente determina a latência; não há promessa de resposta instantânea.

## Verificação

Testes de interface em `SalesWorkflowPanel.test.tsx`; testes de ferramentas em
`supabase/tests/ai_sales_workflow_runtime.test.ts`; testes PostgreSQL em
`supabase/tests/ai_sales_workflow.sql`. O fixture SQL é mínimo e só pode ser instalado
na base descartável `ai_sales_workflow_test`. Não substitui homologação com provedor.

```sh
npm test -- --run src/components/ai-workflow/SalesWorkflowPanel.test.tsx
npx deno test --no-check supabase/tests/ai_sales_workflow_runtime.test.ts
```

Aplicar somente a migration `20260912010000_ai_sales_workflow.sql` antes de publicar
o orquestrador atualizado. Nunca incluir migrations pendentes de outra tarefa por
conveniência. Nenhum teste desta entrega envia mensagens, documentos ou contratos
a terceiros.

Verificação desta entrega: 569 testes do frontend, incluindo quatro cenários da
nova interface; seis testes do runtime; regressões PostgreSQL do fluxo e
compatibilidade da migration com o schema real em transação revertida. Typecheck
do frontend, lint dos arquivos alterados e build passaram. O `deno check` do
orquestrador continua apontando sete erros de tipos herdados em ai-tools/domain/
uazapi, reproduzidos também na base sem estas alterações. Os testes do runtime
foram executados com `--no-check`; não são uma homologação de WhatsApp real.
