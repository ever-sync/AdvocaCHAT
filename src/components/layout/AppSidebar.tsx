import {
  Bot,
  Briefcase,
  CalendarDays,
  Check,
  Building2,
  Gauge,
  LogOut,
  Megaphone,
  MessageCircle,
  Moon,
  Package,
  Settings2,
  Sun,
  RotateCcw,
  ShieldCheck,
  UserCog,
  Users2,
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
  icon: React.ComponentType<{ className?: string }>;
  permission?: "inbox" | "crm" | "agenda" | "clientes" | "produtos" | "relatorios" | "marketing" | "ia" | "configuracoes";
};

const primaryItems: MenuItem[] = [
  { title: "Chat", url: "/inbox", icon: MessageCircle, permission: "inbox" },
  { title: "Casos jurídicos", url: "/casos", icon: Scale },
  { title: "Meu dia jurídico", url: "/juridico/meu-dia", icon: CalendarDays },
  { title: "CRM", url: "/crm", icon: Briefcase, permission: "crm" },
  { title: "Agenda", url: "/agenda", icon: CalendarDays, permission: "agenda" },
  { title: "Clientes", url: "/clientes", icon: Users2, permission: "clientes" },
  { title: "Produtos", url: "/produtos", icon: Package, permission: "produtos" },
  { title: "Documentos", url: "/documentos", icon: FileText, permission: "crm" },
  { title: "Painel", url: "/painel", icon: Gauge, permission: "relatorios" },
  { title: "Marketing", url: "/marketing", icon: Megaphone, permission: "marketing" },
  { title: "Agente IA", url: "/agente-ia", icon: Bot, permission: "ia" },
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
          "flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-150",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-wchat-100 hover:text-primary",
        )}
        activeClassName=""
      >
        <item.icon className="h-5 w-5" aria-hidden />
      </NavLink>
    </SidebarTooltip>
  );
}

export function AppSidebar() {
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

  const isSettingsActive = pathname === "/configuracoes" || pathname.startsWith("/configuracoes/");
  const initials =
    profile?.nome
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  return (
    <aside
      className="relative z-50 hidden h-[100dvh] w-[60px] shrink-0 flex-col border-r border-border bg-card py-3 md:flex"
      aria-label="Navegacao principal"
    >
      <div className="pt-2" />

      <div className="flex flex-col items-center gap-1 px-2">
        {!permissionsLoading
          ? primaryItems
              .filter((item) => !item.permission || can(item.permission, "view"))
              .map((item) => <RailNavLink key={item.url} item={item} pathname={pathname} />)
          : null}
      </div>

      <div className="min-h-0 flex-1" aria-hidden />

      <div className="flex flex-col items-center gap-2 px-2 pb-1">
        <DropdownMenu>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-wchat-100 hover:text-primary"
                  aria-label="Minha conta"
                >
                  <Avatar className="h-8 w-8 border border-border">
                    {profile?.avatar ? <AvatarImage src={profile.avatar} alt="" /> : null}
                    <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  {showAvailabilityToggle ? (
                    <span
                      className={cn(
                        "absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-card",
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
              <UserCog className="mr-2 h-4 w-4" />
              Minha conta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {can("configuracoes", "view") ? (
          <SidebarTooltip label="Configuracoes">
            <NavLink
              to="/configuracoes"
              title="Configuracoes"
              aria-label="Configuracoes"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-150",
                isSettingsActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-wchat-100 hover:text-primary",
              )}
              activeClassName=""
            >
              <Settings2 className="h-5 w-5" aria-hidden />
            </NavLink>
          </SidebarTooltip>
        ) : null}

        <SidebarTooltip label={isDark ? "Modo claro" : "Modo escuro"}>
          <button
            type="button"
            title={isDark ? "Modo claro" : "Modo escuro"}
            aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
            aria-pressed={isDark}
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-wchat-100 hover:text-primary"
          >
            {isDark ? (
              <Sun className="h-[18px] w-[18px]" aria-hidden />
            ) : (
              <Moon className="h-[18px] w-[18px]" aria-hidden />
            )}
          </button>
        </SidebarTooltip>

        <SidebarTooltip label="Sair">
          <button
            type="button"
            title="Sair"
            aria-label="Sair"
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </SidebarTooltip>
      </div>
    </aside>
  );
}
