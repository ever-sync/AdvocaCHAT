# Fase 2 — Atendimento e operação jurídica

Data: 11/09/2026. Produto: AdvocaCHAT. Repositório: ever-sync/AdvocaCHAT.

## Entrega técnica

Em **Casos jurídicos → caso → Atendimento e trabalho**, o escritório pode:

- Configurar serviços, etapas e motivos de encerramento; registrar a etapa de cada caso.
  A etapa de contratação e o status geral do caso são campos separados.
- Criar modelos de entrevistas com perguntas versionadas; registrar respostas
  ligadas à versão utilizada. Respostas médicas/fiscais seguem a permissão do caso.
- Registrar a conferência humana de conflitos, sua decisão e justificativa.
  Não existe pesquisa automática em casos sem acesso nem declaração automática de ausência de conflito.
- Solicitar documentos, gerar link temporário, associar arquivo já recebido e
  aprovar, pedir correção ou cancelar. O responsável revisa o que foi recebido.
- Preparar propostas, contratos e procurações como rascunhos; encaminhar para
  revisão e registrar aprovação ou revogação pelo responsável. Nova versão
  preserva a anterior e exige nova aprovação para utilização.
- Associar um documento e a justificativa de uma evidência externa de assinatura.
  O estado é **registro externo**, sem alegação de verificação por um provedor.
- Criar modelos de tarefas, atribuir responsável e substituto que participem do
  caso, concluir ou cancelar com motivo. Agenda interna distingue consulta,
  audiência, diligência e reunião, com horários, responsáveis e cancelamento.

F2.05 permanece pendente de provedor contratado/credenciais e validação real de
convite, callback e recibo. Google Calendar não foi conectado; a agenda interna
funciona independentemente. Dependências P01/P02 estão registradas em
[Execução contínua](EXECUCAO_CONTINUA.md) para o relatório consolidado.

## Coleta pública e preservação

O link permite um único upload e expira em até sete dias. A credencial aleatória
fica no fragmento do link, é retirada da barra de endereço antes da telemetria e
mantida somente em memória. Somente seu hash é persistido no banco. Reabrir a página
exige o link original; emitir outro link invalida o anterior.

A resposta pública não fornece nome, cliente, caso, categoria, orientações internas
ou documentos existentes. O arquivo é armazenado no bucket privado F1, sujeito à
categoria da solicitação, limite de 10 MiB por arquivo e 200 MiB por caso, conferência
do conteúdo básico, hash SHA-256 e nova validação de acesso na finalização. O recibo
indica recebimento para revisão, sem aprovação automática ou identificação comprovada
de quem usou o link. Cancelamento, vencimento e revogação do emissor bloqueiam uso.

Os caminhos legados de ficha clínica e aprovação de orçamento foram desativados.
`save-public-anamnese` retorna HTTP 410 e não processa o conteúdo enviado. As
permissões anônimas antigas de documentos, modelos e uploads foram retiradas,
preservando registros, arquivos e acesso interno autorizado. Não se geram novos
links com nome, telefone ou conteúdo de proposta em parâmetros da URL.

Formulários públicos limitam metadados de origem; páginas de referência não
transportam caminho/query com dados pessoais. O agendamento público deixou de
buscar/devolver nome e email a partir de um telefone. O preenchimento normal de
agendamento permanece disponível.

## Validação e publicação

Código publicado e SHA remoto confirmado:
`0f6624252e02401225e4eeb43ecadd0ec258195f`.

| Serviço Railway | Deployment | Estado terminal |
| --- | --- | --- |
| web | `a49bb9e9-2620-4c39-ac9d-66858838468d` | SUCCESS |
| functions | `e9bd9ec0-326a-46f7-902b-9ade115922dc` | SUCCESS |
| scheduler | `6826cbf2-04c4-4272-a157-780bceec3ee7` | SUCCESS |

- Typecheck, lint sem erros, build e **466 testes da aplicação** passaram.
  Avisos herdados de hooks/bundles permanecem fora do escopo desta entrega.
- PostgreSQL 17 local com esquema/ACL de produção: proteção de perfis, núcleo F1,
  operações F2 e aposentadoria dos caminhos públicos passaram. A suíte F2 contém
  26 verificações positivas e 34 rejeições esperadas, com fixtures revertidas.
  A adaptação local de índices/extensões não constitui ensaio integral de recuperação.
- `deno check` passou para as funções de documentos, nova coleta e endpoint
  aposentado. O cheque ampliado identificou tipos herdados em scheduling-public
  e em `_shared/email.ts`; não foi declarado como aprovado para todas as funções.
- Migrações `20260911150000` e `20260911151000` aplicadas atomicamente via SSH.
  Hash dos registros existentes de escritórios, perfis, clientes, negociações,
  casos e documentos comparado antes/depois: preservado. Ledger conferido.
- API real: configuração e etapa, entrevistas/versionamento, separação de categorias,
  conflito humano, atribuição/substituto, cancelamento de agenda, versões imutáveis,
  aprovação restrita, revogação e registro externo sem duplicação passaram.
- Coleta real: links inválidos, rotacionados, expirados, cancelados, revogados e
  reutilizados negados; formato incompatível rejeitado sem consumir o link.
  Arquivo persistido e recuperado com bytes/hash iguais; revisão manual conferida.
- Dois uploads simultâneos com o mesmo link produziram um único recebimento e um
  único documento disponível. Conteúdo médico permaneceu invisível ao participante
  sem essa categoria. Endpoint antigo 410 e modelos anônimos bloqueados.
- Navegador publicado: entrevista e histórico, coleta anônima em celular, download,
  revisão, instrumento/evidência/nova versão, tarefas e audiência canceladas,
  persistência após reload. Zero erros de página; largura de 375 px sem overflow.
  Chamadas automáticas de boas-vindas foram bloqueadas; nenhum email foi enviado.

As contas, registros e quatro arquivos sintéticos foram removidos. Leitura após
limpeza preservou o estado original: um escritório/perfil/usuário de autenticação,
zero clientes, negociações, casos, solicitações e documentos. A ativação jurídica
continua individual por escritório, como em F1.

## Continuação

F3 inicia o dossiê assistido de isenção de IR. F9 deve ampliar a paginação das
listas jurídicas, hoje limitadas a 200 registros por consulta, e ensaiar recuperação
integral, carga e tratamento de uploads interrompidos. A homologação jurídica,
fiscal e dos provedores não é substituída pelos testes sintéticos acima.
