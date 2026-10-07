# Plano operacional — documentos, contratos, assinatura e honorários

Atualizado em 07/10/2026. Este plano complementa o
[`PLANO_PLATAFORMA_JURIDICA_E_ISENCAO_IR.md`](PLANO_PLATAFORMA_JURIDICA_E_ISENCAO_IR.md)
e transforma os recursos já construídos em uma jornada operacional completa,
mensurável e recuperável.

## 1. Resultado esperado

O escritório deve conseguir executar, em um único caso:

1. solicitar e receber laudo, holerite, informe ou outro documento;
2. verificar arquivo, autoria, legibilidade, páginas e categoria de acesso;
3. executar OCR e apresentar os dados encontrados com página e confiança;
4. submeter divergências e campos sensíveis à revisão humana;
5. homologar cálculos fiscais e calcular honorários conforme regra contratual;
6. gerar contrato versionado a partir de modelo aprovado;
7. revisar e liberar a versão exata que será enviada;
8. enviar ao cliente um link individual, autenticado e com validade;
9. receber assinatura, evidências e documento final por webhook idempotente;
10. criar parcelas/cobranças somente após os gatilhos aprovados;
11. informar advogado e cliente e manter trilha de auditoria completa;
12. detectar falhas externas, tentar novamente com segurança e encaminhar exceções.

Nenhuma etapa automática deve substituir decisão jurídica, diagnóstico médico,
homologação contábil ou aprovação de uma mensagem sensível.

## 2. Estado atual e lacunas

| Capacidade | Estado técnico atual | Lacuna para operação real |
| --- | --- | --- |
| Revisão de laudo | Dossiê, checklist, documentos privados e revisão objetiva | Piloto profissional com documentos autorizados e métricas de acerto |
| Holerite/contracheque | OCR privado, texto por página, confiança e correção versionada | Ativar cota no escritório, homologar extração e campos fiscais |
| Cálculo de IR | Motor decimal, parâmetros versionados e memória de cálculo | Homologação conjunta advogado/contador e massa de regressão independente |
| Honorários | Fixo, êxito, deduções, parcelamento, revisão e livro do caso | Regras comerciais finais e gateway real homologado |
| Contratos | Modelos, instrumentos, versões, aprovador e rascunhos | Renderização final consistente, assinatura e envio real |
| Assinatura | Contrato de integração e estados previstos | Escolher/contratar provedor, implementar convite, webhook e evidências |
| Link do cliente | Portal por caso e acesso individual | Jornada pública de assinatura, expiração, reenvio e recuperação |
| Cobrança | Adapter Asaas, idempotência e callbacks testados | Credenciais/conta reais, webhook e conciliação homologados |
| IA documental | Política, cotas, citações e revisão | Ativar provedor, avaliar com casos autorizados e manter fallback manual |

## 3. Princípios contra falhas futuras

### 3.1 Estados explícitos

Cada fluxo deve usar uma máquina de estados persistida. Proibido inferir conclusão
pela existência de um arquivo, pelo retorno HTTP 200 ou por uma mensagem de tela.

Estados mínimos do pacote contratual:

`draft -> in_review -> approved -> preparing -> sent -> viewed -> signed -> completed`

Saídas controladas:

`returned`, `expired`, `declined`, `cancelled`, `delivery_failed`, `provider_unknown`.

Transições devem ocorrer no banco dentro de transação, com ator, instante,
versão anterior e motivo. Estado terminal não pode ser sobrescrito por callback
antigo ou fora de ordem.

### 3.2 Idempotência em todos os efeitos externos

- Toda solicitação de OCR, assinatura, mensagem e cobrança recebe chave única.
- A chave e o hash do payload são persistidos antes da chamada externa.
- Repetir a mesma chave com payload diferente deve falhar.
- Webhooks são deduplicados por provedor, conta e ID do evento.
- Timeout fica `provider_unknown`; o sistema consulta o provedor antes de reenviar.
- Reprocessamento exige comando explícito e referência à tentativa anterior.

### 3.3 Versão congelada

Ao aprovar um contrato, congelar:

- modelo e versão;
- variáveis preenchidas;
- regra e memória de honorários;
- hashes dos anexos;
- signatários, ordem e papéis;
- conteúdo renderizado e hash do PDF.

Alterações posteriores criam nova versão e invalidam convites ainda não assinados.
O documento assinado sempre aponta para a versão congelada que originou o envio.

### 3.4 Confirmação por leitura do resultado

Depois de cada mutação, reler o registro autoritativo. Para fornecedores, separar:

- solicitação aceita;
- enviada;
- entregue;
- visualizada;
- assinada ou paga;
- documento/recibo final recuperado e validado.

### 3.5 Segurança e privacidade

- Tenant, caso, categoria e permissão validados no servidor em toda operação.
- Laudos e dados fiscais permanecem em storage privado, sem conteúdo em URL/log.
- Links públicos usam token opaco, hash persistido, expiração e uso limitado.
- Download usa URL curta e auditada; revogação bloqueia novas emissões.
- Segredos de fornecedores ficam somente no servidor e com rotação documentada.
- Logs registram IDs técnicos e códigos, sem diagnóstico, CPF ou texto de documento.
- Aprovação, assinatura e movimentação financeira exigem autenticação reforçada
  conforme o risco e política do escritório.

### 3.6 Fallback operacional

Cada integração deve oferecer alternativa manual segura:

- OCR indisponível: digitação e conferência versionadas;
- IA indisponível: modelo editável sem geração;
- assinatura indisponível: upload do documento assinado externamente, com revisão;
- mensageria indisponível: copiar link somente após autorização registrada;
- cobrança indisponível: obrigação manual, sem marcar pagamento automaticamente.

## 4. Arquitetura do fluxo

### 4.1 Orquestração durável

Criar uma fila/outbox transacional para efeitos externos. O commit do negócio grava
o evento; workers independentes fazem OCR, renderização, assinatura, comunicação e
cobrança. Cada worker usa lease, tentativas limitadas, backoff com jitter e fila de
erros. Reiniciar um worker não pode perder nem duplicar efeito.

Componentes:

- `legal_workflow_runs`: execução principal por caso e versão;
- `legal_workflow_steps`: estado, tentativa, dependências e próximo horário;
- `legal_outbox_events`: evento persistido na mesma transação da decisão;
- `legal_provider_events`: envelope bruto mínimo, hash e processamento do webhook;
- `legal_operational_alerts`: exceções abertas, responsável, prazo e resolução;
- `legal_delivery_ledger`: canal, destinatário revisado e estados de entrega;
- `legal_signature_envelopes`: provedor, versão, signatários e estado;
- `legal_signature_evidence`: hash, evento, IP quando permitido, carimbo e arquivo;

### 4.2 Adaptadores isolados

Definir contratos internos estáveis:

- `DocumentReader`: extrair páginas e confiança;
- `SignatureProvider`: criar, consultar, cancelar e baixar evidências;
- `MessageProvider`: enviar e consultar entrega;
- `PaymentProvider`: criar, consultar, cancelar e reconciliar cobrança;
- `PdfRenderer`: gerar o mesmo PDF para a mesma entrada e versão.

Código de negócio não pode depender do formato bruto do fornecedor. Cada adaptador
normaliza estados, limita tempo e tamanho e preserva o identificador remoto.

### 4.3 Reconciliação programada

Executar reconciliadores periódicos para itens presos ou incertos:

- assinatura sem callback;
- mensagem aceita sem entrega final;
- cobrança pendente além do prazo;
- OCR com lease vencido;
- PDF cujo hash não corresponde ao aprovado;
- outbox sem processamento;
- webhook recebido e ainda não aplicado.

O reconciliador consulta antes de repetir qualquer ação com efeito externo.

## 5. Fases de execução

### Fase A — Baseline, fornecedores e critérios

Objetivo: impedir implementação sobre premissas indefinidas.

- Mapear telas, tabelas, RPCs, funções, workers e estados já existentes.
- Escolher provedor de assinatura após prova de API, webhook, evidências, LGPD,
  custo, sandbox, disponibilidade e exportação do documento final.
- Confirmar conta Asaas, WhatsApp/e-mail e provedor de IA/OCR do ambiente real.
- Definir modelos de contrato, tipos de honorários, signatários e políticas.
- Definir responsáveis por aprovação jurídica, fiscal, financeira e operacional.
- Criar conjunto sintético de referência com laudo, holerite, cálculos e contrato.

Critério de saída: matriz de decisão assinada, sandbox funcional, contratos de API
congelados e dados sintéticos esperados aprovados pelo jurídico e pelo contador.

### Fase B — Entrada e classificação documental

Objetivo: nenhum arquivo chega ao OCR sem integridade e autorização.

- Upload privado em duas etapas com limite de tamanho, MIME real e antivírus.
- Calcular SHA-256 no servidor e recusar arquivo corrompido ou formato divergente.
- Classificação inicial como sugestão; usuário confirma laudo, holerite ou outro.
- Detectar arquivo protegido, ilegível, incompleto, girado e páginas duplicadas.
- Separar categorias médica, fiscal, geral e restrita desde a entrada.
- Gerar solicitação de correção para o cliente sem expor o documento.

Critério de saída: arquivos válidos seguem; inválidos ficam bloqueados com motivo,
ação sugerida e histórico. Testar acesso cruzado, arquivo malicioso e interrupção.

### Fase C — Laudo assistido e revisão profissional

Objetivo: conferir requisitos documentais sem produzir diagnóstico.

- OCR com página, coordenadas, confiança, motor e versão.
- Extrair como candidatos: paciente, emissor, registro, datas, assinatura,
  diagnóstico escrito, CID quando presente, histórico e limitações descritas.
- Exibir cada candidato ao lado do trecho de origem.
- Marcar ausente, ilegível, conflitante, não comprovado ou conferido.
- Comparar datas do laudo, doença, benefício e aposentadoria sem tratá-las como iguais.
- Exigir aprovação do advogado para enquadramento e estratégia.
- Guardar correções como versão nova; nunca modificar silenciosamente o OCR original.

Critério de saída: nenhum campo de baixa confiança entra no caso sem revisão;
resultado sempre mostra a fonte e distingue fato, sugestão e decisão profissional.

### Fase D — Holerite, informe e cálculo fiscal

Objetivo: cálculo reproduzível e homologável.

- Identificar pagador, benefício, competência, bruto, retenção, descontos e líquido.
- Mostrar valores extraídos por página, confiança e campo editado.
- Bloquear cálculo quando competência, pagador ou valor essencial estiver ausente.
- Usar decimal exato; nunca `float` para dinheiro.
- Versionar parâmetros por exercício, regra, fonte e vigência.
- Produzir memória completa: entradas, fórmula, arredondamento e resultado.
- Executar conferência independente com valores esperados pelo contador.
- Alertar duplicidade de competência, pedido sobreposto e cessação não observada.

Critério de saída: mesmo snapshot gera o mesmo resultado; alteração de parâmetro
gera versão diferente; advogado e contador homologam explicitamente.

### Fase E — Honorários e proposta

Objetivo: transformar regra comercial em cálculo auditável.

- Suportar fixo, êxito, híbrido, parcelas, entrada, limites e deduções.
- Validar base permitida pelo contrato e impedir uso de estimativa como recebimento.
- Simular cenários antes da aprovação, com explicação simples para o cliente.
- Congelar regra aprovada junto à versão do contrato.
- Separar obrigação, cobrança, pagamento e saldo.
- Exigir revisão para mudança de percentual, base, vencimento ou beneficiário.

Critério de saída: centavos, parcelamento, pagamento parcial, excesso, estorno e
concorrência passam; cálculo exibido coincide com a memória persistida.

### Fase F — Montagem e aprovação do contrato

Objetivo: gerar documento final consistente e revisado.

- Editor de modelos com campos tipados e obrigatórios.
- Prévia do contrato com realce de campos vazios ou inconsistentes.
- Renderizador determinístico no servidor, fontes incorporadas e paginação estável.
- Comparação entre versões e fluxo `rascunho -> revisão -> aprovação`.
- Congelar PDF, hash, variáveis, regra de honorários e signatários na aprovação.
- Bloquear envio se houver campo vazio, documento vencido ou aprovação revogada.

Critério de saída: regenerar a mesma versão produz o mesmo hash; contrato alterado
não reutiliza convite anterior; download respeita permissão e é auditado.

### Fase G — Link, aceite e assinatura eletrônica

Objetivo: concluir assinatura com evidência verificável.

- Criar envelope com chave idempotente e signatários revisados.
- Gerar link individual de curta validade; nunca expor ID interno previsível.
- Autenticar cliente conforme risco e exigência do provedor.
- Registrar envio, entrega, abertura, aceite, recusa, expiração e cancelamento.
- Validar assinatura do webhook e conta/ambiente antes de aplicar evento.
- Ignorar evento duplicado e impedir regressão por evento fora de ordem.
- Baixar PDF final e pacote de evidências; conferir hash e vínculo com envelope.
- Guardar original aprovado e assinado como arquivos distintos e imutáveis.
- Permitir reenvio somente após consultar estado atual; novo link revoga o anterior.

Critério de saída: assinatura real em sandbox e produção controlada, callback
duplicado/atrasado, link expirado, recusa e cancelamento testados ponta a ponta.

### Fase H — Comunicação, cobrança e portal

Objetivo: dar continuidade sem produzir efeito indevido.

- Escolher canal permitido e confirmar destinatário antes do primeiro envio.
- Templates versionados, aprovados e sem dado sensível desnecessário.
- Enviar contrato por WhatsApp/e-mail somente após aprovação registrada.
- Criar obrigação financeira a partir da versão contratual assinada.
- Criar cobrança Asaas somente com conta, cliente, valor e vencimento revisados.
- Processar pagamentos, parciais, taxas e estornos por webhook idempotente.
- Liberar ao portal apenas contrato/documentos explicitamente autorizados.
- Notificar advogado sobre assinatura, falha, vencimento e pagamento.

Critério de saída: mensagens têm estado de entrega; pagamento só aparece recebido
após evidência; portal perde acesso imediatamente após revogação.

### Fase I — Operação, observabilidade e recuperação

Objetivo: operar sem depender de descoberta manual pelo cliente.

- Painel de saúde por fornecedor, fila, latência e taxa de erro.
- Alertas por item preso, webhook inválido, divergência de hash e quota próxima.
- IDs de correlação do navegador ao worker e fornecedor.
- Runbooks para indisponibilidade, segredo expirado, quota, rollback e vazamento.
- Dead-letter queue com inspeção, motivo e reprocessamento controlado.
- Backup, restauração ensaiada e exportação por caso.
- Feature flags por tenant e capacidade, com desligamento imediato.
- Auditoria de acessos sensíveis e revisão periódica de permissões.

Critério de saída: simular indisponibilidade e recuperar sem duplicar assinatura,
mensagem ou cobrança; restauração cumpre RPO/RTO acordados.

### Fase J — Piloto e expansão

Objetivo: provar valor e segurança antes de liberar para todos.

- Escritório interno/sintético.
- Dois usuários profissionais com casos sintéticos.
- Piloto consentido com poucos casos e acompanhamento diário.
- Liberação gradual por tenant e recurso.
- Reunião de aceite com jurídico, contador, operação e segurança.
- Plano de reversão e exportação confirmado antes de ampliar.

Critério de saída: métricas dentro dos limites, nenhuma pendência crítica e termo
de aceite registrado. A ausência de incidente não substitui os testes previstos.

## 6. Matriz obrigatória de testes

### Funcionais

- arquivo válido, ilegível, protegido, incompleto e duplicado;
- laudo com dados ausentes, conflitantes e baixa confiança;
- holerite com múltiplas páginas, múltiplos pagadores e competências repetidas;
- honorários fixos, êxito, híbrido, deduções e parcelamento;
- contrato com campos vazios, revisão devolvida e versão substituída;
- assinatura concluída, recusada, expirada e cancelada;
- pagamento total, parcial, duplicado, excessivo e estornado.

### Segurança e privacidade

- outro tenant, usuário sem categoria, portal e link revogado;
- troca de IDs, URL expirada, token reutilizado e webhook sem assinatura;
- arquivo malicioso, MIME falso, prompt injection e saída de IA sem citação;
- remoção de conteúdo sensível de logs, eventos, métricas e alertas.

### Concorrência e idempotência

- dois envios simultâneos do mesmo contrato;
- callback repetido, fora de ordem e durante cancelamento;
- dois workers reivindicando o mesmo job;
- alteração da versão enquanto renderiza ou assina;
- duas cobranças concorrentes para a mesma obrigação;
- timeout seguido de reconciliação.

### Resiliência

- fornecedor 400, 401, 403, 404, 409, 429 e 5xx;
- DNS/timeout, conexão interrompida e resposta inválida;
- worker reiniciado após chamada externa e antes do commit;
- banco indisponível, storage indisponível e segredo rotacionado;
- restauração de backup e replay seguro da outbox.

### Compatibilidade visual

- desktop e celular;
- PDF com acentos, nomes longos, tabelas, quebra de página e assinatura;
- acessibilidade por teclado, foco, leitor de tela e mensagens de erro acionáveis.

## 7. Observabilidade e metas iniciais

| Indicador | Meta inicial |
| --- | --- |
| Jobs sem estado terminal após SLA | 0 sem alerta aberto |
| Duplicação de assinatura/cobrança | 0 |
| Eventos de webhook não processados | alerta em até 5 min |
| OCR com campos essenciais sem revisão | 0 |
| Contratos enviados sem aprovação | 0 |
| Divergência entre PDF aprovado e assinado | 0 |
| Cálculos sem versão/parâmetro/memória | 0 |
| Falhas externas sem responsável | 0 |
| Incidentes com dados entre tenants | 0 |

Métricas de negócio: tempo do documento à revisão, tempo da aprovação à assinatura,
taxa de abandono, pendências por causa, correções por tipo de campo, tempo de
homologação, conversão em contrato e inadimplência. Não registrar conteúdo sensível.

## 8. Publicação segura

Para cada fase:

1. migration aditiva, reversível quando possível e testada em clone;
2. backend compatível com schema antigo e novo durante a transição;
3. worker/adaptador em modo sem envio;
4. testes unitários, integração, SQL, concorrência e navegador;
5. deploy em staging com dados sintéticos;
6. leitura do estado persistido e prova do efeito externo;
7. feature flag ativada para tenant piloto;
8. acompanhamento e reconciliação;
9. expansão gradual;
10. remoção de compatibilidade somente após confirmar adoção.

Nunca considerar concluído apenas porque o Git foi publicado ou o deployment ficou
verde. A evidência final deve cobrir navegador, API, banco, worker, fornecedor e
resultado recuperado.

## 9. Dependências que exigem decisão do usuário

Concentrar estas decisões antes do início da fase correspondente:

- provedor de assinatura e conta contratada;
- modelos finais de contrato e identidade visual;
- regra de autenticação/aceite do cliente;
- conta Asaas e ambiente inicial;
- canais oficiais de envio e templates;
- responsável jurídico e contador homologadores;
- política de retenção e descarte de documentos;
- volume mensal esperado, prazo de atendimento e orçamento por fornecedor;
- tenants e usuários do piloto consentido.

Credenciais e documentos reais não devem ser colocados neste arquivo ou no Git.

## 10. Ordem recomendada

1. Fase A — decisões e baseline;
2. Fases B e C — documentos/laudos;
3. Fase D — holerites e cálculo;
4. Fase E — honorários;
5. Fase F — contrato final;
6. Fase G — assinatura;
7. Fase H — comunicação, cobrança e portal;
8. Fase I — operação e recuperação;
9. Fase J — piloto e expansão.

Assinatura e cobrança podem ser desenvolvidas em paralelo depois que a versão
congelada do contrato e a outbox estiverem prontas. Produção deve respeitar a ordem
de ativação acima para evitar que efeitos externos antecedam as aprovações.

## 11. Definição de pronto do programa

O programa estará pronto quando um caso autorizado percorrer toda a jornada com
documentos reais do piloto, revisão nominal, cálculo homologado, contrato aprovado,
link entregue, assinatura recuperada e verificada, cobrança conciliada e acesso no
portal; quando as falhas planejadas forem detectadas e recuperadas sem duplicidade;
e quando auditoria, suporte, backup e desligamento de emergência estiverem operáveis.
