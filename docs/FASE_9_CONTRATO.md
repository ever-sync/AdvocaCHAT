# F9 — Indicadores, custos e entrada/saída assistida

Implementação em integração em 12/09/2026; publicação e evidências finais devem constar no registro de execução.

Migração `20260912040000_legal_operational_readiness.sql`. Rota `/juridico/operacao`, acessível a partir da lista de casos. Todas as funções usam o perfil ativo e o escritório físico atual, sem tenant informado pelo navegador. Contas externas não possuem EXECUTE.

| RPC | Contrato |
| --- | --- |
| `legal_readiness_metrics()` | Casos acessíveis ao usuário, estados e próximas ações vencidas. Valores de IR exigem acesso médico e fiscal. Recebido documentado, reconhecido por pedido (com alerta de sobreposição) e última cessação verificada por fonte são distintos. Custos somente dos casos sob responsabilidade do usuário, separados por natureza e moeda. Bytes de arquivos são medição, não cobrança. |
| `legal_record_operational_cost(case_id,payload)` | Somente responsável. Natureza `actual/estimate/budget`; categoria, moeda, valor decimal exato, período, fonte e critério de rateio. Efetivo exige documento pronto acessível do mesmo caso. Registro manual não equivale a faturamento automático de fornecedor. Chave idempotente bloqueia repetição alterada. Auditoria fiscal. |
| `legal_preview_case_import(rows)` | Lista JSON de 1–100 novos casos, até 128 KiB. Somente título, cliente existente do escritório, área, tipo e próxima ação. Normaliza e produz hash vinculado ao ator/escritório. Não importa documentos, clientes, decisões, poderes ou prazos legais. |
| `legal_apply_case_import(rows,preview_hash,idempotency_key)` | Revalida permissão e prévia. Cria os casos na mesma transação para o ator atual. Retry idêntico retorna os mesmos IDs; conteúdo diferente é negado. Não dispara comunicações. |
| `legal_export_case_manifest(case_id)` | Somente responsável, com acesso restrito. JSON `advocachat-case-v1`, lista fixa de tabelas, máximo 10 mil registros por tabela/50 mil registros/16 MiB no total; excedentes exigem exportação assistida em lotes. Inclui registros e versões do caso. Exclui tokens, credenciais, grants, filas, bibliotecas globais e texto/rascunhos/citações da assistência que dependem dos fluxos específicos de revisão/revogação. Auditoria restrita. Não inclui bytes de arquivos e não é formato de reimportação automática nem backup integral. |

A lista principal de casos usa páginas de 25 e um registro adicional para identificar a próxima página, ordenadas por atualização e ID. A seleção operacional usa páginas de 25 com total explícito. Documentos para prova de custo são limitados a 100 com recusa explícita, sem omissão silenciosa.

As tabelas novas usam RLS e não permitem acesso direto do navegador. Custos não podem ser editados nem apagados pela interface; uma política de correção/reversão de custos ainda precisa ser especificada antes do uso contábil. A importação cria casos novos; não altera registros históricos ou faz fusão automática de clientes.

## Testes reproduzíveis

- `supabase/tests/legal_operational_readiness.sql`: execução em clone descartável com F1–F9, rollback integral; testa limites, idempotência, permissão, isolamento e manifesto.
- `supabase/tests/legal_readiness_load.py --seed`: requer clone localhost:55432 `advocachat_f9_load` com schema F9 e sem fixtures de carga anteriores. Gera somente dados sintéticos. Após a primeira execução, omitir `--seed` para medir o mesmo conjunto. `PG_BIN` permite selecionar os binários PostgreSQL locais.
- Testes Vitest: importação UTF-8 limitada, métricas distintas, recurso desabilitado e ocultação de dados após negativa de acesso.

Medição local: 1.000 casos, 10.000 metadados de arquivos, 3.000 custos sintéticos, quatro consultas simultâneas/20 requisições. p95 passou de 4.449,24 ms para 60,26 ms após calcular os conjuntos de permissões uma vez por consulta. Medição inclui início do processo psql; não é SLA nem teste de capacidade de toda a aplicação em produção.
