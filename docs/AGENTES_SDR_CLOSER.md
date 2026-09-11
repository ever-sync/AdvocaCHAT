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

## Pré Vidas: avaliação opcional e acompanhamento

O SDR registra a falta de laudo sem encerrar a oportunidade. Novas coletas completas com `has_documents=no` abrem acompanhamento `needed`; registros históricos não são migrados automaticamente. O closer explica a empresa parceira e solicita autorização específica antes de registrar `requested`. A autorização da triagem não substitui essa autorização.

Estados: `needed` → `requested` → `scheduled` → `awaiting_report` → `report_received`. `reschedule` identifica falta ou pedido de mudança e limpa a confirmação e horário anteriores; `declined` preserva a oportunidade e permite novo pedido autorizado. Documento existente pode ser vinculado sem passar pela avaliação. Recebimento não significa aprovação do conteúdo.

Em **Agentes de IA → SDR e closer**, o painel mostra os 100 acompanhamentos mais recentes. No detalhe da negociação do **CRM**, o mesmo painel é filtrado pelo cliente vinculado; todas as conversas desse cliente podem aparecer. Cada registro mostra próxima ação, prazo, disponibilidade, consulta, referência de confirmação e os dez eventos mais recentes. A leitura e o registro administrativo são restritos ao administrador real do tenant. O histórico completo permanece no banco.

A ferramenta `record_previdas` registra somente pedido autorizado, recusa ou necessidade de reagendamento, com prazo interno de acompanhamento de 24 horas. O servidor valida consentimento ativo, canal, tenant, revisão e idempotência. Eventos de confirmação são registrados administrativamente com referência externa; vínculo do laudo exige documento médico já recebido naquela conversa. O CRM não move estágios comerciais automaticamente nesta entrega.

**Pendente de integração externa:** API/link de agendamento e autenticação do Pré Vidas, disponibilidade real, confirmação/cancelamento, identificação segura dos eventos, recebimento do laudo e envio de lembretes. O painel registra acompanhamento interno e não realiza chamadas nem envia dados ao parceiro. Prazos exibidos não representam lembretes enviados. Não há confirmação automática baseada na fala do cliente. O registro administrativo é provisório até existir integração verificável com o parceiro.

Validação: `supabase/tests/previdas_operation.sql` após a fixture e as migrações de sales workflow e Pré Vidas; testes de interface `PrevidasPanel.test.tsx`; testes Deno do workflow. A suíte SQL usa transação revertida e dados sintéticos, sem mensagens externas.
