# AdvocaCHAT — Design system 1.0

## Referência executável

Abra `/design-system`. A página usa os componentes reais de `src/components/ui`,
permite alternar os temas, explorar campos/estados, filtrar casos fictícios e abrir
um formulário em modal. Todos os exemplos são locais e temporários. A rota não
consulta registros jurídicos nem oferece ações sobre dados de clientes.

## Fonte de verdade

- `src/styles/design-tokens.css`: cores semânticas nos temas claro e escuro,
  geometria e aliases de compatibilidade para CRM/inbox.
- `tailwind.config.ts`: utilitários semânticos, fontes e raios.
- `src/components/ui`: componentes compartilhados de produção.
- `src/pages/DesignSystem.tsx`: catálogo visual e exemplos interativos.
- `src/styles/design-system.css`: composição exclusiva do catálogo.

Os componentes que já consomem os tokens passam a usar a nova identidade.
Cores literais, logotipos rasterizados, templates externos e estilos específicos
fora desses tokens não são migrados automaticamente. Não substituir cores de
provedores (por exemplo, WhatsApp) nem cores de dados definidas pelos usuários.

## Paleta clara

| Papel                 | Cor                           | Utilitário                           |
| --------------------- | ----------------------------- | ------------------------------------ |
| Institucional         | `#182B49`                     | `text-brand`                         |
| Ação principal        | `#2563EB`                     | `bg-primary text-primary-foreground` |
| Detalhe institucional | `#B39155`                     | `text-gold` / `border-gold`          |
| Fundo da página       | `#F5F7FA`                     | `bg-background`                      |
| Superfície            | `#FFFFFF`                     | `bg-card text-card-foreground`       |
| Texto                 | `#202938`                     | `text-foreground`                    |
| Texto secundário      | Cinza com contraste reforçado | `text-muted-foreground`              |
| Separação             | Cinza suave                   | `border-border`                      |
| Limite de campos      | Cinza mais forte              | `border-input`                       |

O tema escuro tem tokens próprios: superfícies azul-escuras e cores de ação/status
mais claras. Combine sempre o fundo semântico com seu `*-foreground`. Dourado é
um detalhe decorativo: não usá-lo para textos pequenos, ações ou status.

## Tipografia, geometria e ritmo

Inter é a fonte de interface, com fallback `system-ui`. Poppins permanece
carregada para telas antigas que a referenciam explicitamente. Referências e
identificadores usam `font-mono`; métricas usam `tabular-nums`.

- Título de página: 24–30 px, semibold. O título editorial do catálogo usa 36–48 px.
- Título de seção/card: 18–24 px, semibold.
- Corpo: 14–16 px, regular; apoio: 12 px. Nunca depender de texto minúsculo para decisões.
- Espaçamento: múltiplos de 4 px; preferir 8, 12, 16, 24, 32, 48 e 64 px.
- Controles: 8 px (`rounded-md`), altura padrão 40 px, 44 px no tamanho grande.
- Cards: 12 px (`rounded-lg`), borda de 1 px, sem sombra por padrão.
- Modais: 16 px (`rounded-dialog`) no desktop, preservando comportamento móvel existente.
- Etiquetas: cápsula. Sombras reservadas a menus, popovers e modais.

## Ícones

Lucide, 20 px e traço 1.5 na navegação; 16 px dentro dos botões. Ícones decorativos
recebem `aria-hidden`. Ações com ícone isolado precisam de `aria-label` e, quando
necessário, tooltip. Use uma única família e rótulos claros: Balança para casos jurídicos,
Calendário para prazos, Arquivo para documentos, Pessoas para clientes e Balão
para conversas. Use a lista de tarefas para Meu dia jurídico, distinguindo-o da Agenda.

## Componentes

```tsx
<Button><Plus aria-hidden="true" /> Novo processo</Button>
<Button variant="outline">Ver detalhes</Button>
<Badge variant="warning">Prazo próximo</Badge>
<Badge variant="danger">Vencido</Badge>
<Badge variant="success">Concluído</Badge>
<Badge variant="info">Em andamento</Badge>
<Badge variant="neutral">Arquivado</Badge>
```

Manter uma ação principal por contexto. `destructive` é reservado a exclusão ou
outra ação destrutiva. A variante `danger` de Badge descreve um estado negativo
sem transformar a etiqueta em botão.

Campos precisam de `Label` vinculado por `htmlFor`/`id`. Em erro, usar
`aria-invalid` e `aria-describedby` apontando para a mensagem específica. Texto de
placeholder não substitui rótulo. Desabilitado e carregando precisam ser
reconhecíveis; prevenir submissões repetidas na implementação de cada fluxo.

Usar Dialog com título, descrição, fechamento por Escape, foco contido e retorno
ao acionador. Em exclusões reais, apresentar o item e o impacto antes da ação.

## Layout e acessibilidade

Navegação institucional escura e área de trabalho clara. No tema escuro, preservar
a hierarquia com superfícies distintas. Tabelas têm cabeçalhos semânticos, busca
com nome acessível, estado vazio explicativo e rolagem localizada quando necessário.
No celular, priorizar campos essenciais sem criar rolagem horizontal na página.

Preservar foco visível, uso por teclado e textos de status além das cores.
Animações respeitam `prefers-reduced-motion`. Validar contraste WCAG AA nos pares
realmente renderizados; o catálogo não equivale a uma auditoria de acessibilidade
de todas as telas legadas. Componentes com cores ou classes próprias precisam de
verificação individual durante sua migração.

## Verificação

Executar `npm run typecheck`, ESLint nos arquivos alterados e o build com as
variáveis públicas de ambiente do projeto. No catálogo, verificar temas claro e
escuro, viewport móvel, abas por teclado, modal (erro, envio e Escape), filtro com
resultado e filtro vazio. Dados fictícios devem permanecer apenas em memória.

## Aplicação nas telas operacionais

A navegação desktop usa a superfície institucional: 208 px com rótulos em telas
largas e 64 px com ícones em tablets. A lista de áreas tem rolagem independente,
preservando conta, tema e saída. O menu móvel inclui Meu dia jurídico e mantém o
mesmo filtro de permissões existente.

Login, cabeçalhos do atendimento e PageShell usam superfícies e espaçamentos
semânticos. Casos jurídicos usam `CASE_STATUS_VARIANTS`: andamento em azul,
aguardando em âmbar e encerrado neutro. Referências visíveis ao produto anterior
foram corrigidas no atendimento, IA, ativação, configuração de canal e widget.
Cabeçalhos de integrações e identificadores persistidos não foram renomeados.

Validação: TypeScript, lint dos arquivos alterados, build principal e widget;
navegação com fixtures locais em desktop, temas claro/escuro, menu móvel e
larguras 320/390/1024 px. No teste visual, o bloqueio de assinatura foi isolado
apenas no navegador de teste, sem alteração da regra de cobrança do aplicativo.

Os menus desktop e móvel compartilham a mesma associação visual: balança para
casos jurídicos, lista de tarefas para Meu dia jurídico, quadro Kanban para CRM,
calendário para Agenda, pessoas para Clientes e arquivo para Documentos. Painel
usa uma grade de dashboard; Agente IA usa um assistente com balão de conversa.
