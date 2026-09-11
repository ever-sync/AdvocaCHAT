# Fase 1 — Núcleo jurídico

Data: 11/09/2026. Produto: AdvocaCHAT. Repositório: ever-sync/AdvocaCHAT.

## Entrega

A área **Casos jurídicos**, em `/casos`, acompanha assuntos consultivos,
extrajudiciais e judiciais. Cada caso tem responsável, cliente opcional, partes,
processos cadastrados manualmente, participantes, documentos e histórico próprios.
Um cliente pode ter vários casos; cada caso pode reunir vários processos.

- A negociação comercial continua separada. A conversão repetida devolve o mesmo
  caso e mantém cliente, negociação e histórico de origem.
- Caso ativo exige próxima providência; caso aguardando exige motivo. A data da
  próxima providência é operacional, sem cálculo automático de prazo judicial.
- O número CNJ é conferido por formato e dígito verificador. Essa conferência não
  consulta tribunal nem comprova existência do processo.
- OAB/UF é declaração do próprio profissional. Não altera seu papel nem concede
  acesso. Responsável e participante do caso são as funções de acesso desta fase.
- Criação disponível a administradores e operação ativos com permissão de CRM.
  Somente responsável ou participante autorizado vê um caso. Administrador do
  escritório ou da plataforma não recebe acesso automático a casos alheios.
- Participantes começam sem edição e sem documentos médicos/fiscais. O responsável
  concede as permissões explicitamente; concessões e revogações ficam no histórico.
- Documentos gerais, médicos e fiscais usam metadados protegidos e bucket privado.
  Downloads passam pelo servidor, validam a sessão e a permissão atual, geram evento
  de autorização e retornam anexos sem cache. Não há URL pública/assinada reutilizável.
- Upload limitado a PDF, PNG, JPEG e texto UTF-8, 10 MiB por arquivo e 200 MiB por
  caso. O servidor confere conteúdo básico, calcula SHA-256 e reconfere o acesso
  antes de finalizar. Conferência de formato não é varredura antivírus.
- Histórico não pode ser reescrito ou apagado pela aplicação. Eventos de documentos
  compartilhados no caso não copiam nomes de arquivos, conteúdo ou motivos reservados.

## Preservação e suporte

Casos, processos, documentos e histórico não têm exclusão nesta fase. Documentos
começam com preservação habilitada. Somente o responsável pode alterar essa marca;
retirá-la exige justificativa, guardada na mesma categoria restrita do documento.
Retirar a marca não apaga arquivo e não inicia prazo automático de descarte.
A tabela de retenção jurídica por finalidade permanece dependente da validação de
F0/F2; nenhum prazo legal universal foi embutido.

O suporte da plataforma não usa impersonação para abrir conteúdo jurídico. Para
uma intervenção que exija conteúdo, o escritório utiliza um colaborador próprio,
concede acesso mínimo ao caso e registra em nota o chamado, finalidade e período
combinado, sem copiar dados de saúde. O responsável revoga o acesso ao encerrar o
atendimento e confere os eventos de concessão, download e revogação. O acesso médico
ou fiscal exige autorização separada. A expiração desse acesso é manual nesta fase.
Credenciais administrativas de infraestrutura continuam restritas à operação;
não existe botão de acesso irrestrito do suporte no produto.

## Migração e retorno

Ordem: `20260911110000_profile_trust_boundary.sql` e
`20260911120000_legal_core.sql`, registradas no ledger de migrations. A primeira
fecha autopromoção, troca de escritório e bootstrap por metadados forjados; preserva
cadastro independente, convite legítimo e administração pelo escritório.
O contexto compartilhado das funções também rejeita perfil inativo.

A segunda adiciona tabelas e RPCs jurídicos sem converter registros existentes.
A flag é individual por escritório, inicialmente desabilitada. Em
**Casos jurídicos → Escritório**, o administrador pode habilitar/desabilitar.
Desabilitar suspende leitura e escrita jurídicas e preserva os registros; o CRM
continua disponível. Não remover tabelas, bucket ou a correção de privilégios para
reverter uma publicação. Versões anteriores do frontend ignoram as novas tabelas.

## Validação

- PostgreSQL 17 local, com esquema de produção e sem dados de clientes.
- Suítes SQL em `supabase/tests`: proteção de perfis, isolamento entre escritórios,
  isolamento de administrador da plataforma, acesso por caso/categoria, revogação,
  criação idempotente, preservação de origem, CNJ, auditoria e limites documentais.
- Fixtures SQL são revertidas por ROLLBACK. A cópia local adaptou o campo vetorial
  para array e deixou índices/extensões de busca não relacionados fora do ensaio;
  esse teste não demonstra restauração integral da infraestrutura.
- Aplicação: typecheck, lint sem erros, 445 testes unitários e build de produção.
  Existem avisos anteriores de hooks e tamanho de bundles, fora desta fase.
- Edge de documentos: `deno check` e testes de tipo/assinatura de arquivo,
  tamanho e cabeçalhos de download.

### Evidências de produção

Código: `accbdda68427a66230d124b46d9f5df7092fe716`, publicado em `origin/main`.
Railway AdvocaCHAT, ambiente `production`:

| Serviço | Deployment | Resultado |
| --- | --- | --- |
| web | `79a6a8cb-ea50-462b-ab1b-cf59a824c1c4` | SUCCESS |
| functions | `05b5d176-8ab0-4670-ba31-95a7b031a189` | SUCCESS |
| scheduler | `6c03878a-95c6-4a04-b119-838bd3ddb45d` | SUCCESS |

Migrações aplicadas em transação via conexão SSH ao Postgres. Comparação antes e
após: hash integral dos perfis preservado; contagens de clientes e negociações
preservadas. Ledger confirmou as duas versões e a revogação do bootstrap público.

Com contas sintéticas confirmadas administrativamente, sem envio de email:

- Cadastro/Auth real, cliente com dois casos e dois vínculos processuais, notas
  independentes, conversão repetida sem duplicação e negociação original intacta.
- Leitura negada a outro escritório e a participante ainda não incluído; participante
  não consegue autopromoção nem liberar sua própria categoria sensível.
- Três documentos persistidos, um por categoria. SHA-256 e bytes recuperados iguais
  ao original; usuário sem autorização não vê metadados médicos/fiscais e recebe
  bloqueio no download. URLs diretas, públicas e autenticadas, não abrem os arquivos.
- Concessão explícita permite download médico; revogação volta a bloqueá-lo.
  Auditoria e justificativa de preservação foram conferidas.
- Desabilitar a flag oculta os casos e bloqueia download; reabilitar restaura acesso
  aos mesmos dois casos, sem recriação nem perda.
- Perfil inativo bloqueado no RPC jurídico e no contexto compartilhado da Edge.

No navegador publicado, sem mock da API jurídica ou da cobrança: dois casos
abertos; novo caso criado pela interface; título, área e próxima providência
conferidos após recarregar; documento enviado, listado após recarregar e baixado
com bytes idênticos. Navegação a 375 px sem transbordamento horizontal e sem erros
de página. Sete tentativas automáticas de email de boas-vindas do sistema herdado
foram bloqueadas no navegador de teste; nenhum email foi enviado na validação.
O web em produção utiliza Node.js 22.23.2.

Ao final, quatro arquivos sintéticos removidos pelo Storage, três escritórios de
teste removidos com seus registros e três contas sintéticas removidas do Auth.
Leitura posterior: um escritório e um perfil originais; zero clientes, negociações,
casos, documentos e eventos jurídicos. A área permanece disponível no menu, com
habilitação individual em **Casos jurídicos → Escritório**. Não foram convertidos
registros nem concedidas permissões ao escritório original.

Conclusão: F1 entregue e verificada tecnicamente. A validação com escritórios
piloto, decisões de retenção por finalidade e ensaio de recuperação integral
continuam registrados como pendências de F0, sem marcar as demais fases concluídas.

## Limites e próximas fases

Esta entrega não encerra F0 nem substitui a validação do advogado responsável.
As áreas herdadas de CRM/atendimento continuam disponíveis. Dados médicos/fiscais
reservados devem ficar no cofre jurídico, não em notas ou anexos gerais do CRM.
Não há busca global, exportação nem indexação por IA do conteúdo do cofre.

F2 tratará contratação, procurações, agenda e tarefas. Triagem especializada de IR
entra em F3; cálculos e fluxos fiscais em F4; integrações de monitoramento judicial
em F6. Nenhuma dessas etapas é apresentada como concluída aqui.
