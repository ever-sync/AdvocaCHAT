import { useState, type FormEvent, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Moon,
  Plus,
  Scale,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "@/styles/design-system.css";

const navigation = [
  ["fundamentos", "Fundamentos"],
  ["componentes", "Componentes"],
  ["aplicacao", "Em contexto"],
  ["diretrizes", "Diretrizes"],
];
const swatches = [
  { name: "Institucional", token: "brand", hex: "#183E32", color: "bg-brand" },
  { name: "Ação", token: "primary", hex: "#285C48", color: "bg-primary" },
  { name: "Sálvia", token: "gold", hex: "#91B29A", color: "bg-gold" },
  {
    name: "Página",
    token: "background",
    hex: "#F3F6EF",
    color: "bg-background",
  },
  { name: "Superfície", token: "card", hex: "#FBFCF7", color: "bg-card" },
  {
    name: "Texto",
    token: "foreground",
    hex: "#243C30",
    color: "bg-foreground",
  },
];
const icons = [
  [LayoutDashboard, "Visão geral"],
  [FolderOpen, "Processos"],
  [Users, "Clientes"],
  [CalendarDays, "Prazos"],
  [FileText, "Documentos"],
  [MessageSquare, "Conversas"],
  [Wallet, "Financeiro"],
  [Settings2, "Ajustes"],
] as const;
const initialCases = [
  {
    title: "Revisão contratual",
    area: "Direito empresarial",
    reference: "DEMO-2026-001",
    status: "Em andamento",
    variant: "info" as const,
  },
  {
    title: "Acordo extrajudicial",
    area: "Direito civil",
    reference: "DEMO-2026-002",
    status: "Em revisão",
    variant: "warning" as const,
  },
  {
    title: "Consultoria trabalhista",
    area: "Direito do trabalho",
    reference: "DEMO-2026-003",
    status: "Concluído",
    variant: "success" as const,
  },
];

function Section({
  id,
  number,
  title,
  description,
  children,
}: {
  id: string;
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="ds-section scroll-mt-24">
      <div className="mb-7 flex items-start gap-4">
        <span className="ds-section-number">{number}</span>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function DesignSystem() {
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cases, setCases] = useState(initialCases);
  const filteredCases = cases.filter((item) =>
    `${item.title} ${item.area}`
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );
  function addExample(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Informe um título para o caso.");
      return;
    }
    setCases((current) => [
      {
        title: title.trim(),
        area: "Exemplo local",
        reference: `DEMO-2026-${String(current.length + 1).padStart(3, "0")}`,
        status: "Em andamento",
        variant: "info",
      },
      ...current,
    ]);
    setTitle("");
    setError("");
    setQuery("");
    setOpen(false);
    setNotice("Exemplo adicionado. Os dados desta página são temporários.");
  }
  return (
    <div className="ds-page">
      <a className="ds-skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="ds-topbar">
        <a
          href="#"
          className="flex items-center gap-2.5 font-semibold tracking-tight"
          aria-label="AdvocaCHAT, início do design system"
        >
          <span className="ds-brand-mark">
            <Scale size={20} aria-hidden="true" />
          </span>
          Advoca<span className="-ml-2 text-primary">CHAT</span>
          <span className="ds-header-divider" />
          <span className="text-sm font-normal text-muted-foreground">
            Design system
          </span>
        </a>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="hidden sm:inline-flex">
            Versão 1.0
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
            }
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>
      <div className="ds-layout">
        <aside className="ds-sidebar">
          <div>
            <span className="ds-eyebrow">BIBLIOTECA VISUAL</span>
            <nav
              aria-label="Seções do design system"
              className="mt-6 space-y-2"
            >
              {navigation.map(([id, label], index) => (
                <a key={id} href={`#${id}`} className="ds-nav-link">
                  <span className="font-mono text-xs opacity-60">
                    0{index + 1}
                  </span>
                  {label}
                  <ArrowRight
                    size={14}
                    className="ml-auto opacity-40"
                    aria-hidden="true"
                  />
                </a>
              ))}
            </nav>
          </div>
          <div className="ds-sidebar-note">
            <ShieldCheck
              size={22}
              className="mb-3 text-sidebar-primary"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">Clareza em cada decisão.</p>
            <p className="mt-2 text-xs leading-relaxed opacity-70">
              Uma linguagem visual para aproximar pessoas, organizar o trabalho
              e inspirar confiança.
            </p>
            <div className="mt-6 border-t border-sidebar-border pt-4 text-[11px] opacity-60">
              ADVOCA CHAT · 2026
            </div>
          </div>
        </aside>
        <main id="conteudo" className="ds-main">
          <div className="ds-hero">
            <div>
              <div className="ds-eyebrow mb-5 flex items-center gap-2 text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />{" "}
                PRECISÃO JURÍDICA. SIMPLICIDADE DIGITAL.
              </div>
              <h1 className="max-w-2xl text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">
                Confiança na forma.
                <br />
                <span className="text-muted-foreground">
                  Clareza na experiência.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
                A identidade do AdvocaCHAT, do primeiro contato ao próximo
                prazo. Fundamentos e componentes para uma rotina jurídica mais
                organizada.
              </p>
              <Button asChild variant="outline" className="mt-7">
                <a href="#componentes">
                  Explorar componentes <ArrowDown aria-hidden="true" />
                </a>
              </Button>
            </div>
            <div className="ds-hero-seal" aria-hidden="true">
              <Scale strokeWidth={1} size={70} />
              <span>
                ADVOCA
                <br />
                <b>CHAT</b>
              </span>
              <small>PRECISÃO & CONFIANÇA</small>
            </div>
          </div>
          <div className="ds-principles">
            <span>
              <ShieldCheck /> Confiança sem excesso
            </span>
            <span>
              <LayoutDashboard /> Informação com hierarquia
            </span>
            <span>
              <Users /> Pessoas no centro
            </span>
          </div>
          <Section
            id="fundamentos"
            number="01"
            title="Uma identidade com propósito"
            description="Verde-escuro, verde pastel e branco suave. Cada cor tem uma função; cada detalhe, uma razão."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {swatches.map((swatch) => (
                <div
                  key={swatch.token}
                  className="overflow-hidden rounded-lg border bg-card"
                >
                  <div className={`h-24 border-b ${swatch.color}`} />
                  <div className="p-3">
                    <p className="text-sm font-medium">{swatch.name}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {swatch.token}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {theme === "dark" ? "Adaptado ao tema" : swatch.hex}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_1fr]">
              <Card>
                <CardHeader>
                  <div className="ds-eyebrow text-muted-foreground">
                    TIPOGRAFIA · INTER
                  </div>
                  <CardTitle className="pt-3 text-3xl">
                    A informação vem primeiro.
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                    Legibilidade em conversas longas, precisão em documentos e
                    hierarquia para encontrar o que importa.
                  </p>
                  <div className="mt-6 flex flex-wrap items-baseline gap-6 border-t pt-5">
                    <span className="text-3xl font-semibold">Aa</span>
                    <span className="text-base font-medium">
                      Regular · Medium · Semibold
                    </span>
                    <span className="font-mono text-sm text-muted-foreground">
                      0123456789
                    </span>
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Página 24–30 px · Seção 18–24 px · Corpo 14–16 px · Apoio 12
                    px
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div className="ds-eyebrow text-muted-foreground">
                    GEOMETRIA & ESPAÇAMENTO
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between gap-3">
                    {[
                      ["8", "Controles", "rounded-md"],
                      ["12", "Cards", "rounded-lg"],
                      ["16", "Modais", "rounded-dialog"],
                    ].map(([radius, label, shape]) => (
                      <div key={radius} className="text-center">
                        <div
                          className={`mb-3 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center border-2 border-primary/40 bg-accent text-lg font-medium text-accent-foreground ${shape}`}
                        >
                          {radius}
                          <span className="ml-1 text-xs">px</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 border-t pt-4">
                    <p className="text-sm font-medium">Ritmo de 4 px</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <Card className="mt-5">
              <CardHeader>
                <div className="ds-eyebrow text-muted-foreground">
                  ICONOGRAFIA · LUCIDE · 20 PX · TRAÇO 1.75
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-4 gap-y-6 sm:grid-cols-8">
                {icons.map(([Icon, label]) => (
                  <div key={label} className="flex flex-col items-center gap-3">
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                    <span className="text-center text-[11px] text-muted-foreground">
                      {label}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </Section>
          <Section
            id="componentes"
            number="02"
            title="Consistência que se reconhece"
            description="Componentes reais da aplicação. Experimente os estados, navegue pelo teclado e alterne entre os temas."
          >
            <Tabs defaultValue="actions">
              <TabsList aria-label="Categorias de componentes" className="mb-5">
                <TabsTrigger value="actions">Ações</TabsTrigger>
                <TabsTrigger value="forms">Formulários</TabsTrigger>
                <TabsTrigger value="feedback">Feedback</TabsTrigger>
              </TabsList>
              <TabsContent value="actions">
                <Card>
                  <CardHeader>
                    <CardTitle>Uma ação principal por contexto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={() =>
                          setNotice("Ação principal acionada na demonstração.")
                        }
                      >
                        <Plus aria-hidden="true" /> Novo processo
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setNotice("Ação secundária acionada na demonstração.")
                        }
                      >
                        Ver detalhes <ArrowRight aria-hidden="true" />
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setNotice(
                            "Rascunho simulado. Nenhum dado foi enviado.",
                          )
                        }
                      >
                        Salvar rascunho
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setNotice("Ação cancelada na demonstração.")
                        }
                      >
                        Cancelar
                      </Button>
                    </div>
                    <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-6">
                      <Button disabled>Indisponível</Button>
                      <Button disabled>
                        <Loader2 className="animate-spin" aria-hidden="true" />{" "}
                        Salvando…
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          setNotice(
                            "Exemplo de ação destrutiva. Em operações reais, confirme o item e o impacto antes de excluir.",
                          )
                        }
                      >
                        Excluir exemplo
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Altura padrão 40 px · Foco visível · Ícone com rótulo
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="forms">
                <Card>
                  <CardHeader>
                    <CardTitle>Campos com orientação clara</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ds-client">Nome do cliente</Label>
                      <Input
                        id="ds-client"
                        placeholder="Ex.: Cliente de demonstração"
                      />
                      <p className="text-xs text-muted-foreground">
                        Use o nome completo para facilitar a busca.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ds-area">Área de atuação</Label>
                      <Select defaultValue="civil">
                        <SelectTrigger id="ds-area">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="civil">Direito civil</SelectItem>
                          <SelectItem value="labor">
                            Direito do trabalho
                          </SelectItem>
                          <SelectItem value="business">
                            Direito empresarial
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ds-error">E-mail · exemplo de erro</Label>
                      <Input
                        id="ds-error"
                        defaultValue="cliente@"
                        aria-invalid="true"
                        aria-describedby="ds-error-help"
                      />
                      <p
                        id="ds-error-help"
                        className="text-xs text-destructive"
                      >
                        Informe um e-mail completo, como nome@dominio.com.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ds-notes">Observações</Label>
                      <Textarea
                        id="ds-notes"
                        placeholder="Adicione informações relevantes…"
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="feedback">
                <Card>
                  <CardHeader>
                    <CardTitle>Status que não dependem só da cor</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      <Badge variant="info">Em andamento</Badge>
                      <Badge variant="warning">Prazo próximo</Badge>
                      <Badge variant="danger">Vencido</Badge>
                      <Badge variant="success">
                        <Check size={12} className="mr-1" aria-hidden="true" />{" "}
                        Concluído
                      </Badge>
                      <Badge variant="neutral">Arquivado</Badge>
                    </div>
                    <div className="mt-6 flex gap-3 rounded-md border border-success/20 bg-success/10 p-4 text-success">
                      <CheckCircle2
                        size={20}
                        className="shrink-0"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-medium">
                          Documento salvo com sucesso
                        </p>
                        <p className="mt-1 text-sm">
                          Exemplo de confirmação com descrição da próxima etapa.
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 rounded-lg border border-dashed p-6 text-center">
                      <FolderOpen
                        className="mx-auto mb-3 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium">
                        Nenhum processo por aqui
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Crie o primeiro processo para começar a organizar o
                        trabalho.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            <p
              role="status"
              aria-live="polite"
              className="mt-4 min-h-5 text-sm text-success"
            >
              {notice}
            </p>
          </Section>
          <Section
            id="aplicacao"
            number="03"
            title="Do componente à rotina"
            description="Uma prévia do sistema em uso. Dados fictícios; busca e cadastro funcionam apenas nesta demonstração."
          >
            <Card className="overflow-hidden">
              <div className="ds-demo-header">
                <div>
                  <div className="ds-eyebrow mb-2 text-muted-foreground">
                    ESPAÇO DE TRABALHO
                  </div>
                  <h3 className="text-xl font-semibold">
                    Seus processos, em ordem.
                  </h3>
                </div>
                <Dialog
                  open={open}
                  onOpenChange={(value) => {
                    setOpen(value);
                    setError("");
                  }}
                >
                  <DialogTrigger asChild>
                    <Button>
                      <Plus aria-hidden="true" /> Novo exemplo
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar caso de exemplo</DialogTitle>
                      <DialogDescription>
                        Dados temporários para explorar o design system. Nada
                        será enviado ao servidor.
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      onSubmit={addExample}
                      className="space-y-5"
                      noValidate
                    >
                      <div className="space-y-2">
                        <Label htmlFor="ds-case-title">Título do caso</Label>
                        <Input
                          id="ds-case-title"
                          value={title}
                          onChange={(event) => {
                            setTitle(event.target.value);
                            setError("");
                          }}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? "ds-case-error" : undefined}
                          autoComplete="off"
                        />
                        {error ? (
                          <p
                            id="ds-case-error"
                            role="alert"
                            className="text-sm text-destructive"
                          >
                            {error}
                          </p>
                        ) : null}
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setOpen(false)}
                        >
                          Cancelar
                        </Button>
                        <Button type="submit">Criar exemplo</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3 sm:px-6">
                {[
                  [
                    FolderOpen,
                    String(cases.length).padStart(2, "0"),
                    "Processos na demonstração",
                  ],
                  [Clock3, "01", "Aguardando revisão"],
                  [CheckCircle2, "01", "Concluído"],
                ].map(([Icon, value, label]) => {
                  const MetricIcon = Icon as typeof FolderOpen;
                  return (
                    <div
                      key={String(label)}
                      className="flex items-center gap-4 rounded-md border bg-background p-4"
                    >
                      <MetricIcon
                        size={20}
                        className="text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-2xl font-semibold tabular-nums">
                          {String(value)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {String(label)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-y bg-muted/40 px-5 py-3 sm:px-6">
                <div className="relative max-w-sm">
                  <Search
                    className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    className="pl-9"
                    aria-label="Buscar casos de exemplo"
                    placeholder="Buscar por título ou área…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Casos fictícios do design system
                  </caption>
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-6 py-4 font-medium">
                        Caso / área
                      </th>
                      <th
                        scope="col"
                        className="hidden px-6 py-4 font-medium sm:table-cell"
                      >
                        Referência
                      </th>
                      <th scope="col" className="px-6 py-4 font-medium">
                        Situação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((item) => (
                      <tr
                        key={item.reference}
                        className="border-t transition-colors hover:bg-muted/50"
                      >
                        <td className="px-6 py-4">
                          <p className="font-medium">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.area}
                          </p>
                        </td>
                        <td className="hidden px-6 py-4 font-mono text-xs text-muted-foreground sm:table-cell">
                          {item.reference}
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant={item.variant}
                            className="whitespace-nowrap"
                          >
                            {item.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredCases.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum caso encontrado. Tente outro título ou área.
                  </p>
                ) : null}
              </div>
              <div className="border-t px-6 py-3 text-xs text-muted-foreground">
                {filteredCases.length} de {cases.length} casos · Ambiente
                demonstrativo
              </div>
            </Card>
          </Section>
          <Section
            id="diretrizes"
            number="04"
            title="O cuidado está nos detalhes"
            description="Regras para manter a experiência consistente conforme o produto cresce."
          >
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                [
                  "01",
                  "Hierarquia antes de decoração",
                  "Use superfícies e bordas para organizar. Reserve sombras para elementos sobrepostos e a sálvia para detalhes institucionais.",
                ],
                [
                  "02",
                  "Acessibilidade desde o início",
                  "Associe rótulos aos campos, explique erros com texto e preserve o foco visível. Respeite a preferência por movimento reduzido.",
                ],
                [
                  "03",
                  "Uma linguagem humana",
                  "Diga o que aconteceu e qual é o próximo passo. Em ações irreversíveis, explique exatamente o que será afetado.",
                ],
              ].map(([number, heading, text]) => (
                <div key={number} className="border-t-2 border-border pt-5">
                  <span className="font-mono text-xs text-muted-foreground">
                    {number}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold">{heading}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </Section>
          <footer className="ds-footer">
            <span>AdvocaCHAT · Design system 1.0</span>
            <span>Feito para uma rotina jurídica mais clara.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
