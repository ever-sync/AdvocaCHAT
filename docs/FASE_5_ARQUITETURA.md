# Fase 5 — Portal individual, comunicação e financeiro do caso

Data da análise: **11/09/2026**. Estado: **arquitetura proposta para implementação**.
Este documento detalha F5.01–F5.09 do [plano principal](PLANO_PLATAFORMA_JURIDICA_E_ISENCAO_IR.md).
Não comprova integração contratada, envio, cobrança, identidade de pessoa real ou
homologação profissional. Nenhuma implantação ou alteração de F4 faz parte desta análise.

## 1. Decisões para começar

1. Usar identidade externa individual no Auth, com **role JWT/DB `legal_portal`**,
   sem `profiles`, sem novo `tenant`, sem assinatura SaaS e sem convite de colaborador.
   O portal acessa dados exclusivamente por Edge; sua role não usa schemas de dados.
2. Autorizar cada caso por vínculo revisado; representante precisa de poderes
   atuais e distintos para leitura, envio e financeiro. Um telefone ou email em
   comum não cria vínculo nem une clientes.
3. Mostrar somente conteúdo publicado para o destinatário: resumo compreensível,
   pendências, agenda, documentos liberados e prestação de contas aprovada.
4. Manter comunicações em versões aprovadas, com fila durável e recibos por canal.
   Preparar ou copiar convite não equivale a enviá-lo ou comprovar o destinatário.
5. Separar a assinatura do software, honorários do escritório e dinheiro de
   clientes. Reutilizar a aritmética decimal e rastreabilidade de F4; não reutilizar
   suas restituições como se fossem receitas do escritório.

## 2. Base observada e limites de reutilização

| Base atual | Reutilização segura | Alteração necessária em F5 |
| --- | --- | --- |
| `ensure_user_profile`, `handle_new_user`, `handle_user_email_confirmed` | Preservar cadastro e convites internos validados | Interceptar identidade externa em **todas** as entradas do bootstrap; sem tenant/profile/trial/email de boas-vindas interno |
| `useAuth`, `ProtectedRoute`, `App`, cliente Supabase global | Componentes visuais genéricos | Portal fora do provider interno; ausência de `profiles` nunca pode produzir perfil pelo fallback de metadata |
| `legal_cases`, `legal_case_parties`, `legal_case_members` | Caso, cliente/parte e ACL da equipe como origem | Membership externo separado de membro interno; FKs por caso/tenant |
| `legal_representations` F3 | Evidência, revisão, revogação, vigência e validade do instrumento | O escopo atual é somente `document_upload`; não concede leitura, exportação, assinatura ou acesso financeiro |
| Documentos privados F1 e coleta F2 | MIME/tamanho, hash, reserva/finalização, limpeza de falhas | Novas operações autenticadas de portal; não alargar as permissões dos proxies internos nem transformar bearer de coleta em identidade |
| Instrumentos/versionamento F2 | Contrato aprovado e evidência externa conferida | Honorários vinculados à versão exata; assinatura por provedor permanece P01 |
| Tarefas, agenda e eventos F2 | Responsável, substituto, situação e data manual | Publicar uma projeção escolhida; notas internas não entram automaticamente no portal |
| Resultados e recebimentos F4 | Origem comprovada e valores canônicos | Base de êxito revisada, livro de valores do cliente e contas a receber separados |
| `billing_*`, Asaas e AbacatePay existentes | Referências técnicas de chamadas e eventos | São assinatura do SaaS. Novas contas de cobrança por escritório; nenhum reaproveitamento implícito da credencial da plataforma |
| Resend em `_shared/email.ts` | Transporte, após adaptar idempotência e conteúdo seguro | Hoje sucesso HTTP gera `sent`; F5 precisa recibos autenticados e estados distintos |
| UAZAPI/envio/webhook existentes | Identificador do provedor e recibos já modelados no atendimento | Validar conta/canal, assinatura de callback, aprovação e vínculo com a comunicação jurídica; não disparar diretamente pelo evento do caso |

Evidências locais: migrations `20260911110000_profile_trust_boundary.sql`,
`20260910160000_explicit_platform_administration.sql`,
`20260717191000_trial_starts_after_email_confirmation.sql`, F1/F2/F3/F4;
`src/hooks/useAuth.tsx`, `src/lib/supabase.ts`, `src/App.tsx`, `src/main.tsx`;
Edges `legal-documents`, `legal-document-requests`, `invite-collaborator`,
`asaas-create-checkout`, `asaas-webhook`, `abacatepay-webhook`, `uazapi-webhook`.
Os arquivos foram lidos; configurações e entregas reais dos provedores não foram
homologadas nesta etapa.

## 3. Identidade externa e prevenção de tenant indevido — F5.01

### 3.1 Barreira no bootstrap

O fluxo atual cria tenant, `profiles.role=admin` e trial quando o novo usuário não
possui convite interno válido. Pular somente `handle_new_user` deixa o helper de
bootstrap disponível para recriar esses registros em outra chamada.

Existe ainda uma particularidade do Auth: no código oficial consultado,
`adminUserCreate` insere o usuário antes de aplicar `role` e `app_metadata`.
Logo, o trigger de INSERT não deve depender exclusivamente da presença imediata
desses campos. A API administrativa aceita UUID definido pelo servidor; a
sequência precisa ser ensaiada na versão efetivamente instalada.
[Código oficial do GoTrue](https://raw.githubusercontent.com/supabase/auth/master/internal/api/admin.go).

Contrato proposto:

- `legal_portal_provisioning`: registro privado, criado somente por serviço
  autorizado, com UUID futuro do Auth, convite, email normalizado, prazo de
  provisionamento, chave idempotente e estado `reserved|created|failed`.
  Não expor email nem a reserva em API pública.
- Antes do Admin API, reservar o UUID; criar usuário com esse `id`,
  `email_confirm:false`, `role:legal_portal` e `app_metadata` de origem externa.
  A senha inicial não é escolhida nem exibida pelo escritório.
- `ensure_user_profile` consulta a reserva confiável por UUID e email já durante
  o INSERT. Uma reserva externa ou identidade externa persistida impede bootstrap
  interno, inclusive depois de expirar/cancelar um convite. Divergência é erro,
  nunca fallback para criar escritório.
- Depois da criação, verificar UUID, role, marca e ausência de perfil/tenant;
  vincular a identidade ainda pendente. Falha intermediária fica sem grant e pode
  ser retomada idempotentemente. Não apagar uma conta preexistente como compensação.
- A marca persistida em `raw_app_meta_data`, a identidade e a reserva protegem
  chamadas futuras do helper. `raw_user_meta_data` nunca decide o domínio da conta.
- O trigger de confirmação de email não abre trial para identidade externa.
  Proteções também cobrem chamadas de manutenção, backfill e convite interno.

Metadata do usuário é editável; `app_metadata` tem gestão administrativa. Mesmo
assim, grants atuais ficam no banco, pois a remoção de acesso não deve aguardar
renovação de JWT. [Supabase: RLS e metadata](https://supabase.com/docs/guides/database/postgres/row-level-security).

### 3.2 Papel PostgreSQL e superfície permitida

Criar `legal_portal NOLOGIN NOINHERIT`, sem superuser, criação de roles/bancos ou
`BYPASSRLS`. Conceder ao `authenticator` a capacidade de assumir essa role; não
conceder `authenticated`, `service_role` ou roles administrativas ao portal.
O JWT emitido pelo Auth deve conter `role=legal_portal`. Esse é o mecanismo
documentado de troca de role no PostgREST.
[PostgREST: autenticação e SET ROLE](https://docs.postgrest.org/en/v12/references/auth.html).

**Contrato final: Edge exclusiva.** Não conceder USAGE de `public`, `storage` ou
schemas de aplicação à role externa, nem SELECT/DML/EXECUTE em objetos internos.
O navegador usa Supabase Auth para senha/sessão e chama a Edge com seu access token;
a Edge verifica `Auth.getUser(token)` e extrai o UUID, nunca o aceita do corpo.
Depois chama RPCs exclusivas de `service_role` com `p_actor_id` extraído. Essas RPCs
validam novamente identidade/role/membership/poderes/releases no banco e retornam
projeções mínimas. Não existe proxy genérico de tabela, função ou SQL fornecido pelo
cliente. As operações internas de gestão usam o JWT interno e sua ACL habitual.

**NOINHERIT não elimina privilégios concedidos a PUBLIC.** Retirar USAGE concedido
a PUBLIC no schema `public`, preservando em grants explícitos as roles internas,
anon/authenticated/service_role e componentes que o utilizam. Conferir schemas
expostos, funções/views em outros schemas e privilégios efetivos; não alterar
concessões globais sem ensaio. A barreira de schema impede resolução de RPCs legadas
mesmo quando EXECUTE foi herdado de PUBLIC. Não basta mudar `search_path`.
[PostgreSQL: schemas e privilégios](https://www.postgresql.org/docs/17/ddl-schemas.html).

Prova preliminar executada em 11/09/2026 **somente no clone local**
`advocachat_f4`, PG17: encontrados USAGE público e 116 funções SECURITY DEFINER de
`public` com EXECUTE PUBLIC. Uma transação criou role de teste, retirou USAGE
público e preservou concessões explícitas. Leitura de `profiles` e execução de
`add_business_minutes` foram negadas; roles internas selecionadas conservaram
USAGE. ROLLBACK removeu todas as mudanças, incluindo a role de teste. Isso prova o
mecanismo SQL; a liberação ainda inclui teste Auth/PostgREST/Storage/Edge reais e
regressão interna. Os atributos de roles do clone não substituem inventário live.

Uma conta já interna não será convertida, movida de tenant ou terá senha/role
alterada ao receber um convite externo. A primeira implementação deve detectar o
conflito e manter o convite pendente para revisão. Uma identidade já externa pode
ter vários memberships independentes; cada escritório visualiza somente seus
vínculos. Não revelar em resposta pública se o email existe em outro escritório.

### 3.3 Convite, ativação e prova de identidade

Tabelas propostas:

| Entidade | Campos e regras centrais |
| --- | --- |
| `legal_portal_identities` | `auth_user_id`, estado `pending|active|suspended`, revisão de identidade/contato, datas; não é `profiles` e não tem tenant próprio |
| `legal_portal_invites` | tenant/caso/parte, destinatário, tipo cliente/representante/contador, escopos propostos, representação se aplicável, hash de token, validade, versão, criador e revisão |
| `legal_portal_memberships` | identidade+tenant+caso+parte, tipo, grant revisado, vigência, estado, revisão e revogação; FKs compostas impedem cruzar casos |
| `legal_portal_membership_events` | Histórico append-only de emissão, ativação, concessão, redução e revogação; sem token ou cópia de documentos |

Fluxo concreto: responsável prepara convite → revisor confirma parte, identidade,
poderes e escopos → provisionamento externo → geração de link sem envio automático
→ destinatário ativa, define senha e aceita o acesso → servidor verifica identidade
e grant atuais → portal apresenta apenas conteúdo liberado.

`generateLink` gera link/OTP para distribuição pelo canal escolhido e pode criar
usuários em alguns tipos. Usá-lo **somente depois do provisionamento seguro**, com
UUID retornado conferido e tipo apropriado à conta existente; nunca como caminho
alternativo de signup. O tipo devolvido em `verification_type` precisa ser validado
e usado no `verifyOtp`; não presumir que `invite`, `signup` e `recovery` são
intercambiáveis. Confirmar primeiro o comportamento de `magiclink` para conta já
provisionada/não confirmada na versão instalada. A API de verificação aceita
`token_hash`. [Supabase: generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink),
[Supabase: verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).

O link copiável pelo escritório é uma credencial bearer. Seu consumo e até
`email_confirmed_at` no Auth, quando obtido desse link administrativo, **não provam
que o destinatário recebeu o email**. Guardar separadamente `activation_method`,
`identity_reviewed_at`, `contact_verification_method` e evidência/recibo. A liberação
depende da verificação individual aprovada, por canal verificado ou conferência
documentada; endereço apenas digitado não satisfaz isso. Sem evidência, manter
acesso pendente, sem documentos. O responsável não conhece a senha definida.

Rotação/revogação invalida o convite no banco. Um token Auth antigo ainda
consumível não reativa membership nem libera dados. Suspensão de identidade e
revogação por caso são verificadas a cada operação. Alteração de email exige
reverificação do contato, sem relincar automaticamente outras partes.

### 3.4 Sessão e entrypoint próprios

Implementar `PortalAuthProvider` e cliente Supabase com `storageKey` exclusivo,
`detectSessionInUrl:false`, cache de consultas separado e logout local à sessão
externa. Nunca usar `useAuth` como fonte de profile externo nem trocar a sessão
do advogado para testar o cliente.

O entrypoint deve classificar `/portal/*`, capturar e limpar fragmento/query **antes
de importar** `App`, cliente interno ou telemetria. Imports estáticos são avaliados
antes do corpo de `main.tsx`; limpeza posterior não impede um cliente global com
detecção automática de URL. Carregar shell de portal por ramo independente.
Destino de retorno é local e permitido; sem redirecionamento arbitrário, token em
query/log, analytics de sessão ou cache persistente de documentos. `no-store` e
`no-referrer` nos endpoints. Caches incluem identidade, membership, caso e revisão
de grants; cancelam requests e apagam conteúdo na revogação/logout.

## 4. Autorização e conteúdo externo — F5.01, F5.02 e F5.07

Escopos sugeridos: `case_summary:read`, `agenda:read`, `messages:read`,
`messages:write`, `requests:upload`, `documents:read`, `statements:read` e
`fiscal_exports:read`. Categoria documental e lista de documentos liberados são
restrições adicionais, não consequências automáticas de um escopo.

| Pessoa | Concessão mínima | Limites |
| --- | --- | --- |
| Cliente | Caso em que sua identidade foi vinculada à parte correta | Não recebe dados de outra parte, cliente ou caso por parentesco/telefone |
| Representante | Membership individual + representação ativa + escopos revisados | Vigência e poderes conferidos por ação; revogar mandato bloqueia grants dependentes |
| Contador | Pacote fiscal explicitamente aprovado, por caso, com validade | Sem exames, chat completo, dossiê médico ou cálculo conjunto por padrão |
| Equipe interna | ACL F1 atual e categoria acessível | Somente responsável pode ampliar grants; suporte/admin geral não substitui vínculo ao caso |

Extensão de representação deve registrar poderes de portal aprovados separadamente
do `document_upload` existente; uma migração não amplia os mandatos antigos.
Cliente próprio requer vínculo de identidade à parte; contador requer finalidade,
responsável e autorização específica; representante requer ainda mandato/evidência
vigente. Convite nunca valida por si a representação.

Entidades: `legal_portal_publications` (versão, texto revisado, categoria,
destinatários, fontes/versões, aprovação, retirada), `legal_portal_document_releases`
(documento/hash, membership, finalidade, validade, revisor),
`legal_portal_agenda_items` (projeção do compromisso, última revisão) e
`legal_portal_export_versions` (manifesto mínimo, fontes exatas e aprovação).

Status público é texto explícito como “documentos em conferência” ou “aguardando
resposta da fonte pagadora”. Não copiar resumo médico, estratégia, opinião interna,
decisão assistida ou estimativa de F4 para o cliente automaticamente. Aprovação de
uma publicação prende conteúdo e destinatários à versão; qualquer mudança exige
nova aprovação. Documento novo não herda liberação da versão anterior.

Download/exportação usa proxy, verifica identity+membership+escopo+categoria+
representação+release+documento ready/hash e grava auditoria. O arquivo completo
não é exposto por caminho de storage ou URL persistente. Exportação fiscal inclui
apenas itens escolhidos; não exporta snapshots F3/F4 completos para contador.

Upload autenticado liga solicitação à identidade e membership, preserva uploader
externo distinto de `profiles.id`, usa as mesmas validações F1/F2 e revalida grant,
mandato e pedido na finalização. Não simular o cliente como profile do advogado.
Tabelas de atribuição externa/proveniência resolvem a FK interna existente.

Concorrência: escolher ordem única dos locks por operação, compatível com F2/F3
(`request → document → case` no finalize já existente). Após esperar lock, reler
grants/versões. Nenhuma transação segura locks durante chamada a provedor/storage.
Download deve revalidar após buscar bytes e antes de iniciar resposta; revogação
bloqueia novas operações, mas não recupera bytes já entregues. Jobs de exportação
revalidam na geração e no download, não apenas na criação da tarefa.

## 5. Comunicação aprovada e recibos — F5.03

`legal_communication_versions`: conteúdo/template fixo, canal, destinatário e
contato versionados, caso/membership, categoria, motivo/evento originador,
validade e estado `draft|approved|cancelled|superseded`.
`legal_communication_jobs`: versão aprovada, idempotency key, tentativas, lease,
próxima execução, provider connection e estado operacional.
`legal_communication_receipts`: evento original autenticado, conta/canal/message id,
instante do provedor e recebimento, estado normalizado, hash e auditoria.

Evento do caso cria **rascunho**, sem transmitir. Aprovação humana registra
destinatário/conteúdo/anexos exatos. Worker reivindica job com lock/lease, revalida
permissões e contato e depois despacha. Conteúdo de email/WhatsApp padrão é mínimo:
aviso genérico para abrir o portal. Material sensível permanece no portal.
Resposta de cliente no portal é ligada à identidade e ao caso; não revela históricos
de outros participantes. Anexos seguem coleta autenticada, não URL pública.

Estados independentes: `queued`, `sending`, `provider_accepted`, `delivered`,
`read`, `failed`, `unknown`, `cancelled`. Leitura/ciência no portal tem ato e recibo
próprios; pixel de email ou recibo WhatsApp não é assinatura nem ciência processual.
Resend distingue aceitação da API e entrega ao servidor de email do destinatário;
esta última também não prova leitura humana.
[Resend: eventos](https://resend.com/docs/webhooks/event-types).

Callback exige segredo configurado e assinatura verificada sobre corpo bruto,
janela temporal e deduplicação por provedor+conta+evento. Evento desconhecido fica
quarentenado; não encontra tenant confiando em metadado externo arbitrário.
Persistir antes de responder sucesso. Repetição e chegada fora de ordem preservam
histórico sem rebaixar leitura/entrega confirmada por evento antigo.
[Resend: verificação de webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests).

Após timeout ambíguo, consultar o provedor pelo identificador idempotente antes de
repetir. Idempotência local permanece além da janela do provedor; no Resend essa
janela documentada é de 24 horas. Sem consulta segura, marcar `unknown` para
reconciliação; não reenviar cegamente.
[Resend: idempotência](https://resend.com/docs/dashboard/emails/idempotency-keys).

## 6. Honorários, custas e dinheiro do cliente — F5.04–F5.06

### 6.1 Três domínios financeiros

| Domínio | Fonte | Regra |
| --- | --- | --- |
| Assinatura do CaleoCRM | `billing_*` existente | Receita da plataforma; não altera saldo do cliente nem contrato de honorários |
| Honorários do escritório | Contrato/versionamento + obrigação aprovada | Contas a receber e pagamentos próprios; base de êxito não presumida |
| Dinheiro e despesas do cliente | Comprovantes, autorização e livro do caso | Saldos, adiantamentos, custas e repasses; sem apropriação automática como receita |

`ir_payment_principals` F4 comprova recolhimento de IR; **não é entrada em conta do
escritório**. `ir_recoveries` registra restituição efetivamente recebida com prova,
mas não informa por si quem custodia o dinheiro, honorário devido ou repasse feito.
Decisão favorável, cálculo e recebimento são eventos distintos.

### 6.2 Contratos e obrigações

Limite de propriedade: o contrato detalhado de implementação financeira será
fechado pelo responsável pela integração F5 em documento próprio. Os nomes abaixo
são sugestões; o portal depende apenas de prestação de contas e obrigações
explicitamente publicadas. Custódia/beneficiário deve distinguir escritório,
cliente e terceiro; movimentos comprovados permitem alocações parciais sob lock.

- `legal_fee_agreement_versions`: caso/cliente, versão exata do instrumento,
  moeda BRL, componentes fixos/parcelas/êxito, percentual decimal, definição da base,
  gatilho contratual, exclusões, limites, despesas e regra de arredondamento.
  Rascunho/aprovação/supersessão; sem fórmula arbitrária executável.
- `legal_fee_basis_versions`: fatos e valores elegíveis ao componente, origem e
  hash, bruto/descontos/base, revisor e justificativa. Vincular resultado F4 exige
  acesso às categorias da origem; publicar projeção financeira mínima aprovada
  para operador financeiro sem expor medicina/estratégia.
- `legal_case_receivables` e parcelas: devedor, contrato/base/versionamento,
  principal, vencimento, saldo e estado derivado. Aprovação não cria recebimento.
- `legal_financial_reviews`: histórico nominal de aprovação, correção, devolução e
  estorno. Troca de contrato ou base torna obrigação proposta pendente de revisão;
  não reescreve cobrança/pagamento já ocorrido.

Reutilizar valores canônicos em texto e SQL numeric autoritativo de F4. Todo
cálculo guarda entradas, percentual, regra e memória de centavos. Somatórios não
usam `Number`/float. Deduções, distribuição de resíduos e abatimentos são explícitos.
Base recuperada só é apropriada uma vez no componente/obrigação correspondente;
parcelas não podem replicar o total original. Base contratual e percentuais
permanecem dependentes de homologação do responsável, P03.

### 6.3 Livro e conciliação

Modelar `legal_case_expenses`, `legal_client_fund_journals`,
`legal_client_fund_lines`, `legal_financial_reconciliations` e
`legal_client_statement_versions`. Lançamentos confirmados são imutáveis e
balanceados por moeda; correção é reversão vinculada + novo lançamento, com prova.
Cada linha identifica proprietário do recurso (cliente/escritório), caso/cliente,
natureza e documento/linha. Não guardar segredo bancário em histórico público.

Separar: despesa prevista, obrigação aprovada, saída comprovada, custo reembolsável,
adiantamento recebido, uso do adiantamento, valor retido, repasse pendente e repasse
comprovado. Uma compensação de honorários com dinheiro do cliente exige autorização
contratual e ato de revisão, nunca um efeito do webhook. Saldo disponível considera
reservas e saídas/estornos já conciliados, com locks sobre a conta/obrigação para
impedir duas retiradas simultâneas. Prova de pagamento tem dedup por cliente,
documento/hash, linha e referência; versões da mesma prova não criam novo dinheiro.

Prestação de contas é versão aprovada com período, entradas, despesas, honorários,
repasses, saldo e comprovantes liberados. Não expõe extrato de outro cliente nem
extrato integral do escritório. Visualizar/baixar é auditado; publicação posterior
não substitui silenciosamente uma prestação já vista.

### 6.4 Gateway contratado

`legal_provider_connections` identifica tenant, finalidade, conta recebedora,
ambiente e referência de segredo servidor. `legal_charge_attempts` liga obrigação
aprovada a cobrança externa; `legal_payment_events` guarda eventos autenticados;
`legal_payment_allocations` concilia recebimentos a parcelas. Não compartilhar
`billing_subscriptions`/externalReference/segredo da assinatura SaaS.

Publicar cobrança exige ação autorizada, valor/destinatário atuais, contrato
conferido e conexão contratada. Callback valida conta recebedora, moeda, valor e
identificador previamente persistido. Pagamento parcial aloca apenas o recebido;
excesso fica crédito não aplicado para revisão. Estorno/chargeback gera reversão
referenciada, sem apagar o recebimento. Callback repetido não duplica baixa;
retorno do checkout no navegador não é comprovante.

A documentação Asaas descreve `id` de evento e autenticação por header; a nova
integração deverá exigir segredo configurado e persistência idempotente. O handler
SaaS lido aceita token ausente quando a variável está vazia: esse padrão não será
copiado para honorários. Configurar uma conta real continua pendência externa.
[Asaas: webhooks](https://docs.asaas.com/docs/sobre-os-webhooks).

## 7. Acompanhamento e fila de trabalho — F5.08–F5.09

`legal_followup_rules`: caso/fonte/cliente, finalidade, responsável/substituto,
cadência anual/data explícita, timezone `America/Sao_Paulo`, próxima ocorrência,
vigência e pausa. Agenda cria tarefa idempotente por regra+ocorrência, sem email ou
pedido fiscal automático. Cancelar caso/grant ou pausar regra não apaga histórico.

Retenção reaberta usa evidência F4: estado `reopened` decorre de retenção anterior
zero e atual positiva conferidas; `ongoing` é retenção mantida. Aviso externo é
rascunho a revisar. Aniversário de caso não revalida laudo, mandato ou direito à
isenção; tarefa orienta nova conferência documental/fiscal.

“Meu dia” agrega tarefas, agenda, revisão documental, comunicações com falha/estado
incerto, aprovações financeiras e clientes aguardando resposta. Cada item conserva
origem, responsável, data e motivo. A fila “aguardando cliente” nasce de solicitação
publicada e registra resposta/retirada/resolução; enviar qualquer mensagem não
encerra automaticamente a pendência. Paginação e filtros são do servidor, por ACL;
contadores não contam casos ou categorias ocultos.

## 8. Divisão de implementação e contrato inicial

| Bloco | Backend SQL | Edge/worker | UI |
| --- | --- | --- | --- |
| F5-A identidade | Role sem USAGE, grants internos explícitos, reserva privada, guard bootstrap, identity/invite/membership, histórico, testes negativos no legado | `legal-portal-access`: provisionar/gerar/rotacionar sem enviar; confirmar identidade e ativação idempotente | Shell/login/ativação/senha próprios; gerenciador interno de convites, revisões e revogação |
| F5-B conteúdo | Publicações/releases, requests ligados à identidade, agenda/export versões | `legal-portal-documents`: upload/download/export com revalidação e auditoria | Resumo, pendências, documentos, agenda; contador vê pacote fiscal autorizado |
| F5-C comunicação | Versões/aprovações/outbox/receipts e fila de respostas | Dispatcher e callback por adapter; segredo obrigatório | Preparar/aprovar/estado de canal/recibos/responder no portal |
| F5-D financeiro | Contratos/bases/obrigações/livro/conciliação/prestação, numeric e idempotência | Adapter cobrança e callbacks, inicialmente estado não configurado | Honorários, custas/adiantamentos/repasses e prestação de contas |
| F5-E rotina | Followup rules/ocorrências e consulta de trabalho | Scheduler durável idempotente, só cria tarefas | Meu dia, pendências, acompanhamento anual |

Ações externas propostas, sempre via Edge `legal-portal`: `context`, `cases`,
`case`, `requests`, `reply`, `acknowledge`, `statements` e `request_export`.
`legal-portal-documents` recebe `upload`, `download` e `download_export`, com
limites próprios. `legal-portal-access` separa gestão interna (`provision`,
`issue`, `rotate`) e ativação externa (`accept`); antes da sessão, inspeção de
convite retorna somente disponibilidade, sem caso/email/parte expostos.

RPCs correspondentes **service-only**: `legal_portal_service_context`,
`legal_portal_service_cases`, `legal_portal_service_case`,
`legal_portal_service_requests`, `legal_portal_service_reply`,
`legal_portal_service_acknowledge`, `legal_portal_service_statements`,
`legal_portal_service_prepare_upload`, `legal_portal_service_finalize_upload`,
`legal_portal_service_authorize_download` e `legal_portal_service_request_export`.
Assinaturas recebem `p_actor_id` exclusivamente da Edge após Auth.getUser; tenant
é derivado do membership/caso. Não conceder essas RPCs a PUBLIC/anon/authenticated/
legal_portal. Inputs rejeitam ator, tenant ou escopos extras fornecidos pelo cliente.
Retornos contêm apenas campos publicados, IDs opacos e capacidades atuais.

RPCs internas propostas: criar/revisar/revogar convite e membership;
preparar/aprovar/retirar publicação/release; criar/revisar comunicação; registrar
contrato/base/obrigação/livro/conciliação/prestação; gerir regra anual. Todas
derivam autor do JWT, validam perfil ativo, caso, categoria e responsabilidade.
RPCs de finalize/provider/reserva administrativa ficam exclusivas de serviço.

Congelar nomes/payloads com o responsável do backend antes de dividir UI.
Componentes genéricos de formulário/dialog/records podem ser reutilizados; readers
internos, snapshots conjuntos e seus caches não podem ser importados no portal.

## 9. Critérios de aceitação obrigatórios

| ID | Ensaio sintético e resultado esperado |
| --- | --- |
| P5-T01 | Criar externo, confirmar, renovar JWT, chamar bootstrap: zero novo tenant/profile/trial, role externa preservada |
| P5-T02 | Forjar raw_user_meta_data, UUID/email da reserva, expirar reserva, falhar após create: sem promoção, vínculo indevido ou acesso parcial |
| P5-T03 | Role externa chama PostgREST/tabelas/RPCs internas, RPCs service-only, storage, convite e billing: negação; Edge rejeita p_actor_id forjado, token interno e JWT sem identidade externa; inventário inclui grants PUBLIC |
| P5-T04 | Dois casos, tenants, familiares e contador: trocar IDs, mesmo telefone/email, listar/exportar: nenhum acesso herdado |
| P5-T05 | Link copiado/consumido por pessoa sem verificação, link rotacionado e JWT antigo após revogação: não libera conteúdo |
| P5-T06 | Mandato expira/revoga durante upload/export/download: revalidar e negar publicação/entrega ainda não iniciada; cleanup auditado |
| P5-T07 | Cliente modifica grants/categoria/autor via payload; médico substituído ou release revogado: acesso negado |
| P5-T08 | Advogado e cliente no mesmo navegador: ativação/login/logout/refresh do portal não troca sessão/cache interno; URL limpa antes de imports/telemetria |
| P5-T09 | Editar mensagem/destinatário/anexo após aprovação: exige nova revisão; evento do caso não envia sem aprovação |
| P5-T10 | Worker cai após envio; callback repetido/fora de ordem/sem assinatura: sem duplicação; aceito não aparece entregue, estado ambíguo fica visível |
| P5-T11 | Honorário sobre estimativa, decisão e recebido: só base contratual aprovada gera obrigação; nenhum valor vira recebido ou repasse automaticamente |
| P5-T12 | Parcial/excesso/estorno/dupla baixa e duas saídas concorrentes: centavos preservados, saldo nunca apropriado duas vezes, reversão auditada |
| P5-T13 | Financeiro/contador sem ACL médica: prestação/pacote não contém diagnóstico, snapshots, nomes de arquivos ou conversas não liberados |
| P5-T14 | Scheduler repetido, regra pausada e tarefa antiga: uma ocorrência, substituição rastreável, sem comunicação automática |
| P5-T15 | Jornada 375px e desktop, sessão expirada/revogação e falha de rede: dados antigos somem, pendências/estado são compreensíveis |

Executar SQL com roles reais e duas sessões para concorrência; complementar com
Auth/PostgREST/Edge da versão instalada, navegador e providers simulados. Testar
troca de role, `generateLink → verifyOtp → definir senha → login` em conta sintética
sem envio a pessoas reais. Testes simulados não homologam email, WhatsApp ou gateway.

## 10. Dependências reais e ordem de liberação

- **Ensaio técnico de implementação:** verificar UUID custom, ordem de trigger,
  role externa, fluxo de ativação, Edge exclusiva e concessões de schema na
  instalação GoTrue/PostgREST. São testes a executar antes da publicação, não
  bloqueios presumidos nem perguntas ao usuário.
- **P01:** assinatura contratada. Até lá, instrumento/evidência externa revisados,
  sem dizer que o sistema coletou assinatura certificada.
- **P02:** calendário externo. Agenda/rotina internas podem avançar.
- **P03:** responsáveis jurídicos/fiscais para poderes, base de êxito, custas,
  prestação de contas e cenários reais. Não homologar por conta própria.
- **P05:** retenção por finalidade e preservação. Revogar acesso não apaga prova.
- **Dependência adicional a consolidar:** conta de comunicação do escritório,
  verificação de destinatário, remetente e canal autorizado; adapter/receipts reais.
- **Dependência adicional a consolidar:** gateway de honorários contratado e conta
  recebedora correta, sandbox e regras de estorno/chargeback. O billing SaaS não a supre.

Sequência: F5-A → F5-B → F5-C/F5-D em paralelo → F5-E → regressões integradas →
publicação técnica → homologação externa disponível. Sem provedor, o produto
mostra rascunho/não configurado e permite operação manual com evidência. Não gerar
mensagem, cobrança ou transferência de teste para terceiros. Pendências são reunidas
no relatório consolidado conforme [execução contínua](EXECUCAO_CONTINUA.md).

Fontes técnicas acima consultadas em 11/09/2026; GoTrue `master` e documentação
oficial descrevem capacidade atual, não comprovam a versão implantada. Contratos,
escopos e nomes de tabelas/RPCs neste documento são propostas de engenharia.
