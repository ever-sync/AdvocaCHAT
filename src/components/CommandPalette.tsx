import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bookmark,
  Building2,
  Flame,
  Gauge,
  Inbox as InboxIcon,
  LayoutGrid,
  List,
  Megaphone,
  Package,
  Settings,
  Snowflake,
  Sparkles,
  Target,
  User,
  Users,
  FileText,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useCustomers } from "@/lib/api/customers";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { isSupabaseConfigured } from "@/lib/supabase";

const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform);

type NavItem = {
  label: string;
  description?: string;
  to: string;
  permission?: Parameters<ReturnType<typeof useRolePermissions>["can"]>[0];
  icon: typeof InboxIcon;
  keywords?: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Inbox", to: "/inbox", permission: "inbox", icon: InboxIcon, keywords: "chat conversa whatsapp atendimento" },
  { label: "CRM (quadro)", to: "/crm?view=board", permission: "crm", icon: LayoutGrid, keywords: "kanban funil pipeline negociacoes" },
  { label: "CRM (lista)", to: "/crm?view=list", permission: "crm", icon: List, keywords: "tabela negocios deals" },
  { label: "Clientes", to: "/clientes", permission: "clientes", icon: Building2, keywords: "contatos leads" },
  { label: "Painel ao vivo", to: "/painel", permission: "relatorios", icon: Gauge, keywords: "dashboard sla atendimento ao vivo" },
  { label: "Relatórios", to: "/relatorios", permission: "relatorios", icon: BarChart3, keywords: "metricas funil vendas performance" },
  { label: "Produtos", to: "/produtos", permission: "produtos", icon: Package, keywords: "catalogo precos estoque" },
  { label: "Documentos", to: "/documentos", permission: "crm", icon: FileText, keywords: "arquivos anexos pdf planilhas contratos" },
  { label: "Marketing", to: "/marketing", permission: "marketing", icon: Megaphone, keywords: "campanhas email formularios" },
  { label: "Agente IA", to: "/agente-ia", permission: "ia", icon: Sparkles, keywords: "ai inteligencia artificial bot" },
  { label: "Configurações", to: "/configuracoes", permission: "configuracoes", icon: Settings, keywords: "ajustes time funis respostas" },
];

const CRM_SAVED_VIEWS = [
  {
    label: "Vista: Minhas quentes",
    description: "Em andamento, comigo, qualif. alta",
    icon: Flame,
    to: "/crm?owner=mine&status=em_andamento&sort=qualified_desc",
  },
  {
    label: "Vista: Fechando logo",
    description: "Em andamento, próxima previsão de fechamento",
    icon: Target,
    to: "/crm?status=em_andamento&sort=closing",
  },
  {
    label: "Vista: Negócios frios",
    description: "Em andamento + parados, contato mais antigo",
    icon: Snowflake,
    to: "/crm?status=em_andamento&alerts=stale&sort=contact_oldest",
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { can } = useRolePermissions();

  // Cmd+K (mac) / Ctrl+K (win/linux): abre/fecha. Bloqueado quando foco já é input
  // só pra Cmd+K NÃO funcionar — outros atalhos ficam livres.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Customers já estão em cache na app — reusamos a query existente sem refetch extra.
  const { data: customersData } = useCustomers(
    {},
    { enabled: open && isSupabaseConfigured, staleTime: 60_000 },
  );

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [] as { id: string; nome: string; telefone?: string | null }[];
    const digits = q.replace(/\D/g, "");
    const list = customersData ?? [];
    const out: { id: string; nome: string; telefone?: string | null }[] = [];
    for (const c of list) {
      if (out.length >= 6) break;
      const hitName = c.nome?.toLowerCase().includes(q);
      const hitPhone = digits.length > 0 && (c.phoneDigits?.includes(digits) || c.telefone?.includes(digits));
      if (hitName || hitPhone) {
        out.push({ id: c.id, nome: c.nome, telefone: c.telefone });
      }
    }
    return out;
  }, [customersData, query]);

  const go = useCallback(
    (to: string) => {
      setOpen(false);
      setQuery("");
      navigate(to);
    },
    [navigate],
  );

  const filteredNav = useMemo(
    () => NAV_ITEMS.filter((item) => !item.permission || can(item.permission, "view")),
    [can],
  );

  const canCrm = can("crm", "view");
  const trimmedQuery = query.trim();

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={`Buscar ou digitar comando…  (${isMac ? "⌘" : "Ctrl"}+K)`}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nada encontrado. Tente outro termo.</CommandEmpty>

        {canCrm && trimmedQuery.length >= 2 ? (
          <>
            <CommandGroup heading="Buscar no CRM">
              <CommandItem
                value={`crm-search-${trimmedQuery}`}
                onSelect={() => go(`/crm?q=${encodeURIComponent(trimmedQuery)}`)}
              >
                <ArrowRight className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>
                  Buscar “<span className="font-semibold">{trimmedQuery}</span>” em negociações
                </span>
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        {filteredCustomers.length > 0 ? (
          <>
            <CommandGroup heading="Clientes">
              {filteredCustomers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`customer-${c.id}-${c.nome}-${c.telefone ?? ""}`}
                  onSelect={() => go(`/clientes/${c.id}`)}
                >
                  <User className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="flex flex-col">
                    <span className="font-medium">{c.nome}</span>
                    {c.telefone ? (
                      <span className="text-xs text-muted-foreground">{c.telefone}</span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        <CommandGroup heading="Ir para">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.to}
                value={`nav-${item.label}-${item.keywords ?? ""}`}
                onSelect={() => go(item.to)}
              >
                <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>

        {canCrm ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Vistas do CRM">
              {CRM_SAVED_VIEWS.map((v) => {
                const Icon = v.icon;
                return (
                  <CommandItem
                    key={v.to}
                    value={`view-${v.label}`}
                    onSelect={() => go(v.to)}
                  >
                    <Icon className="mr-2 h-4 w-4 text-[var(--crm-brand)]" />
                    <span className="flex flex-col">
                      <span>{v.label}</span>
                      <span className="text-xs text-muted-foreground">{v.description}</span>
                    </span>
                  </CommandItem>
                );
              })}
              <CommandItem value="view-board" onSelect={() => go("/crm?view=board")}>
                <Bookmark className="mr-2 h-4 w-4 text-muted-foreground" />
                Limpar filtros e voltar ao quadro
              </CommandItem>
              <CommandItem
                value="view-pool"
                onSelect={() => go("/crm?owner=pool&status=em_andamento")}
              >
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                Vista: Pool sem responsável
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
