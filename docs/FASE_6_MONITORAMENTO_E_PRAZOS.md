# F6 — Monitoramento, publicações e prazos assistidos

Entrega técnica publicada e verificada em 11/09/2026, código `e6af248`.
Nenhuma fonte real foi ativada.
O [contrato](FASE_6_CONTRATO.md) descreve tabelas, RPCs e estados;
[fontes e limites](FASE_6_FONTES_E_LIMITES.md) registra documentação consultada,
limites contratuais e cenários jurídicos que exigem homologação profissional.

## Comportamento entregue

- A aba Processos preserva o cadastro manual e acrescenta fonte/cobertura, fila,
  conferência de publicações, catálogo de regras/calendários e contagens.
- Cada operação exige conta, permissão documentada, escopo e cobertura compatíveis.
  Credencial ausente aparece como não configurado. O consumo DataJud permanece
  impedido até validação de permissão comercial; uma chave pública não a comprova.
- Originais são preservados com hash, acesso auditado e renderização como texto.
  Repetição do mesmo conteúdo não duplica; correção preserva a versão anterior e
  exige conferência. Descobertas por OAB não vinculam automaticamente a um caso.
- Atribuição, substituto e aceite são internos. Leitura no CRM, recebimento pelo
  fornecedor e captura não registram ciência judicial.
- A contagem usa regra, calendário, prova e marco explicitamente revisados.
  O marco canônico precisa corresponder ao campo da fonte; um marco alternativo
  exige prova e justificativa próprias. Uma recusa não recebe vencimento final.
- Aprovação cria tarefa restrita atomicamente. Mudanças nas fontes, concessões ou
  versões tornam a referência desatualizada, preservando sua data histórica e
  solicitando nova conferência. O formulário genérico de tarefas não altera a data.
- A memória exportada contém dias/etapas, condições, versões e fontes, com estado
  atual ou histórico. A exportação exige nova autorização de leitura no servidor.

## Motor determinístico

O motor inicial calcula dias úteis ou corridos no regime civil processual.
Horas, meses, anos, regras materiais e efeitos não suportados geram recusa.
Não há calendário brasileiro nem regra jurídica semeados como aprovados.

Calendários têm fuso IANA, abrangência e cobertura finita; exceções e suspensões
declaram efeitos separados na contagem, no início e no vencimento. Efeitos
sobrepostos preservam a restrição mais forte. Data civil não ganha horário
inventado. Instante ambíguo ou inexistente na mudança de fuso exige revisão.

Foram verificados 38 cenários SQL explícitos, incluindo disponibilização e
publicação, exclusão do marco, feriados, suspensão, dias corridos, recesso,
limite de cobertura e mudança de dia pelo fuso. Outros 120 casos gerados foram
comparados com um oráculo independente em Python. Todos passaram.

Medição local, sem equivaler a capacidade de produção: cenário habitual ~5,6 ms;
3.650 dias corridos ~42 ms; calendário com 1.000 exceções ~1,13 s. A memória
por dia usa acumulação em array para evitar cópias quadráticas de JSON.

## Verificação local

- `npm run typecheck`: passou.
- `npm run lint`: zero erros; 29 avisos herdados, fora do escopo novo.
- `npm test`: 565 testes em 87 arquivos passaram.
- `npm run build`: passou para aplicação e widget.
- Clone limpo de PostgreSQL: aplicação transacional das três migrations e 13
  suítes F1–F6 passaram, com 735 asserções. Incluem revogação do acesso do revisor
  à prova de outro caso e impedimento de novos prazos com essa referência.
- Oito corridas com duas sessões reais passaram: callbacks duplicados, lease
  único, desativação da conexão, revogação da permissão da fonte, revogação de
  leitura do original, calendário revogado durante aprovação, categoria revogada
  durante exportação e editor inativado durante espera. Esperas por lock foram
  observadas; concorrência de workers confirmou `SKIP LOCKED`, sem consumo real.
- Interface F6: 15 testes; catálogo incluído; resposta tardia, revogação durante
  exportação e formulário de aprovação desatualizado não liberam conteúdo/ação.
- Adaptador: 22 testes Deno, incluindo paginação segura, limites de bytes/tempo,
  autenticação, repetição e resultado incerto de criação de monitoramento.
- Regressão completa das funções compartilhadas: 74 testes Deno passaram.
- Integração SQL → adaptador: nove jobs reais na base local isolada, dez respostas
  HTTP falsas e finalização persistida. Quatro tipos oficiais de OAB, CNJ,
  movimentações, criação/conciliação de monitor e diário. Callback repetido foi
  deduplicado; mudança do original gerou nova versão em quarentena e sem caso.
- Navegador local: cinco painéis em 375 px, original escapado, registro manual,
  atribuição/aceite interno, ausência de configuração, contagem, recusa e relatório.

Evidências locais em `/tmp/advocachat-f6/` e `/tmp/advocachat-f6-ui/`;
esses diretórios são temporários e não substituem os testes versionados em
`supabase/tests/` e nos componentes. Fixtures e documentos são sintéticos.

## Operação e limites restantes

O scheduler envia a operação explícita ao dispatcher. Cada execução processa um
job, com orçamento monotônico de 30 segundos, RPCs limitadas e nova autorização
antes de cada consulta. Criação com resposta incerta exige conciliação e não é
repetida automaticamente. O callback só confirma após persistência.

P04 continua pendente: fonte/contrato, conta, cobertura nominal e homologação
operação a operação. P03 continua pendente: validação profissional das regras,
calendários e casos de referência. Datas e consultas sintéticas não validam um
prazo real nem comprovam cobertura de tribunal. Paginação e carga de grandes
contextos judiciais permanecem no trabalho de escala da F9.

## Publicação e verificação no Railway

Commit `e6af248b23ada9057a2c25399cfa4ae09a8e1c1d` publicado em `origin/main`,
SHA remoto conferido e CI concluída com sucesso. Deploys `SUCCESS`:

| Serviço | Deployment |
| --- | --- |
| web | `3a39d0f4-0c90-4bd0-a6c2-f5ba8373861a` |
| functions | `68a86d72-741c-4e80-8cd6-acd2920d2e0a` |
| scheduler | `8bf6f793-a958-4c52-9300-22e976623c4c` |

Migrations 2300, 2350 e 2400 aplicadas na mesma transação. Comparação dos dados
antes/depois confirmou preservação das 88 tabelas existentes verificadas. Ledger
relido; nenhuma tabela judicial/IR sem RLS; papel do portal continuou sem acesso
ao schema público. Nenhuma fonte/regra/calendário real foi aprovado pela migration.

SHA-256, na mesma ordem: `1ee5ba92ef8a0bfbfb6a793f70d52b07997238bd0ae7a0fc485b8425b44adba0`,
`c4f31ef7277204d9abc3c30f24d559c5c8048e430d7b937b568bce2407341fde`,
`8ff83670ae42b70db6ebe0640ca0f8ab38ac05659811e3d879490c5dc80f4f7d`.

API autenticada com caso sintético: upload/download com bytes e hash idênticos,
original auditado, recusa para usuário sem concessão médica e outro tenant,
triagem/aceite internos, cálculo independente de três dias, revisão e tarefa
persistida. Alterar a data pelo CRUD genérico retornou 403. Unidade em horas
gerou proposta incompleta, sem vencimento nem submissão autorizada.

Mudança sintética de calendário preservou 17/09 como data histórica, sinalizou
reconferência em Meu dia e produziu versão separada com 18/09. No navegador de
produção, essa nova versão foi submetida e revisada pela interface; recarregar
confirmou estado, nota e tarefa. As duas memórias foram baixadas e reabertas como
HTML estático, com CSP e sem scripts. Cinco subabas em 375 px, sem overflow e sem
erros de página. O 403 de `operation-admin` corresponde à ausência esperada de
permissão de administração global no usuário sintético, fora do módulo jurídico.

Dispatcher sem segredo e callback inválido retornaram 401; com segredo interno,
o estado foi não configurado e zero jobs processados. DataJud informou exigência
de permissão. Nenhuma consulta, mensagem, ciência ou protocolo real foi efetuado.

Evidências: `/tmp/advocachat-f6/live-*.log`, `migration-production.log` e
`/tmp/advocachat-f6-live-ui/result.json`, imagens e relatórios. Registros sintéticos
permanecem isolados para as fases seguintes e entram na limpeza final.
