# F5 — Contrato de honorários e prestação de contas

Implementação em validação local. Complementa a [arquitetura F5](FASE_5_ARQUITETURA.md).
Migration: `20260911220000_legal_case_finance.sql`, posterior ao portal.

## Regras do livro do caso

- Assinatura SaaS, honorários e recursos de clientes têm registros separados.
- O livro registra recursos sob custódia do escritório. Restituição F4 recebida
  diretamente pelo cliente não vira automaticamente entrada nesse livro.
- Valores monetários são texto decimal canônico e SQL numeric; campos vazios não
  viram zero. BRL é a única moeda inicial. Regras percentuais são frações decimais.
- Movimentos confirmados não são editados/apagados. Correção usa reversão parcial
  ou integral vinculada, com nova prova e justificativa.
- Uma prova é identificada por hash + linha, além da referência de conciliação.
  Chave idempotente repetida só aceita o mesmo conteúdo.
- Saldo de recursos do cliente e do escritório é calculado separadamente. Saída
  e transferência respeitam saldo sob lock do caso. Saldo inicial exige documento
  e entrada explícita; não aceitar saldo negativo silencioso.
- Compensar honorário com recurso do cliente exige contrato, obrigação aprovada,
  autorização documental e revisão específica. Não ocorre por webhook ou cálculo IR.

## Entidades e RPCs internas

Todas derivam ator/tenant do JWT e validam acesso fiscal ao caso. Responsável do
caso aprova bases, obrigações, movimentos, compensações e prestação. Edição
assistida de rascunho não concede aprovação.

| Entidade | Campos relevantes | Operações |
| --- | --- | --- |
| `legal_fee_agreement_versions` | instrumento aprovado, versão, título, modelo fixed/success, fixed_amount, success_rate, basis_kind manual/ir_recovery/ir_decision, gatilho/exclusões, estado/revisor | `legal_create_fee_agreement`, `legal_review_fee_agreement` |
| `legal_fee_basis_versions` | agreement_id, source_ids, documento manual, base_amount, deductions, effective_base, fee_amount, memória mínima, estado/revisor | `legal_create_fee_basis`, `legal_review_fee_basis` |
| `legal_financial_obligations` | título, natureza fee/cost/reimbursement/advance/client_transfer, receivable/payable, funds_owner client/office, beneficiário office/client/third_party, valor/vencimento, contrato/base, documento, estado | `legal_create_financial_obligation`, `legal_review_financial_obligation`, `legal_cancel_financial_obligation` |
| `legal_cash_transactions` | from_owner/to_owner external/client/office, valor/data, prova/hash/linha/referência, reverses_id, obrigação da compensação, idempotency_key, autor | `legal_record_cash_transaction` |
| `legal_cash_allocations` | cash_transaction_id, obligation_id, settlement/refund, original_allocation_id, valor, idempotency_key | `legal_allocate_cash_transaction` |
| `legal_financial_statement_versions` | período, snapshot, totais, nota pública aprovada, estado/revisor | `legal_create_financial_statement`, `legal_review_financial_statement` |
| `legal_financial_statement_releases` | statement_id, membership_id, vigência, autorização/retirada | `legal_release_financial_statement`, `legal_revoke_financial_statement_release` |
| `legal_payment_connections` | tenant, provedor Asaas, ambiente, identificação da conta, estado/configuração confirmada | `legal_save_payment_connection`; segredo somente no servidor |
| `legal_charge_attempts` | obrigação aprovada, valor/cliente e destino revisados, conexão, idempotência, estado/provedor/recibo | preparação/revisão internas e operações service-only para adapter |

Dinheiro em trânsito não é tratado como disponível. Movimentos manuais exigem
data já ocorrida e comprovante fiscal/general acessível; a operação não movimenta
conta bancária. Distribuição entre obrigações é limitada ao saldo do movimento e
ao saldo da obrigação. Uma reversão devolve saldo da obrigação sem apagar a baixa
original; não pode reverter mais que o confirmado.

## Bases contratuais

Modelo fixo usa valor do acordo; percentual usa base revisada menos deduções e
arredondamento de meio para cima em duas casas. A memória conserva operandos.
Uma base aprovada não pode ser reaproveitada acima do honorário calculado em
obrigações/parcelas. Alterar contrato exige nova versão; obrigações históricas
continuam vinculadas à versão exata que as originou.

Origens F4 são lidas somente com acesso médico e fiscal, pelo responsável. A
projeção financeira publicada contém valores, documentos fiscais e identificadores
de origem, sem snapshots clínicos, estratégia ou títulos de laudos. Decisão exige
evento documental efetivo; o zero padrão de um pedido sem decisão não é uma base.
Estimativa do motor F4 nunca é tratada como restituição recebida.

## Portal e contador

`legal_portal_service_statements(p_actor_id,p_membership_id)` substitui o contrato
vazio do portal. Usa `_legal_portal_assert_member` com `statements:read` e categoria
fiscal, depois exige release individual vigente da versão aprovada. Retorno mínimo:
id, título, período, nota pública, totais e linhas publicadas; não contém notas
internas, dados bancários, snapshots F3/F4, URLs de storage ou provas não liberadas.
Toda consulta/exportação é auditada. Revogação de membership/mandato/release vale
imediatamente para novas leituras. Versão já entregue permanece histórica.

## Cobrança e critérios de aceitação

Conexão de honorários é independente do billing SaaS. Sem credencial/conta
homologada, o adapter retorna `not_configured` e preserva alternativa manual.
Somente obrigação e destino revisados podem preparar envio. Callback exige segredo
configurado, conta e cobrança previamente vinculadas; evento duplicado não baixa
duas vezes. Resposta do checkout não é comprovante. Timeout sem identificação
segura fica `unknown`, sem nova emissão automática.

Validar centavos extremos; base fixa/percentual e parcelamento; mesma prova com
outra referência; pagamento parcial/excesso/reversão; duas saídas concorrentes;
compensação sem autorização; cliente/contador sem dados médicos; declaração sem
release; revogação durante download; provider falso/repetido/fora de ordem.
Homologação profissional P03 e gateway real P07 permanecem pendentes externas.

## Conector Asaas e autenticação do portal

O adapter de honorários usa somente `LEGAL_ASAAS_TENANT_ID`,
`LEGAL_ASAAS_ACCOUNT_ID`, `LEGAL_ASAAS_ENVIRONMENT`, `LEGAL_ASAAS_API_KEY`,
`LEGAL_ASAAS_WEBHOOK_TOKEN` e `LEGAL_ASAAS_SEND_ENABLED`. Sem o vínculo completo e
ativação explícita, nenhuma cobrança é enviada. Credenciais SaaS não são reutilizadas.
O callback usa o header `asaas-access-token`, vincula a cobrança ao cliente revisado,
preserva hash e ID do evento e só confirma persistência. A conciliação do valor
recebido, taxas e estorno exige movimento documental e alocação no livro.

Referências primárias consultadas em 11/09/2026:
[guia de cobranças](https://docs.asaas.com/docs/guia-de-cobrancas),
[recepção de eventos](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook)
e [token de webhook](https://docs.asaas.com/docs/criar-novo-webhook-pela-aplicacao-web).

O convite copiável não contém credencial de login, inclusive na primeira ativação.
A autenticação pertence ao destinatário. Os templates `public/auth-email/` incluem
código e link de confirmação compatíveis com o Auth; entrega real permanece P06.

Templates de confirmação e magic link exibem OTP. Quando `RedirectTo` aponta ao
portal da `SiteURL`, omitem o link de autenticação automática para manter o fluxo
por código e evitar consumo por pré-busca de e-mail. O cadastro interno conserva
seu botão de confirmação. Referência:
[variáveis e pré-busca de templates Auth](https://supabase.com/docs/guides/auth/auth-email-templates).
