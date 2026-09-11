# F4 — Cálculos, pedidos e resultados de IR

Estado em 11/09/2026: implementação publicada, migração aplicada e fluxos validados
em produção pela API e pelo navegador.
Homologação jurídica/fiscal permanece P03.

## Entrega

A aba **Isenção de IR → Cálculos e pedidos** reúne importações, parâmetros,
períodos, cálculos, declarações, pedidos, conciliação e cessação em folha.

- CSV preservado como documento privado, com os bytes originais e SHA-256.
  A prévia rejeita arquivo inválido inteiro; vazios continuam desconhecidos.
  Linhas guardam fonte, pagamento, competência, ano-calendário, exercício e
  página/linha. A conferência torna as linhas imutáveis; correções posteriores
  exigem desconsideração justificada ou substituição rastreável do lote.
- Parâmetros por vigência e periodicidade, com fontes e exemplo esperado
  independente antes da aprovação. Nenhuma tabela aprovada é instalada
  automaticamente em um escritório real.
- Cálculo decimal no PostgreSQL; dinheiro e coeficientes atravessam JSON como
  texto. Cada versão preserva entradas, parâmetros, deduções, arredondamento,
  recusas e hash. Mudanças relevantes tornam a análise anterior desatualizada,
  sem alterar sua memória histórica.
- Períodos recuperáveis dependem de avaliação e revisão profissional explícitas.
  Não existe seleção automática universal dos últimos cinco anos.
- Declaração original pode avançar de rascunho para entregue no mesmo registro,
  com recibo e histórico. Retificadora tem vínculo próprio com a anterior.
- Pedidos administrativos e judiciais independentes por pagador, avaliação de
  competência/legitimidade/estratégia, fatos documentados e prazos manuais
  identificados como tais. Registrar protocolo antigo preserva decisão posterior.
- Principal comprovado, reserva, reconhecimento e recebimento são distintos.
  Reserva concorrente respeita saldo; recebimento exige prova e idempotência.
  Liberar uma reserva preserva a parcela já recebida.
- Cessação e reabertura exigem comparação de documentos distintos; datas futuras
  não podem ser registradas como fatos já ocorridos.
- Demonstrativo HTML imprimível com fontes, versões, memória por grupo e situação
  de revisão. A consulta do relatório revalida autorização no servidor e registra
  auditoria. Conteúdo e referências são escapados; anexos médicos não são embutidos.

## Cobertura e proteção

O motor inicial cobre renda ordinária de residente, mensal ou anual, com parâmetros
revisados. RRA, 13º, regimes regressivos, renda exterior, não residente, tributação
mínima e inventário incompleto produzem recusas explícitas. Atualização monetária
não está calculada. Não somar resultados parciais e apresentá-los como total fiscal.

O acesso fiscal permite conferir documentos e registros fiscais. Avaliações,
cálculos, pedidos e relatórios que combinam enquadramento médico e renda exigem
as duas permissões. A autorização usa a identidade física do escritório; seleção
administrativa de outro escritório não concede acesso. Revogações e mutações
sensíveis são serializadas pelo caso.

Nenhuma transmissão de DIRPF, protocolo, cobrança, restituição bancária ou envio
de mensagem é executado por esta fase. Os registros de fatos externos exigem
comprovação; testes usam somente dados fictícios.

## Validação técnica

- Typecheck geral: aprovado.
- ESLint geral: zero erros; 29 avisos herdados.
- Vitest: 512 testes aprovados em 73 arquivos na rodada geral; após a revisão,
  os cinco testes de privacidade financeira passaram, incluindo resposta de
  relatório atrasada após revogação (uma regressão adicional à rodada geral).
- Build de produção: aprovado com as variáveis públicas do AdvocaCHAT.
- Deno: `legal-documents` e `legal-document-requests` aprovados.
- Testes do demonstrativo: valores além do limite seguro de centavos de `Number`,
  escape de conteúdo e links, indicação de análise incompleta/desatualizada.
- Exemplos independentes e limites de cobertura:
  [fontes e cenários F4](FASE_4_FONTES_E_CALCULOS.md).
- Migração integral em base local limpa e regressões F1–F4: aprovadas, com rollback
  das fixtures. F4 cobre 50 negações esperadas, dez resultados independentes e oito
  fronteiras de faixa, além dos fluxos positivos.
- Duas sessões PostgreSQL reais: espera por lock observada; somente uma reserva
  concorrente de 40 passou quando o saldo era 50. Edições parciais concorrentes
  preservaram ambos os campos. Liberação parcial manteve a quantia recebida.
- Navegador local: oito abas, fluxos de importação/revisão, cálculo/recusa,
  relatório baixado e reaberto, declarações, pedidos, conciliação e cessação.
  Celular de 375 px sem overflow; zero erros de página.

## Aplicação da migração

Migração `20260911190000_ir_calculations_and_requests.sql`, SHA-256
`3080d3bfa73b4f5f717dd85a420cbf8e8279de5c83c173e45e92fc5b93e7b78f`.

Aplicada via SSH no PostgreSQL do projeto Railway AdvocaCHAT, ambiente production,
em uma transação com registro no ledger. Hashes antes/depois comprovaram a
preservação integral das linhas de 40 tabelas existentes: núcleo, Auth e tabelas
jurídicas/F3. As 29 tabelas `ir_` resultantes têm RLS habilitada. O módulo permanece
ligado somente no escritório sintético de teste; o escritório original não foi
habilitado automaticamente.

## Publicação e verificação em produção

Código `88251972db31174166a3753e85d7949664d5f8d4`, publicado e SHA de `origin/main`
conferido. CI aprovado: [execução 34640427392](https://github.com/ever-sync/AdvocaCHAT/actions/runs/34640427392).
Railway finalizou os três serviços com `SUCCESS` no mesmo commit:

- web: `fe3595a5-59c2-4428-810a-01636b061e67`;
- functions: `2b9339dc-fe8f-45d6-8232-7f156d9c763a`;
- scheduler: `7a7917aa-122b-4875-87e5-104b0fe45c07`.

Web e health das funções responderam HTTP 200. A validação autenticada usou caso
fictício isolado e comprovou persistência de CSV, correção antes da revisão,
imutabilidade depois dela, esperado independente **382,88**, recusa sem residência
confirmada, exigência de completude e isolamento por escritório/categoria.

Os testes de operações pela API comprovaram: rotas administrativa/judicial,
estratégias independentes, decisão posterior preservada ao cadastrar protocolo
antigo, prazo manual com substituto, relatório auditado para leitor autorizado e
bloqueio após revogação, situação da mesma declaração original com histórico e
retificadora vinculada. Reservas concorrentes respeitaram o principal **382,88**;
recebimento idempotente de **150,00** e liberação parcial deixaram **182,88**
reservados e **50,00** disponíveis. Cessação/reabertura documentadas e recusa de
fato futuro também passaram. O snapshot anterior permaneceu idêntico e foi marcado
desatualizado quando chegaram novos registros.

Na primeira leitura imediata de um CSV houve HTTP 503; a releitura do mesmo objeto,
sem reenviar, confirmou bytes e hash. Os quatro uploads seguintes foram lidos com
sucesso imediato. A causa dessa resposta isolada não foi determinada; registrar
telemetria operacional e reavaliar no ensaio de falhas da F9.

O navegador em produção executou **30 mutações sintéticas**, seis chamadas de
boas-vindas foram bloqueadas e não houve erro de página. Conferiu CSV original,
valor ausente corrigido antes da revisão, parâmetro/exemplo independente, período
manual, recusa sem total, cálculo **100,00 → 0,00**, abrangência na aprovação,
relatório auditado baixado e reaberto, principal/reserva/recebimento/liberação,
declaração/recibo/histórico e retenção positiva sem falsa cessação. Reload confirmou
persistência; oito abas em 375 px ficaram sem overflow. Não houve repetição do
503 nos uploads desse roteiro. O relatório estático reabriu sem requisições externas.

Após a revisão final, a interface distingue pedido sem decisão de uma decisão que
reconhece valor zero. Essa alteração é de apresentação; os registros de decisões
continuam sendo a origem do valor reconhecido. A continuação avança para F5.

## Dependências

P03: advogado e profissional fiscal devem homologar regras, exercícios, momentos
de arredondamento, cenários reais e alcance do piloto. O resíduo na fronteira
anual de 2026 permanece uma escolha explícita de parâmetro para homologação.

P04: cobertura dos pagadores, tribunais e canais externos permanece por definir.
A continuação deve avançar para F5 sem apresentar esses serviços como conectados.
