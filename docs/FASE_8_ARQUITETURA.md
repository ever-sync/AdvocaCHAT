# F8 — Operações especializadas, sucessores e acesso por diligência

Documento histórico; implementação e verificação finais em [F8 — entrega técnica](FASE_8_OPERACOES_ESPECIALIZADAS.md) e [contrato SQL](FASE_8_CONTRATO.md). Nenhum adaptador institucional foi implementado.

Proposta de arquitetura preparada em **11/09/2026**, após a leitura do código F1–F7 e das fontes abaixo. Nomes e assinaturas são um contrato proposto para distribuição do trabalho; **a migration 2600 e os conectores F8 ainda não estão implementados neste documento**. Não há homologação institucional, autorização para atos externos ou aprovação de tese jurídica decorrente desta proposta.

Referências internas: [plano, F8.01–F8.07](./PLANO_PLATAFORMA_JURIDICA_E_ISENCAO_IR.md), [portal F5](./FASE_5_ARQUITETURA.md), [captura e prazos F6](./FASE_6_CONTRATO.md), [assistência documental F7](./FASE_7_CONTRATO.md).

## 1. Entregas e limites verificáveis

| Item | Entrega implementável no produto | Dependência que permanece explícita |
| --- | --- | --- |
| F8.01 | Registro da instituição, autorização versionada, cobertura por operação e adaptador de consulta estritamente permitido; registro manual de recibos | Credenciais e habilitação próprias da instituição no Domicílio, contrato técnico conferido, ensaio do ambiente e revisão do responsável |
| F8.02 | Matriz de conector/tribunal/grau/operação com provas e resultados de homologação | Cada operação precisa de evidência própria; um teste do fornecedor não homologa todos os tribunais |
| F8.03 | Preparação versionada do ato, checklist de assinatura/representação, autorização nominal e conferência do recibo de ato realizado por canal autorizado | Envio real exige canal, assinatura e permissão correspondentes; permanece indisponível sem esses elementos |
| F8.04 | Diligência atribuída a identidade externa individual, instruções e arquivos liberados especificamente, prazo de acesso, entrega e revisão | Identidade/qualificação e instruções conferidas pelo escritório; testes não enviam convites reais |
| F8.05 | Dossiê de falecimento, pessoas interessadas, evidências, representação e decisões externas registradas | Habilitação e poderes não são inferidos; análise nominal do advogado e documento aplicável ao ato |
| F8.06 | Pacotes versionados de organização de especialidades, prévia da instalação e aplicação idempotente | Demanda e homologação dos pilotos; nenhum pacote instala tese, prazo, cálculo, assinatura ou política de IA já aprovados |
| F8.07 | Registro de viabilidade, acordo, canal, operação, custo e cobertura de INSS/cartórios/outros serviços | Acordo institucional e permissão comercial/técnica específicos; catálogo público não significa acesso liberado |

Critério de comunicação: distinguir **adaptador implementado**, **configuração presente**, **operação autorizada**, **homologação registrada** e **operação ativa**. Nenhum desses estados será sintetizado como “integração completa”. Ausência de credencial ou de permissão resulta em estado persistente e legível.

## 2. Fontes e implicações

Consulta de 11/09/2026. Conteúdo abaixo orienta campos e cenários de revisão, não decide um caso concreto.

| Fonte primária | Regra observada / consequência no produto |
| --- | --- |
| [CPC, texto compilado, arts. 75 VII, 110, 313 e 687–692](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105compilada.htm) | Espólio/representação e habilitação processual são questões distintas. Registrar quem se apresenta, quem representa, qual prova e qual decisão foi juntada. Falecimento não altera partes, suspende tarefas nem habilita sucessor automaticamente. |
| [Receita Federal — restituição, situações especiais](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/restituicao/pedido), página atualizada em 08/03/2023 | O procedimento diferencia existência de bens, dependentes habilitados e estado do pagamento bancário. Documentação e destino do valor são analisados especificamente. O cadastro de parentesco não cria percentuais ou direito ao recebimento. |
| [Receita Federal — pessoa falecida com bens](https://www.gov.br/receitafederal/pt-br/canais_atendimento/atendimento-virtual/falecidos/com-bens) | A representação perante a Receita depende do instrumento e da situação, inclusive nomeação de inventariante ou representação provisória. Registrar fundamento, alcance e prova; não supor que uma procuração geral do CRM atende a todo ato. |
| [Receita Federal — declaração de espólio](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/espolio), atualizada em 05/02/2024 | Preservar a identidade do contribuinte falecido e distinguir declarações inicial/intermediárias/final. O cadastro de sucessores não transfere declarações ou histórico fiscal para outro cliente. |
| [PDPJ — Domicílio Judicial Eletrônico](https://docs.pdpj.jus.br/servicos-negociais/domicilio-judicial-eletronico/) | A API institucional usa credencial própria e identidade da instituição. A lista de comunicações tem filtro temporal limitado ou processo; inteiro teor/abertura pode registrar ciência. Cadastro no CRM, consulta de lista e ciência são operações diferentes. O manual contém rotas de homologação e serviços exclusivos de tribunais: não copiar endpoint de ambiente nem presumir permissão de destinatário. |
| [CNJ — Modelo Nacional de Interoperabilidade](https://www.cnj.jus.br/modelo-nacional-de-interoperabilidade/) e [integração para tribunais](https://www.cnj.jus.br/integracao-para-os-tribunais/) | Referências conferidas nas notas de preparação da coordenação. A reabertura automática do primeiro endereço falhou nesta revisão. Usar como referência do padrão; ainda exigir endpoint, versão e evidência da operação concreta antes da implementação do conector. |
| [Catálogo Conecta gov.br](https://www.gov.br/conecta/catalogo/apis) | Catálogo para integração governamental; a presença de API não concede acesso a um SaaS privado. Registrar elegibilidade/contrato antes de declarar disponibilidade. |
| [INSS — ACT OAB-SC](https://www.gov.br/inss/pt-br/acesso-a-informacao/acts/acordos-de-cooperacao-tecnica-acts-por-estado/santa-catarina-sc/oab-sc/acordo-de-cooperacao-tecnica-entre-o-inss-srsul-e-oab-sc) | Exemplo oficial de acesso dependente de acordo, conforme notas de preparação. Não universalizar a outros estados, entidades, operações ou escritórios. |
| [ONR — API de assinatura](https://www.onr.org.br/api-de-assinatura-do-onr-saiba-como-disponibilizar-esta-funcionalidade-para-os-registros-de-imoveis-do-brasil/) | Referência das notas de preparação a serviço voltado a sistemas de cartórios. Não equivale a contrato de pesquisa geral ou assinatura para este CRM. |

Para restituição de falecido, registrar separadamente: `assets_status=unknown/declared_present/declared_absent`, `dependency_status=unknown/reported/documented`, `payment_location=unknown/not_released/available_at_bank/credited/returned_to_revenue`, documentos e revisão. Esses valores são **fatos declarados ou documentados**, não resultados de uma árvore de decisão jurídica. Os prazos de resgate bancário ou de pedidos não são aplicados ao crédito F4 sem seleção de regra e revisão próprias.

## 3. Reuso e isolamento

| Base atual | Reuso | Limite que não pode ser ampliado implicitamente |
| --- | --- | --- |
| F1 caso/partes/documentos privados | IDs existentes, SHA, categoria, prova pronta, responsável e ACL do caso | Nenhuma mudança de tenant/cliente/parte histórica por instalação de pacote ou sucessão |
| F3 `legal_representations` | Instrumento, parte representante, vigência, estado e prova | O escopo F3 atual `document_upload` não representa poderes de peticionar, receber valores ou consultar serviços externos |
| F5 identidade `legal_portal` | Auth individual, storageKey externo, Edge exclusiva e bloqueio de perfil/tenant interno | Um correspondente recebe concessão por diligência; não recebe membership de caso inteiro para contornar o isolamento |
| F5 concessões de representação | Conferência adicional de escopos do portal | Acesso ao portal não prova legitimidade sucessória nem habilitação processual |
| F5 financeiro | Obrigações, prova, beneficiário, alocação e reconciliação | Não transformar crédito tributário do falecido em honorário, receita do escritório ou saldo do herdeiro |
| F6 catálogos/cobertura/jobs/inbox | Versionamento, quota, idempotência, originais privados e conferência de associação | Providers e operações atuais são enums fechados. Conector F8 exige extensão explícita e testes; não usar `escavador` como alias de outro serviço |
| F7 referências/rascunhos | Texto privado revisável e versões com citações | Pacotes não conferem automaticamente texto, página, política, instrumento ou resultado de IA |

Todos os dados de caso usam tenant físico, perfil ativo, feature e categoria no servidor. `restricted` exige acesso médico **e** fiscal. Dados externos originais e dossiês sucessórios começam `restricted`; projeções menores são preparadas e revisadas pelo responsável. Logs contêm IDs, estados e códigos, sem nomes, CPF, texto de peças, URLs com tokens ou credenciais.

## 4. Sucessores: modelo proposto

### Registros

- `legal_succession_versions`: `id,tenant_id,case_id,succession_key,version_number,previous_version_id,deceased_party_id,death_on?,death_document_id?,category='restricted',assets_status,dependency_status,payment_location,proceeding_id?,notes,state,created_by/at,reviewed_by/at,review_note`. Estados `draft/in_review/reviewed/returned/revoked`; revisão indica dossiê conferido, nunca deferimento.
- `legal_succession_persons`: versão, `party_id`, `claimed_capacity` (`spouse/partner/heir/legatee/dependent/estate_representative/other/unknown`), `capacity_note`, `evidence_document_ids[]`, `representation_id?`, pendências. A capacidade é declarada; `review_state` é documental. Até 50 pessoas e 20 provas por versão, sem gravar CPF redundante em JSON.
- `legal_succession_authority_reviews`: dossiê/pessoa, `operation` fechada (`document_collection/portal_access/administrative_representation/judicial_representation/payment_request`), `representation_id?`, `evidence_document_ids`, `basis_note`, `scope_note`, `valid_from/until`, `decision=reviewed/insufficient/revoked`, revisor/instante. Não estende os scopes de F3; é uma revisão vinculada à operação e às provas.
- `legal_succession_events`: fatos externos append-only, `event_kind` (`death_reported/estate_filing/appointment/habilitation_requested/habilitation_decided/document_received/payment_authority_recorded/note`), `occurred_at?` com offset ou `occurred_on?`, `document_id?`, `description`, `previous_event_id?` em correções. Nomeação, decisão e autorização de pagamento exigem prova pronta. Sem marcar decisão externa pelo simples estado `reviewed` do dossiê.

Revisão calcula snapshot dos IDs/SHAs/estados da prova e representação; `is_current` é derivado. Mudança de prova, revogação, vencimento, mudança do responsável ou nova versão exige nova conferência antes de uso. A revisão exige ACL conjunta e responsável do caso. Partes e valores F4/F5 permanecem associados aos titulares originais; uma eventual instrução de pagamento tem beneficiário e documento próprios, com revisão e conciliação específicas.

### RPCs propostas

`legal_succession_create_version(p_case_id,p_payload)` → metadados; criação/correção por editor restrito, payload fechado e limite 256 KiB. `legal_succession_read(p_version_id)` → conteúdo auditado e `is_current`. `legal_succession_submit`, `legal_succession_review(p_version_id,p_decision,p_note)` → versão. `legal_succession_record_authority(p_version_id,p_payload)` e `legal_succession_record_event(p_version_id,p_payload)` → registro append-only. `legal_succession_context(p_case_id)` → apenas metadados autorizados e pendências, sem documentação integral.

Uma certidão de óbito não cancela globalmente a identidade Auth: ela pode estar ligada a outros casos/instituições e o relato pode ser incorreto. O responsável pode colocar em espera os vínculos **daquele caso** mediante ação explícita e motivo, preservando trilha; bloqueio de segurança impede novas liberações dependentes até reavaliação. Tarefas judiciais não são apagadas nem recalculadas em razão desse registro.

## 5. Correspondentes e parceiros por diligência

`legal_diligence_versions`: caso/processo opcional, categoria, título externo, instrução revisável, identidade externa atribuída, supervisor/substituto internos, prazo operacional informado, expiração de acesso, orçamento/honorário informativo vinculado a acordo F5 quando existir, estado e versão. Uma diligência tem **uma identidade externa**; alteração do destinatário cria nova concessão e invalida a anterior.

`legal_diligence_grants`: `identity_id,diligence_version_id,scopes,allow_medical,allow_fiscal,valid_from,expires_at,revision,state,approved_by/at,note`. Escopos fechados: `instruction:read`, `files:read`, `delivery:upload`, `message:write`. Aprovação do escritório e aceite do destinatário são registros diferentes. Expiração é verificada com `clock_timestamp()` em cada ação; o job de encerramento apenas materializa o estado e tarefas.

`legal_diligence_releases` e `legal_diligence_requests`: arquivos individuais e coletas vinculados à diligência, SHA/categoria/expiração e instrução pública específica. Nenhum manifesto contém anexos não liberados. `legal_diligence_deliveries`: arquivo F1 privado, identidade, instante, hash, descrição, `submitted/reviewed/returned`, revisão nominal. Upload não conclui diligência nem comprova ato judicial. `legal_diligence_messages`: somente participantes desta diligência, sem histórico geral do caso.

Reutilizar a autenticação F5 e o fluxo de convite **sem credencial Auth devolvida ao escritório**. O destinatário faz login ou solicita seu próprio código. Se necessário, acrescentar destino fechado `diligence` à reserva/provisionamento existente, com validação do convite por SQL. Não criar outro sistema de senha, papel `authenticated`, profile interno nem tenant para o correspondente.

RPCs internas propostas: `legal_diligence_create_version`, `legal_diligence_review`, `legal_diligence_revoke`, `legal_diligence_prepare_invite`, `legal_diligence_review_delivery`. Service-only: `legal_diligence_service_context`, `...accept`, `...read_instruction`, `...authorize_download`, `...prepare_upload`, `...finalize_upload`, `...abandon_upload`, `...reply`; todos recebem ator extraído de `Auth.getUser` pelo Edge. IDs arbitrários de outra diligência/caso nunca são autorizados pela identidade em comum.

Download valida antes e depois de obter bytes, sem URL de Storage. Finalize revalida identidade/concessão/instrução/prova e preserva origem externa. Cleanup só remove blob após abandono confirmado no SQL, nunca após timeout ambíguo. F2 bearer público e endpoints de caso F5 não podem ler nem preencher solicitações de diligência por uma ponte alternativa.

## 6. Cobertura institucional e atos externos

### Matriz de cobertura versionada

`legal_operation_coverage_versions`: `provider,connector_key,api_version,environment,institution_reference,court,degree,unit,operation,channel,documentation_url,checked_on,permission_document_id,valid_from/until,limitations,adapter_state,homologation_state,reviewer`. Capabilities de consulta e de ato são distintas. Homologações append-only registram cenário, versão, prova, data, responsável e resultado (`passed/failed/inconclusive`), incluindo testes negativos.

Uma conexão server-owned vincula `tenant_id + account_id + institution_reference + environment`. CNPJ/identificadores institucionais ficam protegidos; conta do serviço e senha só no ambiente privado. Uma conta não pode ser reutilizada por outro tenant mediante parâmetros do browser. UI não recebe segredo, endpoint editável, URL de autenticação ou token. Reutilizar estados/quota F6 onde o significado for equivalente e registrar a extensão dos enums em migration aditiva.

### Domicílio, primeiro contrato implementável

Adaptador inicial de **metadados de comunicações e logs permitidos**, com rotas fechadas verificadas na documentação da versão implantada. Filtro temporal máximo de sete dias ou CNJ conforme contrato; paginação limitada e estado `pagination_incomplete`. Conta/instituição vêm do ambiente e da configuração aprovada, não de cabeçalhos enviados pelo usuário.

O código de consulta não implementa abertura, ciência, inteiro teor nem segue links retornados. Operações institucionais de cadastro, envio pelo tribunal, atualização de pessoa e aceitação de comunicação não entram por um proxy genérico. Autenticação/renovação do token de serviço é uma operação técnica separada. Ausência de configuração ou autorização não produz captura fictícia.

Originais restritos e versões de eventos seguem o modelo F6, sem associação automática por OAB/CNJ. Campo externo que diga “ciente” permanece alegação do provedor até prova/conferência; não é produzido por visualizar um card no CRM. Regras F6 de prazo continuam selecionadas e revisadas, sem inferir marco da data de captura.

### Preparação e registro de ato

`legal_external_act_versions`: caso/processo, canal/órgão/operador, tipo (`petition/awareness/administrative_request/other`), destinatário, versão do instrumento, arquivo final/hash, prova de assinatura, representação/revisão específica, cobertura, checklist, snapshot, revisor e estado. Separar `draft/in_review/ready/returned/revoked` do andamento externo.

`legal_external_act_attempts`: criação explícita, chave idempotente, versão/snapshot, conta/canal, `not_configured/permission_required/prepared/sending/unknown/provider_accepted/failed`, timestamps e códigos normalizados. Sem adaptador autorizado, tentativa permanece `not_configured`/`permission_required` e não faz fetch. Nenhuma rotina F7/IA dispara o ato. Timeout após possível envio não recebe retry automático.

`legal_external_act_receipts`: evidência privada, SHA, referência externa, processo/destinatário/canal, data declarada e data de registro, status de conferência, vínculo único à tentativa. `legal_external_act_reconcile` exige responsável, prova atual e concordância dos identificadores; só então registra `recorded_as_protocolled` ou ciência externamente comprovada. Guardar hash+referência impede reutilizar comprovante com outro ID. Retificação é nova evidência ligada à anterior; não apaga o evento.

RPCs internas propostas: `legal_external_act_create_version`, `...submit`, `...review`, `...prepare_attempt`, `...record_receipt`, `...reconcile`, `...read`. Eventual serviço de envio/consulta exige contrato separado com `claim/authorize_attempt/finish/receipt`, limites e guarda de ambiguidade F6. Nesta entrega, nenhuma chamada de ciência ou peticionamento é habilitada por inferência de autorização.

## 7. Pacotes de especialidade

`legal_specialty_package_versions`: tenant, chave, versão, título, propósito, especialidade declarada, escopo, fontes/consulta, nota de validade, limitações, `body`, estado e revisores. Sem catálogo jurídico global aprovado. Exemplos de organização para avaliação dos pilotos: isenção IR, sucessão relacionada ao crédito, previdenciário documental, consumidor e família; demanda ainda precisa ser confirmada.

`body` é esquema fechado com no máximo 50 itens de checklist, 20 etapas e 20 modelos de tarefa. Itens contêm chave, título, descrição, categoria, exigência organizacional e referências de origem. Não aceita JavaScript, SQL, fórmulas, instruções ao worker, URLs de execução, segredo, condição automática de elegibilidade, dias de prazo legal ou números de tese aprovados. Campo informativo de prazo fica como texto de conferência; tarefa só recebe data operacional explicitamente escolhida.

Instalar é criar snapshot do pacote e itens organizacionais. `legal_specialty_preview(p_case_id,p_version_id)` devolve exatamente inclusões/conflitos/permissões; `legal_specialty_apply(p_case_id,p_version_id,p_preview_hash,p_idempotency_key)` revalida e aplica atomicamente. Aplicar duas vezes a mesma chave retorna o resultado existente. Checklist/modelo F3/F7 referenciado precisa de revisão própria; referência revogada não é copiada silenciosamente.

`legal_specialty_installations` preserva versão, itens criados, autor e hash. Atualização de pacote não modifica instalações. Novo exame mostra diferença e cria outra instalação/versão mediante escolha explícita; respostas, documentos e tarefas já concluídas permanecem. Desativar pacote bloqueia usos futuros, sem remover histórico.

## 8. Divisão técnica e ordem sugerida

1. **Backend:** fechar enums/schemas/ACLs da migration F8, modelo de sucessão e pacotes; testar privacidade, versões e idempotência antes de UI. Não reutilizar helpers IR para conceder poderes além do escopo real.
2. **UI:** abas “Sucessores”, “Diligências”, “Atos e recibos” e “Especialidades”; catálogos/cobertura em área administrativa. Cards mostram conferência interna, ocorrência externa e pendência separadamente. Nenhum JSON bruto nem CPF/documento sensível no título de notificação.
3. **Edge/Auth:** concessões externas por diligência e download/upload privado; reutilizar sessão e identidade F5 com entrada própria. Domínio de acesso externo continua isolado do App/AuthProvider interno.
4. **Integração institucional:** registrar contrato e testes de Domicílio em modo consulta; adapters adicionais somente após contrato técnico fechado. Configuração e execução real dependem da prova do escritório, não da presença de campo na UI.
5. **Atos:** entregar preparação/recibo manual/reconciliação utilizáveis. Habilitação de um conector de ato externo é uma decisão específica posterior, com código e prova próprios; sem “enviar” cenográfico.

Convenções: UUID strings; dinheiro decimal em texto e SQL `numeric`; datas civis ISO e instantes com offset; limites de listas/payloads explícitos; leitura de conteúdo separada de listagem; tabelas privadas e RPCs com grants fechados. Caso → objeto é a ordem usual, preservando a ordem instrumento → versão → caso ao chamar F2. Catálogos não capturam casos após advisory lock; operações que dependam de ambos precisam de ordem documentada e corrida real.

## 9. Cenários mínimos de aceitação

| Cenário sintético | Resultado exigido |
| --- | --- |
| Relato de falecimento sem prova ou pessoa apenas marcada “herdeiro” | Dossiê pendente; nenhum poder, acesso financeiro, percentagem ou habilitação inferidos |
| Certidão presente, inventário/dependência desconhecidos | Campos continuam desconhecidos; checklist assistido pede conferência sem escolher via de restituição |
| Dossiê aprovado e representação expira/revoga durante uso | `is_current=false` ou ação negada; histórico preservado e nenhum novo acesso liberado |
| Upload finaliza depois de expiração/revogação da diligência | Não publica o documento; cleanup somente após abandono autorizado, sem apagar ready já confirmado |
| Correspondente A tenta ID de B, caso completo, RPC interna ou Storage | Negação; nenhuma passagem para `authenticated`, perfil ou tenant interno |
| Uma identidade atua em dois escritórios e recebe novo convite | Convite não emite sessão/senha/OTP ao escritório e não reativa grants de outro tenant |
| Domicílio sem instituição/credencial/permissão ou ambiente divergente | Estado explícito, zero chamadas ao provedor; UI não anuncia integração ativa |
| Lista paginada contém link de inteiro teor, HTML ou instrução | Preservação privada e texto escapado; nenhuma abertura, download automático, ciência ou execução |
| Provider corrige evento / callback chega duplicado ou fora de ordem | Original e versões preservados; replay idempotente, conflito em quarentena, sem rebaixar ocorrência conferida |
| Ato sem assinatura/cobertura/representação ou arquivo mudou | Preparação incompleta; não transmitir nem registrar protocolo |
| Timeout de envio e novo clique | Estado `unknown`, mesma tentativa; reconciliação antes de qualquer nova transmissão |
| Recibo de outro processo/beneficiário/tentativa ou reaproveitado | Recusa ou quarentena; não produz status de protocolo, pagamento ou ciência |
| Pacote com tese/prazo aprovado embutido, chave desconhecida ou fórmula | Recusa do esquema; nenhum objeto aprovado ou ato criado |
| Prévia muda antes da instalação ou pacote é revogado em concorrência | Hash atual obrigatório; nenhuma aplicação parcial |
| Instalação repetida / atualização de pacote | Idempotência e snapshot antigo preservados; nenhum dado ou tarefa concluída sobrescritos |
| Sucessor é cadastrado em caso de crédito tributário | Crédito/declaração/recebimento continuam com titular e prova originais; honorários do escritório separados |

Provas de encerramento: SQL com fixtures sintéticas e ROLLBACK, corridas reais de duas sessões nos grants/versões/idempotência, mocks de provedor somente em testes, navegador com ACL revogada/cache tardio, logs sem conteúdo e leitura após persistência. Homologação institucional, recebimento efetivo, ato externo e piloto comercial permanecem identificados como dependências reais até haver prova correspondente.
