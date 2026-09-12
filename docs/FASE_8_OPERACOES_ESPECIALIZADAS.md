# F8 — Entrega técnica verificada

Verificação em **12/09/2026**. Código publicado em `fc601373172abb1d8b924e2cd84a8985ffaaac97` e presente no deployment `135c2fb8ae914f9fbfea267c4a8de5b4691df17f`. O [contrato](FASE_8_CONTRATO.md) descreve as assinaturas definitivas; a arquitetura anterior é histórica.

## Publicação e banco

Projeto Railway AdvocaCHAT `f5af8047-0621-424a-aade-2f6d99853bd5`, ambiente production. Deployments observados em `SUCCESS`:

| Serviço | Deployment |
| --- | --- |
| web | `5ae118b5-cd26-4b78-9c8b-a3c9175481a3` |
| functions | `0a205078-9271-447f-adbd-e2b451d49a59` |
| scheduler | `ff9fa387-3cb9-49d0-ac2b-4d72e0004558` |

Migração `20260911260000` aplicada por transação com prazo de lock, ledger e comparação dos registros de 116 tabelas existentes. SHA256 `9764a5197b0cac9e586a097d164a235050086c40fc9f753b1ac8a6852c801764`. As colunas anteriores preservaram seus hashes; nenhum registro existente foi substituído. As tabelas F8 têm RLS; navegador não acessa tabelas privadas ou funções de serviço, e a role externa não possui USAGE no schema público.

## Evidência funcional

- Cobertura institucional versionada, revisão e prova de homologação sintética. Mesmo com documentação conferida, `adapter_implemented=false` e `active=false`; configuração ausente devolve 409. Nenhum conector judicial foi ativado.
- Dossiê sucessório preserva patrimônio, dependência e localização do pagamento desconhecidos. Representação e poderes específicos recebem revisão separada. Usuário apenas fiscal recebe 403.
- Ato manual, conferência nominal, tentativa com resultado desconhecido e recibo sintético reconciliado. Protocolo confirmado bloqueia repetição na mesma série. Nenhum ato foi transmitido.
- Pacote organizacional revisado, prévia e instalação persistida. Não instala tese, fórmula nem contagem automática de prazo legal.
- Diligência restrita com instrução e arquivo selecionados, identidade externa própria criada no Auth real sem e-mail, grant individual e sem acesso ao caso inteiro.
- Download privado confere SHA256; documento não liberado é negado. Upload fiscal mantém a quarentena restrita, e repetição com a mesma chave não duplica o arquivo. Responsável baixa o comprovante, membro somente fiscal e fluxo OCR legado são negados.
- Navegador em produção: os cinco painéis exibem registros persistidos em desktop e 375px. Portal externo exibe texto não confiável literalmente, permite download privado e possui saída visível. Zero erros de página. Após o ensaio, convite revogado e leitura anteriormente autorizada passou a retornar 403.

Regressão anterior à publicação: 623 testes da aplicação, 121 testes Deno, 861 asserções SQL F1–F8, dez corridas F8 e nove grupos de contrato SQL–Edge–SQL. Os testes de contrato simulam transporte; a evidência de produção acima usou Auth, Storage e PostgreSQL reais, com dados inteiramente sintéticos.

Evidências locais privadas: `/tmp/advocachat-f8/` (migração, deployments e testes API), `/tmp/advocachat-f8-live-ui/` (resultado, capturas e download sintético). Fixtures são identificadas por arquivo privado para limpeza posterior; nenhum segredo ou cliente real integra este documento.

## Limites

F8.01/F8.02 permanecem dependentes de contratos, credenciais, cobertura e homologação institucional (P04). F8.03/F8.07 possuem avaliação e preparação manual, sem conectores executáveis. O catálogo organizacional está disponível; adoção de especialidades por pilotos depende de revisão profissional e demanda (P03). A entrega real de OTP/e-mail não foi testada. Confirmação administrativa ocorreu somente na identidade fictícia do ensaio, sem mensagem a terceiros.
