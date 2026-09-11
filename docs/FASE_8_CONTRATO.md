# F8 — Contrato SQL/API 2600

Contrato aditivo para implementação, 11/09/2026. Referência: `FASE_8_ARQUITETURA.md`. A migração é `20260911260000_legal_specialized_operations.sql`. Nenhuma operação externa de ciência, peticionamento ou fornecedor é executada por este contrato; habilitação institucional e contrato técnico permanecem P04.

## Convenções

Todos os IDs são UUID; datas civis são ISO `YYYY-MM-DD`; instantes exigem offset e são finitos. Categoria `general|medical|fiscal|restricted`; restricted exige ambas as permissões médicas e fiscais. Toda mutação interna exige perfil ativo no tenant físico, recurso jurídico habilitado e ACL de caso. Dono do caso faz revisões nominais; editor pode preparar. Catálogos são administrados pelo admin. Não há escrita direta nem SELECT de conteúdo nas tabelas para authenticated/anon/legal_portal.

Todas as RPCs retornam JSON. `read` devolve conteúdo auditado; listagens contêm metadados autorizados. `version` é imutável em conteúdo: ajustes criam uma nova versão com `previous_version_id` e mesma chave/categoria; revisões e eventos são auditados. Estado de conferência interna não equivale a resultado externo. Os campos `is_current` e `missing` são derivados no servidor.

`legal_expansion_context(p_case_id uuid)` → `{tenant_id,user_id,can_edit,can_review,can_manage,external_execution_enabled:false}`.

`legal_expansion_list(p_case_id uuid,p_kind text,p_limit integer=25,p_offset integer=0)` → `{items:metadata[],has_more:boolean}`; kind `coverages|acts|succession|diligences|packages|installations`; limites 1..50 e offset 0..100000. Metadados comuns: `id,case_id?,tenant_id,version_number?,title?,category?,state,created_at,created_by,reviewed_at?,reviewed_by?,is_current?`; sem corpo, pessoas, e-mail externo, credenciais ou hashes de convite.

## Cobertura e conexão por operação

`legal_operation_coverage_versions`: id, tenant_id, coverage_key, version_number, previous_version_id, title, provider (`domicilio|djen|mni|inss|onr|other`), operation (`domicilio_list|domicilio_logs|domicilio_awareness|court_case_read|court_publication_read|petition_submit|inss_request|registry_search|registry_signature|other_manual`), api_version, environment (`production|homologation`), institution_reference, court, degree, channel, documentation_url, checked_on, permission_document_id, valid_from, valid_until, limitations, permission_state (`unverified|documented|denied`), state (`draft|reviewed|revoked`), reviewer/note. Prova geral pronta com acesso atual do revisor; versões não aprovadas por seed.

`legal_operation_homologations`: id, coverage_version_id, scenario, result (`passed|failed|inconclusive`), evidence_document_id, tested_on, note, created_by/at. Registro append-only da operação exata; prova exigida. Uma homologação de outra operação, tribunal, ambiente ou versão não é reutilizada automaticamente.

`legal_operation_connections`: tenant_id, coverage_version_id, account_id privado, institution_reference privado, environment, configured, updated_by/at. Somente serviço grava binding confirmado pelo ambiente. Projeção de leitura: `{id,coverage_version_id,configured,adapter_implemented:false,permission_current,homologation_passed,active:false,state:'adapter_unimplemented'|'not_configured'|'permission_required'|'homologation_required'}`. Cadastro/revisão não anuncia integração ativa.

- `legal_operation_create_coverage(p_payload jsonb)` → metadata. Payload contém campos editoriais acima, excluindo IDs gerados/tenant/versão/estado/revisor. Limite 32 KiB.
- `legal_operation_review_coverage(p_version_id uuid,p_decision text,p_note text)` → metadata; reviewed/revoked. Reviewed exige permissão documentada, prova, fonte/data e vigência válidas.
- `legal_operation_record_homologation(p_version_id uuid,p_payload jsonb)` → registro. Campos scenario,result,evidence_document_id,tested_on,note.
- `legal_operation_read_coverage(p_version_id uuid)` → `{version,is_current,homologations,connection}`; acesso à prova preservado.
- `legal_operation_service_configure(p_actor_id uuid,p_expected_tenant_id uuid,p_account_id text,p_institution_reference text,p_environment text,p_coverage_version_id uuid,p_configured boolean)` → projection. Actor é admin atual e tenant/conta/instituição/ambiente devem ser o vínculo do servidor; nenhuma chave fica no banco.

## Atos preparados, tentativas e recibos

`legal_external_act_versions`: id, tenant_id, case_id, act_key, version_number, previous_version_id, category, title, act_kind (`petition|awareness|administrative_request|other`), proceeding_id?, coverage_version_id?, recipient, channel, representation_id?, succession_authority_id?, instrument_version_id?, final_document_id?, signature_evidence_document_id?, source_document_ids[], purpose, authority_basis, checks, snapshot, snapshot_hash, state (`draft|in_review|ready|returned|revoked`), review fields. Conteúdo final, assinatura, destinatário e poderes são conferidos separadamente; instrumento deve ser versão aprovada e atual, quando selecionado.

Checks fechados: `documents_complete,recipient_verified,representation_reviewed,signature_checked,channel_authorized,legal_consequences_reviewed`, todos boolean. Petição e requerimento precisam arquivo final e prova de assinatura. Ciência exige referência/prova de origem e revisão das consequências, nunca é produzida pela leitura do CRM. `ready` significa preparo interno conferido, não transmissão habilitada. Nenhum envio existe nesta fase.

`legal_external_act_attempts`: id, version_id, case_id, mode=`manual`, idempotency_key, snapshot_hash, state (`prepared|reported_external|unknown|not_sent|reconciled`), note, created_by/at. Nova tentativa é proibida enquanto houver uma tentativa não reconciliada ou declarada não enviada. Uma execução ambígua não recebe retry automático.

`legal_external_act_receipts`: id, attempt_id, document_id, document_sha256, external_reference, recipient, channel, proceeding_id?, occurred_on, outcome (`protocol|awareness|rejected|not_sent`), description, state (`submitted|reviewed|returned`), reviewed_by/at, review_note. Recibo não confirma identidade nem resultado até revisão. Mesma prova SHA/referência não pode ser apropriada por tentativas diferentes. Fato externo pode ser registrado historicamente após mudança na análise; isso não torna uma versão antiga atual nem autoriza novo ato.

- `legal_external_act_create_version(p_case_id uuid,p_payload jsonb)` → metadata; campos editoriais acima, 128 KiB máximo.
- `legal_external_act_submit(p_version_id uuid)` / `legal_external_act_review(p_version_id uuid,p_decision text,p_note text)` → metadata; decisão ready/returned/revoked. Ready exige missing vazio e snapshot atual.
- `legal_external_act_read(p_version_id uuid)` → `{version,is_current,missing:string[],can_prepare_attempt:boolean,attempt_blockers:string[],attempts:[],receipts:[]}`.
- `legal_external_act_prepare_attempt(p_version_id uuid,p_idempotency_key uuid,p_note text)` → attempt; owner, ready atual, modo manual somente.
- `legal_external_act_report_attempt(p_attempt_id uuid,p_state text,p_note text)` → attempt; reported_external/unknown/not_sent, registro humano sem fetch.
- `legal_external_act_record_receipt(p_attempt_id uuid,p_payload jsonb)` → receipt; prova privada pronta, mesmo caso/categoria, datas não futuras.
- `legal_external_act_reconcile(p_receipt_id uuid,p_decision text,p_checks jsonb,p_note text)` → receipt; reviewed/returned. Checks boolean `reference_matches,recipient_matches,channel_matches,document_compared,occurrence_confirmed`, todos true para reviewed. Processo/destinatário/canal têm de coincidir com a tentativa. Revisor owner. A tentativa reconciliada preserva todos os registros; resultado significa ocorrência documentada externamente.

## Sucessão e representação por operação

`legal_succession_versions`: id,tenant_id,case_id,succession_key,version_number,previous_version_id,category=`restricted`,title,deceased_party_id,death_on?,death_document_id?,assets_status (`unknown|declared_present|declared_absent`),dependency_status (`unknown|reported|documented`),payment_location (`unknown|not_released|available_at_bank|credited|returned_to_revenue`),proceeding_id?,notes,snapshot,snapshot_hash,state (`draft|in_review|reviewed|returned|revoked`),review fields.

`legal_succession_persons`: id,version_id,case_id,party_id,claimed_capacity (`spouse|partner|heir|legatee|dependent|estate_representative|other|unknown`),capacity_note,evidence_document_ids[],representation_id?,pending_note. Até 50 pessoas; nenhuma duplicação de CPF nem percentual inferido. Até 20 provas por pessoa.

`legal_succession_authority_reviews`: id,version_id,person_id,representation_id?,operation (`document_collection|portal_access|administrative_representation|judicial_representation|payment_request`),evidence_document_ids[],basis_note,scope_note,valid_from?,valid_until?,decision (`reviewed|insufficient|revoked`),snapshot,reviewed_by/at. reviewed exige representação F3 ativa vinculada à mesma pessoa e ambos os instantes de validade; insufficient admite representação/datas ausentes, sem criar valores fictícios, mas NÃO altera os scopes document_upload. Esta tabela documenta conferência nominal específica; não concede automaticamente portal, petição ou acesso a dinheiro.

`legal_succession_events`: id,version_id,event_kind (`death_reported|estate_filing|appointment|habilitation_requested|habilitation_decided|document_received|payment_authority_recorded|note`),occurred_on,document_id?,description,previous_event_id?,created_by/at. Nomeação/decisão/autorização de pagamento exigem prova. Correções são novos eventos; nenhum evento altera partes, dinheiro ou prazos existentes.

- `legal_succession_create_version(p_case_id uuid,p_payload jsonb)` → metadata. Campos editoriais + `persons:[...]` e predecessor; limite 256 KiB.
- `legal_succession_submit(p_version_id uuid)` / `legal_succession_review(p_version_id uuid,p_decision text,p_note text)` → metadata; reviewed/returned/revoked. Revisão exige certidão pronta, pessoas e referência vigente das provas. Dados desconhecidos continuam desconhecidos.
- `legal_succession_read(p_version_id uuid)` → `{version,is_current,missing:string[],persons,authorities,events}`; dupla ACL e auditoria.
- `legal_succession_record_authority(p_version_id uuid,p_payload jsonb)` → authority; owner/dupla ACL. Revogação utiliza `legal_succession_revoke_authority(p_authority_id uuid,p_note text)`.
- `legal_succession_record_event(p_version_id uuid,p_payload jsonb)` → event; fatos efetivos sem datas futuras.

## Diligências com identidade externa isolada

`legal_diligence_versions`: id,tenant_id,case_id,diligence_key,version_number,previous_version_id,category,title,instructions,proceeding_id?,supervisor_id,substitute_id?,due_at?,expires_at,source_document_ids[],snapshot,snapshot_hash,state (`draft|approved|returned|revoked|completed`),review fields. Editor prepara, owner confere. Supervisores atuais do mesmo caso, categoria compatível. Nova versão invalida acesso anterior. Orçamento/honorário não é aprovado automaticamente nem movido para o financeiro.

`legal_diligence_invites`: id,case_id,tenant_id,version_id,email privado,identity_id?,scopes (`instruction:read|files:read|delivery:upload|message:write`),expires_at,state (`draft|approved|rejected|issued|accepted|revoked`),revision,identity_evidence_document_id?,identity_note,reviewed_by/at,created_by/at.

`legal_diligence_grants`: id,case_id,tenant_id,version_id,invite_id,identity_id,scopes,expires_at,state (`active|revoked|completed`),accepted_at,revision. Não existe membership F5 para esta concessão. Documentos são somente os IDs/SHA explicitamente selecionados e conferidos na versão; não há acesso ao caso completo.

`legal_diligence_deliveries`: id,case_id,version_id,grant_id,identity_id,document_id,description,state (`prepared|submitted|reviewed|returned|abandoned`),reviewed_by/at,note. Até 5 arquivos/50 MiB por diligência; cada arquivo ≤10 MiB e quota F1 de 200 MiB por caso. PDF/PNG/JPEG/TXT/CSV. Recebido não conclui diligência nem comprova ato judicial.

`legal_diligence_messages`: id,grant_id,identity_id,body≤6000,idempotency_key,created_at; só a diligência correspondente.

Reserva de identidade: `legal_portal_provisioning` ganha `diligence_invite_id` e XOR com `invite_id`; os guards Auth existentes continuam impedindo profile/tenant interno. RPCs F5 recusam reservas cujo destino é diligência e vice-versa. Nenhuma credencial Auth é devolvida ao staff; o correspondente autentica por senha/OTP solicitado por ele.

RPCs internas:

- `legal_diligence_create_version(p_case_id uuid,p_payload jsonb)` → metadata.
- `legal_diligence_review(p_version_id uuid,p_decision text,p_note text)` → metadata; approved/returned/revoked/completed. Completed exige entrega revisada e encerra acesso.
- `legal_diligence_read(p_version_id uuid)` → `{version,is_current,invites,grants,deliveries,messages}`; e-mails e dados de identidade owner-only.
- `legal_diligence_create_invite(p_version_id uuid,p_payload jsonb)` → metadata; email,scopes,expires_at.
- `legal_diligence_review_invite(p_invite_id uuid,p_decision text,p_evidence_document_id uuid,p_note text)` → metadata; approved/rejected, prova geral de identidade/contato.
- `legal_diligence_revoke_invite(p_invite_id uuid,p_note text)` → metadata; revoga token/grant.
- `legal_diligence_review_delivery(p_delivery_id uuid,p_decision text,p_note text)` → delivery; reviewed/returned.

RPCs exclusivas service_role, actor sempre derivado de Auth.getUser no Edge:

- `legal_diligence_service_reserve(p_staff_id,p_invite_id,p_auth_user_id,p_idempotency_key)` → `{id:provisioning_id|null,auth_user_id,email,status}`.
- `legal_diligence_service_complete_provision(p_staff_id,p_provisioning_id)` → `{identity_id,auth_user_id,email,status}`.
- `legal_diligence_service_issue(p_staff_id,p_invite_id,p_token_hash)` → `{invite_id,expires_at,revision}`; token aleatório32bytes gerado no Edge, somente SHA256 no banco.
- `legal_diligence_service_inspect(p_token_hash)` → `{available:boolean}`; nenhum dado pessoal.
- `legal_diligence_service_accept(p_actor_id,p_token_hash)` → `{grant_id,status}`.
- `legal_diligence_service_context(p_actor_id)` → `{identity_id,status,diligences:[{grant_id,title,category,due_at,expires_at,state,scopes}]}`; não retorna case_id/tenant_id.
- `legal_diligence_service_read(p_actor_id,p_grant_id)` → `{grant:{id,title,category,due_at,expires_at,scopes},instructions,documents:[{id,file_name,mime_type,size_bytes,sha256}],deliveries:[{id,document_id,file_name,state,description,created_at,review_note}],messages:[{id,body,created_at}]}`; só arquivos liberados/entregas próprias.
- `legal_diligence_service_download(p_actor_id,p_grant_id,p_document_id)` → `{document_id,storage_path,mime_type,file_name,sha256,size_bytes}`; Edge transmite bytes após segunda revalidação, sem signed URL.
- `legal_diligence_service_prepare_upload(p_actor_id,p_grant_id,p_payload)` → `{delivery_id,document:{id,storage_path,mime_type,size_bytes,status}}`; payload file_name,mime_type,size_bytes,description,idempotency_key; category é opcional medical|fiscal apenas para a diligência restricted. As demais derivam a categoria da versão, sem downgrade.
- `legal_diligence_service_finalize_upload(p_actor_id,p_delivery_id,p_sha256)` → `{delivery_id,document_id,state}`; SHA medido pelo Edge, grant/source/expiração atuais e existência Storage verificadas.
- `legal_diligence_service_abandon_upload(p_actor_id,p_delivery_id)` → `{cleanup_allowed:boolean,storage_path?:string}`; ready nunca apagado, timeout não autoriza limpeza.
- `legal_diligence_service_reply(p_actor_id,p_grant_id,p_body,p_idempotency_key)` → `{id,body,created_at}`.

## Pacotes organizacionais de especialidade

`legal_specialty_package_versions`: id,tenant_id,package_key,version_number,previous_version_id,title,specialty,purpose,scope,source_url,checked_on,validity_note,limitations,body,state (`draft|reviewed|revoked`),review fields.

Body fechado: `{stages:[{key,label}],checklist:[{key,title,description,category,required}],task_templates:[{key,title,description,category}]}`; máximos 20/50/20. Não aceita fórmulas, prazo legal, aprovação jurídica, script ou endpoint de execução. Templates são organizacionais; datas operacionais só na criação explícita de tarefa.

`legal_specialty_installations`: id,tenant_id,case_id,package_version_id,snapshot,preview_hash,idempotency_key,created_by/at. `legal_specialty_items`: id,installation_id,case_id,kind (`stage|checklist|task_template`),item_key,category,payload,state (`open|completed|disabled`),note,task_id?. Histórico não é sobrescrito por versão nova.

- `legal_specialty_create_version(p_payload jsonb)` / `legal_specialty_review(p_version_id uuid,p_decision text,p_note text)` → metadata; admin, reviewed/revoked.
- `legal_specialty_read(p_version_id uuid)` → `{version,is_current}`.
- `legal_specialty_preview(p_case_id uuid,p_version_id uuid)` → `{version_id,is_current,can_apply,missing:string[],additions:{stages,checklist,task_templates},conflicts:[],preview_hash}`; hash inclui pacote, itens previamente instalados e ACL atual. Não cria nada.
- `legal_specialty_apply(p_case_id uuid,p_version_id uuid,p_preview_hash text,p_idempotency_key uuid)` → `{installation_id,already_applied,items:[...]}`; dono, todas categorias autorizadas, transação atômica. Conflicts são avisos de itens anteriores preservados; can_apply é o bloqueio autoritativo. Mesma versão já aplicada retorna instalação existente; nova versão exige nova prévia e preserva itens antigos.
- `legal_specialty_installation(p_installation_id uuid)` → `{installation,items}`.
- `legal_specialty_update_item(p_item_id uuid,p_state text,p_note text)` → item; open/completed/disabled, categoria atual.
- `legal_specialty_create_task(p_item_id uuid,p_due_at timestamptz,p_assignee_id uuid,p_substitute_id uuid)` → task metadata. Tarefa F2 com data operacional explícita e assignees ativos do caso; vínculo categoria amplia os reference_kind F6 para specialty/diligence, preservando a política e Meu dia. Nenhum calendário/prazo jurídico é inferido.


## Entregas restritas e compatibilidade documental

Entrega de diligência general/medical/fiscal herda exatamente essa categoria. Diligência restricted exige seleção explícita medical ou fiscal, mas mantém status F1 `diligence_restricted`: somente os serviços F8 podem fornecer esses bytes. Leitura de metadados em F1 exige as duas permissões pelo vínculo da entrega. Finalize F1 não promove esse arquivo para ready; F3/F4/F5/F7 continuam recusando sua reutilização porque exigem ready. As reservas de armazenamento existentes contam também diligence_restricted. Arquivos históricos selecionados como provas preservam sua classificação original.

`legal_diligence_staff_download(p_actor_id uuid,p_version_id uuid,p_document_id uuid)` é service-only. Retorna `{document_id,storage_path,file_name,mime_type,size_bytes,sha256}` somente para ator interno atual com ACL da categoria da diligência e arquivo selecionado/entregue naquela versão. O Edge revalida após obter bytes. Leitura histórica interna de entregas é auditada e continua possível após encerramento; não reabre concessão externa. Revogação da ACL interna bloqueia ambas as validações.

### Fechamento da auditoria F8

Cada tentativa preserva `reports[]` com estado, nota, autor e instante, sem substituir relatos anteriores. `attempt_blockers` considera toda a série do ato (`not_current_ready`, `pending_attempt`, `confirmed_receipt`): um protocolo ou ciência externamente comprovado e revisado impede nova tentativa da mesma série; atos distintos exigem outra chave. Histórico `conflicts` da prévia de pacote é filtrado pela categoria de cada item do caso e continua sendo aviso de preservação, sem impedir por si só a instalação de nova versão.


### Evidência de regressão e execução local

Migração 2600 aplicada em transação no clone local limpo `advocachat_f8_final`, derivado do esquema F7; nenhum dado de produção ou fornecedor foi usado. As 15 suítes F1–F8 passaram: **861 asserções**, sendo **74 da F8** e 38 oráculos da contagem determinística. Logs locais: `/tmp/advocachat-f8-final/`.

`supabase/tests/legal_expansion_concurrency.py` cria clones descartáveis de um esquema F8 vazio, popula somente as fixtures sintéticas transacionais e retém logs. Foram **10 corridas com espera por lock efetivamente observada**: leitura após revogação; conclusão de upload revogado e abandono seguro; vencimento durante espera; instruções substituídas; perda de metade da ACL dupla; limite de cinco entregas; instalação idempotente; catálogo revogado durante instalação; mandato revogado durante preparo; mesmo recibo normalizado em casos distintos. Nenhuma chamada de fornecedor ou envio ocorre.

Reprodução em PostgreSQL 17 local: `python3 supabase/tests/legal_expansion_concurrency.py --pg-bin /opt/homebrew/opt/postgresql@17/bin --port 55432 --baseline advocachat_f8_final --tmp-dir /tmp/advocachat-f8-races`. O parâmetro `--baseline` deve apontar somente para um banco local descartável com esquema F1–F8 e sem dados reais. Logs e resumo ficam no diretório indicado; a ferramenta não apaga os clones automaticamente.
