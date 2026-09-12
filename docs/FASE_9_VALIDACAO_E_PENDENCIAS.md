# F9 — Entrega técnica e bloqueio de publicação

**12/09/2026.** Código `38782817b19e5b1d2eb80b004f688b9968900fd2` publicado e SHA confirmado em `origin/main`. CI GitHub `34704068593`: **SUCCESS**. [Contrato das funções e limites](FASE_9_CONTRATO.md). O frontend público ainda não contém esta entrega: as três solicitações de deploy foram recusadas pelo Railway com **“Your trial has expired. Please select a plan to continue using Railway.”** Não houve contratação nem mudança de plano pela tarefa.

## Entrega disponível

- Indicadores de casos acessíveis e resultados IR, separando recebido documentado, reconhecido por pedido e cessação verificada. Reconhecimentos sobrepostos não são apresentados como crédito líquido.
- Custos informados pelo responsável, separados em efetivos comprovados, estimativas e orçamentos, por moeda. Não há integração automática com faturas de infraestrutura ou outros provedores.
- Lista de casos paginada; seleção operacional também paginada.
- Importação assistida de 1–100 novos casos por JSON, com prévia, confirmação, limite de tamanho e idempotência. Não importa clientes, documentos, poderes, decisões ou prazos legais.
- Manifesto JSON privado dos registros/versionamentos do caso para o responsável, com limites explícitos. Os bytes dos documentos são baixados separadamente pelos fluxos autorizados; credenciais, grants, filas e conteúdo da assistência sujeito a revogação não integram o manifesto. Não é exportação integral automática de escritório nem arquivo de restauração de banco.
- [Roteiro operacional](FASE_9_OPERACAO_E_LANCAMENTO.md): treinamento, suporte, incidentes, fontes e matriz de planos proposta, sem preços ou contratação fictícios.

## Banco e testes

Migração `20260912040000` aplicada por transação e registrada no ledger, SHA256 `d24b214a7594055b9018321398bdce46d340c56213b0aba7c9c69ecda5a67c94`. Registros existentes de 137 tabelas foram preservados por comparação de hashes. As tabelas novas têm RLS e não permitem leitura direta do navegador.

- 637 testes Vitest, build da aplicação/widget e typecheck passaram. Lint: zero erros, 29 avisos herdados.
- Dez testes de UI/entrada F9; negativa de acesso oculta métricas anteriores.
- Dezesseis suítes SQL F1–F9 passaram no clone limpo. F9 contém 23 verificações, inclusive limite de bytes antes da agregação do manifesto, outro escritório, role externa, responsável e idempotência.
- Duas corridas adicionais: importações simultâneas criam um único caso; custos simultâneos criam um único lançamento. Scripts versionados em `supabase/tests/`.
- API de produção: prévia, criação idempotente de um caso, custo de ensaio sem duplicação, manifesto e negativas de membro/outsider passaram.
- Navegador: frontend **local** da versão nova conectado ao Auth/PostgreSQL reais; registro/reload de custo, prévia e confirmação de importação, download de manifesto e layout 375px passaram, sem erro de página. Essa evidência não substitui a validação do frontend público depois do deploy.

## Capacidade medida

Conjunto local: 1.000 casos, 10.000 metadados de arquivos e 3.000 custos sintéticos; quatro consultas simultâneas, vinte requisições. A primeira consulta de indicadores apresentou p95 de 4.449,24 ms. Após calcular os conjuntos de permissões uma vez, p95 de 60,26 ms; repetição pelo script versionado: 47,21 ms. A medição inclui abertura do psql, não executa tráfego em provedores e não é SLA de toda a plataforma. Nenhuma réplica foi aumentada para contornar o gargalo.

## Recuperação comprovada e limites

Um snapshot MVCC consistente do banco PostgreSQL de produção gerou arquivo lógico de 5.420.619 bytes em 5,446 s. O arquivo foi restaurado em **outra base**, com nome aleatório, no mesmo serviço PostgreSQL, sem apontar Auth, PostgREST, Storage ou workers para ela. A restauração levou 6,833 s. Os registros de **307 tabelas** de public/Auth/Storage/ledger coincidiram com os hashes do snapshot original. A role externa continuou sem USAGE no schema público, as tabelas jurídicas/IR mantiveram RLS e a base temporária negou CONNECT público. A fila de rede estava vazia e seu worker permaneceu vinculado exclusivamente à base original.

Os **26 objetos**, 48.427 bytes, do bucket jurídico presentes no snapshot foram copiados para outro bucket privado e baixados novamente. Todos os SHA256 coincidiram; leitura anônima foi negada. A etapa de arquivos levou 45,977 s. Nenhum objeto original foi sobrescrito. Isso demonstra recuperação lógica de banco e objetos daquele ponto; **não demonstra troca de infraestrutura, failover ou sobrevivência à perda de todo o serviço/região**. As durações não incluem um incidente completo nem constituem metas contratuais de RTO/RPO. Segredos/papéis/binários externos e automação contínua de backup de objetos precisam integrar o plano operacional acordado.

Backups de volume diários/semanais/mensais já estavam configurados na inspeção anterior. PITR estava desabilitado e a imagem Supabase não era elegível para o fluxo nativo da Railway. Não foi trocada a imagem nem alterada a política de backup. Metas, retenção, orçamento e aceite de recuperação permanecem P05.

## Encerramento dos ensaios

Removidos somente três escritórios sintéticos e seus **630 registros**, distribuídos em 117 tabelas, depois de resolver dependências e rejeitar vínculos cruzados. Os registros não selecionados de **278 tabelas públicas** mantiveram seus hashes dentro da transação. Removidos cinco usuários Auth fictícios (read-back 404), 26 objetos originais dos ensaios, 26 cópias e o bucket de recuperação. A base restaurada e os arquivos temporários de backup foram removidos. O banco da aplicação não foi substituído; o recurso jurídico real permanece habilitado. Fixtures antigas não devem ser reutilizadas: suas identidades foram excluídas.

Evidências privadas locais: `/tmp/advocachat-f9/`, `/tmp/advocachat-f9-final/` e `/tmp/advocachat-f9-ui/`. Nenhum cliente real, cobrança, protocolo judicial ou envio de mensagem foi usado para validar os fluxos desta fase.

## Próximos passos que exigem decisão externa

1. **P09 — Railway:** regularizar o plano do workspace do projeto AdvocaCHAT; depois publicar a versão de F9 e conferir a interface pública. A tarefa não contratou um plano.
2. P03/P05: responsáveis pelos pilotos, revisão jurídica/fiscal, escopo de oferta, preços, retenção, suporte e metas de recuperação. A matriz comercial é uma proposta.
3. P01/P02/P04/P06/P07/P08: habilitar somente as integrações contratadas e homologar assinatura, calendário, Justiça, canais/OTP, pagamentos e IA. Estados não configurados e alternativas manuais permanecem explícitos.

A antiga automação `continuar-fases-do-advocachat` não foi encontrada nos arquivos locais de automação nesta retomada. Nenhuma repetição de deploy pago ou automação substituta foi criada.
