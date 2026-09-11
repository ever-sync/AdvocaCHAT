# Plano de evolução do AdvocaCHAT: plataforma jurídica e isenção de IR

Data de referência: **11/09/2026** · Versão: **1.4** · Situação: **F1–F4 com entregas técnicas verificadas; F5 em implementação**.

Este é o roteiro de execução do produto. Reúne as 30 ideias de plataforma jurídica
aprovadas na conversa e 25 funcionalidades específicas para escritórios que atuam
com isenção de Imposto de Renda. As fases, estimativas e metas são propostas de
planejamento; funcionalidades futuras não estão implementadas por constarem aqui.

## 1. Objetivo e recorte inicial

Construir uma plataforma em que o escritório acompanhe cada cliente, caso,
documento, prazo e próxima providência, com atendimento integrado e informações
compreensíveis para o cliente.

O núcleo será utilizável em várias áreas do Direito. A primeira especialidade
será **isenção de IR por moléstia grave sobre rendimentos potencialmente elegíveis,
com cessação de retenções e recuperação de valores quando cabível**. Esse recorte
é uma hipótese de produto extraída do pedido do usuário, a validar na fase F0.
Outras hipóteses de isenção terão regras e módulos próprios; a parcela por idade
de 65 anos não será tratada como se fosse a mesma isenção por doença grave.

Públicos iniciais:

- Advogado autônomo e escritório pequeno com atendimento por WhatsApp.
- Escritório especializado em isenção de IR com equipe de triagem e documentação.
- Advogado responsável pelo caso, assistente administrativo e financeiro.
- Cliente aposentado, pensionista ou militar, eventualmente com representante.
- Contador, correspondente ou consultor convidado, com acesso limitado ao trabalho.

Jornada principal:

```mermaid
flowchart LR
  A[Primeiro atendimento] --> B[Triagem e conflito de interesses]
  B --> C[Contrato e abertura do caso]
  C --> D[Documentos e análise profissional]
  D --> E[Plano de atuação]
  E --> F[Via administrativa]
  E --> G[Via judicial]
  F --> H[Resultados por fonte pagadora]
  G --> H
  H --> I[Conferência de valores e recebimentos]
  I --> J[Prestação de contas e acompanhamento]
```

A escolha de rota pertence ao advogado. A via judicial não terá como requisito
obrigatório um indeferimento administrativo. Os fluxos podem se relacionar,
observados os efeitos e a prevenção de pedidos ou recebimentos duplicados.

## 2. Base existente e lacunas confirmadas no código

Análise do checkout `ever-sync/AdvocaCHAT`, referência inicial `104bf57`.
Não equivale a nova homologação de produção ou de todos os provedores.

| Capacidade existente | Reaproveitamento | Trabalho necessário |
| --- | --- | --- |
| Clientes, conversas e histórico | Relacionamento com cliente | Ficha jurídica, partes, representantes e vínculo com casos |
| CRM, funis e tarefas | Contratação e organização inicial | Separar negociação comercial de caso jurídico |
| Documentos e formulários | Entrevista, coleta e modelos | Remover resíduos clínicos; versionamento e acesso por caso |
| Agenda e conectores Google | Consultas e compromissos | Audiências, diligências e prazos com origem verificável |
| IA, conhecimento, resumos e transferência humana | Apoio ao atendimento e ao advogado | Isolamento por caso, referências e revisão profissional |
| Equipes, permissões e auditoria | Escritórios independentes | Acesso mínimo a provas médicas, fiscais e financeiras |
| Cobrança e billing | Parte da infraestrutura financeira | Billing atual é do SaaS; honorários e repasses exigem outro modelo |
| Webhooks e workers | Base de integrações | Fila durável, cobertura por tribunal e controle de efeitos duplicados |

Referências locais: [escopo atual](../README.md),
[menu](../src/components/layout/AppSidebar.tsx),
[tipos de domínio](../src/types/domain.ts),
[documentos](../src/pages/Documentos.tsx),
[integrações](../src/lib/api/integrations.ts),
[scheduler](../infra/scheduler/index.mjs) e
[registro histórico da implantação](deployment.md).

Lacunas que condicionam o plano:

- Não há núcleo de processos, intimações, prazos judiciais ou conectores de tribunais.
- A assinatura desenhada na tela não constitui integração homologada com provedor
  de assinatura. O novo fluxo precisa guardar evidências e documento final.
- Isolamento por escritório não basta para restringir um laudo médico dentro da equipe.
- O scheduler atual percorre sete tarefas sequencialmente; não representa uma fila
  durável de monitoramento judicial nem uma consulta exata a cada 60 segundos.
- Algumas rotinas de retenção dependem de `pg_cron`; sua execução precisa ser
  comprovada, não presumida pela existência da migration.
- O registro de implantação descreve Postgres com uma instância e não documenta
  teste de carga. Duas réplicas web não significam alta disponibilidade do banco.
- Entrega de e-mail, autenticação e acesso do primeiro usuário devem ser revalidados;
  a conversa registrou divergência de endereço no cadastro, ainda sem correção confirmada.

## 3. Princípios de produto e engenharia

1. Um escritório não acessa dados, arquivos, buscas ou respostas de IA de outro.
2. Um cliente pode ter vários casos; um caso pode ter vários processos e pedidos.
3. Cada informação importada identifica fonte, consulta e data de atualização.
4. Cada caso aberto tem responsável e próxima ação ou motivo explícito de espera.
5. O cliente vê somente informações aprovadas para compartilhamento.
6. IA prepara, organiza e sugere. Diagnóstico, estratégia, cálculo aprovado,
   ciência processual e protocolo exigem o profissional habilitado.
7. Importação de documento ou movimentação não significa concessão de direito.
8. Resultado concedido, retenção efetivamente cessada e dinheiro recebido são estados diferentes.
9. Integração indisponível aparece como falha, não como ausência de novidade.
10. Alterações preservam cadastros e histórico; não converter dados clínicos/comerciais
    antigos silenciosamente em informação jurídica.
11. Toda conexão externa terá finalidade, permissões, custo e cobertura definidos.
12. O piloto pode operar com anexação e registro manual quando não houver API autorizada.

## 4. Catálogo completo: 30 funcionalidades da plataforma

IDs `J01` a `J30` são permanentes para acompanhar entregas. A fase indicada é a
primeira entrega principal; fundações de segurança e dados podem começar antes.
Todos os itens abaixo estão **planejados**.

| ID | Funcionalidade | Entrega esperada | Fase |
| --- | --- | --- | --- |
| J01 | Ficha jurídica do cliente | Casos, partes relacionadas, contatos e próxima ação | F1 |
| J02 | Entrevista por especialidade | Questionários versionados e revisão do advogado | F2 |
| J03 | Conflitos de interesse | Alertas por partes relacionadas, com decisão registrada | F2 |
| J04 | Funil de contratação | Contato, análise, proposta, contrato e abertura de caso | F2 |
| J05 | Documentos pendentes | Solicitação, upload, conferência e lembretes | F2 |
| J06 | Portal do cliente | Casos autorizados, documentos, agenda e pagamentos | F5 |
| J07 | Casos e processos | Assuntos consultivos, extrajudiciais e judiciais | F1 |
| J08 | Importação por número CNJ | Preenchimento por fonte autorizada com procedência | F6 |
| J09 | Linha do tempo | Eventos internos desde F1; movimentos externos em F6 | F1/F6 |
| J10 | Central de tribunais | Acesso orientado em F6; operações habilitadas em F8 | F6/F8 |
| J11 | Publicações por OAB | Captura, associação, deduplicação e conferência | F6 |
| J12 | Domicílio Judicial | Comunicações de instituições habilitadas | F8 |
| J13 | Prazos com conferência | Origem, regra, calendário, memória e revisor | F6 |
| J14 | Distribuição de intimações | Responsável, revisor, substituto e escalonamento | F6 |
| J15 | Agenda jurídica | Audiências, diligências, reuniões e preparação | F2 |
| J16 | Fluxos por especialidade | Etapas e tarefas configuráveis por serviço jurídico | F2/F8 |
| J17 | Painel Meu dia | Prazos, compromissos, respostas e pendências | F5 |
| J18 | Correspondentes e parceiros | Diligência, comprovante, acesso e remuneração | F8 |
| J19 | Contratos e procurações | Modelos, preenchimento, revisão e versões | F2 |
| J20 | Assinatura eletrônica | Provedor, signatários, evidências e arquivo final | F2 |
| J21 | Organizador de provas | OCR, índice, cronologia e página de origem | F7 |
| J22 | Biblioteca de jurisprudência | Fonte oficial, favoritos, temas e atualização | F7 |
| J23 | Assistente de peças | Minutas com fontes, fatos e pendências explícitas | F7 |
| J24 | Assistente de atendimento | Respostas dentro do caso e transferência humana | F7 |
| J25 | Atualizações ao cliente | Eventos explicados, aprovação e entrega comprovada | F5 |
| J26 | Honorários | Fixo, parcelas, recorrência e êxito contratual | F5 |
| J27 | Despesas e repasses | Comprovantes, adiantamentos e prestação de contas | F5 |
| J28 | Indicadores do escritório | Operação, produtividade e resultado por caso | F9 |
| J29 | Sigilo por caso | Acesso a dados/arquivos/IA e auditoria | F1 |
| J30 | Saúde das integrações | Atraso, erro, cobertura, consumo e custo | F6/F9 |

## 5. Especialidade: 25 funcionalidades adicionais para isenção de IR

Todos os itens `IR01` a `IR25` estão **planejados**. As sugestões de análise não
substituem o exame do advogado nem autorizam uma declaração ou requerimento.

| ID | Funcionalidade | Como ajuda o escritório | Fase |
| --- | --- | --- | --- |
| IR01 | Triagem de possível enquadramento | Perguntas sobre benefício, doença documentada e retenção, sem prometer elegibilidade | F3 |
| IR02 | Inventário de rendimentos | Separar aposentadoria, pensão, reforma/reserva, salário, aluguel e demais categorias | F3 |
| IR03 | Múltiplas fontes pagadoras | Vários benefícios, pagadores e regimes em um mesmo cliente | F3 |
| IR04 | Linha do tempo médico-previdenciária | Diagnóstico, laudo, início do benefício, retenções, pedidos e decisões em campos distintos | F3 |
| IR05 | Catálogo jurídico de hipóteses | Fundamentos e critérios versionados, relacionados à evidência e aprovados pelo advogado | F3 |
| IR06 | Checklist por pagador e rota | Documentos específicos para INSS, RPPS, militares, previdência complementar e outros pagadores | F3 |
| IR07 | Dossiê médico reservado | Laudos/exames com emissor, data, origem, acesso mínimo e revisão | F3 |
| IR08 | Conferência documental do laudo | Apontar ausência de identificação, assinatura, emissor ou datas; sem emitir diagnóstico | F3 |
| IR09 | Controle de representação | Procuração, alcance, validade, revogação e representante, quando necessário | F3 |
| IR10 | Atendimento acessível | Fluxos curtos, linguagem clara e familiar autorizado com acesso próprio | F3/F5 |
| IR11 | Importação de informes e contracheques | Campos estruturados com revisão; OCR assistido em F7 | F4/F7 |
| IR12 | Matriz anual e mensal de IR | Rendimentos, retenções, pagamentos e declarações por fonte e período | F4 |
| IR13 | Memória de cálculo auditável | Cenários e comparação com valores aprovados, sem confundir estimativa com crédito | F4 |
| IR14 | Análise de períodos recuperáveis | Marcos e alertas revisados por caso, sem regra automática universal de 60 meses | F4 |
| IR15 | Gestão de retificações | Exercício, recibos, situação fiscal, conferência e comprovantes de transmissão | F4 |
| IR16 | Pedidos administrativos por pagador | Protocolo, documentos, exigência, decisão e acompanhamento independente | F4 |
| IR17 | Preparação da demanda judicial | Estratégia, competência e partes revisadas; peças e anexos vinculados | F4 |
| IR18 | Gestão de exigências e recursos | Motivo, próxima providência, prazo informado e pacote documental | F4 |
| IR19 | Verificação da cessação de retenção | Comparar contracheques posteriores por benefício e alertar divergências | F4 |
| IR20 | Conciliação de restituições | Relacionar pedidos, valores efetivamente recebidos e saldo, prevenindo duplicidade | F4/F5 |
| IR21 | Honorários específicos da especialidade | Base de cálculo contratual, êxito, parcelamento e aprovação do demonstrativo | F5 |
| IR22 | Colaboração com contador | Exportação do pacote fiscal e acesso limitado por caso, sem expor exames desnecessários | F5 |
| IR23 | Acompanhamento anual | Novos informes, nova fonte, retenção reaberta e pendências de declaração | F5 |
| IR24 | Acompanhamento de sucessores | Óbito, representação e providências indicadas pelo advogado, preservando o histórico | F8 |
| IR25 | Painel especializado de resultados | Tempo até documentação completa, decisão, cessação e recebimento efetivo | F9 |

## 6. Regras jurídicas que precisam virar requisitos verificáveis

As fontes oficiais estão na seção 16. Antes de publicar uma regra no software,
registrar URL, versão/data, interpretação aprovada, vigência e responsável jurídico.
O sistema deve comportar exceções documentadas e revisão de entendimentos.

| Regra de desenho | Consequência no produto | Fonte |
| --- | --- | --- |
| Doença e natureza do rendimento precisam ser examinadas separadamente | Análise por rendimento/benefício; não marcar toda a renda do cliente como isenta | S01, S02 |
| Salário de atividade não se torna isento por essa hipótese só porque há doença grave | Salário e benefício separados, inclusive para aposentado que continua trabalhando | S02, S05 |
| Prova administrativa e judicial têm tratamentos distintos | Registrar natureza do laudo; não impedir revisão judicial por falta de laudo oficial | S01, S04 |
| Documentos para iniciar pedido e prova exigida para decisão não são necessariamente iguais | Permitir protocolo inicial e posterior perícia conforme o canal; checklist não rejeita todo laudo particular na entrada | S18 |
| Marcos de doença, benefício e laudo não são intercambiáveis | Data inicial proposta com evidências, justificativa e aprovação profissional | S01, S02 |
| Requerimento administrativo prévio não é requisito universal para ação de isenção/repetição | Abrir rota judicial mediante decisão do advogado, sem bloqueio por falta de indeferimento | S02, S23 |
| Retificação e recuperação de valores têm requisitos próprios | Tratar ano-calendário, exercício, recibo, fiscalização e pretensão separadamente | S03, S06 |
| Remissão/ausência atual de sintomas não deve gerar rejeição automática | Permitir histórico e análise profissional da situação comprovada | S07 |
| Previdência complementar exige tratamento específico | Classificar produto e evento; não tratar benefício periódico, resgate e todos os produtos da mesma forma; revisar orientação sobre VGBL | S02, S19 |
| A parcela de isenção por 65 anos é outra hipótese | Separar fundamentos, limites e cálculos; bloquear somas duplicadas | S08 |
| Dados de saúde exigem controle específico | Finalidade/base legal documentadas; acesso por caso e por categoria documental | S09 |
| Comunicação jurídica tem regras próprias | Modelos informativos revisados; evitar promessa de ganho, diagnóstico automático e captação a partir de listas de doentes | S10 |

Não transformar CID em diagnóstico nem em decisão jurídica automática. A ausência
de condição no catálogo deve encaminhar para revisão fundamentada, preservando a
distinção entre hipótese legal prevista e tese que depende de análise.
O catálogo observará o rol legal e o Tema 250/STJ; descrições clínicas genéricas
não ampliam automaticamente esse rol. A análise de enquadramentos específicos deve
ficar documentada e aprovada. Referências S20 e S21.

Na recuperação administrativa, distinguir diferença após retificadora com saldo
a restituir, imposto pago a maior e hipóteses que demandem PER/DCOMP Web ou outro
procedimento. Guardar a decisão sobre a via; não oferecer um botão universal de
restituição. A janela de retificação e o prazo da pretensão de restituição não são
o mesmo campo. Referências S03, S06 e S22.

### 6.1. Situações mínimas para validar com o especialista

- Aposentadoria com doença posterior e retenção mensal.
- Doença anterior à aposentadoria; laudo emitido depois de ambos os eventos.
- Pensionista e aposentado com mais de uma fonte pagadora.
- Aposentadoria e salário simultâneos; outros rendimentos não abrangidos.
- Laudo particular, laudo oficial e datas divergentes em documentos.
- Histórico de neoplasia com ausência de sintomas atuais.
- Benefício/resgate de previdência complementar com produto e regime identificados.
- Pessoa com 65 anos ou mais com múltiplas fontes e hipóteses de isenção diferentes.
- Declaração já restituída, retificada, em fiscalização ou com pagamento adicional.
- Pedidos administrativo e judicial relacionados ao mesmo período.
- Concessão sem cessação da retenção ou com cessação apenas em uma fonte.
- Recebimento parcial, restituição anterior, óbito ou representante com poderes revogados.

## 7. Fases, dependências e marcos

Premissa para estimativas: **duas pessoas de engenharia**, com design/QA e um
advogado especialista disponíveis semanalmente. Faixas são semanas de calendário
por fase, em execução predominantemente sequencial; não são prazo contratado.
Faltam disponibilidade real da equipe, orçamento e condições dos provedores.
Credenciamento externo pode acrescentar espera sem duração previsível.

| Fase | Resultado principal | Depende de | Estimativa | Marco |
| --- | --- | --- | --- | --- |
| F0 | Escopo, evidências e ambiente de homologação | — | 1 semana | Base validada |
| F1 | Núcleo jurídico e proteção por caso | F0 | 2–3 semanas | Estrutura |
| F2 | Contratação, documentos e agenda jurídica | F1 | 2–3 semanas | Entrada operacional |
| F3 | Especialidade IR e dossiê revisável | F1, F2 | 2–3 semanas | M1: piloto assistido |
| F4 | Fluxos fiscais, cálculos e pedidos | F3 | 3–5 semanas | Operação IR |
| F5 | Portal, comunicação e financeiro | F2, F3; conciliação depende de F4 | 3–4 semanas | M2: operação completa |
| F6 | Monitoramento judicial e prazos | F1, F2 e fonte habilitada; comunicação depende de F5 | 4–6 semanas | Conexões |
| F7 | OCR, pesquisa e IA revisável | F3–F6 conforme função | 3–5 semanas | M3: produtividade |
| F8 | Integrações avançadas e outras especialidades | F6 e habilitações específicas | 2–4 semanas | Expansão |
| F9 | Escala, indicadores e lançamento ampliado | F5–F8; desempenho acompanhado antes | 2–4 semanas | M4: escala |

Soma indicativa: **24–38 semanas**, sem esperas de terceiros. F0 recalibra a
estimativa com inventário de telas, serviços e cenários. Credenciamento de fontes
pode começar em F0; integração em produção só entra após os critérios da fase.

### F0 — Validar a especialidade e preparar a execução

Responsáveis: produto, advogado especialista e liderança técnica.

- [ ] F0.01 Selecionar três escritórios piloto e mapear sua rotina real de IR.
- [ ] F0.02 Confirmar quais pagadores, regimes, estados/tribunais e serviços entram no piloto.
- [ ] F0.03 Validar questionário, documentos, estratégias e casos de referência com o advogado.
- [ ] F0.04 Medir situação inicial: tempo de atendimento, documentos faltantes, retrabalho e custo.
- [ ] F0.05 Inventariar dados existentes e campos herdados; definir migração preservando histórico.
- [ ] F0.06 Preparar homologação isolada, dados sintéticos e contas de teste por papel.
- [ ] F0.07 Revalidar cadastro, confirmação, recuperação, permissões, storage e entrega dos canais.
- [ ] F0.08 Selecionar candidatos a assinatura, monitoramento, cobrança, OCR e IA; obter condições de uso/custo.
- [ ] F0.09 Identificar base legal/finalidades de dados sensíveis e papéis contratuais escritório/plataforma.
- [ ] F0.10 Registrar orçamento, capacidade da equipe, responsáveis e backlog da primeira iteração.
- [ ] F0.11 Ensaiar restauração de banco e documentos em ambiente isolado e registrar tempos/perdas.
- [ ] F0.12 Preparar procedimento mínimo de incidente, bloqueio de acesso, revogação e contato responsável.

Saída: mapa de jornada aprovado, cenários sintéticos, inventário de dados e
homologação acessível, restauração demonstrada e procedimento de incidente ensaiado.
Não usar dados médicos reais antes dos controles de F1.
Evidências: atas de validação, fluxos, checklist de ambiente e baseline de métricas.

### F1 — Criar o núcleo jurídico e o sigilo por caso

Responsáveis: engenharia e QA; validação por produto/advogado.

- [x] F1.01 Criar casos, partes, vínculos com clientes, responsáveis e processos cadastrados manualmente.
- [x] F1.02 Manter negociação separada; conversão idempotente cria caso sem perder histórico.
- [x] F1.03 Adicionar OAB/UF e papéis jurídicos sem concessão automática de privilégio.
- [x] F1.04 Implementar acesso por escritório, caso e categoria documental em backend/storage.
- [x] F1.05 Criar linha do tempo manual, próxima providência e auditoria de alterações.
- [x] F1.06 Definir retenção, bloqueio de exclusão por necessidade de preservação e acesso de suporte auditado.
- [x] F1.07 Migrar de forma aditiva; conferir contagens, relações e reversão de leitura por feature flag.
- [x] F1.08 Criar navegação jurídica sem rótulos clínicos e comerciais inadequados.

Entrega técnica em 11/09/2026: [escopo, preservação, suporte e evidências](FASE_1_NUCLEO_JURIDICO.md).
Retenção sem descarte automático e suporte por participação explícita/revogação
manual; regras de prazo e contratos dependem da validação de F0.

Saída: um cliente com dois casos e dois processos pode ser acompanhado sem
misturar históricos. Assistente sem autorização não acessa laudo por URL direta,
API, busca, exportação ou IA. Cliente A e escritório B não veem o caso do cliente C.
Evidências: testes adversariais de acesso, demonstração com dados sintéticos e
comparação da migração. Cobertura: J01, J07, J09 e J29.

### F2 — Transformar atendimento em contratação e trabalho jurídico

- [x] F2.01 Adaptar funil, serviços jurídicos e motivos de encerramento.
- [x] F2.02 Criar entrevistas versionadas por especialidade e verificação de conflitos.
- [x] F2.03 Implementar solicitação/upload seguro e revisão de documentos.
- [x] F2.04 Criar contratos, procurações e propostas com versões e aprovador.
- [ ] F2.05 Integrar assinatura: convite autorizado, callback idempotente, evidências e original assinado.
- [x] F2.06 Adaptar agenda para consultas, audiências e diligências; homologar Google Calendar se contratado.
- [x] F2.07 Criar modelos de tarefas e distribuição por responsável/substituto.
- [x] F2.08 Validar mensagens e formulários públicos; remover campos e dados pessoais de URLs públicas.

Entrega técnica em 11/09/2026: [operação, coleta segura e evidências](FASE_2_OPERACAO_JURIDICA.md).
F2.05 depende de provedor; F2.06 entrega agenda interna, com calendário externo
condicionado à contratação/habilitação. Pendências reunidas em EXECUCAO_CONTINUA.md.

Saída: contato → contratação → documentos → caso aberto funciona de ponta a ponta.
Callbacks repetidos não duplicam caso/assinatura. Link expirado não abre documento.
Cancelamento de compromisso e revogação de procuração propagam o estado correto.
Cobertura: J02–J05, J15, J16, J19 e J20.

### F3 — Entregar o piloto assistido de isenção de IR

- [x] F3.01 Implementar triagem com estados: incompleta, revisão jurídica, enquadramento proposto, decisão registrada.
- [x] F3.02 Cadastrar rendimentos, pagadores e benefícios sem agregar todos como isentos.
- [x] F3.03 Montar cronologia de doença, laudo, benefício e retenções com documentos de origem.
- [x] F3.04 Criar catálogo versionado de hipóteses e checklist por rota/pagador.
- [x] F3.05 Implementar dossiê médico/fiscal, revisão de laudos e pendências objetivas.
- [x] F3.06 Registrar mandato e representante; revogação remove acesso futuro.
- [x] F3.07 Criar resumo do caso e plano de atuação preenchidos/revisados pelo advogado.
- [x] F3.08 Oferecer coleta acessível em celular e atendimento humano para quem não conclui sozinho.
- [ ] F3.09 Executar os cenários da seção 6.1 com dados sintéticos antes do piloto consentido/autorizado.

Entrega técnica: [dossiê, testes e publicação](FASE_3_DOSSIE_ASSISTIDO_IR.md).
F3.09 tem cenários de dossiê/revisão/acesso executados; cenários de valores,
declarações, períodos e conciliação seguem em F4, com homologação P03 pendente.

Saída M1: o escritório atende e organiza um caso IR completo, com revisão humana
e protocolos registrados como evento auditado com comprovante anexado. O acompanhamento
estruturado por pedido/pagador será entregue em F4. Nenhuma dependência de API da Receita ou INSS.
Toda proposta de enquadramento mostra rendimento, evidência, fundamento e revisor.
Cobertura: IR01–IR10. Cálculo automático e promessa de restituição ficam fora de M1.

### F4 — Estruturar cálculos, pedidos e resultados de IR

- [x] F4.01 Importar planilha/informe revisável e organizar competências, anos-calendário e exercícios.
- [x] F4.02 Implementar motor decimal versionado, parâmetros por exercício e memória de cálculo.
- [x] F4.03 Registrar marcos e análise de períodos recuperáveis, com alertas revisados pelo advogado.
- [x] F4.04 Gerir declarações originais/retificadoras, recibos, situações e evidências, sem transmissão automática presumida.
- [x] F4.05 Criar pedidos por fonte pagadora com protocolos e decisões independentes.
- [x] F4.06 Criar fluxo judicial independente e avaliação registrada de competência, legitimidade e estratégia.
- [x] F4.07 Distribuir exigências e recursos; prazos informados manualmente são marcados como tais.
- [x] F4.08 Acompanhar cessação real em folha/benefício e conciliar restituições por período.
- [x] F4.09 Registrar vínculo entre pedidos sobrepostos e bloquear dupla apropriação de valores.
- [ ] F4.10 Homologar cálculos com advogado e profissional fiscal responsável, usando valores esperados independentes.

Saída: cálculo reproduzível, decisões por pagador, pacote de documentos revisado e
conferência de resultado. Valor estimado não aparece como recebido nem como direito
reconhecido. Controles de cálculo detalhados na seção 10. Cobertura: IR11–IR20.

### F5 — Cuidar do cliente e do financeiro do caso

- [ ] F5.01 Publicar portal com autorização por caso e acesso individual do representante.
- [ ] F5.02 Disponibilizar status compreensível, pendências, documentos liberados e agenda.
- [ ] F5.03 Criar comunicações por evento com aprovação e comprovante de entrega/falha.
- [ ] F5.04 Implementar honorários e base de êxito conforme contrato, separado de valores do cliente.
- [ ] F5.05 Controlar custas, reembolsos, adiantamentos e repasses com conciliação.
- [ ] F5.06 Integrar cobrança contratada e tratar duplicação, estorno e pagamento parcial.
- [ ] F5.07 Implementar colaboração com contador e exportações mínimas por caso.
- [ ] F5.08 Programar acompanhamento anual e alertas de retenção reaberta.
- [ ] F5.09 Criar Meu dia e fila de clientes aguardando resposta.

Saída M2: caso acompanhado até resultado financeiro e prestação de contas.
Cliente recebe atualização autorizada; status “entregue” depende de recibo do
canal, não somente HTTP 200. Cobertura: J06, J17, J25–J27, IR10 e IR20–IR23.

### F6 — Conectar monitoramento e prazos com confiabilidade

- [ ] F6.01 Homologar fonte judicial com contrato/permissão e cobertura do piloto definidos.
- [ ] F6.02 Implementar fila durável, limite por provedor/escritório, reprocessamento e deduplicação.
- [ ] F6.03 Importar por número CNJ e monitorar processos/publicações por OAB.
- [ ] F6.04 Guardar fonte original, instante de captura e atualização; detectar falha e atraso.
- [ ] F6.05 Associar publicação ao processo com revisão de ambiguidades e homônimos.
- [ ] F6.06 Criar triagem, distribuição e substituição de responsável por intimação.
- [ ] F6.07 Implementar cálculo assistido de prazo com calendário e memória de contagem versionados.
- [ ] F6.08 Disponibilizar cobertura por tribunal e ação manual de conferência quando a fonte falhar.
- [ ] F6.09 Ensaiar queda de provedor, timeout, evento fora de ordem e retomada sem efeitos duplicados.

Saída: evento externo → persistência → conferência → tarefa/prazo funciona com
rastreabilidade. Após F5, homologar também a comunicação autorizada ao cliente.
Nenhum prazo publicado como definitivo sem
fonte e revisão. Cobertura: J08–J11, J13, J14 e primeira versão de J30.

### F7 — Acrescentar OCR, pesquisa e IA com revisão

- [ ] F7.01 Implementar OCR de informes, contracheques e provas com referência à página e confiança.
- [ ] F7.02 Criar biblioteca de modelos/jurisprudência com origem e versão.
- [ ] F7.03 Gerar rascunhos de cronologia, resumo, mensagem e peça com citações recuperáveis.
- [ ] F7.04 Impedir invenção de dados ausentes; destacar fatos não comprovados e divergências.
- [ ] F7.05 Aplicar autorização antes da recuperação de documentos; revogação invalida acesso/indexação.
- [ ] F7.06 Separar assistente interno do advogado e assistente voltado ao cliente.
- [ ] F7.07 Avaliar vazamento entre casos, instruções maliciosas em anexos e fidelidade das referências.
- [ ] F7.08 Configurar cotas/custos e alternativa manual quando IA estiver indisponível.

Saída M3: tarefas assistidas ganham tempo com avaliação registrada. IA não é motor
tributário; cálculos vêm do serviço determinístico aprovado. Nenhum envio, ciência
ou petição ocorre porque uma instrução dentro de um PDF pediu. Cobertura: J21–J24 e IR11.

### F8 — Expandir operações e especialidades

- [ ] F8.01 Integrar Domicílio para instituições habilitadas, separando consulta e ato de ciência.
- [ ] F8.02 Homologar conectores adicionais tribunal a tribunal e operação a operação.
- [ ] F8.03 Avaliar peticionamento assistido somente com canal autorizado, assinatura e recibo verificável.
- [ ] F8.04 Disponibilizar correspondentes e parceiros com acesso limitado e encerramento automático do acesso.
- [ ] F8.05 Criar acompanhamento de sucessores com validação de representação.
- [ ] F8.06 Publicar pacotes de especialidade adicionais conforme demanda dos pilotos.
- [ ] F8.07 Avaliar INSS, cartórios e outros serviços por disponibilidade contratual/técnica real.

Saída: tabela de cobertura atualizada, credenciais segregadas e pilotos por conector.
Não registrar “protocolado” sem recibo; resposta ambígua exige reconciliação antes de
nova tentativa. Cobertura: J10, J12, J16, J18 e IR24.

### F9 — Validar escala e ampliar a comercialização

- [ ] F9.01 Criar indicadores gerais e específicos IR, medindo resultado efetivo.
- [ ] F9.02 Medir custo por escritório/caso: infra, monitoramento, armazenamento, assinatura, mensagens e IA.
- [ ] F9.03 Executar teste de carga representativo e corrigir gargalos antes de aumentar réplicas.
- [ ] F9.04 Homologar restauração de banco e documentos; medir perda e tempo de recuperação.
- [ ] F9.05 Definir planos comerciais por equipe, casos/processos e consumo, com limites transparentes.
- [ ] F9.06 Criar importação assistida, treinamento, suporte e exportação de dados no encerramento.
- [ ] F9.07 Ampliar gradualmente os escritórios após estabilidade e revisão dos indicadores.
- [ ] F9.08 Registrar plano de resposta a incidentes, plantão operacional e manutenção de fontes/regras.

Saída M4: metas da seção 13 atendidas no piloto, custos conhecidos e recuperação
demonstrada. Cobertura: J28, conclusão de J30 e IR25. O produto não terá promessa
de “toda a Justiça”, “ganho garantido” ou consulta em tempo real sem evidência.

## 8. Modelo de dados proposto

Nomes abaixo são sugestões de modelagem, não tabelas já existentes. Reutilizar o
cadastro de clientes e o isolamento por `tenant_id`; manter uma única origem para
identidade e vínculos. Relações devem impedir vínculo entre escritórios diferentes.

| Grupo | Entidades sugeridas | Regras principais |
| --- | --- | --- |
| Núcleo | `legal_cases`, `case_parties`, `case_members`, `case_events` | Caso independente do funil; vários clientes/partes; histórico auditável |
| Processos | `judicial_proceedings`, `proceeding_events`, `publications` | Número CNJ normalizado; origem, órgão/grau e eventos sem sobrescrita cega |
| Trabalho | `legal_deadlines`, `deadline_reviews`, `legal_calendars`, `case_tasks` | Data original, regra, versão do calendário, memória e aprovação |
| Documentos | `case_documents`, `document_versions`, `document_access_grants`, `signature_envelopes` | Original preservado; versões imutáveis; grants revogáveis |
| Cliente | `client_portal_memberships`, `representation_grants` | Mesmo familiar não recebe acesso global por compartilhar telefone |
| IR | `ir_case_assessments`, `ir_income_sources`, `ir_benefits`, `ir_medical_evidence` | Doença, benefício, fonte e enquadramento distintos |
| Fiscal | `ir_income_entries`, `ir_tax_returns`, `ir_calculation_versions`, `ir_calculation_lines` | Ano-calendário/exercício/competência separados; valores decimais |
| Pedidos | `ir_claims`, `ir_claim_events`, `ir_outcomes`, `ir_recoveries` | Rotas e resultados por pagador/período; vínculo de sobreposição |
| Financeiro | `fee_agreements`, `case_invoices`, `case_expenses`, `client_fund_entries` | Dinheiro do cliente distinto de receita e billing da plataforma |
| Conectores | `provider_connections`, `provider_jobs`, `provider_events`, `provider_usage` | Credencial por escopo; outbox, idempotência e controle de custo |
| Governança | `legal_rule_versions`, `approval_records`, `audit_events`, `retention_holds` | Alteração de regra exige revisão; retenção por finalidade |

Chaves de deduplicação externas incluem provedor, escritório, recurso, evento e
versão quando disponível. Não depender só de nome de pessoa ou texto da publicação.
Índices e políticas devem acompanhar filtros reais: escritório, caso, responsável,
estado, próxima ação e data do evento. Adotar constraints e testes de relações.

## 9. Proteção de documentos e acesso

Matriz inicial a validar em F0; “administrador” não significa acesso irrestrito a
documentação médica ou autorização automática para agir como cliente.

| Papel | Acesso padrão proposto |
| --- | --- |
| Advogado do caso | Dados e documentos concedidos ao caso; revisão jurídica |
| Revisor jurídico | Casos atribuídos para revisão e respectivas evidências |
| Assistente | Cadastro, tarefas e pendências; saúde/fiscal somente por concessão explícita |
| Financeiro | Contratos, cobranças e repasses; laudos médicos fora do acesso padrão |
| Contador convidado | Pacote fiscal autorizado, temporário e auditado |
| Cliente | Próprios casos e documentos liberados pelo escritório |
| Representante | Casos e ações abrangidos pela representação válida |
| Suporte da plataforma | Metadados operacionais; acesso excepcional temporário, justificado e auditado |

Controles de implementação:

- Autorizar no servidor cada download, exportação, busca, indexação e solicitação à IA.
- URLs assinadas curtas; armazenamento privado; validar tipo/tamanho e verificar anexos.
- Criptografia em trânsito, proteção em repouso e gestão de chaves/segredos fora do código.
- Não colocar diagnóstico, CPF, laudo, senha, token ou conteúdo de mensagem em logs/URLs.
- Não coletar senha gov.br/e-CAC/Meu INSS do cliente. Usar delegação autorizada,
  canais oficialmente habilitados ou operação manual pelo usuário responsável.
- Bases legais e responsabilidades definidas por finalidade; consentimento não será
  usado como justificativa universal para todos os tratamentos.
- Retenção e descarte aprovados, com bloqueio por necessidade de preservação;
  expiração de log operacional não apaga prova do caso.
- Promover anexos relevantes do chat ao dossiê com ciclo de vida próprio; excluir
  conversa ou expirar mídia não pode apagar silenciosamente a prova preservada.
- A auditoria registra ação, identificador, versão/hash, ator e justificativa;
  não replica o conteúdo médico em diffs nem em eventos de telemetria.
- MFA para papéis privilegiados, revogação de sessões e auditoria de acesso excepcional.
- Mensagens externas usam conteúdo mínimo e link seguro, especialmente para saúde.

## 10. Requisitos do cálculo de IR e da conciliação

O motor terá entradas estruturadas, regras versionadas e saídas reproduzíveis.
Não usar a soma de IR retido como valor automaticamente recuperável.

Entradas: fonte/benefício, natureza do rendimento, competência, valores brutos,
tributáveis e retidos, décimo terceiro quando aplicável, deduções relevantes,
declaração original, pagamentos, restituições anteriores, marcos aprovados e
limites legais aplicáveis ao exercício. Registrar documento/página de cada entrada.

Processo proposto:

1. Importar valores como rascunho e confrontar totais com informes/documentos.
2. Resolver campos ausentes e divergências com responsável, sem preencher por palpite.
3. Classificar cada rendimento e período sob uma regra aprovada.
4. Reconstruir o cálculo aplicável ao exercício/categoria, incluindo rendimentos
   que permanecem tributáveis e efeitos de declarações/recebimentos anteriores.
5. Separar apuração anual, tributação exclusiva e demais tratamentos pertinentes.
6. Calcular diferença entre cenários comparáveis e documentar pagamentos/créditos
   que já satisfizeram a pretensão; correção monetária depende de regra específica.
7. Submeter memória, fundamento e períodos ao profissional responsável.
8. Versionar a aprovação e gerar demonstrativo sem substituir declarações/protocolos oficiais.
9. Conciliar decisão, cessação e recebimento; somente comprovante efetivo baixa saldo.

Estados: `rascunho`, `incompleto`, `em_revisao`, `aprovado`, `substituido`.
Alterar qualquer entrada ou regra gera nova versão e invalida a aprovação anterior
para novos atos. Versões já usadas em protocolo permanecem preservadas.

Critérios de aceite:

- Reprodução exata com mesmas entradas/regras; precisão e arredondamento explicitados.
- Valores esperados independentes, aprovados pelo especialista fiscal/jurídico.
- Testes de múltiplas fontes, rendimentos mistos, 13º, retificação prévia,
  restituição parcial, pagamentos anteriores, períodos limítrofes e dados faltantes.
- Reconciliação não duplica pedido/recebimento em reenvio de webhook ou importação.
- Estimativa comercial, cálculo aprovado, decisão e recebimento têm rótulos distintos.

## 11. Estratégia de integrações

| Fonte/serviço | Uso proposto | Condição de entrada e alternativa | Fase |
| --- | --- | --- | --- |
| WhatsApp/e-mail | Atendimento e avisos | Conta da operação, autorização e recibos; alternativa portal | F0/F5 |
| Assinatura | Contratos e procurações | Provedor contratado, evidências e webhook; upload de assinatura externa validada | F2 |
| Google Calendar | Compromissos | OAuth e escopos mínimos; calendário interno como origem definida | F2 |
| Receita/e-CAC/Meu IR | Documentos, declarações e recibos | Operação assistida/manual primeiro; API comercial não confirmada | F4 |
| INSS/RPPS/pagadores | Pedidos e exigências | Canal e representação por instituição; registro manual com comprovante | F4/F8 |
| DataJud | Metadados processuais | Termos atuais restringem exploração comercial; depende de autorização compatível antes do uso no SaaS | F6 |
| Provedor comercial judicial | OAB, processos e movimentações | Contrato/licença, cobertura, custo e limites; piloto antes de expandir | F6 |
| DJEN | Publicações | Validar acesso, condições, cobertura e atraso; conferência na fonte quando falhar | F6 |
| STJ/STF/TST | Pesquisa e referências | STJ possui dados abertos; demais fontes conforme acesso efetivamente validado | F7 |
| Domicílio Judicial | Comunicações de instituições | CNPJ habilitado, credenciais e aprovações; consulta não implica ciência automática | F8 |
| PJe/eproc/e-SAJ | Consulta e eventual protocolo | Homologação por tribunal/operação; MNI não é passe universal de acesso | F6/F8 |
| Cartórios e outros órgãos | Diligências especializadas | Confirmar serviço, custo, procuração e canal; sem promessa de API universal | F8 |
| Cobrança/pagamento | Honorários e conciliação | Conta do escritório, contrato e callbacks verificados | F5 |

SISBAJUD, RENAJUD e outros instrumentos restritos não serão apresentados como
ferramentas de consulta geral disponíveis ao escritório. Uma integração só entra
no catálogo público depois de comprovar público elegível e operações permitidas.
API de assinatura gov.br também não será presumida disponível para SaaS comercial.

Cada conector precisa de ficha: dono, finalidade, autorização/contrato, escopos,
cobertura, frequência, custo, limite, tratamento de sigilo, revogação, alternativa
manual e evidências de homologação. Referências S11–S17.

## 12. Arquitetura e operação no Railway

Preservar React/Vite, Postgres, Supabase Auth/REST/Storage e a separação existente
de web, funções e scheduler. Não decompor tudo em novos serviços antes de medir.

Evolução por etapa:

- F0/F1: homologação isolada, configuração por ambiente, backups restauráveis,
  storage privado, auditoria, migrações aditivas e feature flags por escritório.
- F4: cálculo determinístico independente de IA; execução rastreável e exportação
  da memória; arquivos derivados preservam vínculo com o original.
- F6: fila persistida inicialmente em Postgres com reserva atômica, lease,
  expiração, retentativa com espera progressiva, outbox e fila de falhas.
- F6/F7: separar trabalho pesado de OCR/IA/monitoramento do atendimento síncrono;
  concorrência por provedor e escritório impede que um cliente monopolize a fila.
- Não adicionar monitoramento lento ao ciclo sequencial atual de atendimento;
  workers dedicados consomem a fila sem atrasar mensagens e lembretes existentes.
- F9: decidir Redis, filas externas, réplicas de leitura ou HA por evidência de
  volume, conexões e recuperação; não tratá-los como já provisionados.

Projetar processamento com reentrega e efeitos idempotentes. Ciência, assinatura,
protocolo e cobrança exigem verificação de estado antes de repetir uma operação
cuja resposta ficou incerta. Um lock em memória não protege múltiplas réplicas.

Métricas: latência de requisição, falha por operação, idade do job mais antigo,
última captura bem-sucedida, custo por provedor/escritório, saturação do pool,
tamanho de documentos e duração de OCR/cálculo. Não incluir conteúdo sensível.

Release futuro: testes → homologação → aprovação do marco → deploy → status
terminal `SUCCESS` → validação específica com persistência/recibo. Reversão por
flag e versão compatível; não usar rollback destrutivo que apague casos/documentos.

## 13. Qualidade, indicadores e critérios do piloto

Metas propostas, não resultados já alcançados. Medir baseline em F0 e confirmar
viabilidade com os pilotos antes de transformar metas em SLA comercial.

| Indicador | Meta inicial proposta | Como medir |
| --- | --- | --- |
| Casos ativos com dono/próxima ação | 100%, ou espera justificada | Consulta diária de casos |
| Cálculos publicados com revisão | 100% | Versão, aprovador e entradas vinculadas |
| Eventos importados com procedência | 100% | Fonte + identificador + data de captura |
| Vazamento entre escritórios/casos | Zero nos cenários de homologação | Testes adversariais em API/storage/busca/IA |
| Menos trabalho para atualizar clientes | Redução de 30% frente ao baseline | Tempo amostral por caso/semana |
| Documentação completa no primeiro ciclo | Melhora de 20% frente ao baseline | Checklist concluído sem nova solicitação |
| Divergência de cálculo inexplicada | Zero nos casos de referência aprovados | Confronto independente e revisão |
| Efeitos duplicados de integração | Zero na bateria de reentrega/falha | Simulação e reconciliação persistida |
| Experiência interna | p95 abaixo de 2 s em consultas comuns | Carga acordada; terceiros medidos separadamente |
| Recuperação | RPO/RTO medidos antes do lançamento | Exercício de restauração de banco e documentos |

Piloto sugerido: três escritórios e pelo menos vinte casos representativos no
conjunto, iniciando com dados sintéticos e depois dados reais autorizados. Esse
volume ajuda a validar operação; não demonstra correção jurídica universal.

Testes por camada: migrações e constraints; autorização negativa; cálculo com
referência independente; contratos dos provedores; jornada no navegador/celular;
acessibilidade; falhas/reentrega; restauração. Build verde e resposta HTTP 200 não
comprovam entrega de mensagem, protocolo, recebimento ou capacidade de escala.

## 14. Riscos, custos e decisões em aberto

| Risco/decisão | Tratamento no plano | Dono |
| --- | --- | --- |
| Regra jurídica/fiscal muda | Versões, fonte, revisão periódica e impacto nos casos existentes | Jurídico + produto |
| Fonte impede uso comercial | Validar autorização/licença e alternativa antes de implementar | Produto + jurídico |
| Monitoramento falha | Cobertura visível, alerta de atraso e conferência manual | Engenharia + operação |
| Dado médico exposto | ACL por caso/categoria, storage privado e testes negativos | Segurança + engenharia |
| Cálculo/retificação incorretos | Entradas rastreáveis, referência independente e revisão | Jurídico/fiscal |
| Caso misturado com venda | Domínio jurídico separado, conversão e migração auditáveis | Engenharia |
| API/OCR/IA custa mais que a assinatura | Cotas, medição unitária, alertas e planos por consumo | Produto + financeiro |
| Cliente tem dificuldade digital | Acessibilidade, fluxo assistido e representante autorizado | Design + atendimento |
| Integração cria efeito duplicado | Idempotência, reconciliação e confirmação de estado incerto | Engenharia |
| Backup existe, restauração falha | Exercício periódico com banco e arquivos | Operação |

Decisões a registrar durante F0, sem bloquear a elaboração deste roteiro:

- [ ] O nome comercial continuará AdvocaCHAT? Qual domínio definitivo?
- [ ] O primeiro foco é doença grave? Quais outras hipóteses de isenção serão necessárias?
- [ ] Quais três escritórios, pagadores e tribunais formarão o piloto?
- [ ] Quem aprova regras jurídicas e quem homologa cálculos/declarações?
- [ ] Qual equipe, disponibilidade e teto mensal de infraestrutura/provedores?
- [ ] Qual provedor de assinatura, monitoramento, pagamento e mensagens será contratado?
- [ ] Qual prazo de retenção por finalidade e quais metas de recuperação serão contratadas?
- [ ] Quais dados existentes devem ser migrados e quais precisam apenas permanecer consultáveis?

Modelo comercial a experimentar: assinatura por escritório com equipe/casos
incluídos e franquias de monitoramento, assinatura e IA. Separar custo do software
dos honorários cobrados pelo advogado. Não precificar antes de medir custo por caso.

## 15. Como seguiremos este documento

Em 11/09/2026, o usuário direcionou a execução para **F1, a primeira fase de
implementação**. O núcleo jurídico foi construído e publicado; o detalhamento e
as evidências estão em [Entrega da fase 1](FASE_1_NUCLEO_JURIDICO.md). F0 continua
pendente nas decisões de negócio, validação jurídica e recuperação integral.
O usuário autorizou continuar automaticamente até F9 e reunir as dependências
externas ao final. F2–F4 têm entregas técnicas verificadas; F5 está
em implementação. O [registro contínuo](EXECUCAO_CONTINUA.md) acompanha as
pendências sem confundir publicação técnica com homologação profissional.
Mudanças de escopo entram aqui com justificativa e efeito em dependências/custo.

Estados de acompanhamento: `planejado`, `pronto_para_execucao`, `em_execucao`,
`em_validacao`, `concluido`, `bloqueado`. Marcar um checkbox somente após comprovar
o critério; implementação local, deploy e homologação são evidências distintas.

| Fase | Estado atual | Responsável nominal | Evidências/pendências |
| --- | --- | --- | --- |
| F0 | planejado | A definir | Validar recorte IR, piloto e ambiente |
| F1 | concluido | Codex (implementação técnica) | [Entrega, testes e implantação](FASE_1_NUCLEO_JURIDICO.md); validação de negócio/jurídica dos pilotos permanece em F0 |
| F2 | em_validacao | Codex (implementação técnica) | [Entrega técnica verificada](FASE_2_OPERACAO_JURIDICA.md); assinatura P01 e calendário externo P02 pendentes |
| F3 | em_validacao | Codex (implementação técnica) | [Dossiê, SQL, API e navegador publicado verificados](FASE_3_DOSSIE_ASSISTIDO_IR.md); cenários fiscais seguem em F4, homologação P03 pendente |
| F4 | em_validacao | Codex (implementação técnica) | [Cálculos, pedidos, SQL, API e navegador verificados](FASE_4_CALCULOS_PEDIDOS_E_RESULTADOS.md); homologação profissional F4.10 permanece P03 |
| F5 | em_execucao | Codex (implementação técnica) | [Arquitetura e contratos](FASE_5_ARQUITETURA.md); portal, comunicação, financeiro e rotina em implementação |
| F6 | planejado | A definir | Fonte habilitada e cobertura definida |
| F7 | planejado | A definir | Dados autorizados e conjunto de avaliações |
| F8 | planejado | A definir | Habilitações e demanda dos pilotos |
| F9 | planejado | A definir | Métricas, carga e recuperação comprovadas |

Modelo de ticket:

```text
ID: F1.01
Funcionalidades relacionadas: J01, J07
Problema e comportamento esperado:
Escopo incluído e limites:
Dependências:
Responsável:
Dados/permissões envolvidos:
Critérios de aceite verificáveis:
Plano de migração/reversão:
Validação e evidências:
Commit publicado:
Implantação/ambiente e verificação:
Pendências:
```

Ao implementar: preservar trabalho não relacionado, inspecionar branch/worktree,
diff, commits e remoto; publicar somente a alteração da tarefa em `origin/main` e
verificar o SHA remoto. Registrar neste roteiro as entregas e limitações reais.
Manter o alerta sonoro global do Codex habilitado.

## 16. Fontes e manutenção das regras

Fontes consultadas em **11/09/2026**; revisão obrigatória antes de implementar
regras, credenciar conectores ou ampliar sua cobertura. Links são referências,
não evidência de que a integração já está ativa.

- **S01** — [Receita Federal: isenção para portadores de moléstia grave](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/molestia-grave).
- **S02** — [PGFN: isenção por moléstia grave](https://www.gov.br/pgfn/pt-br/cidadania-tributaria/por-assunto/imposto-de-renda-pessoa-fisica-irpf-2/isencao-por-molestia-grave). Referência atual para rendimentos, previdência complementar e acesso à via judicial.
- **S03** — [Receita: retificação de exercícios anteriores na isenção](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/imposto-de-renda/dirpf/isencao/como-retificar-as-declaracoes-de).
- **S04** — [STJ: Súmula 598, prova judicial da moléstia grave](https://scon.stj.jus.br/SCON/pesquisar.jsp?b=SUMU&i=1&inde=&l=100&livre=sumula+598&operador=e&ordenacao=MAT%2CTIT%2CORD&p=true&thesaurus=JURIDICO).
- **S05** — [STJ: Tema 1037, rendimentos de atividade laboral](https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?cod_tema_final=1037&cod_tema_inicial=1037&novaConsulta=true&tipo_pesquisa=T).
- **S06** — [Receita: declaração retificadora](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/retificadora) e [CTN, arts. 165–169](https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm).
- **S07** — [STJ: alcance da isenção e Súmula 627](https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/11042021-STJ-define-alcance-da-isencao-tributaria-para-portadores-de-doencas-graves.aspx).
- **S08** — [Receita: situações específicas, incluindo aposentadoria e 65 anos](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/manual-mir/situacoes-especificas).
- **S09** — [LGPD, especialmente arts. 5º e 11](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm).
- **S10** — [OAB: Provimento 205/2021](https://www.oab.org.br/leisnormas/legislacao/provimentos/205-2021).
- **S11** — [DataJud: termo de uso](https://datajud-wiki.cnj.jus.br/api-publica/termo-uso/) e [glossário](https://datajud-wiki.cnj.jus.br/api-publica/glossario/). Termos publicados restringem uso/exploração comercial; não pressupor licença para SaaS.
- **S12** — [CNJ: Domicílio Judicial Eletrônico](https://docs.pdpj.jus.br/servicos-negociais/domicilio-judicial-eletronico/) e [GeCli](https://docs.pdpj.jus.br/servicos-negociais/GeCli/).
- **S13** — [PJe: MNI Client](https://docs.pje.jus.br/servicos-auxiliares/servico-mni-client/) e [TRF2: Balcão Jus](https://www.trf2.jus.br/trf2/artigo/coport/balcao-jus).
- **S14** — [STJ: dados abertos](https://dadosabertos.web.stj.jus.br/).
- **S15** — [Escavador: documentação de monitoramento](https://api.escavador.com/v2/docs/monitoramento-de-processos). Exemplo de provedor a avaliar; sem contratação definida.
- **S16** — [CNJ: Comunicações Processuais/DJEN](https://www.cnj.jus.br/programas-e-acoes/processo-judicial-eletronico-pje/comunicacoes-processuais/).
- **S17** — [gov.br: termos do serviço de integração de identidade digital](https://www.gov.br/governodigital/pt-br/estrategias-e-governanca-digital/transformacao-digital/ferramentas/autenticacao-gov.br/termo-de-uso-do-servico-de-integracao-com-a-conta-gov.br).
- **S18** — [Meu INSS: solicitar isenção de Imposto de Renda](https://www.gov.br/pt-br/servicos/solicitar-isencao-do-imposto-de-renda?id=3038&origem=servico).
- **S19** — [PGFN: Parecer SEI 212/2025, previdência complementar/VGBL](https://www.gov.br/pgfn/pt-br/assuntos/representacao-judicial/documentos-portaria-502/parecer-sei-no-212-2025-redlit.pdf).
- **S20** — [STJ: Tema 250, rol legal de doenças](https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?cod_tema_final=250&cod_tema_inicial=250&novaConsulta=true&tipo_pesquisa=T).
- **S21** — [Lei 7.713/1988, art. 6º](https://www.planalto.gov.br/ccivil_03/leis/l7713.htm).
- **S22** — [Receita: perguntas frequentes de IR, seção Isenção](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/imposto-de-renda/dirpf).
- **S23** — [STF: Tema 1373, requerimento administrativo prévio](https://portal.stf.jus.br/jurisprudenciaRepercussao/tema.asp?num=1373). Conferir junto à orientação atual de S02.

## 17. Histórico do plano

| Data | Versão | Alteração |
| --- | --- | --- |
| 11/09/2026 | 1.0 | Plano inicial: 30 funcionalidades jurídicas, 25 da especialidade IR, fases F0–F9, critérios e dependências |
| 11/09/2026 | 1.1 | Execução de F1 a pedido do usuário: núcleo jurídico, cofre por categoria, proteção dos perfis e migração aditiva; F0 não encerrada |

| 11/09/2026 | 1.2 | Entrega técnica F2: instrumentos, coleta privada, tarefas e agenda; provedores externos pendentes |
| 11/09/2026 | 1.3 | Entrega técnica F3: dossiê IR, fontes e rendas distintas, análise humana e representação |
| 11/09/2026 | 1.4 | F4 publicada e verificada com cálculos decimais, pedidos e conciliação; avanço automático para F5 |
