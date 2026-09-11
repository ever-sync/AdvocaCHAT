# F3 — Dossiê assistido de isenção de IR

Execução de 11/09/2026. A fase organiza dados, documentos e propostas revisadas
pelo advogado. Não calcula diagnóstico, concessão, prazo recuperável ou crédito.
Fundamentos e cenários estão em [Fontes e cenários F3](FASE_3_FONTES_E_CENARIOS.md).

## Entrega

- Fontes pagadoras e rendimentos separados, incluindo natureza da pensão,
  regime, produto previdenciário e evento de recebimento.
- Cronologia com datas exatas, estimadas ou desconhecidas, documento/página de
  origem e correções que preservam o evento anterior.
- Conferência documental com metadados do emissor, natureza oficial/particular,
  datas e pendências objetivas. Documento particular não é recusado automaticamente.
- Referências jurídicas por versão, vigência/limites informados e data de consulta
  da fonte. Aprovação exige revisão expressa do responsável do escritório.
- Checklists por pagador/rota, aplicação idempotente, estado derivado da coleta
  documental e dispensa motivada.
- Proposta por rendimento, resumo e estratégia, seguida de revisão humana.
  O servidor preserva os dados e referências usados em cada versão. Mudanças em
  dados ou em uma versão aprovada da referência tornam a análise anterior
  desatualizada. Rascunho novo da referência não invalida sozinho uma decisão.
- Representação com prova, alcance, validade e revogação. O vínculo não cria um
  colaborador interno. Coleta vinculada é bloqueada quando a representação vence,
  é revogada ou sua prova contratual é substituída.
- Interface de triagem em seis áreas dentro do caso; coleta móvel reutiliza o
  fluxo F2 e a equipe pode registrar atendimento e documentos assistidos.

## Autorização e histórico

Rendimentos são fiscais; laudos e fatos de saúde são médicos. Cada consulta
respeita o escritório físico e as permissões atuais do caso. Uma análise que
combina as duas categorias exige **ambas** as permissões, inclusive para ler
seu histórico. As novas tabelas não permitem escrita direta autenticada.

Mutação, aprovação e concessão de coleta conferem a autorização após adquirir os
locks necessários. A finalização verifica novamente expiração/representação
depois da espera; uma negativa reverte a prontidão do documento. O evento geral
de auditoria contém identificadores/estados, sem o conteúdo médico ou fiscal.

## Evidências técnicas

- Migration `20260911170000_ir_assisted_dossier.sql`: aplicação integral em
  PostgreSQL 17 local; **48 assertivas positivas e 54 negativas** da regressão F3
  passaram com rollback, além das regressões F1/F2.
- Cobertos: isolamento entre escritórios/casos/categorias, revisão do responsável,
  versões imutáveis, catálogo atualizado, propostas incompletas, correção de
  evidências, vínculo de representante, prova substituída e expiração durante a
  finalização do upload.
- Migration aplicada no projeto Railway **AdvocaCHAT / production**, registrada
  no ledger. Hashes de `tenants`, `profiles`, `customers`, `crm_negotiations` e
  `auth.users` foram iguais antes/depois. Leitura posterior confirmou os dois
  casos, dois processos e três documentos prontos das fixtures; 12 novas tabelas
  estão com RLS habilitada.
- API real com três usuários sintéticos passou: rendimentos/datas separados,
  acesso médico/fiscal independente, laudo particular com conferência, revisão do
  catálogo, checklist derivado/idempotente, proposta individual por fonte, revisão
  exclusiva do responsável, alteração que torna a análise desatualizada e
  preservação integral do snapshot anterior.
- O link do representante retornou disponível antes da revogação e indisponível
  depois, sem criar acesso de equipe. Arquivos privados foram lidos pelo proxy
  autorizado com bytes/hash conferidos. Nenhum e-mail foi enviado pelos testes.
- Typecheck, lint sem erros e build passaram; **471 testes em 69 arquivos**
  passaram, incluindo três regressões de interface com cache preenchido e
  revogação de categorias protegidas. Permanecem 29 avisos herdados no lint.
- Navegador local: 14 cenários nas seis áreas, desktop e largura de 375 px,
  sem overflow ou erros de página. Incluiu dados desconhecidos, laudo particular,
  catálogo incompleto, revisão pendente, análise desatualizada e representação.

Código publicado: `3105f4d78329ca186355fe61093f9f196cc1fb37`; SHA de
`origin/main` conferido após o push.

| Serviço Railway | Deployment | Estado terminal |
| --- | --- | --- |
| web | `247a1ce4-5ea9-4369-bf6e-5254dbd6fad2` | SUCCESS |
| functions | `3ed2fe8f-6ab4-40d6-897e-cca756481400` | SUCCESS |
| scheduler | `6819314f-6500-4d3c-b207-a970929ce280` | SUCCESS |

Navegador publicado: seis abas verificadas, oito mutações rastreadas e leitura
após reload. Fonte/pensão alimentícia, data desconhecida, protocolo médico,
conferência do laudo particular, proposta por rendimento, snapshot e nova
evidência que exige revisão passaram. Proposta incompleta não oferece aprovação.
Zero erros de página; seis abas em largura de 375 px sem overflow. Seis chamadas
automáticas de boas-vindas foram bloqueadas; nenhuma mensagem foi enviada.

As três contas/escritórios sintéticos e os documentos privados estão preservados
temporariamente para os testes encadeados da F4, isolados do escritório original.
A limpeza final e a conferência do estado original continuam obrigatórias antes
de encerrar a execução disponível; não foram declaradas como realizadas na F3.

## Dependências e próxima fase

A revisão em uma fixture sintética valida o software, não homologa uma hipótese
jurídica. **P03** continua pendente: advogado/profissional fiscal responsável,
casos de referência autorizados e aceite jurídico/fiscal. Não há catálogo
jurídico pré-aprovado ou regra clínica automática sem essa revisão.

F3.09 cobre os cenários de dossiê, enquadramento assistido, revisão e acesso. Os
cenários monetários, períodos, pedidos, cessação e conciliação da seção 6.1 do
plano continuam na F4. Cálculos não dependem de presumir acesso a Receita/INSS.

Limites a tratar na F9: listas jurídicas limitadas a 200 registros e ensaio de
recuperação integral com banco e documentos. Homologação contratual externa e
retenção continuam no [registro consolidado](EXECUCAO_CONTINUA.md).
