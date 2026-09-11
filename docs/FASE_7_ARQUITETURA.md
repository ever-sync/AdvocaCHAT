# F7 — OCR, biblioteca e assistência revisável

Decisões de implementação preparadas em 11/09/2026, durante o fechamento da F6.
A entrega técnica foi publicada e verificada; consulte [evidências F7](FASE_7_ASSISTENCIA_DOCUMENTAL.md). Habilitação de IA e avaliação profissional reais permanecem pendentes.

## Fluxo e limites

1. O advogado seleciona documentos prontos do caso e a finalidade. A autorização
   médica/fiscal é verificada antes de recuperar qualquer conteúdo. Combinação de
   categorias exige ambas as concessões. Não há pesquisa global entre escritórios.
2. Uma fila persistida processa OCR fora do atendimento síncrono. O original e seu
   hash permanecem imutáveis. Cada página recebe texto, palavras, coordenadas,
   confiança de reconhecimento e versão do motor. Confiança não comprova um fato.
3. O usuário confere o texto junto ao original, registra correções em nova versão
   e decide o que aprovar. Valores detectados permanecem texto proposto; não criam
   rendimentos, doenças, datas jurídicas, cálculos nem recebimentos automaticamente.
4. A pesquisa local recupera somente versões aprovadas e atualmente autorizadas.
   Cada trecho conserva documento, hash, versão e página; revogação impede novas
   consultas, exportações e uso por jobs, mesmo com conteúdo já indexado.
5. Resumos, cronologias, mensagens e peças são rascunhos versionados. A conferência
   mostra citações recuperáveis, lacunas, divergências e itens sem comprovação.
   Aprovação revalida fontes; uma mudança não altera silenciosamente o histórico.
6. A interface do cliente usa apenas conteúdo liberado individualmente pela F5.
   Não recebe acesso ao assistente, à biblioteca interna ou ao índice documental.

## OCR sem envio a fornecedor

Worker privado em container separado, usando Poppler para renderizar PDFs e
Tesseract com português para reconhecer as páginas. Entrada por bytes de um
documento autorizado, sem URLs arbitrárias. Processos usam argumentos fixos,
diretório temporário privado, limites de páginas, pixels, saída, memória e tempo,
e remoção dos temporários após conclusão ou falha. Não executar comandos ou buscar
endereços contidos no documento.

O formato TSV do Tesseract fornece a estrutura por página/palavra, coordenadas e
confiança para construir uma conferência rastreável. A interpretação do documento
continua dependente de revisão. [Documentação oficial do Tesseract](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html).

PDF protegido, ilegível, acima do limite ou com processamento interrompido deve
apresentar recusa ou resultado parcial explícito. Não transformar página ausente
em página vazia reconhecida. A alternativa é transcrição manual com página e
documento de origem, identificada como manual.

## Biblioteca e rascunhos

- Modelos e jurisprudência pertencem ao escritório e possuem origem, data de
  consulta, versão, escopo de uso e responsável pela revisão. Rascunhos não entram
  na recuperação aprovada. Não há catálogo de precedentes inventados.
- Pesquisa inicial textual no PostgreSQL, com autorização anterior à seleção e
  limites transparentes. Índice compartilhado não permite snippets de outro caso.
- Citações usam IDs emitidos pelo servidor e trechos exatos das fontes selecionadas.
  A validação recusa referência inexistente, página incorreta, texto alterado,
  outra categoria/caso ou fonte revogada. A correção literal de uma citação não
  demonstra, por si só, que ela sustenta a conclusão: o revisor deve conferir isso.
- A saída permite lacunas e divergências. Um campo ausente permanece ausente.
  OCR e geração não substituem os motores determinísticos de IR e prazos.
- Rascunhos revisados podem ser usados conscientemente em instrumentos ou
  publicações existentes, mantendo referência à versão. Sem envio ou protocolo
  disparado pela geração ou por instruções dentro de um anexo.

## Provedor de linguagem opcional

Adaptador isolado do orquestrador comercial herdado. Chave, conta, tenant, modelo,
limites e habilitação são próprios do módulo jurídico. Nenhuma credencial de outro
produto é reutilizada e nenhuma chamada real é feita sem configuração autorizada.

Para o adaptador OpenAI, usar Responses com esquema fechado, sem ferramentas,
sem pesquisa externa, sem encadeamento de sessão e com `store:false`. Validar
novamente a resposta, o estado terminal, recusas, limites e referências no servidor.
Saída estruturada ajuda a validar o formato; não garante a veracidade das afirmações.
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

`store:false` não equivale a contrato de retenção zero. Os controles de retenção
e a possibilidade de registros de abuso precisam ser avaliados antes de enviar
conteúdo jurídico, médico ou fiscal. A habilitação exige política e finalidade
documentadas, além das credenciais. [Controles de dados da OpenAI](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint).

Sem modelo ou autorização, mostrar indisponibilidade e permitir criação manual.
Não apresentar montagem determinística de texto como uma resposta de IA.

## Critérios de verificação

- OCR real de documento inteiramente sintético, comparado com texto e valores
  esperados independentes; página ilegível e conteúdo incompleto identificados.
- Escopo entre tenants, casos, médico/fiscal, cliente/equipe e fonte revogada.
- Anexo com instrução maliciosa, URL externa, citação inexistente, trecho alterado,
  contradição e dado ausente: nenhum ato ou conclusão automática.
- Timeout, resposta truncada, recusa, saldo de quota insuficiente, dois workers e
  revogação durante processamento; sem resultado liberado sob autorização antiga.
- Métricas separadas de páginas, tokens, tempo e custo estimado/confirmado, com
  unidade, tarifa versionada e teto. Falha incerta não significa consumo zero.
- Interface por documento/página, alternativa manual, revisão de fontes e
  rascunho; teste responsivo e jornada autenticada após publicação.

Dependência a consolidar ao final: P08 — provedor/modelo, política de tratamento,
orçamento e credenciais de IA; homologação de fidelidade com o piloto permanece P03.
