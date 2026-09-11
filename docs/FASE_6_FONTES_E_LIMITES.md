# Fase 6 — Fontes judiciais, limites e contagem assistida

Pesquisa conferida em **11/09/2026** para F6.01–F6.09 do [plano principal](./PLANO_PLATAFORMA_JURIDICA_E_ISENCAO_IR.md). Este documento propõe contratos de implementação e cenários sintéticos; não aprova fonte comercial, calendário, interpretação jurídica ou prazo de cliente. Não houve consulta de processo pessoal, aquisição de serviço, uso de credencial, ciência eletrônica ou peticionamento.

## 1. Decisão para implementação

- **Pode avançar:** cadastro de processos, entrada manual comprovada, adaptadores testados com respostas sintéticas, fila durável, revisão de vínculos, distribuição, controle de cobertura e contador assistido com parâmetros versionados.
- **DataJud comercial desabilitado:** a chave compartilhada publicada pelo CNJ não supre a autorização comercial. O bloqueio é de permissão de uso, além da configuração técnica.
- **Escavador Business é uma candidata concreta:** existe documentação oficial para CNJ, OAB, monitoramento e diários. Desenvolver adaptador opcional sem credenciais; ativação depende do contrato, escopo, custos e piloto P04.
- **DJEN, Domicílio e DataJud são fontes com finalidades distintas.** Um movimento recebido de agregador ou DataJud não equivale à publicação oficial nem à ciência de comunicação pessoal.
- **Nenhuma regra aprovada de fábrica:** o sistema pode oferecer exemplos identificados como rascunhos. Aprovar calendário/regra e conferir uma contagem são atos humanos separados, nominais e auditados.
- **F6 não executa ciência nem peticionamento.** Nem o nome HTTP `GET` garante ausência de efeito jurídico: a operação específica deve estar documentada como consulta sem confirmação antes de integrar.

## 2. Evidências e limites das fontes

### 2.1 DataJud

Os [termos oficiais](https://datajud-wiki.cnj.jus.br/api-publica/termo-uso/) continuam remetendo à [versão 1.2, de 27/11/2023](https://formularios.cnj.jus.br/wp-content/uploads/2023/11/Termos-de-uso-api-publica-V1.2.pdf). Os itens 3.3 e 3.8 restringem finalidade e exploração comercial, inclusive de informações derivadas; 3.6 não assegura exatidão, completude ou atualização; 3.13 estabelece até 120 requisições por minuto, salvo autorização expressa e escrita. A página de [acesso](https://datajud-wiki.cnj.jus.br/api-publica/acesso/) divulga uma chave pública sujeita a troca. **Conclusão de produto:** mantê-lo indisponível para o SaaS enquanto P04 não documentar autorização compatível; copiar a chave não resolve esse requisito.

Os [endpoints](https://datajud-wiki.cnj.jus.br/api-publica/endpoints/) são organizados por tribunal. O [glossário](https://datajud-wiki.cnj.jus.br/api-publica/glossario/) descreve número CNJ, tribunal, classe, grau, órgão, assuntos e movimentos; distingue `dataHoraUltimaAtualizacao` e `@timestamp`. No contrato público consultado não há operação documentada de monitoramento de publicações por OAB, comprovante de ciência ou cobertura de autos integrais. Isso é uma constatação sobre esse contrato, não uma afirmação de inexistência de outros serviços do CNJ.

Requisitos propostos:

1. `permission_status`, versão dos termos, documento autorizativo e finalidade aprovada independem de `credentials_configured`.
2. Não fazer teste de conectividade externo antes da permissão. Estado visível: “Uso comercial depende de autorização”, sem prometer captura ativa.
3. Preservar atualização informada pela fonte, atualização do índice e captura local como campos diferentes. Campo ausente permanece desconhecido.
4. Resposta vazia não significa ausência de processo ou movimentação. Não converter falta de cobertura em “em dia”.
5. Não ampliar busca para pessoas ou compartilhar bases entre escritórios. Dados recebidos continuam sujeitos à finalidade, retenção e ACL do caso.

### 2.2 Adaptador comercial opcional: Escavador Business

A [apresentação oficial da API](https://api.escavador.com/) informa contratação e serviços para empresas; a [documentação V2](https://api.escavador.com/v2/docs/) descreve PAT Bearer, paginação, callbacks e limite divulgado de 500 requisições/minuto. A disponibilidade documental não comprova contrato ou cobertura contratada do AdvocaCHAT.

| Capacidade documentada | Fonte primária | Limite para o produto |
| --- | --- | --- |
| Consulta por CNJ e processos de advogado por OAB, com UF/tipo | [Consulta de processos V2](https://api.escavador.com/v2/docs/consulta-de-processos) | Descoberta gera candidatos; OAB não concede autorização ao caso. |
| Monitoramento de processo e consulta do monitor | [Monitoramento V2](https://api.escavador.com/v2/docs/monitoramento-de-processos) | Criar monitor pode contratar consumo; exigir ação autorizada e orçamento. |
| Novos processos relacionados a termo | [Novos processos V2](https://api.escavador.com/v2/docs/monitoramento-de-novos-processos) | Identificação e ambiguidade precisam de revisão. |
| Diários por termo/processo, origens e variações; callbacks com e sem processo identificado | [Diários V1](https://api.escavador.com/v1/docs/monitoramento-de-diarios-oficiais) | O contrato lido aceita `termo`/`processo`; não inventar `tipo=oab`. A busca textual de inscrições exige ensaio de formatos, UF e falsos positivos. |

A documentação de diários informa interrupção da captura ao atingir o limite de aparições. Esse estado precisa aparecer como cobertura interrompida, com conferência manual. A eventual identificação de processo pelo fornecedor permanece uma sugestão até conferência.

O [contrato de callbacks](https://api.escavador.com/v2/docs/#token-para-validar-callbacks-da-api) usa token de segurança no cabeçalho `Authorization`; não documenta HMAC nesse trecho. O adaptador deve validar o formato exato contratado, comparar em tempo constante, vincular a conta ao tenant no servidor e persistir evento/hash antes do sucesso HTTP. Consultar detalhes por API autenticada pode completar a validação do objeto externo. Não confiar em `tenant_id`, caso, URL ou identidade recebidos no corpo.

**Pendências P04:** direito de uso/reexibição por SaaS e subclientes, controlador/operador e retenção, ambientes, conta de cobrança, tribunais/instâncias/diários contratados, datas iniciais de cobertura, frequência/atraso, limites por operação, custos e interrupções por saldo, formato de callback, reconciliação, suporte e cancelamento. Não há credencial nem preço aprovado neste documento. “Cobertura nacional” comercial não substitui matriz homologada por operação.

### 2.3 DJEN e Domicílio Judicial Eletrônico

A [Resolução CNJ 569/2024](https://atos.cnj.jus.br/atos/detalhar/5691), que altera a 455/2022, separa o DJEN para comunicações sem exigência de vista/intimação pessoal e o Domicílio para citação eletrônica e comunicações pessoais, excetuada a citação por edital. Estabelece tratamentos diferentes para citação consultada, citação de pessoa jurídica de direito público sem consulta e demais intimações pessoais. As janelas de dez dias corridos ali previstas não se transformam em dias úteis pelo art. 219. [Cópia oficial da Resolução 569 no STJ](https://www.stj.jus.br/internet_docs/biblioteca/clippinglegislacao/Res_pres_569_2024_CNJ.pdf).

Uma [consulta do CNJ julgada em 30/06/2026](https://atos.cnj.jus.br/atos/detalhar/6993), item 40, reafirma o marco DJEN nos casos sem intimação pessoal e o caráter informativo de comunicações concomitantes. Não substituir a data da publicação por mensagem do fornecedor, e-mail, visualização no CRM, assinatura da decisão ou data da coleta.

O [CNJ anunciou em 28/11/2025](https://www.cnj.jus.br/cnj-alerta-para-atualizacao-no-domicilio-judicial-eletronico/) mudança obrigatória das credenciais API institucionais até 31/03/2026. Portanto, manual de 2023 não basta para escolher o fluxo de autenticação atual. Integração direta exige contrato técnico vigente, habilitação institucional, poderes e testes por operação. Ausência desses elementos mantém o adaptador desabilitado; F6 continua funcionando com importação autorizada e conferência manual.

**Estado da verificação:** texto da Resolução 569 conferido em fonte oficial; a abertura direta da página consolidada da 455 e de algumas atas retornou erro/403 nesta sessão. Os trechos de atos de 2025/2026 acima estavam disponíveis no índice da própria fonte oficial. Não foi homologada consolidação integral, API do DJEN, API do Domicílio nem calendário de tribunal. Não contornamos bloqueios. Na homologação, anexar inteiro teor oficial e confirmar alterações/efeitos temporais aplicáveis.

## 3. Bases para um contador assistido

### 3.1 Regras que precisam de campos distintos

| Referência conferida | Conteúdo relevante | Consequência proposta |
| --- | --- | --- |
| [CPC, art. 219](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm#art219) | Dias úteis para prazos processuais em dias. | Classificar regime/natureza; não aplicar automaticamente a prazo material, administrativo, janela de consulta ou outro ramo. |
| [CPC, arts. 220 e 224](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm#art220) | Suspensão de 20/12 a 20/01; exclusão do começo, inclusão do vencimento e regras de prorrogação; publicação e início separados. | Suspensões e ajustes precisam de alcance e evidência próprios. |
| [CPC, art. 231](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm#art231) | O marco depende da modalidade: juntada, publicação, consulta e outras hipóteses; inciso IX trata do quinto dia útil após confirmação da citação eletrônica. | Seleção humana da modalidade e do marco, com prova. Não contar cinco dias duas vezes nem confundir marco com primeiro dia contado. |
| [Lei 11.419/2006, art. 4º, §§ 3º–4º](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11419.htm#art4) | Publicação no dia útil após disponibilização; início no dia útil seguinte à publicação. | Conservar ambas as datas, com transformação explícita e calendário aplicável. |
| [Lei 11.419/2006, art. 5º](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11419.htm#art5) | Consulta certificada, tratamento de dia não útil e janela de dez dias corridos nas hipóteses previstas. | Ler resumo interno não produz ciência. Classificar consulta voluntária/tácita e modalidade antes de qualquer contagem. |
| [Lei 11.419/2006, arts. 3º e 10](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11419.htm#art10) | Protocolo judicial, horário e indisponibilidade do sistema do Judiciário possuem efeitos próprios. | Queda do CRM ou fornecedor não prova indisponibilidade judicial. Preservar certificado do tribunal e revisão. |

### 3.2 Esclarecimento de 2026: marco e primeiro dia contado

O [TJRJ divulgou em 02/02/2026 o Aviso TJ 27/2026](https://www.tjrj.jus.br/web/portal-conhecimento/noticias/noticia/-/visualizar-conteudo/5736540/405593111), com tese do CNJ: excluir o envio na janela de consulta; distinguir três dias úteis de outras janelas; tratar o quinto dia útil posterior à confirmação como dia do começo, excluído da contagem efetiva. A notícia reproduz transição de 90 dias. Seu resumo inicial usa formulação mais ampla sobre “dia útil”; a tese transcrita distingue as hipóteses. **Não converter esse resumo em algoritmo universal nem usar 02/02 como início presumido da transição.** Obter acórdão, publicação, alcance e regime temporal antes de aprovar regra do Domicílio. O mecanismo deve permitir registrar esse entendimento e sua vigência sem reescrever contagens históricas.

O [registro da consulta CNJ sobre pessoas jurídicas de direito público em 2025](https://atos.cnj.jus.br/atos/detalhar/6337) também distingue citação/intimação e consulta/ausência de consulta. Essas condições devem integrar a identificação da regra; “eletrônico” sozinho é insuficiente.

### 3.3 Calendário do órgão competente

Como exemplo de fonte — **não como calendário padrão do produto** — o [STJ divulgou seu calendário institucional de 2026](https://www.stj.jus.br/sites/portalp/paginas/comunicacao/noticias/2026/06012026-portaria-define-feriados-e-pontos-facultativos-do-stj-em-2026.aspx), com referência à Portaria STJ/GDG 1.010/2025. Calendário de um tribunal não comprova expediente de outro. O [calendário oficial de sessões do STJ](https://processo.stj.jus.br/processo/calendario?aplicacao=calendario.filipeta) é consulta auxiliar, sem substituição da portaria e atos supervenientes.

A configuração deve registrar órgão perante o qual o ato será praticado, tribunal, instância, comarca/seção, UF/município quando aplicáveis, fuso IANA, intervalo coberto e exceções. “Calendário brasileiro” ou somente feriados nacionais não atende à conferência de prazo forense. Ponto facultativo administrativo, suspensão de expediente e suspensão de prazo são tipos distintos; seu efeito depende do ato aplicável.

## 4. Contrato de dados proposto para backend e UI

Nomes abaixo são conceituais; alinhar os nomes finais com as migrations. Separar dados descritivos, autorização do conector e homologação jurídica.

### 4.1 Fonte, cobertura e conexão

| Grupo | Campos mínimos |
| --- | --- |
| Fonte | `provider`, `api_version`, `documentation_url`, `checked_on`, `terms_version`, `permission_status`, `permission_document_id`, `allowed_operations`, `valid_from`, `valid_until`, `reviewer_id`, `review_note` |
| Conta | `tenant_id`, `provider_account_id`, ambiente, credencial referenciada no servidor, `enabled`, responsável, limites de consumo por conta/operação e por escritório |
| Cobertura | tribunal, instância, sistema, diário/origem, capacidade CNJ/OAB/publicação, início de cobertura, frequência esperada, atraso tolerado aprovado, estado e última conferência nominal |
| Monitor | caso/processo autorizado ou fila restrita de descoberta, CNJ como string, OAB número/UF/tipo como strings, ID externo, estado, revisão de contato/poderes quando exigida, orçamento, solicitante e chave idempotente |

Configurações propostas no servidor: ativação global inicialmente falsa; vínculo obrigatório tenant/conta; credencial separada de webhook; lista fechada de hosts/operações; timeout, bytes/páginas por execução, concorrência e limite de consumo; política de retenção; segredo de scheduler. Nunca aceitar destino HTTP arbitrário enviado pelo navegador. URL externa de retorno também precisa de allowlist; não buscar anexos automaticamente sem proteção contra SSRF e sem ACL.

Estado de conexão deve distinguir `permission_pending`, `not_configured`, `disabled`, `active`, `degraded`, `rate_limited`, `quota_exhausted` e `coverage_unknown`. Ter chave, conexão HTTP ou fila aceita não significa monitoramento confirmado.

### 4.2 Eventos externos e conferência

Cada evento conserva tenant/conta/origem, ID externo, tipo, versão da fonte, hash do original, documento privado do original, parser/versão, horário de captura, atualização da fonte e precisão/fuso dos campos temporais. Original não é HTML executável nem conteúdo enviado a IA por padrão.

Datas distintas, todas podendo ser desconhecidas: `decision_signed_at`, `made_available_on`, `published_on`, `communication_sent_at`, `provider_received_at`, `source_consulted_at`, `awareness_effective_on`, `captured_at`. Preservar valor textual original quando o fornecedor não informa fuso. Não inventar meia-noite UTC ou converter data civil pelo fuso do navegador.

Separar associação de conferência: `unmatched`, `ambiguous`, `proposed`, `confirmed`, `rejected`; confirmação registra ator, motivo, processo/caso e evidências da publicação. Uma página com vários processos ou uma OAB homônima nunca distribui automaticamente todo o texto a todos os clientes. Candidatos sem caso permanecem em fila de descoberta restrita, não em busca global para qualquer colaborador.

Distribuição registra responsável, substituto, data de recebimento interno, aceite interno e reatribuições. Usar “Conferido no escritório”/“Assumir tratamento”; nunca nomear essa ação “Dar ciência”. Aceite interno não modifica datas jurídicas.

### 4.3 Regra, calendário e cálculo

| Objeto | Conteúdo revisável |
| --- | --- |
| Versão da regra | Título, regime e natureza, modalidade/ato, tipo de destinatário, condições de aplicação/exclusão, unidade suportada, operações enumeradas, vigência e transição, fundamento e fontes conferidas, limitações, autor/revisor/estado |
| Versão do calendário | Escopo territorial/órgão, intervalo finito, fuso, dias de expediente, feriados, suspensões/intervalos, expediente excepcional, efeitos sobre início/curso/vencimento, documentos oficiais, fontes, conferente e estado |
| Entrada da contagem | Caso/processo/publicação confirmados, categoria de acesso, quantidade inteira informada, fundamento da duração, regra/calendário exatos, data e tipo de marco selecionados, prova, condições/exceções, responsável/substituto |
| Saída imutável | Versão do motor, snapshot/hash, marcos intermediários, primeiro dia contado, vencimento proposto, memória diária, recusas/avisos, autor e revisão nominal |

Operações enumeradas possíveis: usar data conferida; avançar quantidade explícita de dias úteis/corridos para obter um marco intermediário; excluir/incluir o marco de modo explícito; contar dias com calendário; aplicar ajuste de vencimento documentado. Cada etapa deve produzir seu próprio registro. **Não aceitar SQL, JavaScript ou fórmula arbitrária fornecida na regra.** Não inferir duração, prazo em dobro, preclusão, suspensão individual ou reinício por interrupção a partir de palavras da publicação.

Uma definição inequívoca evita erro de um dia: `start_marker_on` é o marco jurídico selecionado; `first_counted_on` é o primeiro dia que recebe índice 1. Campo genérico `start_date` sem semântica não basta. Deslocamento usado para formar o marco e deslocamento usado para contar o prazo não podem ser repetidos silenciosamente.

Memória por data: data civil, classificação de expediente, contável ou excluída, fundamento/ato/calendário da exclusão, etapa, índice acumulado e motivo de eventual ajuste. Dias sem cobertura do calendário interrompem o cálculo; não são presumidos úteis. Estender a vigência exige nova versão.

Estados sugeridos: `incomplete`, `draft`, `in_review`, `reviewed`, `superseded`; atualidade derivada separada (`is_current`). Proposta não revisada pode gerar tarefa de **conferir prazo**, claramente distinta de prazo processual conferido. Somente versão atual conferida, com fonte e ACL válidas, pode alimentar o prazo processual revisado. Mudança de regra, calendário, marco, associação, prova ou duração torna a versão anterior desatualizada; preserva a data histórica e abre reconferência, sem trocar silenciosamente uma tarefa já acompanhada.

**Recusas obrigatórias:** fonte/modalidade/regime desconhecido; falta de prova; publicação ambígua; falta de calendário ou cobertura; regra não aprovada/fora da vigência; lacuna em transição; fuso necessário ausente; duração sem fundamento; hora/mês/ano ou regime não implementado; interrupção/reinício não suportado; conflito entre documentos. A ação disponível é registrar conferência manual fundamentada, não “usar padrão”.

## 5. Fila, privacidade e efeitos controlados

1. Persistir intenção autorizada antes do pedido externo. Claim com lease, limite por conta/provedor e tenant; revalidar conexão, permissão, orçamento e ACL depois de adquirir locks.
2. Deduplicar recepção por conta/provedor/ID/versão/hash. Mesmo ID com conteúdo alterado gera revisão/correção preservando o anterior. Eventos fora de ordem não regressam o estado atual por ordem de chegada.
3. GET de consulta pode ter retry limitado com espera e reconciliação. Timeout em criação de monitor não autoriza repetição cega: usar idempotência documentada ou marcar `unknown` e reconciliar pelo ID externo.
4. Callback autenticado e persistido antes do sucesso; replays não criam segunda publicação/tarefa. Mensagem desconhecida vai para quarentena restrita. Confirmação técnica de callback não é ciência judicial.
5. Só permitir comandos de consulta/monitoramento previstos no adaptador. Ciência, consulta com aperfeiçoamento, peticionamento, certificados e ações de representação ficam fora da lista de operações F6.
6. Atraso, quota e indisponibilidade criam pendência operacional e ação de conferência manual, sem inventar evento judicial ou prorrogação. Retomada usa cursor com sobreposição/dedup e preserva lacunas.
7. Metadados/originais/tarefas herdam o caso e a categoria. Não rebaixar publicação médica/fiscal para geral; documento com conteúdo combinado requer política que conserve as restrições aplicáveis. O portal F5 recebe apenas versão expressamente publicada após conferência.
8. IDs e contagens bastam nos logs; não registrar tokens, URLs assinadas, nomes, CNJs, OABs ou texto de publicação. Erros externos devem ser normalizados antes de retornarem ao cliente.
9. Aprovação de cálculo e criação/alteração da tarefa ocorrem em transação sob lock do caso, conferindo snapshot atual. Revogação de acesso, troca de responsável e atualização de parâmetro não podem ser ignoradas após espera de lock.

## 6. Cenários independentes de aceitação

Todos os exemplos abaixo usam **calendário sintético**, segunda a sexta, sem feriados ou suspensões salvo os expressamente indicados. Não representam calendário de tribunal. São oráculos de teste propostos; não foram executados contra implementação F6 nesta pesquisa.

| ID | Entrada controlada | Resultado esperado |
| --- | --- | --- |
| C01 | Disponibilização sexta 11/09/2026; regra de publicação expressamente selecionada | Publicação 14/09 e primeiro dia contado 15/09 no calendário fictício. |
| C02 | C01 com 14/09 marcado não útil por ato sintético | Publicação 15/09; primeiro contado 16/09. Provar que disponibilização não recebe índice 1. |
| C03 | Marco 14/09/2026; excluir marco; 3 dias úteis | Índices 1–3 em 15, 16 e 17/09; vencimento proposto 17/09. |
| C04 | C03 com suspensão sintética em 16/09 | Índices em 15, 17 e 18/09; suspensão justificada na memória. |
| C05 | Marco 18/09; excluir; quantidade 3 | Em dias corridos: 19, 20, 21/09. Em úteis: 21, 22, 23/09. Unidade escolhida aparece na memória. |
| C06 | Confirmação em 14/09; etapa “formar marco no quinto útil seguinte”; depois excluir marco e contar 3 úteis | Marco 21/09; primeiro contado 22/09; proposta 24/09. Regra sintética inspirada na tese de 2026, não homologação do Domicílio. |
| C07 | Quantidade maior que o intervalo aprovado do calendário | `incomplete`; nenhuma data final calculada com dias presumidos. |
| C08 | Suspensão sintética de 20/12/2026 a 20/01/2027; marco 18/12; excluir; 3 úteis | Primeiro contado 21/01/2027; depois 22 e 25/01; memória enumera suspensão. Sem aprovação do regime, recusar aplicar a suspensão. |
| C09 | Marco resultante de data/hora em UTC que corresponde ao dia anterior no fuso do órgão | Data civil calculada no fuso da versão; browsers em fusos diferentes produzem o mesmo resultado. Timestamp sem fuso necessário é recusado. |
| C10 | Quantidade em horas, regra de interrupção, transição indefinida ou prazo material | Recusa específica; possibilidade de cadastro manual fundamentado sem alegar cálculo automático. |
| C11 | Calendário A substituído após revisão; usuário tenta aprovar versão antiga | Aprovação falha como desatualizada; nova versão exige novo exame e mantém histórico. |
| C12 | Documento alterado/revogado, associação corrigida ou acesso retirado durante aprovação | Operação relê sob lock e é negada; nenhum prazo/tarefa parcialmente publicado. |
| I01 | Chave DataJud presente, permissão comercial pendente | Nenhum fetch/claim externo; estado “autorização pendente” persistido/visível. |
| I02 | PAT de fornecedor ausente ou tenant/conta divergente | Nenhum consumo externo nem alteração de fila alheia; resposta explícita. |
| I03 | Mesmo callback chega três vezes e em dois workers | Uma recepção lógica e um efeito; tentativas auditadas sem duplicação de tarefa. |
| I04 | ID externo repetido com hash diferente | Quarentena/correção versionada; não sobrescrever fonte original silenciosamente. |
| I05 | Publicação antiga chega depois da recente | Ordenação por fonte e semântica; chegada não retrocede situação. Ambas ficam preservadas. |
| I06 | Monitor criado no fornecedor, resposta sofre timeout | `unknown`; reconciliar antes de repetir ou cobrar novamente. |
| I07 | 429, quota/saldo esgotado, 503 ou parser incompatível | Redução/pausa de consumo, cobertura degradada e conferência manual. Não mostrar “sem novidades”. |
| I08 | Callback falso, conta errada, URL interna/redirect malicioso ou payload excessivo | Rejeição/quarentena sem fetch arbitrário, efeito de caso ou vazamento. |
| I09 | OAB idêntica em UFs distintas; homônimos; página com dois processos | Candidatos separados; nenhuma associação/divulgação automática por similaridade. |
| I10 | Fonte fornece apenas movimento e captura local | Publicação/ciência continuam desconhecidas; contador solicita marco comprovado. |
| I11 | Indisponibilidade somente do agregador ou CRM | Não prorrogar prazo judicial; abrir conferência operacional. |
| I12 | Reprodução local de evento importado para comunicação F5 | Rascunho interno vinculado; envio/publicação exige aprovação e permissão atuais. |
| I13 | Monitor de tenant A, usuário B ou `legal_portal` tenta acessar RPC/tabela/original | Negado no servidor; não confiar em interface, UUID opaco ou categoria em cache. |
| I14 | Operação chamada `GET` no fornecedor registra ciência | Adaptador recusa por capacidade, mesmo usando método HTTP de leitura. |

Além dos casos enumerados, usar comparação de memória com uma planilha/calendário independente, não outra chamada ao mesmo motor. Ensaiar duas sessões reais para dedup/leases/aprovação concorrente, com dados sintéticos e rollback. Ensaios não aprovam regras jurídicas de produção.

## 7. Homologação humana e entrega por área

### Backend

Implementar objetos versionados, entradas originais privadas, outbox/inbox, contexto mínimo por ACL, funções transacionais para conferência/distribuição, calendário e memória. Reutilizar caso, membro, documentos privados e tarefa F1/F2. Não criar perfil ou permissão de portal nova para F6. Leitura de calendário pode ser compartilhada dentro do escritório conforme papel; evidências e resultados de caso continuam restritos.

### Edge/adaptador

Implementar adaptador comercial opcional e ensaios determinísticos com transporte falso exclusivamente nos testes. Não há modo de produto que apresente simulação como captura real. Conta/segredos no servidor, capacidades fechadas, callback autenticado, limites, timeouts e retomada. Não incluir chave DataJud no build nem chamada externa habilitada por mera presença de configuração. O motor autoritativo deve persistir memória e resultado no backend; UI não confirma datas calculadas apenas no navegador.

### UI

Separar “Processos”, “Publicações para conferir”, “Cobertura”, “Calendários e regras” e “Prazos assistidos”, podendo usar abas. Exibir original seguro e campos temporais lado a lado, hipótese de associação, responsável/substituto, versão de regra/calendário, recusas e memória diária. Leitor consulta; quem revisa vê exatamente o snapshot aprovado. Alterações pendentes não substituem data já conferida sem ação explícita.

### Registro nominal de homologação

Cada aprovação deve guardar identidade do revisor, papel, data/hora, escopo, fontes com `checked_on`, documentos/versões, exemplos independentes e respectivos resultados, limitações e motivo. Para regra/calendário: vigência e universo de aplicação. Para integração: contrato/permissão e cobertura por operação. Para cada prazo: modalidade, marco, duração, condições do caso, fonte e memória integral. Nenhuma aprovação é atribuída automaticamente ao titular do sistema ou à equipe que escreveu código.

| Pendência | O que falta para uso real | O que pode ser entregue antes |
| --- | --- | --- |
| P04 — fonte judicial | Permissão comercial, contratação/configuração e cobertura piloto demonstrada | Adaptador opcional, fila, cadastro, importação manual, cenários falsos e indicador de indisponibilidade |
| Calendários/regras | Responsável jurídico conferir atos, vigência, transições, exceções e casos independentes | Editor, versões, validação estrutural, memória e bloqueios de aprovação |
| DJEN/Domicílio direto | Documentação vigente, habilitação, operação sem ciência comprovada e poderes do titular | Distinção de modalidades, registro manual e arquitetura de capacidades fechadas |
| Comunicação F5 | Consentimento/permissão, revisão do conteúdo e fornecedor real homologado quando necessário | Rascunho vinculado à publicação e publicação interna autorizada no portal |

F6 técnica pode progredir sem credenciais reais. **F6.01 permanece pendente até existir autorização/contrato e piloto; F6.03 externa permanece não homologada até captura autorizada demonstrada.** O critério final é evento → persistência → conferência → tarefa/prazo rastreável, com falhas e ausência de cobertura visíveis. Esta pesquisa não altera o estado dessas homologações.

## 8. Contrato do adaptador implementado nesta fase

O transporte Escavador está restrito às rotas oficiais enumeradas no código: consulta pelo CNJ, movimentações do CNJ, descoberta por OAB, criação explícita de monitor de processo ou termo em diário e consulta de um monitor conhecido. `discover_oab` usa o tipo de inscrição documentado pela API V2 (`ADVOGADO`, `ESTAGIARIO`, `SUPLEMENTAR` ou `CONSULTOR_ESTRANGEIRO`); não usa códigos de categoria de outro cadastro. `read_updates` usa o CNJ; `reconcile_monitor` usa o identificador do monitor e sua espécie.

As funções `legal-judicial-dispatch` e `legal-judicial-webhook` autenticam suas próprias entradas. A primeira admite somente configuração por usuário interno validado por Auth e execução do worker por segredo de cron; a segunda exige o token Bearer dedicado cadastrado no callback. JWT, tokens e corpo original não são registrados em logs. Nenhuma função admite URL, header ou credencial fornecidos no corpo como destino de consulta.

| Configuração no servidor | Efeito |
| --- | --- |
| `LEGAL_ESCAVADOR_TENANT_ID` + `LEGAL_ESCAVADOR_ACCOUNT_ID` | Vínculo obrigatório entre uma conta e o escritório; nunca escolhido pelo payload externo |
| `LEGAL_ESCAVADOR_API_TOKEN` + `LEGAL_ESCAVADOR_ENABLED=true` | Habilita transporte somente após a SQL também validar permissão vigente, operação, responsável, conta, orçamento e quota |
| `LEGAL_ESCAVADOR_CALLBACK_TOKEN` | Segredo distinto do PAT e do cron, com ao menos 32 caracteres; usado no Authorization Bearer do callback |
| `CRON_SECRET` | Autentica o disparo agendado; segredo forte conferido em tempo constante |
| `LEGAL_DATAJUD_TENANT_ID` + `LEGAL_DATAJUD_ACCOUNT_ID` | Permite registrar indisponibilidade/permissão pendente; não existe transporte DataJud executável nesta fase |

O adaptador real não possui ambiente sandbox documentado: uma fila marcada como sandbox é recusada antes de qualquer fetch. Testes injetam o transporte falso e não alteram essa restrição. Nenhuma dessas variáveis foi habilitada por esta implementação.

Cada chamada, inclusive repetição GET ou próxima página, passa pela autorização transacional e pelo orçamento do job. Cada execução reserva somente um job e tem orçamento monotônico de 30 segundos; fetch externo tem limite de 5 segundos, chamadas RPC têm espera limitada e o transporte Auth/PostgREST é abortado após 4 segundos. O corpo de entrada também tem limite de tempo. Há até uma repetição imediata de leitura por página para falha transitória segura; POST de monitor não é repetido após resultado ambíguo. Paginação aceita apenas cursor limitado na mesma origem, rota e busca, com até cinco chamadas por job. Página restante persiste como captura incompleta para uma continuação explícita; esgotar o tempo não declara captura integral. Respostas e callbacks têm limite de 1 MiB e tempo de leitura; bytes originais são persistidos antes de confirmar recebimento. Candidatos inválidos não ganham vínculos, e ausência de publicação/ciência permanece ausência.

As verificações automatizadas cobrem parser, CNJ, limites, autenticação, vínculo de conta, quota antes de cada tentativa, revogação entre páginas, paginação hostil, timeout de POST, callbacks repetidos/alterados e erro antes da persistência. Elas demonstram comportamento técnico com dados sintéticos; não comprovam contratação, consulta real, entrega do fornecedor ou homologação de regra jurídica.

Em 11/09/2026, a integração `supabase/tests/legal_judicial_adapter_contract.ts` passou em clone PostgreSQL local descartável: nove jobs criados pelas RPCs reais, dez respostas de transporte falso, seis operações e quatro tipos de inscrição OAB. A execução incluiu claim, autorização, ingestão e finalização reais no clone; callbacks repetidos produziram uma recepção lógica e alteração de conteúdo gerou segunda versão em quarentena, ainda sem caso e com acesso restrito. Não houve conexão ao provedor. Os 22 testes unitários do adaptador e cinco testes de comportamento do catálogo também passaram. Esses números se referem à versão técnica ensaiada, sem substituir os pilotos e as aprovações pendentes acima.
