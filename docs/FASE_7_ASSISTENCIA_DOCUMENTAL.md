# F7 — OCR privado e assistência documental

Entrega técnica publicada e verificada em 11/09/2026. Código da aplicação
`ac6545d323e4d493b05476a526102705b50456af`; worker
`a08ed0cc47217b7b595f7363e9048963f97595b1`. SHA de `origin/main` conferido e CI
concluída com sucesso. [Contrato SQL/API](FASE_7_CONTRATO.md) e
[arquitetura](FASE_7_ARQUITETURA.md) detalham os estados e limites.

## Comportamento entregue

A aba Assistência reúne Textos e OCR, Biblioteca, Pesquisa, Rascunhos e
Configuração. O original privado permanece imutável. Texto reconhecido contém
página, coordenadas, confiança e motor; correções geram versões novas e cada
página exige conferência nominal antes de entrar na pesquisa aprovada.

Biblioteca e políticas possuem fontes, versões, escopo e revisão. A pesquisa
revalida acesso ao caso, categoria, versão e prova antes de recuperar conteúdo.
Citações literais preservam documento, hash, página e trecho. Revogação bloqueia
novas leituras de citações e de rascunhos derivados, inclusive após indexação.

Cronologias, resumos, mensagens e peças permanecem rascunhos. A interface mostra
lacunas, divergências e trechos sem citação. Transferência revisada cria somente
rascunho de instrumento ou publicação; essas operações revalidam as fontes.
Nenhum reconhecimento preenche automaticamente fatos fiscais, doenças, datas
jurídicas ou valores. O portal externo não recebe acesso ao assistente interno.

O adaptador de IA exige política, modelo, conta e vínculo de tenant específicos.
Usa saída estruturada, citações emitidas pelo servidor, armazenamento desativado
no request, sem ferramentas e com limites de bytes, tokens, custo e tempo.
Consumo incerto permanece reservado para conciliação. Nenhum modelo real foi
ativado nem chamado: P08 e avaliação profissional P03 permanecem pendentes.

## OCR executado no Railway

Serviço privado `legal-document-worker`, uma réplica, 1 vCPU e 2 GB. Container
executa como UID 10001, com temporários privados e limites por processo, páginas,
pixels, memória, saída e tempo. Python 3.12.14, Tesseract 5.3.0 e Poppler 22.12.0;
idioma português oficial `tessdata_fast/4.1.0`, SHA-256
`c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb`.

O build exige dez testes do motor e treze do worker no Linux. Sentinela e
proveniência registram hashes do código testado; runtime recusa divergência.
Nos testes, auditoria Python recusou socket/DNS e mediu zero chamadas. Isso não
equivale a isolamento de rede de processos nativos pelo sistema operacional;
comandos nativos usam argumentos locais fixos e ambiente sem credenciais.

Fluxo real com fixtures sintéticas: Storage privado → worker Linux → PostgreSQL.
PNG reconhecido em 553 ms; PDF de duas páginas processado em 1.503 ms, mantendo
a segunda página sem texto como cobertura parcial. Valores e data permaneceram
texto não conferido. Consumo persistido: três páginas. O download do original
pela interface produziu SHA idêntico ao arquivo enviado.

## Verificação

- Typecheck, build da aplicação/widget e lint passaram; zero erros e 29 avisos
  herdados de lint. Vitest: 584 testes em 90 arquivos, incluindo 19 novos de UI.
- Regressão compartilhada Deno: 84 testes passaram. O adaptador foi verificado
  com respostas falsas; nenhuma chamada ao fornecedor foi feita.
- Base limpa PostgreSQL: 14 suítes F1–F7, 787 asserções, incluindo 52 da F7.
- Dez grupos de concorrência: deduplicação, cotas por tenant entre casos, lease
  único, orçamento de IA, revogação/cancelamento durante finalização, preservação
  de custo medido, ordenação de locks do instrumento, lease expirado durante
  espera e mudança de mês da reserva. Todos passaram.
- Contrato OCR SQL → worker/motor reais → SQL: nove grupos passaram. Contrato
  IA SQL → handler real → respostas falsas → SQL: dez grupos passaram, incluindo
  citação inventada, fonte revogada, resposta incerta e ausência de credencial.
- API publicada: acesso médico e de outro tenant recusados; escrita/leitura
  direta do texto e funções do worker vedadas ao navegador. Dispatcher recusou
  segredo inválido e retornou não configurado com zero jobs para IA ausente.
- Navegador publicado: revisão médica, parcial preservado, pesquisa literal,
  rascunho revisado e transferido como draft, biblioteca e política conferidas,
  cota OCR salva e relida. Cinco abas e dois modais verificados em 375 px.
  Nenhum erro de página, envio ou consulta a fornecedor. Dois 403 legados de
  `operation-admin` correspondem ao usuário sem administração global.
- Após a navegação, revogação da fonte geral impediu leitura da citação indexada
  e do corpo do rascunho derivado. Originais e histórico foram preservados.

Testes versionados estão em `supabase/tests/`, funções compartilhadas e
componentes. Evidências temporárias: `/tmp/advocachat-f7/`,
`/tmp/advocachat-f7-races-final/` e `/tmp/advocachat-f7-live-ui/`.
Não substituem os testes versionados nem comprovam desempenho em documentos reais.

## Migração e publicação

Migration `20260911250000`, SHA-256
`4ca5b835943058afe621e5089fedc48a767cb0f8e1c19c1b8533449849fbcd90`, aplicada
transacionalmente. Digests confirmaram preservação das 102 tabelas existentes
verificadas. As 14 tabelas F7 têm RLS; portal permanece sem USAGE no schema
público. OCR foi habilitado somente no escritório sintético usado na validação.
O estado jurídico habilitado pelo usuário no escritório real foi preservado.

Deployments `SUCCESS`:

| Serviço | Deployment |
| --- | --- |
| web | `19e7a6ee-9ff6-4edb-8ec7-7cc5cddcad72` |
| functions | `db5c9253-b18f-43cb-bf6c-66d7d131275f` |
| scheduler | `bcfc34e1-a7e3-4f66-8146-20462d2653c7` |
| worker OCR com conexão privada | `33e6869f-0075-47f9-ae49-7a4132eb586d` |

Primeiro build do worker recusou um parâmetro Docker não suportado pelo builder;
a correção foi publicada, os testes Linux passaram e o serviço operou usando a
imagem `sha256:5f72473c6d5046d61adcb16a521d8c1eb6748628143d6e904895fac1d8117a9e`.
Fixtures permanecem isoladas até as verificações F8/F9 e entram na limpeza final.
