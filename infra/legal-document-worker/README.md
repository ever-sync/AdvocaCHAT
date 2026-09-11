# Núcleo de OCR jurídico offline — F7

O núcleo `ocr_kernel.py` contém somente o processamento local de um arquivo
autorizado. Ele não contém servidor HTTP, acesso ao banco, busca de URLs, fila
ou chamada de IA.
O worker que o envolver deve validar tenant/caso/categoria antes de recuperar o
original e novamente antes de persistir ou disponibilizar o resultado.

## Uso e dependências

O núcleo `ocr_kernel.py` usa Python 3.9+ e biblioteca padrão. Os executáveis
`pdfinfo`, `pdftoppm` e `tesseract` e os modelos de idioma devem ser fornecidos
pelo ambiente. Caminhos dos motores e diretório de modelos são configuração do
servidor, nunca campos aceitos do documento ou do navegador.

```python
from ocr_kernel import Engines, process_file, safe_summary

result = process_file(
    authorized_path,
    "application/pdf",
    languages=["por"],
    engines=Engines.system("/opt/legal-ocr/tessdata"),
)
# result contém conteúdo privado. Somente safe_summary(result) serve para log.
```

PNG e PDF são os formatos iniciais. O tipo é confrontado com o conteúdo; arquivo
simbólico, não regular, protegido, animado ou acima dos limites é recusado.
Não existe fallback silencioso de português para inglês. O Tesseract usa LSTM,
segmentação automática e TSV, com parâmetros fechados. Não recebe nomes de
configuração ou argumentos extraídos do arquivo.

## Contrato de saída

- Documento: `kernel_version`, `source_sha256`, `source_bytes`, `mime_type`,
  `status`, `reason`, `pages_total`, `pages`, `engine`, `elapsed_ms` e
  `review_status="unreviewed"`.
- `status`: `complete` quando todas as páginas foram reconhecidas acima do
  limiar operacional; `partial` quando há texto acompanhado de página ausente,
  baixa confiança ou falha; `unreadable` quando nenhuma página contém texto
  reconhecido; `failed` para falha operacional; `refused` para entrada, idioma
  ou ambiente não admissível. `complete` não significa documento fiel,
  homologado ou juridicamente aprovado.
- Página: número original a partir de 1, estado `recognized`, `low_confidence`,
  `no_text_recognized` ou `not_processed`; texto, TSV privado e palavras quando
  disponíveis; confiança média decimal como string ou `null`.
- Palavra: texto proposto, confiança decimal string, bloco/parágrafo/linha e
  retângulo `left/top/width/height` em pixels da imagem renderizada. Página
  informa largura e altura para escala do visor. Isso não é a coordenada em
  pontos do PDF original.
- Proveniência: versão do Tesseract, versão Poppler para PDF, idiomas ordenados
  e SHA-256 de cada `traineddata`, parâmetros de renderização, modo de memória
  e limiar. O hash do original cobre exatamente a cópia processada.

Uma página não processada não é registrada como página vazia. OCR não permite
distinguir com certeza uma página verdadeiramente vazia de uma página ilegível;
`no_text_recognized` exige exame humano. Valores, datas e instruções encontrados
continuam texto: não criam rendimento, doença, prazo, crédito ou ação externa.

## Limites e isolamento

Padrões: entrada 10 MiB, 20 páginas, 16 milhões de pixels, dimensão máxima 4000,
512 KiB de saída por processo OCR, 4 MiB de resultado e 12 segundos por processo,
dentro de 90 segundos totais. Os limites configuráveis possuem tetos fixos;
capacidade maior exige revisão do código e do ambiente. PDF acima do limite de
páginas é recusado integralmente, sem apresentar a primeira parte como completa.

O original é copiado para diretório temporário 0700 e arquivo 0600. Cada processo
tem grupo próprio, stdin fechado, ambiente mínimo, argumentos fixos, `shell=False`,
limites de CPU, descritores, arquivo e saída; timeout ou falha termina o grupo e
seus filhos. Imagens intermediárias são removidas por página e o diretório é
removido ao sair, inclusive em falha. Conteúdo/nomes/caminhos e stderr do motor
nunca entram no resumo seguro ou no código público de erro.

Linux usa `RLIMIT_AS` para limitar espaço de endereçamento. No macOS, que recusou
esse limite no ensaio local, há monitoramento de RSS do grupo de processos a cada
ciclo de leitura e encerramento acima do teto. Essa modalidade é registrada em
`engine.memory_enforcement`; não é equivalente ao bloqueio de alocação do Linux.
O container futuro ainda deve impor limite de memória externo, filesystem efêmero,
usuário sem privilégios e bloqueio de rede. A execução Linux/container não foi
demonstrada por este ensaio macOS.

## Ensaios reproduzíveis

`test_ocr_kernel.py` utiliza Pillow, ReportLab e pypdf somente para gerar entradas
sintéticas. Essas bibliotecas não são dependências do núcleo. Precisa de Arial
(macOS) ou DejaVuSans (Linux) para o PNG de teste e do modelo português explícito.

```sh
LEGAL_OCR_TEST_TESSDATA=/private/test/tessdata python3 -m unittest -v test_ocr_kernel.py
```

Em 11/09/2026, dez testes passaram com Tesseract 5.5.3 e Poppler 26.08.0 no macOS;
a renderização do PDF sintético também foi inspecionada visualmente. O ensaio usou
apenas um modelo baixado para diretório temporário
privado; nada foi instalado globalmente:

- Origem oficial: [por.traineddata, tessdata_fast 4.1.0](https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/por.traineddata).
- Tamanho: 1.982.756 bytes.
- SHA-256: `c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb`.
- Documentação primária consultada: [Tesseract CLI/TSV](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html) e [modelos de idioma](https://tesseract-ocr.github.io/tessdoc/Data-Files.html).

Os testes verificam valores esperados independentes (`1.234,56` e `10/09/2026`),
PNG/PDF com OCR real, página sem reconhecimento, resultado parcial, PDF protegido,
idioma ausente, limites, TSV inválido, privacidade de temporários e término dos
processos descendentes. Não usam documentos de clientes nem fazem chamadas a
provedores. Fidelidade em documentos reais, manuscritos, tabelas, baixa resolução
e execução no container continuam dependentes do piloto/homologação.

## Imagem Linux e verificação obrigatória

O `Dockerfile` usa o contexto na raiz do repositório e três estágios: `core`,
`test` e `runtime`. Todos herdam a mesma base `python:3.12-slim-bookworm`, os
mesmos binários Poppler/Tesseract e DejaVuSans. As fontes também permanecem no
runtime porque PDFs podem referenciar fontes padrão sem embuti-las; somente
instalá-las no estágio de teste daria uma condição de renderização diferente.
O modelo português vem da URL oficial acima;
tamanho e SHA-256 são conferidos durante a construção, sem opção de substituir
o endereço ou o hash por argumento de build. Idioma continua explícito no kernel.

O estágio `test` acrescenta as versões fixadas em
`requirements.test.txt` de Pillow, pypdf, ReportLab e sua dependência
charset-normalizer. Esses pacotes Python e arquivos de teste não entram em
`runtime`. Os dez testes sintéticos executam como UID/GID 10001, com
`RUN --network=none`, sem credenciais. O build recusa testes pulados, quantidade
inesperada, execução como root, plataforma diferente de Linux ou resultado com
modo de memória diferente de `rlimit_as`. Também consulta `RLIMIT_AS` dentro de
um subprocesso real do kernel e confronta o valor com a política configurada.

`tini -s -g` envolve explicitamente os testes para recolher processos órfãos
após o teste de encerramento do grupo. O runtime também usa Tini como PID 1.
O marcador `/tmp/ocr-verified` só é escrito após sucesso; `runtime` depende dele
por `COPY --from=test`, impedindo que a construção normal ignore esse estágio.
Uma camada de teste já verificada pode ser reutilizada pelo cache do BuildKit.
O marcador fica em `/opt/legal-ocr/ocr-verified`, com hashes do kernel, suíte e
requisitos, UID, modo de memória e versões dos motores/modelo. Ele não contém
texto, nomes de documentos ou credenciais. A tag da base e pacotes Debian podem
receber atualizações; o digest da imagem final deve acompanhar a evidência de
cada publicação, junto do marcador de versões realmente testadas.
O estágio final também confere o hash do kernel contra o marcador e recusa a
presença das dependências Python de criação de fixtures.

No mesmo estágio sem rede, a suíte `test_worker.py` verifica transporte e fila
usando somente objetos falsos e bytes sintéticos. Exige pelo menos os dez casos
iniciais, não aceita testes pulados e registra sua quantidade separada em
`worker_tests`; `tests=10` continua reservado à suíte do kernel. Os hashes do
worker e de seus testes também acompanham o marcador, e o estágio final confere
que `worker.py` é exatamente o que passou na suíte. Falha do worker ou do kernel
impede a criação do marcador. Esse ensaio de contrato não substitui a integração
com SQL real nem a comunicação HTTP do serviço implantado.

```sh
# Executar a partir da raiz do repositório, com BuildKit Linux disponível.
docker build --target test --progress=plain -f infra/legal-document-worker/Dockerfile .
docker build --target runtime --progress=plain -t advocachat-legal-document-worker -f infra/legal-document-worker/Dockerfile .
```

O estágio final exige `worker.py`, responsável pelo HTTP, fila e revalidação do
acesso. A entrada é `python worker.py`, usuário 10001, `PORT=8080` por padrão e
healthcheck local `GET /health`; a configuração do modelo é
`LEGAL_OCR_TESSDATA_DIR=/opt/legal-ocr/tessdata`. O wrapper deve processar somente
requisições autenticadas e arquivos obtidos de origem autorizada, sem aceitar
caminho de binário, diretório de modelo ou URL fornecidos pelo cliente.
HTTP saudável, isoladamente, não comprova OCR nem persistência autorizada.

Esta alteração não executou o container: o Docker CLI local está disponível,
mas o daemon está desligado. A primeira prova Linux deverá ser o build remoto
com a etapa de testes realmente executada, seguida do ensaio sintético do
wrapper e da revalidação de acesso antes de persistir. Não usar documentos reais
nem habilitar consumo por clientes nessa verificação inicial. Limites de memória,
CPU, armazenamento efêmero e isolamento de rede devem ser configurados também
no serviço; `RUN --network=none` se aplica aos testes, não à rede do runtime.

Fontes técnicas primárias conferidas em 11/09/2026:
[base Python oficial](https://github.com/docker-library/python/blob/master/3.12/slim-bookworm/Dockerfile),
[instruções Docker/BuildKit](https://docs.docker.com/reference/dockerfile/#run---network),
[Poppler Debian](https://packages.debian.org/bookworm/poppler-utils),
[Tesseract Debian](https://packages.debian.org/bookworm/tesseract-ocr),
[Tini Debian](https://packages.debian.org/bookworm/tini),
[Pillow](https://pypi.org/project/Pillow/12.3.0/),
[pypdf](https://pypi.org/project/pypdf/6.18.1/),
[ReportLab](https://pypi.org/project/reportlab/5.0.1/) e
[charset-normalizer](https://pypi.org/project/charset-normalizer/3.5.1/).
