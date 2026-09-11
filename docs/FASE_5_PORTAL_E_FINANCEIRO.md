# Fase 5 — Portal individual, atendimento e financeiro do caso

Estado: implementação concluída e validada localmente; publicação e prova em
produção em andamento. Nenhum e-mail, cobrança ou transferência real foi feito
nos ensaios desta fase.

## Entrega

- Portal separado do app interno, com sessão própria e entrada que limpa o
  convite da URL antes de carregar clientes de autenticação ou telemetria.
- Identidade externa reservada antes de criar o usuário no GoTrue; sem perfil de
  equipe, tenant próprio ou assinatura SaaS. O escritório recebe somente convite.
  O destinatário autentica sua própria conta por senha ou OTP e aceita o acesso.
- Autorizações por pessoa, caso, categoria, finalidade, prazo e poderes de
  representação. O contador recebe somente os escopos fiscais aprovados.
- Publicações, agenda, documentos e pacotes fiscais liberados individualmente;
  mensagens e registro de leitura; upload atribuído à identidade externa real.
- Comunicação versionada com aprovação, fila durável, vínculo de provedor/conta,
  limite de tentativas, expiração, recibos autenticados e distinção entre criação,
  aceite do provedor, entrega, leitura, falha e resultado incerto.
- Acompanhamento anual idempotente e Meu dia, com tarefas, pendências, respostas
  de clientes e falhas. A rotina cria trabalho interno; não pratica ato fiscal.
- Honorários vinculados ao contrato e aceite exatos, base fixa ou percentual
  revisável, fontes documentais ou fatos efetivos do módulo IR. O cálculo fiscal
  não é tratado como restituição recebida ou saldo bancário.
- Custas, reembolsos, adiantamentos e repasses; parcelas limitadas à base aprovada;
  movimentos e alocações imutáveis, idempotência, provas únicas, estorno parcial e
  compensação com autorização documental explícita. Saldos do cliente e do
  escritório ficam separados e não podem ser usados em duplicidade.
- Prestação de contas versionada, revisão contra os dados atuais, conteúdo público
  mínimo e liberação individual. Uma versão entregue permanece histórica, e
  revogação ou expiração impede novas consultas.
- Adapter Asaas exclusivo para honorários, revisão de destinatário/conta/valor,
  prevenção de duplicação e callback persistido antes da resposta. O evento exige
  conciliação documental; criação de cobrança e checkout não quitam uma obrigação.

Arquitetura detalhada: [portal e atendimento](FASE_5_ARQUITETURA.md) e
[financeiro](FASE_5_FINANCEIRO_CONTRATO.md).

## Banco e isolamento

Migrations posteriores à F4:

| Versão | Arquivo | SHA-256 validado |
| --- | --- | --- |
| 2100 | `20260911210000_legal_portal_and_client_care.sql` | `027c2cdde74b56b749dc551747c207ef9a841934da916b8e6e675c5f0ca02a46` |
| 2200 | `20260911220000_legal_case_finance.sql` | `50182e36a95b2eb6a038b74baf1e91c6dc32f412cc4fe3b97338ef9678a7cf84` |

O papel `legal_portal` não herda `authenticated` nem tem USAGE nos schemas public
ou storage. As permissões internas existentes são preservadas explicitamente.
Acesso externo passa pelas Edges e por RPCs exclusivas do serviço, que revalidam
identidade, ator, vínculo, e-mail, grant, caso e representação a cada operação.

O worker de cobrança usa vínculo tenant/conta/ambiente do servidor. Tokens de lease
não são expostos no SELECT ou nos retornos das operações da equipe. Um contrato
ou base que perdeu validade impede nova cobrança; fatos financeiros históricos
continuam preservados e podem ser conciliados com sua prova.

## Verificação local concluída

- Clone limpo `advocachat_f5_verified`, criado sobre a base F4: aplicação integral
  das duas migrations e dez suítes SQL com rollback, incluindo autenticação,
  retirada de acessos públicos legados, F1, F2, F3, F4, portal e três cenários financeiros.
- Portal: 48 asserções e 47 negações. Financeiro base: 23/21. Suplemento portal:
  31/27; suplemento IR: 33/38. Os suplementos reutilizam fixtures e asserções;
  estes números não representam cenários únicos somáveis.
- Seis ensaios com duas conexões reais e espera de lock observada: revogação de
  mandato durante upload; dois dispatchers para um job; revogação durante
  download; expiração de prestação durante espera; duas saídas de 100,00 para
  saldo de 150,00; desativação de conexão enquanto o worker espera.
- O saldo concorrente termina em 50,00, com uma saída recusada. Prestação expirada
  retorna vazia e o worker não recebe lease de uma conexão desativada.
- Base de êxito independente: recebimento 20,00, dedução 1,01, base 18,99 e fração
  0,25 produzem 4,75; decisão 50,00 e fração 0,10 produzem 5,00. Fontes obsoletas,
  outra categoria/caso, reaproveitamento e ausência de decisão são recusados.
- 39 testes Deno nos handlers de portal/comunicação/pagamento; checagem Deno das
  seis Edges, harness de integração e correção de tipos herdados.
- Typecheck da aplicação, lint sem erros e 29 avisos preexistentes; suíte completa
  com 546 testes em 83 arquivos. Build da aplicação e widget passou.
- Interface externa exercitada no computador e em 375 px: ativação com OTP
  simulado e aceite separado, dois casos, documentos, mensagens, agenda, pacote
  fiscal, demonstrativo e saída. Nenhum módulo interno carregado, nenhuma chamada
  real a provedor e nenhum erro de página; cinco abas móveis sem overflow.
- A interface interna também foi exercitada com convite, revisão, publicação,
  documentos, comunicação e rotina. Cinco abas de atendimento e quatro financeiras
  foram verificadas em 375 px, sem overflow; as ações financeiras reais ficam na
  verificação API/navegador em produção.
- A interface financeira oculta saldo e rascunhos após revogação do acesso fiscal.
  O formulário conserva a chave idempotente após timeout e só a renova após
  confirmação do salvamento.

Esses ensaios usam exclusivamente dados sintéticos. SQL e navegador local não
substituem homologação profissional, entrega de e-mail ou cobrança real.

## Publicação e verificação em produção

As duas migrations foram aplicadas atomicamente em produção em 11/09/2026.
O read-back confirmou os dois registros no ledger, a preservação exata dos dados
das 58 tabelas anteriores verificadas, 29 tabelas IR com RLS, o papel externo sem
USAGE em public e uma única ativação jurídica, do escritório sintético de teste.

Em andamento: registrar SHAs Git, deployments SUCCESS, prova de isolamento
GoTrue/PostgREST, retorno das APIs e navegação real após o rollout.

## Dependências preservadas

- P03: regras contratuais, honorários e homologação jurídica/fiscal do piloto.
- P06: canal e destinatário verificados, entrega real de OTP e comunicação.
- P07: conta recebedora, sandbox, credenciais, notificações e estornos Asaas reais.
- A implementação mantém alternativas manuais e estados explícitos sem simular
  entrega, pagamento ou integração homologada.
