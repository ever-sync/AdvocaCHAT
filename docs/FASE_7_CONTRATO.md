# F7 — Contrato de implementação

Este contrato complementa a [arquitetura](FASE_7_ARQUITETURA.md) e descreve a
implementação congelada em 11/09/2026. Migração: `20260911250000`.
Os resultados de SQL e concorrência estão registrados ao final; a publicação e
os ensaios no ambiente Railway são documentados separadamente.

## Autorização e versões

Reutilizar tenant físico, feature jurídica, ACL de caso/categoria e bloqueio do
caso antes de mutações. `restricted` exige médico e fiscal. Portal, `anon` e
escrita direta de `authenticated` não recebem acesso ao módulo. Funções de serviço
exigem `service_role`, lease e revalidação da identidade que solicitou o trabalho.
O original é sempre um documento F1 pronto, do mesmo caso, com hash verificado.
Não inferir caso/categoria de OCR nem de resposta do modelo.

Listagens retornam somente metadados, paginadas. Conteúdo por página/versão exige
leitura específica auditada; revogação invalida recuperação, novos jobs, revisão,
exportação e publicação. Resultado em processamento perde autorização quando
o solicitante ou a fonte deixam de satisfazer o snapshot. Índice não é autorização.

## OCR e transcrição

- Job: documento, hash, categoria, solicitante, idempotency key, estado
  `queued/running/succeeded/partial/failed/cancelled/authorization_revoked`, lease
  privado, tentativas, limite e consumo de páginas, engine e motivo normalizado.
  Não permitir duas execuções vivas para o mesmo documento/hash. Reprocessamento
  é explícito e preserva resultados anteriores. Cancelamento não apaga histórico.
- Worker privado processa PDF/PNG; limite inicial 10 MiB, 20 páginas, 4 MiB de
  resultado e 90 s de processamento. PDF protegido/ilegível, MIME não suportado,
  limite de tamanho e idioma ausente geram estado explícito. Não seguir URLs.
- Saída do kernel: versão do motor/modelos/hash, bytes de origem, total conhecido
  de páginas, estado/motivo/tempo e páginas com número, texto, palavras, caixas,
  confiança e estado. Palavras e TSV não são fatos jurídicos/fiscais confirmados.
- Versões de texto: documento/hash, sequência, modo `ocr/manual/correction`,
  referência anterior, engine, estado `draft/in_review/approved/returned/revoked`,
  nota e autor/revisor. Páginas imutáveis; correção cria nova versão completa.
- Aprovação nominal por página: somente páginas explicitamente conferidas entram
  na pesquisa. Resultado parcial permanece rotulado como parcial; ausência não
  vira página vazia e não se declara documento completo por aprovar uma página.
  Transcrição manual informa página e mantém referência ao original.
- Conferência usa texto ao lado de original baixado pelo endpoint privado F1.
  Não criar URL pública nem armazenar raster de página sem necessidade.

## Biblioteca e citações

Biblioteca versionada por escritório com título, tipo `template/jurisprudence/note`,
origem HTTPS ou documento geral, data de consulta, nota de versão, texto e escopo
de uso. Não semear jurisprudência como aprovada. Aprovação exige revisão nominal.
Quando a origem é um documento de caso, acesso atual à origem também é exigido
antes de qualquer exposição ou reutilização; não torná-lo público ao escritório.

Pesquisa recebe caso, consulta e fontes selecionadas autorizadas. Recupera somente
páginas aprovadas e versões de biblioteca aprovadas acessíveis, com limites claros.
Antes de ordenar/produzir trechos, restringir por tenant, caso, categoria, estado
e versão atual. Resultado inclui uma citação emitida/persistida pelo servidor:
`id,case_id,category,source_kind,source_version_id,document_id?,page?,quote,
source_sha256,created_at`. Quote é trecho literal, não HTML. Identidade/versão/
hash/página/texto são novamente conferidos ao criar ou ler um rascunho.

## Rascunhos e IA opcional

Tipos: `summary/chronology/message/pleading`. Versões imutáveis têm propósito,
estado `draft/in_review/reviewed/returned`, fontes atuais, nota do revisor e corpo:

```ts
{
  title: string,
  sections: { heading: string; text: string; citation_ids: string[] }[],
  missing_facts: string[],
  divergences: string[]
}
```

Seção sem citação permanece visível como não comprovada. IDs inexistentes, de
outro caso, texto alterado ou fontes indisponíveis recusam conclusão. Conferência
literal não implica suporte semântico: a revisão humana é obrigatória. Anexos são
dados, não instruções; o adaptador não tem ferramentas, URLs ou execução de atos.

Sem modelo configurado, permitir autoria manual com o mesmo esquema/revisão e
mostrar IA indisponível. O conteúdo do cliente passa por liberação individual F5;
não disponibilizar assistente interno, biblioteca ou documentos automaticamente.
Encaminhamento de versão revisada para instrumento/publicação deve ser explícito
e preservar referência, sem enviar nem protocolar como efeito da geração.

## Fila privada e limites

OCR: worker separado usa REST/Storage internos com endpoints fixos do ambiente;
claim retorna caminho privado e hash somente após ACL. Um job por processo,
lease de 5 minutos, timeout de rede, resultado limitado. Finalização revalida hash,
estado/cancelamento, solicitante, caso, categoria, limites e lease. Expiração
libera novo pedido explícito, sem duplicação silenciosa de resultado ou consumo.

Geração: fila própria, binding servidor de tenant/conta/modelo e política aprovada.
Responses com schema fechado, sem ferramentas, `store:false` e timeout. Chaves não
chegam ao browser. Job ausente de configuração permanece indisponível, sem fetch.
Reserva de quota acontece sob lock antes do consumo; duas execuções não podem
gastar a mesma reserva. Falha incerta mantém consumo reservado como incerto.

Configuração por escritório registra habilitação OCR, teto de páginas por mês e
limite por documento. IA exige conta/modelo/política/finalidade e tarifas versionadas,
moeda/unidade, teto financeiro mensal e de tokens por chamada. Valores monetários
decimais, com estimativa separada de medição do provedor. Não assumir preço zero.
Logs/heartbeats contêm somente IDs, estado, contagens e duração, nunca texto.

## Congelamento do contrato

Os implementadores devem registrar aqui nomes/assinaturas RPC, projeções finais e
limites validados antes de integrar os componentes. Testes precisam demonstrar
SQL real → worker → páginas e SQL real → adaptador → versão, além de revogação,
concorrência, fidelidade de citações e uso autenticado no navegador.

## Contrato SQL/API definido — 2500

As assinaturas abaixo são o contrato de implementação validado. IDs são UUID; datas/instantes ISO; dinheiro/tarifas/custos são **strings decimais** no JSON. Os limites são validados novamente no banco. Metadados comuns: `id,tenant_id,case_id,category,created_by,created_at`; categorias `general|medical|fiscal|restricted`.

### Tabelas e projeções

- `legal_assistance_settings`: `tenant_id,ocr_enabled,ocr_monthly_page_limit,ocr_max_pages,updated_by,updated_at`. Default OCR desligado; teto por documento 20 páginas, teto mensal configurável 1..100000.
- `legal_ocr_jobs`: comuns + `document_id,source_sha256,idempotency_key,state,attempts,max_pages,quota_pages,quota_month,pages_total,processed_pages,kernel_version,error_code,result_version_id,started_at,finished_at,updated_at`. Estados `queued/running/succeeded/partial/failed/cancelled/authorization_revoked/unknown`. Lease e expiração privados. `quota_pages` reserva conservadora até medição; incerteza não vira zero.
- `legal_document_text_versions`: comuns + `document_id,source_sha256,version_number,mode:ocr|manual|correction,previous_version_id,ocr_job_id,pages_total,completeness:complete|partial|unknown,engine,state:draft|in_review|approved|returned|revoked,note,reviewed_by,reviewed_at,review_note`. Uma versão nova substitui a anterior para recuperação, sem apagar histórico.
- `legal_document_text_pages`: `id,tenant_id,case_id,version_id,category,page_number,text,page_status:recognized|low_confidence|no_text_recognized|not_processed|manual,words,confidence_mean,width,height,coordinate_system,review_state:unreviewed|approved|returned,reviewed_by,reviewed_at,review_note`. Texto/palavras imutáveis. Listagem omite `text,words` e nota; leitura específica traz conteúdo.
- `legal_document_text_reviews`: `id,tenant_id,case_id,version_id,page_number,decision,note,reviewed_by,created_at`; append-only.
- `legal_knowledge_versions`: `id,tenant_id,knowledge_key,version_number,title,kind:template|jurisprudence|note,source_url,source_document_id,checked_on,version_note,scope,text,source_sha256,state:draft|approved|rejected|revoked,created_by,created_at,reviewed_by,reviewed_at,review_note`. Fonte documental somente geral; acesso à origem não se amplia pela biblioteca. Listagem omite texto.
- `legal_source_citations`: comuns + `source_kind:text_page|knowledge,source_version_id,document_id,page_number,start_offset,quote,source_sha256,source_label`. São trechos emitidos pelo servidor, imutáveis e reconferidos literalmente.
- `legal_assistance_draft_versions`: comuns + `draft_key,version_number,kind:summary|chronology|message|pleading,purpose,body,citation_ids,snapshot,snapshot_hash,mode:manual|ai,ai_job_id,previous_version_id,state:draft|in_review|reviewed|returned|revoked,reviewed_by,reviewed_at,review_note`. Listagem omite `body,snapshot,purpose`; `is_current` acompanha a projeção.
- `legal_assistance_draft_reviews` e `legal_assistance_transfers`: histórico nominal e referência de encaminhamento F2/F5, sem liberação automática.
- `legal_ai_policy_versions`: `id,tenant_id,policy_key,version_number,title,model,purpose_note,retention_note,source_document_id,source_url,checked_on,valid_from,valid_until,allow_medical,allow_fiscal,currency:USD,rate_unit:per_million_tokens,input_rate,output_rate,monthly_budget,max_input_tokens,max_output_tokens,state:draft|approved|rejected|revoked,created_by,created_at,reviewed_by,reviewed_at,review_note`. Tarifas `numeric`, strings no JSON; limites 50000 tokens de entrada/4000 de saída. Nenhum preço é semeado.
- `legal_ai_connections`: `id,tenant_id,account_id,model,policy_version_id,enabled,state:not_configured|enabled|disabled|policy_required,created_by,updated_at`. Conta/modelo vêm do binding de ambiente confirmado pelo Edge, jamais da declaração isolada do browser. Projeção ao usuário omite `account_id`.
- `legal_ai_jobs`: comuns + `draft_key,kind,purpose,citation_ids,max_output_tokens,idempotency_key,connection_id,policy_version_id,state:queued|running|succeeded|failed|cancelled|authorization_revoked|not_configured|quota_exhausted|unknown,input_token_bound,input_tokens,output_tokens,reserved_cost,measured_cost,quota_cost,quota_month,consumption:not_sent|reserved|reported|uncertain,result_version_id,error_code,started_at,finished_at`. Lease privado. Listagem omite propósito/citações e reserva técnica; custo/quota decimal textual.
- `legal_assistance_audit`: eventos genéricos e IDs, append-only, sem conteúdo no histórico geral F1.

### Contexto e listagens internas

`legal_assistance_context(p_case_id uuid)` → `{tenant_id,user_id,can_edit,can_review,can_manage,settings,ocr_usage:{month,charged_pages,monthly_limit},ai_connection:{id,model,policy_version_id,enabled,state}|null,ai_usage:{month,currency,quota_cost,monthly_budget}|null}`. `can_edit/can_review` representam capacidade geral no caso; cada ação e controle de interface também valida a categoria específica. Conteúdo restricted exige ambas as concessões.

`legal_assistance_list(p_case_id uuid,p_kind text,p_limit integer default25,p_offset integer default0)` → `{items:metadata[],has_more:boolean}`. Tipos `ocr_jobs|text_versions|knowledge|drafts|ai_jobs|ai_policies`; 1..50 resultados, offset0..100000. Biblioteca/políticas são do tenant; documentos de origem conservam ACL.

`legal_assistance_configure_ocr(p_enabled boolean,p_monthly_page_limit integer,p_max_pages integer)` → settings. Admin ativo, sem alterar categorias nem conteúdo.

### OCR e versões de texto

- `legal_ocr_enqueue(p_document_id uuid,p_idempotency_key uuid,p_previous_job_id uuid default null)` → job metadata. Pronto/mesmo hash, editor atual, uma execução viva por documento/hash, reserva sob lock do caso→quota tenant. Reprocessar exige referência explícita ao último job terminal. Sem reset automático de consumo.
- `legal_ocr_cancel(p_job_id uuid,p_note text)` → metadata. O cancelamento invalida conclusão; running conserva reserva até medição ou reconciliação. Não remove original.
- `legal_ocr_service_claim(p_limit integer default1)` → `[{id,lease_token,document_id,storage_path,source_sha256,source_bytes,mime_type,max_pages,tenant_id,case_id,category}]`. Serviço privado, limite1, lease5min, sem URL fornecida pelo usuário. Revalida solicitante e documento. Recuperação de lease vencida vira `unknown` e exige novo pedido explícito.
- `legal_ocr_service_finish(p_job_id uuid,p_lease_token uuid,p_result jsonb)` → `{job:metadata,version_id:uuid|null}`. `p_result` é o DTO exato do kernel documentado em `infra/legal-document-worker/README.md`; SHA/tamanho/MIME confrontados, até4MiB,20páginas. Revalida cancelamento/fonte/ACL depois do processamento. Conteúdo novo fica não conferido.
- `legal_ocr_service_fail(p_job_id uuid,p_lease_token uuid,p_code text,p_processing_started boolean)` → metadata. Código normalizado, sem stderr; reserva conservada se processamento pode ter iniciado.
- `legal_text_create_version(p_document_id uuid,p_payload jsonb)` → version metadata. Payload `{mode:'manual'|'correction',previous_version_id?:uuid,pages_total?:number,note:string,pages:[{page_number:number,text:string}]}`;1..20 páginas distintas, total original conhecido até1000, texto total até2MiB. Correção referencia a versão atual e inclui todas as páginas já efetivamente transcritas (`recognized/low_confidence/manual`), preserva o total original conhecido e permite omitir páginas ainda não processadas/sem texto reconhecido sem inventar transcrição vazia. A completude continua parcial enquanto faltarem páginas.
- `legal_text_list_pages(p_version_id uuid,p_limit integer default20,p_offset integer default0)` → metadata paginada, sem texto/palavras.
- `legal_text_read_page(p_version_id uuid,p_page_number integer)` → `{version:metadata,page:page_with_text_and_words,is_current:boolean}`, auditado.
- `legal_text_submit(p_version_id uuid)` → metadata.
- `legal_text_review_pages(p_version_id uuid,p_page_numbers integer[],p_decision text,p_note text)` → metadata. `approved|returned`, owner da categoria, versão atual. Página ausente/não processada não pode ser aprovada. Somente páginas explicitamente aprovadas entram na pesquisa. Versão parcial continua parcial.
- `legal_text_revoke(p_version_id uuid,p_note text)` → metadata; owner, bloqueia novos usos sem apagar histórico.

### Biblioteca, pesquisa e citações

- `legal_knowledge_create_version(p_payload jsonb)` → metadata. Payload campos editoriais listados acima, excluindo IDs, versão, hash/estado/atores; `legal_can_create`. Texto≤200000chars, origem HTTPS ou documento geral, título/escopo/consulta/nota de versão.
- `legal_knowledge_review(p_version_id uuid,p_decision text,p_note text)` → metadata. `approved|rejected|revoked`, admin, prova/origem e consulta completas; versão aprovada atual e acesso à origem são revalidados no uso.
- `legal_knowledge_read(p_version_id uuid)` → `{version:full_version,is_current:boolean}`, auditado e com ACL atual da origem.
- `legal_assistance_search(p_case_id uuid,p_query text,p_sources jsonb,p_limit integer default10)` → `{citations:Citation[],has_more:boolean}`. Fontes explicitamente selecionadas `[{kind:'text_page'|'knowledge',version_id:uuid}]`,1..20; busca textual literal2..200chars; resultados1..10; citação≤3000chars. Não pesquisa fontes que o chamador não selecionou ou não pode acessar.
- `legal_assistance_read_citation(p_citation_id uuid)` → Citation, auditada, texto/posição/hash/página novamente conferidos na origem atual.

### Rascunhos e encaminhamento explícito

- `legal_assistance_create_draft(p_case_id uuid,p_payload jsonb)` → metadata. Payload `{draft_key,kind,category,purpose,body,citation_ids:uuid[],previous_version_id?:uuid}`. Corpo no schema acima, purpose≤2000chars;0..12citações (manual sem fonte fica não comprovado), limite96kB. Cada seção≤6000chars, até12seções. Fontes médicas+fiscais combinadas exigem restricted.
- `legal_assistance_read_draft(p_version_id uuid)` → `{version:full_version,citations:Citation[],is_current:boolean}`, auditado; fonte revogada impede recuperar corpo/citações, mesmo no histórico.
- `legal_assistance_submit(p_version_id uuid)` → metadata, atualidade obrigatória.
- `legal_assistance_review(p_version_id uuid,p_decision text,p_note text)` → metadata; `reviewed|returned|revoked`, owner atual, fonte/hash/trecho reconferidos. Registro nominal não é validação automática da conclusão jurídica.
- `legal_assistance_use_draft(p_version_id uuid,p_target_kind text,p_payload jsonb)` → `{target_kind,target_id,source_version_id}`. `instrument` com `{instrument_type:'proposal'|'contract'|'power_of_attorney',title}`; `publication` com `{membership_id,title,publication_kind:'summary'|'update'}` conforme enums F5 existentes. Cria apenas draft na API existente e vínculo auditável. **restricted não é rebaixado** para categorias F2/F5; esse conteúdo combinado continua interno. Nenhuma assinatura/envio/liberação como efeito desta ação.

### IA opcional — binding e consumo autoritativos

- `legal_ai_create_policy_version(p_payload jsonb)` / `legal_ai_review_policy(p_version_id uuid,p_decision text,p_note text)` → metadata. Admin; aprovação exige política documentada, retenção/finalidade, tarifas textuais positivas, teto mensal, vigência, fonte geral pronta e atual. Default sem política aprovada.
- `legal_ai_service_configure(p_actor_id uuid,p_expected_tenant_id uuid,p_account_id text,p_model text,p_policy_version_id uuid,p_enabled boolean)` → connection projection. Somente serviço, binding tenant/conta/modelo do ambiente, política confere modelo.
- `legal_ai_enqueue(p_case_id uuid,p_payload jsonb)` → metadata. Payload `{draft_key,kind,category,purpose,citation_ids:uuid[],max_output_tokens:integer,idempotency_key:uuid}`;1..12citações/24kUTF8 bytes de trechos; saída256..4000. Não reserva preço zero nem chama provedor ausente.
- `legal_ai_cancel(p_job_id uuid,p_note text)` → metadata. Sem declarar consumo zero de execução iniciada.
- `legal_ai_service_claim(p_expected_tenant_id uuid,p_account_id text,p_model text,p_configured boolean)` → `[{id,lease_token,input:{purpose,kind,citations:[{id,quote,source_label,page:number|null}],max_output_tokens}}]`; máximo1, fonte/ACL/política atuais, lease5min. Sem configuração devolve[] e persiste estado indisponível.
- `legal_ai_service_authorize(p_job_id uuid,p_lease_token uuid,p_expected_tenant_id uuid,p_account_id text,p_model text,p_input_token_bound integer)` → `{allowed:boolean,reason?:string,reserved_cost?:string}`. Chamado imediatamente antes do fetch. Bound conservador = bytes UTF8 do request completo +4096, até50000. Reserva numérica `(bound*input_rate+max_output*output_rate)/1000000` arredondada para cima a6casas; lock de quota por tenant/mês. Revalida fontes/política/binding/revogação. Não autoriza duas vezes a mesma lease.
- `legal_ai_service_finish(p_job_id uuid,p_lease_token uuid,p_outcome jsonb)` → `{job:metadata,version_id:uuid|null}`. DTO do adaptador root: `{ok:true,body,usage:{input_tokens,output_tokens}|null,response_id}` ou `{ok:false,code,consumption:'not_sent'|'uncertain'|'reported',usage?:{input_tokens,output_tokens}}`. Recusa conteúdo sem citações válidas; resultado sempre draft. Usage medida conserva custo separado da reserva. Falha sem medição mantém quota conservadora; não há retry automático.

As RPCs `*_service_*` são exclusivas do papel de serviço, incluindo validação de role em execução; as demais exigem JWT interno atual. Nenhuma tabela com corpo/palavras/trechos/lease tem SELECT direto concedido ao browser.


### Verificação SQL e concorrência

A série de rascunhos mantém a categoria original entre versões, inclusive quando a próxima versão é solicitada à IA. Reclassificação exige uma série separada e escolha explícita de fontes; não substitui uma série restrita por outra geral. A conexão projeta `policy_required` quando sua política atual deixa de ser válida, mesmo que tenha sido habilitada anteriormente.

As 14 suítes F1–F7 são transacionais, com dados sintéticos e rollback. A suíte F7 inclui 52 asserções; o conjunto contém 787. O harness `supabase/tests/legal_assistance_concurrency.py` cria um clone local e prova nove disputas entre sessões: enqueue duplicado, quota OCR entre casos, lease única de worker, orçamento decimal IA entre casos, revogação médica antes do finish, cancelamento IA com consumo medido, correção de fonte durante revisão F2, ordem de locks de versão/revisão F2 e lease expirada durante espera. Um décimo grupo verifica a reserva OCR que atravessa o mês. Nenhum desses testes chama fornecedor ou envia documento real.

```sh
python3 supabase/tests/legal_assistance_concurrency.py --baseline advocachat_f7_verified --prefix advocachat_f7_race_local --tmp-dir /tmp/advocachat-f7-races
```

O argumento baseline deve ser um banco PostgreSQL local descartável com F1–F7 aplicadas e sem clientes; o harness aceita apenas host `127.0.0.1` e conserva clones/logs para inspeção. Os ensaios complementares `legal_ocr_adapter_contract.py` e `legal_ai_adapter_contract.ts` validam respectivamente o kernel real com arquivos sintéticos e o handler real com respostas controladas, mantendo a SQL autoritativa.
