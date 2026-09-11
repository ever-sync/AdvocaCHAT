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

Verificação de implantação, jornada real e comparação de dados: em andamento.

## Limites e próximas fases

Esta entrega não encerra F0 nem substitui a validação do advogado responsável.
As áreas herdadas de CRM/atendimento continuam disponíveis. Dados médicos/fiscais
reservados devem ficar no cofre jurídico, não em notas ou anexos gerais do CRM.
Não há busca global, exportação nem indexação por IA do conteúdo do cofre.

F2 tratará contratação, procurações, agenda e tarefas. Triagem especializada de IR
entra em F3; cálculos e fluxos fiscais em F4; integrações de monitoramento judicial
em F6. Nenhuma dessas etapas é apresentada como concluída aqui.
