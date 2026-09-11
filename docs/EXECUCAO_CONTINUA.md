# Execução contínua do AdvocaCHAT

Autorização de 11/09/2026: avançar automaticamente para a próxima fase e reunir,
ao final, tudo que depender do usuário. Este arquivo acompanha execução e
pendências; o [plano principal](PLANO_PLATAFORMA_JURIDICA_E_ISENCAO_IR.md) mantém os
critérios de cada fase. Não marcar integração contratual ou validação humana como
concluída porque um adaptador ou teste simulado passou.

## Estado de execução

- F1: implementada, publicada e verificada. Código `accbdda`, evidências `8e946e2`.
- F2: entrega técnica publicada e verificada (`0f66242`); assinatura contratada pendente P01.
  Evidências: [Fase 2](FASE_2_OPERACAO_JURIDICA.md).
- F3: entrega técnica publicada e verificada (`3105f4d`), com dossiê, revisão e representação.
  Evidências: [Fase 3](FASE_3_DOSSIE_ASSISTIDO_IR.md). Homologação profissional permanece P03.
- F4: entrega técnica publicada e verificada (`8825197`), incluindo SQL, API e navegador.
  Evidências: [Fase 4](FASE_4_CALCULOS_PEDIDOS_E_RESULTADOS.md). Homologação profissional permanece P03.
- F5: entrega técnica publicada e verificada (`e2476ef`, correção de rota `035b34d`), com portal, comunicação, honorários, prestação de contas e rotina. [Evidências SQL, API e navegador](FASE_5_PORTAL_E_FINANCEIRO.md); entregas reais e cobrança seguem P06/P07.
- F6: em execução — monitoramento, conferência de publicações e prazos assistidos; nenhuma fonte externa ativada.
- F7–F9: continuar pela ordem do plano, respeitando dependências técnicas reais.
- Continuação vinculada à mesma tarefa por automação `continuar-fases-do-advocachat`.

Em cada etapa: conferir estado Git, preservar trabalho alheio, implementar,
validar com fixtures sintéticas, publicar o escopo em `origin/main`, verificar
SHA e `SUCCESS` no Railway e registrar verificação funcional/persistência.
Não repetir mensagens, convites, cobranças ou atos jurídicos como efeito dos testes.

Dependências externas não impedem avanço em trabalho independente: deixar estados
claros de não configurado, preservar alternativa manual e registrar os testes que
não podem ser realizados sem a dependência. Se só restarem essas dependências,
encerrar a execução disponível com relatório consolidado e pausar a continuação.

## Pendências para apresentar somente no relatório consolidado

| ID | Dependência | O que pode avançar sem ela | O que continua pendente |
| --- | --- | --- | --- |
| P01 | Provedor de assinatura contratado, credenciais, conta de teste e condições de uso | Instrumentos versionados, aprovação, revogação e registro explícito de evidência externa | Convite eletrônico, callback autenticado, recibo e verificação com provedor real (F2.05) |
| P02 | Habilitação e autorização de calendário externo do escritório | Agenda jurídica interna, cancelamento, responsáveis e substitutos | Sincronização e homologação com Google Calendar, se adotado |
| P03 | Advogado responsável, profissionais fiscais e casos de referência dos pilotos | Modelos revisáveis, campos estruturados, controles, exemplos sintéticos e cenários determinísticos | Aprovação jurídica/fiscal e homologação com os escritórios (F0, F3, F4) |
| P04 | Pagadores, tribunais, fontes e contratos de monitoramento definidos; autorização comercial compatível para DataJud ou contrato/cobertura de fornecedor comercial | Modelo de fontes, integração desacoplada, fila e acompanhamento manual | Cobertura e homologação real de conectores (F6/F8); chave pública não comprova permissão comercial |
| P05 | Política de retenção por finalidade, orçamento e metas de recuperação | Preservação sem descarte automático, controles e medição em testes | Prazos/obrigações contratuais e aceite das metas de operação |
| P06 | Canal de comunicação autorizado do escritório e destinatários verificados | Portal, conteúdo aprovado, fila, adapters e recibos verificáveis; templates de OTP | Homologação real de entrega pelo canal contratado e recebimento de OTP no endereço correto |
| P07 | Gateway de honorários e conta recebedora do escritório, sandbox e regras de estorno | Obrigações, conciliação, reversões e adapter isolado do billing SaaS | Cobrança e callback reais com provedor contratado |

Não reutilizar credenciais, clientes ou base de dados de outros produtos.
Não contratar serviços nem enviar mensagens a terceiros sem autorização específica.

## Acompanhamento técnico para as fases seguintes

- F3: preservar natureza de renda e fontes separadas; avaliação conjunta exige acesso médico e fiscal.
- Fixtures F3–F5 mantidas isoladamente para validar as próximas fases; remover blobs, registros e usuários internos/externos sintéticos e conferir estado original antes do encerramento disponível.
- F5: integração Auth real passou sem envio; tipos herdados de convite/scheduling-public foram corrigidos e verificados. Preservar a separação entre convite e credenciais próprias do cliente.
- F9: paginação das listas jurídicas (limite atual 200), tratamento auditado de uploads interrompidos, carga e recuperação integral. Medir também volume de snapshots F4 e custo de conferir atualidade de todas as versões; consultas fiscais recusam silenciosa truncagem acima de 25.000 linhas, mas ainda precisam de filtros/paginação apropriados para grandes casos.
