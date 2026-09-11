# F6 — Contrato SQL, API e adaptador

Contrato de implementação de 11/09/2026. Objetos novos nas migrations 2300 (monitoramento) e 2400 (prazos), sem alterar migrations aplicadas. Os rascunhos não representam regras, calendário ou fornecedor homologados. Referência: [fontes e limites](./FASE_6_FONTES_E_LIMITES.md).

## Convenções e acesso

- UUIDs são strings; datas civis `YYYY-MM-DD`; timestamps exigem offset. JSON não contém fórmulas executáveis.
- `category`: `general | medical | fiscal | restricted`; `restricted` exige **ambas** as concessões médica e fiscal. Entradas externas são sempre `restricted`.
- `_legal_judicial_assert(case,category,owner)` trava o caso antes de revalidar tenant físico, feature, perfil ativo e ACL. Leitura usa os mesmos limites sem exigir edição.
- Descoberta sem associação e seu original: somente administrador ativo do tenant. Após associação: somente equipe autorizada do caso/categoria. OAB e monitor do fornecedor não associam automaticamente.
- Originais UTF-8 ficam em tabela privada separada (`legal_judicial_originals`), até 1 MiB, com SHA-256 conferido pelo PostgreSQL. Nunca aparecem em contextos, logs, fila ou HTML executável. Leitura autenticada específica e auditada devolve texto; UI renderiza como texto.
- Todas as mutações por RPC; tabelas sem escrita direta de `authenticated`, `anon`, `legal_portal` ou `PUBLIC`. Funções de serviço exigem `auth.role() = service_role`; `p_actor_id` vem de `Auth.getUser` no Edge, nunca do corpo do usuário.
- Tarefas F6 têm vínculo privado e RLS adicional por categoria; o CRUD genérico F2 não modifica seu prazo/atribuição. Os RPCs F6 preservam esse limite.

## 2300: tabelas e projeções

Todos os objetos de caso têm `id,tenant_id,case_id,created_at,created_by` quando aplicável. Versões registram autor, revisor, nota e datas; não há seed aprovado.

| Tabela | Campos específicos |
| --- | --- |
| `legal_judicial_source_versions` | `provider`, `source_key`, `version_number`, `title`, `api_version`, `documentation_url`, `checked_on`, `terms_version`, `permission_document_id`, `allowed_operations[]`, `valid_from`, `valid_until`, `scope={court?:string,oab_state?:string,origins_ids?:number[],note?:string}`, `limitations`, `state=draft/approved/rejected/revoked`, `review_note`, `reviewed_by/at` |
| `legal_judicial_connections` | `provider`, `account_id`, `environment`, `source_version_id`, `enabled`, `state`, `limits` JSON, `last_success_at`, `last_error_code`, `updated_at`; sem segredo |
| `legal_judicial_coverages` | `connection_id`, `scope` JSON, `capability`, `coverage_start_on`, `expected_interval_minutes`, `tolerated_delay_minutes`, `state=unknown/verified/degraded/interrupted`, `review_note`, `reviewed_by/at`, `last_capture_at` |
| `legal_judicial_jobs` | `connection_id`, `proceeding_id?`, `operation`, `query` JSON, `state`, `attempts`, `request_count`, `max_requests`, `budget_units`, `authorization_note`, `idempotency_key`, `next_attempt_at`, `provider_monitor_id?`, `result_summary`, timestamps; lease e hash somente serviço |
| `legal_judicial_inbox` | `connection_id?`, `provider`, `provider_event_id`, `version_number`, `original_id`, `original_sha256`, `parser_version`, `event_type`, `title`, `category`, `candidates` JSON, `provider_monitor_ids[]`, `source_updated_at?`, `decision_signed_at?`, `made_available_on?`, `published_on?`, `communication_sent_at?`, `provider_received_at?`, `source_consulted_at?`, `awareness_effective_on?`, `temporal_notes`, `captured_at`, `association_state=unmatched/ambiguous/confirmed/rejected/quarantined`, `proceeding_id?`, `evidence_document_id?`, `revision`, `extracted_from_inbox_id?`, `review_note`, `reviewed_by/at` |
| `legal_judicial_originals` | original UTF-8, MIME, hash; nenhuma seleção direta autenticada |
| `legal_judicial_triage` | `inbox_id`, `assignee_id`, `substitute_id?`, `state=pending/accepted/completed/cancelled`, `internal_received_at`, `accepted_at?`, `due_at?`, `task_id`, `note`, `revision` |
| `legal_judicial_task_links` | `task_id`, `case_id`, `category`, `reference_kind=triage/deadline_check/deadline_reviewed`, `reference_id` |

`connection.state`: `permission_pending | not_configured | disabled | active | degraded | rate_limited | quota_exhausted | coverage_unknown`.

`job.state`: `queued | sending | retry_wait | succeeded | failed | unknown | cancelled | permission_pending | not_configured | quota_exhausted`.

Fonte e cobertura devem corresponder mecanicamente ao tribunal do processo (`court` ou `*` aprovado), UF da OAB (`oab_state` ou `*`) ou origens do diário (`origins_ids`). Consumo exige cobertura nominal da mesma operação em `verified` ou `degraded`; degradação operacional permite retry seguro, sem apagar a revisão de escopo. `unknown/interrupted` bloqueiam nova captura.

`operation`: `consult_cnj | discover_oab | monitor_process | monitor_diary | read_updates | reconcile_monitor`.

`query` contém apenas `cnj?, oab_number?, oab_state?, oab_type?, term?, origins_ids?:number[], variations?:string[], limit_appearances?:number, provider_monitor_id?, monitor_kind?:process|diary, cursor?:{cursor?:string,li?:string,page?:number}`. Não contém URL. `oab_type` usa `ADVOGADO | ESTAGIARIO | SUPLEMENTAR | CONSULTOR_ESTRANGEIRO` do endpoint V2. `read_updates` usa CNJ e consulta movimentações; `reconcile_monitor` usa ID/kind conhecido de monitor. `max_requests` entre 1 e 5; `budget_units` inteiro explícito para monitoramento. `documents_publicos` nunca habilitado.

### RPCs internos 2300

Todos retornam row/projeção JSON, exceto onde indicado.

- `legal_judicial_create_source_version(p_payload jsonb)` → source row. Payload exatamente campos descritivos da tabela, sem tenant/estado/versão/autor. Administrador.
- `legal_judicial_review_source(p_version_id uuid,p_decision text,p_note text)` → source row. `approved/rejected/revoked`; aprovação exige prova geral pronta, fontes, vigência, escopo e operações enumeradas. DataJud mantém consumo bloqueado na F6 mesmo com cadastro aprovado.
- `legal_judicial_save_coverage(p_connection_id uuid,p_payload jsonb,p_coverage_id uuid default null)` → row; administrador, conferência nominal.
- `legal_judicial_enqueue(p_connection_id uuid,p_payload jsonb)` → job **sem lease/hash**. Payload `case_id?,proceeding_id?,operation,query,max_requests,budget_units,authorization_note,idempotency_key`. Sem caso requer admin; com caso requer responsável com acesso restrito, processo F1 e CNJ correspondente quando aplicável.
- `legal_judicial_retry_job(p_job_id uuid,p_note text)` → job público. Somente consultas seguras com tentativas limitadas; `unknown` de criação não repete.
- `legal_judicial_cancel_job(p_job_id uuid,p_note text)` → job público. Somente não enviado; envio ambíguo exige conciliação.
- `legal_judicial_record_manual_event(p_case_id uuid,p_payload jsonb)` → inbox row. Payload `title,event_type,category,original_text,evidence_document_id,proceeding_id?,extracted_from_inbox_id?,parser_version?,` campos temporais da inbox, `temporal_notes?`. Original hash calculado no banco; prova pronta no mesmo caso; associação confirmada pelo responsável que registra. Não cria ciência por leitura.
- `legal_judicial_review_association(p_inbox_id uuid,p_case_id uuid,p_proceeding_id uuid,p_decision text,p_evidence_document_id uuid,p_note text)` → inbox row. `confirmed/rejected`; responsável do caso, prova pronta e CNJ candidato conferido; correção de associação preserva revisão anterior e invalida prazo derivado. Não move entre casos silenciosamente.
- `legal_judicial_read_original(p_inbox_id uuid)` → `{original_text,content_type,sha256}` com auditoria. Restrição atual revalidada.
- `legal_judicial_assign(p_inbox_id uuid,p_assignee_id uuid,p_substitute_id uuid,p_due_at timestamptz,p_note text)` → triage row + task_id. Responsável/substituto ativos, do mesmo caso e com categoria; tarefa genérica sem texto original.
- `legal_judicial_accept_assignment(p_triage_id uuid,p_note text)` → triage row. Aceite interno pelo responsável/substituto, jamais ciência jurídica.
- `legal_judicial_update_task_status(p_task_id uuid,p_status text,p_note text)` → tarefa F2; `open/completed/cancelled` conforme F2, categoria e atribuição revalidadas; cancelamento justificado.
- `legal_judicial_context(p_case_id uuid default null)` → contexto abaixo. Sem caso, catálogo/conexões/cobertura visíveis conforme papel e descoberta exclusiva admin; com caso, somente registros daquele caso e autorizados.

```ts
{
  tenant_id: string, user_id: string,
  can_manage_sources: boolean, can_edit_catalog: boolean, can_approve_catalog: boolean,
  can_edit_case: boolean, can_review_case: boolean,
  sources: SourceVersion[], connections: ConnectionProjection[], coverages: Coverage[],
  jobs: JobProjection[], inbox: InboxProjection[], triage: Triage[],
  calendars: CalendarVersion[], rules: RuleVersion[], deadlines: DeadlineVersion[],
  deadline_states: {id:string,is_current:boolean}[]
}
```

Sem caso, `triage/deadlines` vazios; calendários/regras são catálogo do tenant. Contexto não contém originais, lease, tokens, hash de payload, dados de outros tenants ou dados médicos/fiscais fora da ACL. Para UI, `can_edit_case/can_review_case` incorporam categoria `restricted`.

### RPCs de serviço 2300

- `legal_judicial_service_configure(p_actor_id uuid,p_expected_tenant_id uuid,p_account_id text,p_source_version_id uuid,p_enabled boolean,p_limits jsonb)` → connection projection. `p_limits={environment:production|sandbox,requests_per_minute:1..120,requests_per_day:1..10000}`. Administrador físico e vínculo de conta obtido exclusivamente do env confirmado no Edge. Provider deriva da fonte. Não exige nem armazena segredo.
- `legal_judicial_service_claim(p_expected_tenant_id uuid,p_account_id text,p_provider text,p_configured boolean,p_limit integer default 10)` → array de `{id,lease_token,operation,query,max_requests,request_count,connection:{provider,account_id,environment},source_version_id}`. Sem configuração/permissão: nenhuma unidade sendable; registra motivo normalizado. DataJud não recebe claim.
- `legal_judicial_service_authorize_attempt(p_job_id uuid,p_lease_token uuid,p_expected_tenant_id uuid,p_account_id text)` → `{allowed:boolean,max_response_bytes:1048576,reason?:string}`. **Antes de cada fetch**, trava e revalida autorização/lease/conta/ACL; consome quota por minuto/dia e limite do job. Sem retry/fetch depois de `allowed:false`.
- `legal_judicial_service_finish(p_job_id uuid,p_lease_token uuid,p_status text,p_payload jsonb)` → job projection. Status `succeeded/retryable_error/rate_limited/quota_exhausted/permanent_error/unknown`. Payload fechado `{provider_monitor_id?,monitor_kind?:process|diary,next_cursor?:object,items_count?:number,error_code?:string}`. Sem original ou URL arbitrária; paginação/recepções usam ingest separado. GET tem no máximo 3 tentativas com espera; timeout de criação vira `unknown`.
- `legal_judicial_service_ingest(p_expected_tenant_id uuid,p_account_id text,p_provider text,p_event_id text,p_raw_original text,p_payload jsonb)` → `{id,status,duplicate,changed}`. Payload `{original_sha256,parser_version,event_type,title?,provider_monitor_ids?:string[],candidates?:[{cnj?,oab_number?,oab_state?,title?}],source_updated_at?,decision_signed_at?,made_available_on?,published_on?,communication_sent_at?,provider_received_at?,source_consulted_at?,awareness_effective_on?,temporal_notes?,quarantine_reason?:missing_event_id|unsupported_event|too_many_monitors}`. Não aceita case/tenant do corpo. Mesmo evento/hash retorna existente; novo hash cria versão quarantined preservando anterior. Toda entrada externa começa sem caso; associação é humana.

O Edge valida autenticação do callback, limites UTF-8 e corpo antes de ingest; só confirma após persistência. Preserva o original como texto, não busca anexos/URLs. Corpo inválido não entra no contador. Os callbacks podem conter múltiplos monitores/candidatos e jamais recebem associação automática.

## 2400: calendário, regra e prazo assistido

### Calendário

`legal_deadline_calendar_versions`: `id,tenant_id,calendar_key,version_number,title,scope,timezone,valid_from,valid_until,body,sources,state,created_by/at,reviewed_by/at,review_note`.

`scope={court:string,degree:string,unit:string,territory:string}`; os quatro campos precisam de confirmação explícita, podendo usar texto documental como “todas as unidades do órgão” quando sustentado pela fonte. Não há casamento por aproximação. O campo `court` também deve coincidir com o órgão cadastrado no processo F1; ausência ou divergência produz recusa estruturada.

`body={working_weekdays:number[],exceptions:[{on:string,working_day?:boolean,suspend_count:boolean,allow_start:boolean,allow_due:boolean,reason:string,source_index:number}],suspensions:[{from:string,until:string,suspend_count:boolean,allow_start:boolean,allow_due:boolean,reason:string,source_index:number}]}`. `working_weekdays` usa ISO1..7. Exceções/suspensões têm prova e efeito explícito, sem interpretar “ponto facultativo”. Intervalo finito máximo 10 anos; até 1000 exceções e 100 suspensões. Sobreposições preservam o efeito mais restritivo de início, contagem e vencimento, registrado na memória.

`sources=[{title,url,checked_on,version_note?,document_id}]`; documento geral pronto acessível ao revisor, URL https, consulta ISO. A regra e o calendário precisam de fonte e revisão para cálculo completo.

### Regra

`legal_deadline_rule_versions`: `id,tenant_id,rule_key,version_number,title,scope,valid_from,valid_until,body,sources,state,created_by/at,reviewed_by/at,review_note`.

`body={regime:string,nature:string,modality:string,recipient_kind:string,conditions:string,exclusions:string,validity_note:string,transition_resolved:boolean,input_kind:civil_date|timestamp,anchor_kind:string,marker_offset_count:number,marker_offset_unit:business_days|calendar_days,marker_adjustment:none|next_business_day,exclude_marker:boolean,count_unit:business_days|calendar_days,apply_suspensions:boolean,due_adjustment:none|next_business_day,due_time:string}`.

Motor inicial suporta `regime=civil_procedure`, `nature=procedural`, unidades em dias; outras naturezas/regimes permanecem rascunho e geram recusa explícita. A modalidade/destinatário são classificados pelo revisor e não inferidos do texto. `due_time` HH:MM:SS é informado/revisado, não presumido pelo browser. Fontes, vigência/transição e condições são obrigatórias para aprovar.

### Contagem

`legal_deadline_versions`: `id,tenant_id,case_id,deadline_key,version_number,category='restricted',proceeding_id,inbox_id?,rule_version_id?,calendar_version_id?,input,snapshot,snapshot_hash,result,engine_version,state=incomplete/draft/in_review/reviewed/returned,created_by/at,reviewed_by/at,review_note,task_id?,supersedes_version_id?`.

Payload de criação:

```ts
{
 deadline_key:string, title:string, proceeding_id:string,
 inbox_id?:string, rule_version_id?:string, calendar_version_id?:string,
 quantity:number, unit:'business_days'|'calendar_days'|'hours'|'months'|'years',
 anchor_date?:string, anchor_at?:string, anchor_kind:'made_available_on'|'published_on'|'awareness_effective_on'|'decision_signed_at'|'communication_sent_at'|'source_consulted_at'|'manual_verified',
 manual_anchor_reason?:string,
 evidence_document_id?:string, duration_basis:string,
 conditions_confirmed:boolean, coverage_confirmed:boolean, conflict_detected:boolean,
 scope:{court:string,degree:string,unit:string,territory:string},
 assignee_id:string, substitute_id?:string, note:string,
 supersedes_version_id?:string
}
```

`result={proposed_due_on:string|null,start_marker_on:string|null,first_counted_on:string|null,due_at:string|null,timezone:string|null,memory:[{on:string,stage:string,working_day:boolean,suspended:boolean,eligible:boolean,index:number,reason:string}],refusals:[{code:string,message:string}]}`.

Quando há fonte, o marco canônico é comparado ao seu campo real; timestamp pode virar data civil somente pelo fuso do calendário. Ausência/divergência recusa conclusão. Marco alternativo exige `manual_verified`, prova e `manual_anchor_reason`; captura, atualização do fornecedor e leitura interna não viram ciência.

Snapshots imutáveis incluem versões exatas, heads aprovados das chaves, prova SHA, acesso atual de cada revisor às provas (`catalog_proof_access`), associação/revisão do evento e atribuição. `inbox_source_head` guarda ID, versão, estado, revisão e SHA da última recepção do mesmo evento; uma correção posterior ainda não rejeitada bloqueia nova conclusão. Perder o acesso à prova de outro caso também invalida a análise e exige nova revisão documental. `is_current` deriva do snapshot atual; atualizar catálogo/prova/associação/atribuição não altera a data histórica. Sem cobertura ou com recusa, não há vencimento final. Nenhum texto muda uma regra de contagem.

### RPCs internos 2400

- `legal_deadline_create_calendar_version(p_payload jsonb)` / `legal_deadline_create_rule_version(p_payload jsonb)` → row. Campos da tabela excluindo estado/versão/atores; catálogo editável por `legal_can_create`.
- `legal_deadline_review_calendar(p_version_id uuid,p_decision text,p_note text)` / `legal_deadline_review_rule(...)` → row; `approved/rejected/revoked`, aprovação admin nominal, provas/estrutura/vigência completas.
- `legal_deadline_create_version(p_case_id uuid,p_payload jsonb)` → row com memória/refusas, sempre proposta.
- `legal_deadline_submit(p_version_id uuid)` → row; somente draft atual sem recusa.
- `legal_deadline_review(p_version_id uuid,p_decision text,p_note text)` → row; `reviewed/returned`, responsável restrito, snapshot relido sob lock. `reviewed` cria tarefa F2 vinculada/restrita atomicamente. Corrigir uma versão cria outra; tarefa histórica não muda silenciosamente.
- `legal_deadline_create_check_task(p_version_id uuid,p_due_at timestamptz,p_note text)` → tarefa de **conferir prazo**, permitida para incompleto, sem rotular a proposta como prazo revisado.
- `legal_deadline_read_report(p_version_id uuid)` → `{calculation:DeadlineVersion,is_current:boolean,generated_at:string}`; leitura restrita atual, auditoria sem conteúdo; exportação de histórico desatualizado não autoriza novos atos.

## Regras operacionais e testes

Locks: caso → objeto de caso → conexão; catálogos sob lock advisory por tenant, sem capturar casos. Jobs sem caso usam conexão/objeto mantendo a ordem definida no código. Serviço autoriza cada fetch, limita tentativas, request count e consumo; lease expirada de criação exige conciliação. Tempo real após espera usa `clock_timestamp()`.

As migrations adicionam políticas restritivas e guard F2 somente para tarefas vinculadas F6. Não há calendário ou regra aprovada semeados. Os testes `legal_judicial_monitoring.sql` e `legal_assisted_deadlines.sql` usam dados sintéticos e ROLLBACK; `legal_deadline_engine.sql` contém os oráculos puros. A implementação técnica não encerra P04 nem homologação jurídica.

A regressão de concorrência `supabase/tests/legal_judicial_concurrency.py` cria dois bancos locais a partir de uma base limpa pós-F6, sem executar fornecedor. Exemplo: `python3 supabase/tests/legal_judicial_concurrency.py --pg-bin /opt/homebrew/opt/postgresql@17/bin --port 55432 --baseline advocachat_f6_verified --tmp-dir /tmp/advocachat-f6-races`. Ela observa a espera real por lock, conserva logs de cada sessão e não remove os bancos sintéticos ao terminar. Exige PostgreSQL local descartável com privilégios de criação de banco.
