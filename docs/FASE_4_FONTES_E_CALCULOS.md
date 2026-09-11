# F4 — Fontes e cenários de cálculo para homologação

**Conferência em 11/09/2026. Estado: preparação técnica; parâmetros e resultados ainda dependem de homologação jurídica/fiscal P03.**

Este documento prepara F4.01–F4.10 do [plano](PLANO_PLATAFORMA_JURIDICA_E_ISENCAO_IR.md). Não implementa um motor fiscal, não reconhece crédito e não autoriza transmissão de declarações ou pedidos. O enquadramento e seus documentos permanecem no [dossiê F3](FASE_3_FONTES_E_CENARIOS.md); aqui se acrescentam critérios para cálculos verificáveis e acompanhamento por pedido.

## 1. Fontes primárias e alcance

| ID | Fonte | Conferência e aplicação |
| --- | --- | --- |
| F4-S01 | [Receita — Tributação de 2025](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025) | Atualizada em 27/04/2026. Tabelas mensais distintas em janeiro–abril e maio–dezembro de 2025; tabela anual do exercício 2026, ano-calendário 2025. |
| F4-S02 | [Receita — Tributação de 2026](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026) | Atualizada em 27/04/2026. Incidência/redução mensal desde janeiro de 2026; incidência/redução anual no exercício 2027, ano-calendário 2026. |
| F4-S03 | [Receita — Exemplos da Lei 15.270/2025](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025) | Atualizada em 04/03/2026. Cinco resultados oficiais independentes, reproduzidos apenas como entradas e valores esperados abaixo. |
| F4-S04 | [Lei 15.270/2025](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm) | Consultada em 11/09/2026. Lei 9.250: arts. 3º-A, 11-A, 16-A e 16-B. Reduções, 13º e tributação mínima têm contratos diferentes. |
| F4-S05 | [Receita — Restituição na isenção](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/imposto-de-renda/dirpf/isencao/como-requerer-a-restituicao-do) | Atualizada em 17/07/2024. Distingue ano corrente, declarações anteriores e quotas pagas. |
| F4-S06 | [Receita — Solicitar ou compensar crédito de IRPF](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/restituicao-ressarcimento-reembolso-e-compensacao/creditos/retencao/beneficiario/pf/irpf/como-solicitar-ou-compensar-o-credito) | Atualizada em **30/07/2026**. Distingue DIRPF, devolução pela fonte, 13º/RRA e outras retenções exclusivas. O caminho válido inclui `orientacao-tributaria`. |
| F4-S07 | [CTN compilado — arts. 165, 165-A, 168 e 170-A](https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm) | Consultado em 11/09/2026. O marco do prazo depende da hipótese; não autoriza selecionar automaticamente os últimos cinco anos civis. |
| F4-S08 | [LC 236, de 04/09/2026](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp236.htm) | Art. 3º: vigência na publicação; portal indica DOU de 04/09/2026, edição extra. Alteração muito recente a incluir na homologação de prazos e atualização. |
| F4-S09 | [IN RFB 2.055/2021, texto anotado](https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=122002&visao=anotado) | Arts. 148–149 identificados no conteúdo oficial indexado: marcos distintos de juros. A abertura direta não forneceu texto legível nesta sessão; conferir integral e alterações antes de aprovar parâmetros. |
| F4-S10 | [Receita — Perguntas e Respostas IRPF 2026, versão de 23/04/2026](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf) | Fonte oficial localizada para conferência fiscal detalhada de quotas, retificação e juros. Nesta preparação foi conferido o trecho indexado de retificação com redução do imposto; o manual integral não foi revisado. |

## 2. Separação dos períodos e da natureza do cálculo

O registro deve ter **data do pagamento, competência informada, ano-calendário e exercício** separados. Não inferir a tabela somente pelo ano no título de um informe ou pela data de elaboração do cálculo.

| Contrato | Seleção correta de parâmetros |
| --- | --- |
| Pagamento mensal em abril de 2025 | Jan–abr/2025; desconto simplificado máximo de R$ 564,80. [F4-S01](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025) |
| Pagamento mensal em maio de 2025 | Desde mai/2025; desconto simplificado máximo de R$ 607,20. A redução criada para 2026 não se aplica. [F4-S01](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025) |
| Declaração do exercício 2026 | Ano-calendário 2025; teto anual simplificado de R$ 16.754,34. [F4-S01](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025) |
| Declaração do exercício 2027 | Ano-calendário 2026; teto anual simplificado de R$ 17.640,00. [F4-S02](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026) |

O motor deve distinguir rendimento tributável antes das deduções, deduções admitidas, base da tabela progressiva, imposto antes da redução e redução limitada. A variável da redução não é a base já diminuída pelas deduções. No exemplo oficial 5, R$ 7.607,20 de rendimento com base de R$ 7.000,00 continua sem redução. Deduções legais e desconto simplificado são alternativas, não somas. [F4-S03](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025)

O 13º permanece em apuração própria; a redução mensal também o alcança na hipótese do art. 3º-A §3º. Isso não o transforma em um décimo terceiro mês somado à base ordinária do ajuste anual. [F4-S04](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm)

Tributação mínima exige avaliação específica desde AC2026/ex2027: limite de R$ 600 mil, base legal própria, exclusões, imposto já devido/pago e redutor. O art. 16-A §1º X exclui os rendimentos isentos dos incisos XIV/XXI do art. 6º da Lei 7.713. Não se pode incluir toda aposentadoria isenta nem excluir toda renda da pessoa. Enquanto esse contrato não estiver homologado, o sistema recusa um resultado fiscal total para esses casos. [F4-S04](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm)

## 3. Valores esperados independentes

Valores em reais. Estes casos verificam aritmética e seleção de parâmetros; salários dos exemplos oficiais não demonstram direito à isenção por doença. Nenhum esperado foi extraído de uma implementação F4.

### 3.1 Exemplos publicados pela Receita

Fonte de todas as cinco linhas: [F4-S03, exemplos 1–5](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025). Data dos pagamentos: 02/01/2026.

| ID | Rendimento | Dedução legal informada | Dedução utilizada | Base progressiva | Imposto anterior | Redução | IRRF esperado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| F4-C01 | 3.036,00 | 257,73 | 607,20 | 2.428,80 | 0,00 | 0,00 | **0,00** |
| F4-C02 | 4.000,00 | 373,41 | 607,20 | 3.392,80 | 114,76 | 114,76 | **0,00** |
| F4-C03 | 5.000,00 | 509,60 | 607,20 | 4.392,80 | 312,89 | 312,89 | **0,00** |
| F4-C04 | 6.000,00 | 649,60 | 649,60 | 5.350,40 | 562,63 | 179,75 | **382,88** |
| F4-C05 | 7.607,20 | 0,00 | 607,20 | 7.000,00 | 1.016,27 | 0,00 | **1.016,27** |

**Divergência tipográfica da fonte:** o exemplo 1 publica a subtração como R$ 2.428,00; `3.036,00 − 607,20 = 2.428,80`. Ambos estão na faixa sem imposto. A tabela acima preserva os operandos oficiais e corrige apenas a aritmética, explicitamente; validar essa correção na homologação.

### 3.2 Casos sintéticos derivados diretamente das tabelas

Aritmética conferida separadamente com decimal exato. Todos pressupõem exclusivamente os rendimentos e deduções indicados, sem outros ajustes.

| ID | Entradas e fórmula resumida | Resultado esperado e origem |
| --- | --- | --- |
| F4-C06 | Mensal abr/2025: 5.000,00; deduções legais zero; base 4.435,20; `base × 22,5% − 662,77` | **335,15**, sem redução de 2026. [F4-S01](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025) |
| F4-C07 | Mensal mai/2025: mesmos 5.000,00; base 4.392,80; `base × 22,5% − 675,49` | **312,89**, sem redução de 2026. [F4-S01](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025) |
| F4-C08 | Anual AC2025/ex2026: tributáveis 60.000,00; simplificado 12.000,00; base 48.000,00; `base × 22,5% − 8.054,97` | **2.745,03** de imposto antes de retenções/pagamentos. [F4-S01](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025) |
| F4-C09 | Anual AC2026/ex2027: mesmas entradas; progressivo 2.694,15 e redução limitada ao imposto | **0,00** após redução. [F4-S02](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026) |
| F4-C10 | Anual AC2026/ex2027: tributáveis 72.000,00; simplificado 14.400,00; base 57.600,00; progressivo 4.935,34; redução 1.548,33 | **3.387,01** antes de retenções/pagamentos. [F4-S02](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026) |

Testar separadamente cada limite de faixa, um centavo abaixo/acima, e o momento de arredondar. A fórmula anual publicada produz resíduo decimal de `0,015` em 88.200,00, embora a tabela descreva redução zerada nesse patamar. A implementação deve registrar qual tratamento foi homologado, com esperado independente do responsável fiscal; não resolver silenciosamente a diferença usando tolerância genérica. [F4-S02](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026)

## 4. Restituição, conciliação e períodos

Ano corrente, declaração anterior com saldo a restituir e declaração anterior com quotas pagas precisam de caminhos distintos. A orientação específica menciona declaração do ano seguinte, retificação e, na hipótese de quotas efetivamente pagas, PER/DCOMP Web. [F4-S05](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/imposto-de-renda/dirpf/isencao/como-requerer-a-restituicao-do)

A orientação atual sobre crédito exige considerar devoluções já realizadas pela fonte. O saldo de restituição apurado na DIRPF não pode ser usado em declaração de compensação; a fonte distingue esse saldo das exceções. Restituição de 13º/RRA pode ser solicitada pela DIRPF quando cabível; outras retenções exclusivas podem exigir processo/formulário. A rota deve ser revisada por natureza do crédito, sem regra universal “todo IR retido vai ao PER/DCOMP”. [F4-S06](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/restituicao-ressarcimento-reembolso-e-compensacao/creditos/retencao/beneficiario/pf/irpf/como-solicitar-ou-compensar-o-credito)

O art. 168 estabelece cinco anos com marcos próprios das hipóteses do art. 165. O cadastro preserva recolhimentos, fatos geradores, ajuizamento, decisões e trânsito; o advogado seleciona o fundamento aplicável e revisa cada período. A vedação do art. 170-A também impede pressupor compensação de matéria judicial antes do trânsito. [F4-S07](https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm)

**Alteração recente:** LC 236/2026 acrescentou ao CTN o art. 165-A, relativo aos índices de atualização, e art. 168 §§2–3, relativos à habilitação administrativa e certificação do trânsito. Registrar a nova versão normativa e exigir conferência de aplicação temporal na P03. Não reabrir nem encerrar períodos automaticamente porque uma lei foi publicada. [F4-S08](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp236.htm)

Atualização monetária depende da natureza do crédito e do marco adotado: pagamento indevido e restituição apurada em declaração possuem termos iniciais diferentes na IN. Não aplicar a mesma data de início de juros a todas as retenções mensais. Índices, termo inicial/final e eventual parcela do mês final precisam de versão e homologação próprias. [F4-S09](https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=122002&visao=anotado)

## 5. Contrato técnico proposto, ainda não implementado

As decisões abaixo são requisitos de engenharia propostos para homologação, não interpretações normativas adicionais:

1. **Entrada rastreável:** cada linha importada conserva documento privado de origem, página/linha, pagador, benefício, datas, categoria fiscal e autor da revisão. Importar não significa aprovar.
2. **Aritmética decimal:** armazenar valores monetários como decimal textual ou unidade inteira documentada; nunca `Number` binário para dinheiro. Preservar coeficientes na precisão normativa e mostrar cada operação, limite e arredondamento.
3. **Parâmetros imutáveis:** versão inclui vigência, periodicidade, natureza da renda, jurisdição, fontes, aprovadores, precisão e regras de arredondamento. Não usar parâmetros do exercício seguinte quando o período solicitado está ausente.
4. **Versões do cenário:** vínculo com a avaliação F3 aprovada, seu hash e as entradas fiscais. Mudança relevante invalida o estado atual da aprovação, preservando histórico e autoria. Nenhuma decisão clínica é calculada.
5. **Resultados separados:** mostrar imposto projetado, retenção informada, pagamento comprovado, ajuste/restituição anterior, hipótese de diferença, crédito reconhecido e valor recebido em campos distintos. IR retido não equivale a crédito recuperável.
6. **Conciliação sem duplicidade:** o mesmo principal identificado por cliente, período, tributo e documento de pagamento não pode ser apropriado integralmente em dois pedidos simultâneos. Permitir divisão comprovada e registrar devolução pela fonte, restituição administrativa e satisfação judicial.
7. **Cobertura explícita:** cada motor declara escopo aprovado. RRA, 13º, previdência regressiva, rendas no exterior, não residente, lucros/dividendos, tributação mínima ou situações sem dados completos não entram em fórmula genérica.
8. **Privacidade:** demonstrativos com inferência médica exigem ambas as permissões médica e fiscal; anexos e resultados não entram em URLs públicas, telemetria ou índices automáticos de IA.

### Recusa controlada

Resposta esperada quando não há cobertura: `incompleto`, com motivos estruturados e ações para o responsável. Não retornar zero nem total “estimado” que omita parcelas não suportadas.

| ID | Condição sintética | Comportamento esperado |
| --- | --- | --- |
| F4-R01 | Exercício sem tabela aprovada | Recusar apuração; identificar versão ausente. |
| F4-R02 | Fonte pagadora ou natureza desconhecida | Exigir classificação humana; preservar importação. |
| F4-R03 | Mistura de renda tributável, isenta e exclusiva sem valores separados | Não repartir por aproximação; pedir informe discriminado. |
| F4-R04 | Rendimento incompleto para o ajuste anual | Permitir conferência parcial identificada; impedir resultado fiscal anual total. |
| F4-R05 | Alta renda com contrato mínimo não homologado | Informar escopo não coberto; impedir conclusão fiscal total. |
| F4-R06 | RRA/previdência regressiva/não residente sem módulo específico | Recusar fórmula comum e abrir pendência fiscal. |
| F4-R07 | Regra ou marco jurídico F3 modificado após aprovação | Marcar cenário desatualizado; exigir nova versão e revisão. |
| F4-R08 | Índice ausente, marco de juros não revisado ou resultado futuro | Não inventar série; mostrar principal separado, com atualização não calculada. |
| F4-R09 | Retenção já devolvida ou pagamento já vinculado a outro recebimento | Bloquear duplicidade e apontar vínculo para conciliação. |
| F4-R10 | Prazo proposto sem fundamento, pagamento ou marco verificado | Não excluir período nem prometer recuperação; pendência jurídica explícita. |
| F4-R11 | Usuário fiscal sem acesso médico abre cenário com fundamento clínico | Negar leitura/exportação do cenário combinado. |
| F4-R12 | Submissão de valores `NaN`, infinito, texto ambíguo ou escala excedente | Rejeitar entrada; não converter silenciosamente para zero. |

## 6. Homologação e pendências P03

O advogado valida fundamento, marco, períodos e rota. O profissional fiscal valida bases, exclusões, deduções, tabelas, agregações e restituições anteriores. A autoria e o aceite técnico são registrados separadamente do aceite jurídico/fiscal.

Para cada cenário: identificar responsável, versão de parâmetros, documentos sintéticos, esperado independente, memória decimal, origem do esperado, divergências, decisão, data e condições da aprovação. Os cinco exemplos oficiais são regressões mínimas; não bastam para homologar toda a DIRPF ou recuperação por doença.

Pendências antes de habilitar cálculos de casos reais:

- Responsáveis nominais e amostras de referência autorizadas, conforme [P03](EXECUCAO_CONTINUA.md).
- Escopo inicial exato: competências/exercícios, regimes, naturezas e exclusões suportadas.
- Regra documentada de arredondamento por etapa e tratamento dos limites com resíduos decimais.
- Conferência integral das normas de restituição/juros, efeitos da LC 236/2026 e marcos por espécie de crédito.
- Tabelas/índices oficiais versionados, com controle de integridade e períodos cobertos.
- Esperados independentes para múltiplas fontes, 13º, devoluções anteriores, quotas, pedidos sobrepostos e casos recusados.
- Permissões de exportação, armazenamento privado e demonstração de que cenários sem cobertura não produzem valor final enganoso.

F4.10 permanece pendente até o aceite dos responsáveis. Nenhum resultado deste documento representa valor recuperável de cliente real.

## 7. Contratos de operação para a implementação

Esta seção fixa os critérios de engenharia para a entrega de F4. A existência de um formulário de aprovação ou o resultado positivo de testes não preenche a homologação externa P03.

| Fluxo | Entrada e registro necessários | Saída e limite de confiança |
| --- | --- | --- |
| Importação revisável | Documento fiscal privado do próprio caso, fonte/benefício F3, linha/página de origem, data do pagamento, competência, ano-calendário e exercício; valores textuais separados para bruto, tributável, isento, exclusivo, deduções e retenções | Rascunho com pendências de classificação e conferência. Importar novamente deve identificar repetição; correções preservam a origem e invalidam cenários que usaram a versão anterior. |
| Parâmetros fiscais | Periodicidade, vigência, naturezas cobertas, faixas, coeficientes, deduções, redução, precisão/arredondamento e fontes consultadas | Versão imutável, criada como rascunho. A aprovação precisa identificar pessoa, data, nota e escopo; parâmetros ausentes ou não aprovados produzem recusa identificada. |
| Cálculo e comparação | Entradas fiscais revisadas, cenário da avaliação F3 aprovada e ainda atual, versão explícita dos parâmetros e declarações/pagamentos anteriores relevantes | Memória decimal reproduzível. O resultado distingue imposto antes/depois, retenção informada e diferença hipotética; não converte a diferença em direito reconhecido ou recebido. |
| Períodos e marcos | Período selecionado pelo advogado, marco, fundamento, evidências e nota de revisão | Período em análise, incluído ou excluído por decisão identificada. A aplicação não escolhe automaticamente os últimos 60 meses nem exclui período apenas pela data de um laudo. |
| Declarações | Ano-calendário/exercício, original ou retificadora, vínculo à declaração anterior quando existir, recibo e evidência privada, situação informada | Registro do que foi conferido ou realizado fora do produto. Só comprovante permite registrar transmissão; não existe transmissão presumida a partir de um rascunho salvo. |
| Pedidos administrativos | Caso, pagador, períodos, rota, objeto, documentos e eventos separados de protocolo, exigência, recurso e decisão | Histórico independente para cada pedido e fonte. Protocolo requer comprovante; concessão não baixa retenções futuras nem confirma recebimento. |
| Rota judicial | Pedido independente, partes e análise registrada de competência, legitimidade e estratégia | Preparação e acompanhamento pelo advogado; ausência de indeferimento administrativo não impede a criação. Número de processo e comprovantes são informados e conferidos. |
| Exigências e recursos | Pedido, fato gerador, responsável, data de conhecimento, prazo/data informados e sua fonte | Providência distribuída, com indicação explícita de prazo manual. Nenhum prazo ganha natureza de cálculo judicial homologado neste módulo. |
| Cessação e recebimentos | Documento posterior da própria fonte/benefício; para recebimento, data, valor, comprovante, canal e parcelas de principal relacionadas | Cessação observada por competência e recebimento efetivo conciliado. Sem evidência, o estado continua pendente; juros, principal e honorários não são um único campo. |
| Sobreposição | Identidade do pagamento/principal, cliente, tributo, período, pedidos relacionados e alocações | Principal já apropriado fica indisponível para nova apropriação além do saldo. Divisão justificada é possível; reenviar a mesma operação não duplica o recebido. |

Todos os vínculos devem ser validados no servidor. Um identificador recebido da interface não demonstra que o pagador, rendimento, documento, declaração ou pedido pertence ao caso autorizado. Documentos gerais ou médicos não podem entrar num caminho fiscal que permita a um usuário sem a categoria correspondente ler sua descrição; cálculos que exponham fundamentação de saúde exigem as duas permissões.

### 7.1. Memória decimal e integridade das versões

O banco executa as operações fiscais com `numeric`; JSON de valores monetários e coeficientes mantém strings decimais. A interface não recalcula imposto com `Number`, não trata campo vazio como zero e não normaliza texto ambíguo por remoção indiscriminada de caracteres. O formato de intercâmbio usa ponto decimal, sem separador de milhar; a interface pode apresentar vírgula sem alterar o valor armazenado.

A memória contém, no mínimo: identificação/versão do motor; entradas examinadas; hashes e identificadores das fontes; parâmetros completos; vigência; faixa escolhida; dedução legal ou simplificada escolhida; base progressiva; multiplicação e parcela a deduzir; imposto antes da redução; variável e fórmula da redução; limites aplicados; arredondamentos por etapa; resultado e recusas. A comparação de cenários conserva os dois conjuntos de operandos, não somente sua diferença.

Uma alteração em valor, documento, natureza, marco F3, parâmetro aprovado, declaração prévia ou recebimento relevante impede usar uma aprovação antiga como autorização de um cenário novo. O histórico aprovado permanece consultável como histórico; nova versão exige reexame. O servidor verifica atualidade também no momento da aprovação, inclusive se a interface tiver ficado aberta durante a mudança.

### 7.2. Validações independentes mínimas

| Grupo | Cenário e evidência esperada |
| --- | --- |
| Aritmética | Reproduzir F4-C01–C10 e testar cada limite com um centavo abaixo/acima; comparar memória e resultado sem calcular o esperado usando o próprio motor. |
| Escopo | Tabela ausente, versão rascunho, RRA/regressivo não coberto, renda anual incompleta e tributação mínima não coberta retornam motivos estruturados, sem um total fiscal enganoso. |
| Importação | Valor vazio, negativo onde não admitido, `NaN`, infinito, notação exponencial, separador ambíguo e escala excedente não se convertem em zero; original permanece disponível para revisão. |
| Atualidade | Corrigir uma linha, substituir evidência ou aprovar regra mais recente enquanto a revisão está aberta impede aprovação antiga para novos atos. Nova minuta normativa não invalida uma versão só por existir. |
| Autorizações | Usuário de outro escritório/caso, perfil inativo e categoria revogada não leem nem alteram registros por identificador direto. A aprovação e a reserva de valores repetem a verificação sob bloqueio transacional. |
| Conciliação concorrente | Duas alocações simultâneas que ultrapassem o saldo não podem ambas concluir. Duplicação da mesma chave de operação não cria outra entrada; alteração de conteúdo sob a mesma chave é rejeitada. |
| Prova de resultado | Decisão favorável sem contracheque posterior não significa cessação; pedido deferido sem comprovante de pagamento não significa recebido; recebimento parcial conserva saldo e origem. |
| Sobreposição de rotas | Pedido administrativo e judicial podem coexistir com vínculo e análise de sobreposição, mas não apropriam o mesmo principal duas vezes. Devolução pela fonte é conciliada com a mesma identidade de principal. |

O registro de homologação deve distinguir revisão **jurídica**, revisão **fiscal** e teste **técnico**. A interface não deve atribuir a um colaborador uma habilitação profissional somente porque ele tem o papel de proprietário do caso. O responsável registra sua função e identificação; o aceite de engenharia não substitui esse registro.
