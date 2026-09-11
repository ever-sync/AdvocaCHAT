import {
  BotMessageSquare,
  SquareKanban,
  CalendarDays,
  ListTodo,
  Check,
  Building2,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Settings2,
  Sun,
  RotateCcw,
  ShieldCheck,
  UserCog,
  UsersRound,
  FileText,
  Hourglass,
  Scale,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useToast } from "@/hooks/use-toast";
import { usePlatformAdminAccess } from "@/lib/api/platform-admin";
import { useTenantBillingSnapshot } from "@/lib/api/billing";
import {
  usePlatformTenants,
  usePlatformTenantContext,
  useSetPlatformTenantContext,
} from "@/lib/api/platform-tenant-context";
import { useSetMyAvailability } from "@/lib/api/settings";
import { cn } from "@/lib/utils";
import type { UserAvailability } from "@/types/domain";

const AVAILABILITY_OPTIONS: Array<{
  value: UserAvailability;
  label: string;
  dotClass: string;
  description: string;
}> = [
  {
    value: "available",
    label: "Disponível",
    dotClass: "bg-emerald-500",
    description: "Recebe novas conversas pela fila",
  },
  {
    value: "busy",
    label: "Ocupado",
    dotClass: "bg-amber-500",
    description: "Não recebe auto-atribuição",
  },
  {
    value: "offline",
    label: "Offline",
    dotClass: "bg-zinc-400",
    description: "Fora da fila automática",
  },
];

function availabilityMeta(value: UserAvailability | undefined) {
  return AVAILABILITY_OPTIONS.find((opt) => opt.value === value) ?? AVAILABILITY_OPTIONS[0];
}

function formatTrialTimeLeft(milliseconds: number) {
  if (milliseconds <= 0) return "Teste encerrado";

  const totalMinutes = Math.ceil(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}min restantes`;
  if (hours > 0) return `${hours}h ${minutes}min restantes`;
  return `${minutes}min restantes`;
}

type MenuItem = {
  title: string;
  url: string;
  icon: typeof MessageCircle;
  permission?: "inbox" | "crm" | "agenda" | "clientes" | "produtos" | "relatorios" | "marketing" | "ia" | "configuracoes";
};

const primaryItems: MenuItem[] = [
  { title: "Chat", url: "/inbox", icon: MessageCircle, permission: "inbox" },
  { title: "Casos jurídicos", url: "/casos", icon: Scale },
  { title: "Meu dia jurídico", url: "/juridico/meu-dia", icon: ListTodo },
  { title: "CRM", url: "/crm", icon: SquareKanban, permission: "crm" },
  { title: "Agenda", url: "/agenda", icon: CalendarDays, permission: "agenda" },
  { title: "Clientes", url: "/clientes", icon: UsersRound, permission: "clientes" },
  { title: "Produtos", url: "/produtos", icon: Package, permission: "produtos" },
  { title: "Documentos", url: "/documentos", icon: FileText, permission: "crm" },
  { title: "Painel", url: "/painel", icon: LayoutDashboard, permission: "relatorios" },
  { title: "Marketing", url: "/marketing", icon: Megaphone, permission: "marketing" },
  { title: "Agente IA", url: "/agente-ia", icon: BotMessageSquare, permission: "ia" },
];

function SidebarTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        className="border-border bg-primary text-xs font-medium text-primary-foreground shadow-xl"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function isItemActive(item: MenuItem, pathname: string) {
  if (item.url === "/crm") {
    return pathname === item.url;
  }
  return pathname === item.url || pathname.startsWith(`${item.url}/`);
}

function RailNavLink({ item, pathname }: { item: MenuItem; pathname: string }) {
  const isActive = isItemActive(item, pathname);

  return (
    <SidebarTooltip label={item.title}>
      <NavLink
        to={item.url}
        title={item.title}
        aria-label={item.title}
        end={item.url === "/crm"}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center gap-3 rounded-md transition-colors duration-150 group-data-[expanded=true]/sidebar:w-full group-data-[expanded=true]/sidebar:justify-start group-data-[expanded=true]/sidebar:px-3",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
        activeClassName=""
      >
        <item.icon strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden /><span className="hidden truncate text-sm font-medium group-data-[expanded=true]/sidebar:block">{item.title}</span>
      </NavLink>
    </SidebarTooltip>
  );
}

export function AppSidebar() {
  const [expanded, setExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem("advocachat:sidebar-expanded");
      if (saved !== null) return saved === "true";
    } catch { /* Storage may be unavailable in private sessions. */ }
    return window.matchMedia("(min-width: 1280px)").matches;
  });
  function toggleSidebar() {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem("advocachat:sidebar-expanded", String(next)); }
    catch { /* The toggle still works without persistent storage. */ }
  }
  const pathname = useLocation().pathname;
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { can, isLoading: permissionsLoading } = useRolePermissions();
  const { toast } = useToast();
  const { resolvedTheme, setTheme } = useTheme();
  const platformAdminAccess = usePlatformAdminAccess({
    enabled: Boolean(profile?.id),
  });
  const billingSnapshot = useTenantBillingSnapshot({
    enabled: Boolean(profile?.id),
  });
  const isPlatformAdmin = platformAdminAccess.data?.isPlatformAdmin ?? false;
  const tenantContext = usePlatformTenantContext({
    enabled: isPlatformAdmin,
  });
  const tenantsQuery = usePlatformTenants({
    enabled: isPlatformAdmin,
  });
  const setTenantContext = useSetPlatformTenantContext({
    onError: (error) => {
      toast({
        title: "Não foi possível trocar a empresa",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });
  // next-themes só conhece o tema após montar; evita renderizar o ícone errado.
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => setThemeMounted(true), []);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  useEffect(() => {
    const trialEndsAt = billingSnapshot.data?.subscription?.trial_ends_at;
    if (!trialEndsAt || billingSnapshot.data?.subscription?.status !== "trialing") return;

    setCountdownNow(Date.now());
    const interval = window.setInterval(() => setCountdownNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [billingSnapshot.data?.subscription?.status, billingSnapshot.data?.subscription?.trial_ends_at]);
  const isDark = themeMounted && resolvedTheme === "dark";
  const setAvailability = useSetMyAvailability({
    onError: (error) => {
      toast({
        title: "Não foi possível mudar o status",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const currentAvailability = availabilityMeta(profile?.availability);
  const showAvailabilityToggle = profile?.role === "atendimento";
  const activeTenantId = tenantContext.data?.current_tenant_id ?? null;
  const selectedTenantId = tenantContext.data?.selected_tenant_id ?? null;
  const activeTenantName =
    tenantsQuery.data?.find((tenant) => tenant.tenant_id === activeTenantId)?.nome ?? "Acesso atual";
  const tenantSelectorBusy = tenantContext.isFetching || tenantsQuery.isFetching || setTenantContext.isPending;
  const trialEndsAt = billingSnapshot.data?.subscription?.trial_ends_at;
  const trialTimeLeft =
    billingSnapshot.data?.subscription?.status === "trialing" && trialEndsAt
      ? formatTrialTimeLeft(new Date(trialEndsAt).getTime() - countdownNow)
      : null;

  const initials =
    profile?.nome
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  return (
    <aside
      data-expanded={expanded}
      className={cn("group/sidebar relative z-40 hidden h-[100dvh] shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-3 text-sidebar-foreground md:flex", expanded ? "w-[208px]" : "w-[64px]")}
      aria-label="Navegacao principal"
    >
      <NavLink to="/inbox" aria-label="AdvocaCHAT, início" className="mx-2 mb-4 flex h-11 shrink-0 items-center justify-center gap-2 rounded-md text-sidebar-foreground group-data-[expanded=true]/sidebar:justify-start group-data-[expanded=true]/sidebar:px-3"><Scale strokeWidth={1.5} className="h-6 w-6 shrink-0 text-sidebar-primary" aria-hidden /><span className="hidden text-base font-semibold tracking-tight group-data-[expanded=true]/sidebar:block">AdvocaCHAT</span></NavLink>

      <div className="mb-3 px-2">
        <SidebarTooltip label={expanded ? "Recolher menu" : "Expandir menu"}>
          <button type="button" onClick={toggleSidebar} aria-expanded={expanded}
            aria-controls="app-sidebar-navigation" aria-label={expanded ? "Recolher menu" : "Expandir menu"}
            className="flex h-9 w-full items-center justify-center gap-3 rounded-md border border-sidebar-border text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[expanded=true]/sidebar:justify-start group-data-[expanded=true]/sidebar:px-3">
            {expanded ? <PanelLeftClose className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden /> : <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />}
            <span className="hidden text-xs group-data-[expanded=true]/sidebar:block">Recolher menu</span>
          </button>
        </SidebarTooltip>
      </div>
      <div id="app-sidebar-navigation" className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 group-data-[expanded=true]/sidebar:items-stretch">
        {!permissionsLoading
          ? primaryItems
              .filter((item) => !item.permission || can(item.permission, "view"))
              .map((item) => <RailNavLink key={item.url} item={item} pathname={pathname} />)
          : null}
      </div>


      <div className="flex shrink-0 flex-col items-center gap-2 border-t border-sidebar-border px-2 pb-1 pt-3 group-data-[expanded=true]/sidebar:items-stretch">
        <DropdownMenu>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="relative flex h-10 w-10 items-center justify-center gap-3 rounded-md group-data-[expanded=true]/sidebar:w-full group-data-[expanded=true]/sidebar:justify-start group-data-[expanded=true]/sidebar:px-3 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  aria-label="Minha conta"
                >
                  <Avatar className="h-8 w-8 border border-border">
                    {profile?.avatar ? <AvatarImage src={profile.avatar} alt="" /> : null}
                    <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden min-w-0 flex-1 truncate text-left text-sm group-data-[expanded=true]/sidebar:block">{profile?.nome ?? "Minha conta"}</span>
                  {showAvailabilityToggle ? (
                    <span
                      className={cn(
                        "absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-sidebar group-data-[expanded=true]/sidebar:static group-data-[expanded=true]/sidebar:shrink-0",
                        currentAvailability.dotClass,
                      )}
                      aria-label={`Status: ${currentAvailability.label}`}
                    />
                  ) : null}
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" className="border-border bg-primary text-primary-foreground">
              {profile?.nome ?? "Conta"}
              {showAvailabilityToggle ? ` · ${currentAvailability.label}` : ""}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="end" className="w-72">
            {isPlatformAdmin ? (
              <>
                <DropdownMenuItem
                  className="font-medium text-primary focus:text-primary"
                  onSelect={() => navigate("/admin/operacao")}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Meu painel SUPERADMIN
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {trialTimeLeft ? (
              <>
                <div className="px-2 py-2">
                  <div className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2.5">
                    <Hourglass className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-primary">Teste grátis</p>
                      <p className="text-sm font-medium text-foreground">{trialTimeLeft}</p>
                    </div>
                  </div>
                </div>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {showAvailabilityToggle ? (
              <>
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                  Meu status
                </DropdownMenuLabel>
                {AVAILABILITY_OPTIONS.map((opt) => {
                  const active = currentAvailability.value === opt.value;
                  return (
                    <DropdownMenuItem
                      key={opt.value}
                      disabled={setAvailability.isPending}
                      onSelect={() => {
                        if (active) return;
                        void setAvailability.mutateAsync(opt.value);
                      }}
                      className="flex items-start gap-2"
                    >
                      <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", opt.dotClass)} />
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{opt.description}</span>
                      </span>
                      {active ? <Check className="mt-1 h-4 w-4 text-primary" /> : null}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
              </>
            ) : null}
            {isPlatformAdmin ? (
              <>
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                  Empresa ativa
                </DropdownMenuLabel>
                <div className="px-2 pb-2">
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-2">
                    <Building2 className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{activeTenantName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {selectedTenantId ? "Empresa selecionada no modo SUPERADMIN" : "Acesso padrão da conta"}
                      </p>
                    </div>
                  </div>
                </div>
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                  Selecionar empresa
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={activeTenantId ?? ""}
                  onValueChange={(value) => {
                    if (!value || value === activeTenantId) return;
                    void setTenantContext.mutateAsync(value).then(() => {
                      window.location.reload();
                    });
                  }}
                >
                  {(tenantsQuery.data ?? []).map((tenant) => (
                    <DropdownMenuRadioItem
                      key={tenant.tenant_id}
                      value={tenant.tenant_id}
                      disabled={tenantSelectorBusy}
                      className="truncate"
                    >
                      {tenant.nome}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={tenantSelectorBusy || !selectedTenantId}
                  onSelect={() => {
                    if (!selectedTenantId) return;
                    void setTenantContext.mutateAsync(null).then(() => {
                      window.location.reload();
                    });
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Voltar para meu acesso
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onSelect={() => navigate("/configuracoes?aba=perfil")}>
              <UserCog strokeWidth={1.5} className="mr-2 h-4 w-4" />
              Minha conta
            </DropdownMenuItem>
            {can("configuracoes", "view") ? (
              <DropdownMenuItem onSelect={() => navigate("/configuracoes")}>
                <Settings2 strokeWidth={1.5} className="mr-2 h-4 w-4" aria-hidden />
                Configurações
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => setTheme(isDark ? "light" : "dark")}>
              {isDark ? <Sun strokeWidth={1.5} className="mr-2 h-4 w-4" aria-hidden /> : <Moon strokeWidth={1.5} className="mr-2 h-4 w-4" aria-hidden />}
              {isDark ? "Tema claro" : "Tema escuro"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={async () => {
              await signOut();
              navigate("/login");
            }}>
              <LogOut strokeWidth={1.5} className="mr-2 h-4 w-4" aria-hidden />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </aside>
  );
}
