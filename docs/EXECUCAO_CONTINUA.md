# Execução contínua do AdvocaCHAT

Autorização de 11/09/2026: avançar automaticamente para a próxima fase e reunir,
ao final, tudo que depender do usuário. Este arquivo acompanha execução e
pendências; o [plano principal](PLANO_PLATAFORMA_JURIDICA_E_ISENCAO_IR.md) mantém os
critérios de cada fase. Não marcar integração contratual ou validação humana como
concluída porque um adaptador ou teste simulado passou.

## Estado de execução

- F1: implementada, publicada e verificada. Código `accbdda`, evidências `8e946e2`.
- F2: em execução — contratação, entrevistas, coleta, instrumentos, agenda e tarefas.
- Próxima etapa após validar a parte técnica de F2: F3, triagem e dossiê de IR.
- F3–F9: continuar pela ordem do plano, respeitando dependências técnicas reais.
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
| P04 | Pagadores, tribunais, fontes e contratos de monitoramento definidos | Modelo de fontes, integração desacoplada, fila e acompanhamento manual | Cobertura e homologação real de conectores (F6/F8) |
| P05 | Política de retenção por finalidade, orçamento e metas de recuperação | Preservação sem descarte automático, controles e medição em testes | Prazos/obrigações contratuais e aceite das metas de operação |

Não reutilizar credenciais, clientes ou base de dados de outros produtos.
Não contratar serviços nem enviar mensagens a terceiros sem autorização específica.
