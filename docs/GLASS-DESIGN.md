# Visual de vidro — referência e implementação

Referência: imagem fornecida em 29/09/2026, interface SugarCRM.

## Extração

- Fundo cinza frio com iluminação azul na parte inferior.
- Painéis brancos translúcidos, borda clara e sombra discreta.
- Cantos amplos (32–36 px), controles arredondados e ações circulares.
- Texto quase preto, navegação selecionada preta, ícones de traço fino.
- Navegação horizontal no desktop e trilho de ícones à esquerda.

## Plano executado

1. Substituir a paleta verde pelos tokens neutros, incluindo os aliases de CRM e inbox.
2. Centralizar superfícies, transparência, fallback sem blur e tema escuro em `glass.css`.
3. Implementar cabeçalho com links autorizados, busca funcional e alternância de tema.
4. Estilizar o trilho lateral, manter sua expansão e adaptar o conteúdo ao contêiner arredondado.
5. Propagar o material para cards, controles, popovers e diálogos compartilhados.
6. Verificar compilação, tipos, lint dos arquivos alterados e testes existentes de CRM/inbox.

O conteúdo, as permissões e as ações de cada módulo continuam específicos do AdvocaCHAT. O diagrama de jornadas da referência não representa dados existentes do produto e não foi inserido como funcionalidade fictícia. A implementação reproduz a linguagem visual; não constitui uma cópia pixel a pixel da tela SugarCRM.

## Verificação

Os testes E2E usam os fixtures locais existentes, sem mensagens ou mudanças em contas reais. A validação local não comprova deploy nem homologação de todas as rotas com dados de produção.
