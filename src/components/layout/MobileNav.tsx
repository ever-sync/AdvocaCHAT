import {
  Briefcase,
  CalendarDays,
  LogOut,
  Menu,
  Megaphone,
  MessageSquare,
  Package,
  Settings2,
  UserCog,
  UserRound,
  Users2,
  FileText,
  FolderOpen,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { cn } from "@/lib/utils";

type NavIcon = typeof MessageSquare;

const linkItems: { title: string; url: string; icon: NavIcon; permission?: "inbox" | "crm" | "agenda" | "clientes" | "produtos" | "marketing" | "configuracoes" }[] = [
  { title: "Chat", url: "/inbox", icon: MessageSquare, permission: "inbox" },
  { title: "Casos jurídicos", url: "/casos", icon: FolderOpen },
  { title: "Meu dia jurídico", url: "/juridico/meu-dia", icon: CalendarDays },
  { title: "CRM", url: "/crm", icon: Briefcase, permission: "crm" },
  { title: "Agenda", url: "/agenda", icon: CalendarDays, permission: "agenda" },
  { title: "Clientes", url: "/clientes", icon: Users2, permission: "clientes" },
  { title: "Produtos", url: "/produtos", icon: Package, permission: "produtos" },
  { title: "Documentos", url: "/documentos", icon: FileText, permission: "crm" },
  { title: "Marketing", url: "/marketing", icon: Megaphone, permission: "marketing" },
  { title: "Ajustes", url: "/configuracoes", icon: Settings2, permission: "configuracoes" },
];

function pathMatches(pathname: string, url: string) {
  if (url === "/crm") return pathname === url;
  return pathname === url || pathname.startsWith(`${url}/`);
}

function MobileNavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: (typeof linkItems)[number];
  pathname: string;
  onNavigate?: () => void;
}) {
  const isActive = pathMatches(pathname, item.url);

  return (
    <SheetClose asChild>
      <NavLink
        to={item.url}
        end={item.url === "/crm"}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-md border px-3 py-3 text-sm font-medium transition-colors",
          isActive
            ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
            : "border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground",
        )}
        activeClassName=""
      >
        <item.icon className="h-5 w-5 shrink-0" aria-hidden />
        <span>{item.title}</span>
      </NavLink>
    </SheetClose>
  );
}

export function MobileNav() {
  const pathname = useLocation().pathname;
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { can, isLoading: permissionsLoading } = useRolePermissions();
  const activeItem = linkItems.find((item) => pathMatches(pathname, item.url));
  const initials =
    profile?.nome
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";

  return (
    <header
      className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:hidden"
      aria-label="Navegação principal"
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(88vw,20rem)] gap-0 p-0" disableInnerScroll>
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-border px-4 pb-4 pt-6 text-left">
                <SheetTitle className="text-base">Menu</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  Acesse as áreas principais do sistema.
                </p>
              </SheetHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-2">
                  {!permissionsLoading
                    ? linkItems
                        .filter((item) => !item.permission || can(item.permission, "view"))
                        .map((item) => (
                          <MobileNavLink key={item.url} item={item} pathname={pathname} />
                        ))
                    : null}
                </div>
              </div>

              <div className="border-t border-border p-4">
                <SheetClose asChild>
                  <button
                    type="button"
                    onClick={async () => {
                      await signOut();
                      navigate("/login");
                    }}
                    className="flex w-full items-center gap-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="h-5 w-5 shrink-0" aria-hidden />
                    Sair
                  </button>
                </SheetClose>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">
            {activeItem?.title ?? "AdvocaCHAT"}
          </p>
          <p className="truncate text-xs text-sidebar-foreground/75">
            {activeItem ? "AdvocaCHAT" : "Navegação principal"}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative h-10 w-10 shrink-0 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-label="Minha conta"
            >
              <Avatar className="h-8 w-8 border border-border">
                {profile?.avatar ? <AvatarImage src={profile.avatar} alt="" /> : null}
                <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {profile?.nome ?? "Minha conta"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/configuracoes?aba=perfil")}>
              <UserCog className="mr-2 h-4 w-4" />
              Minha conta
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={async () => {
                await signOut();
                navigate("/login");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
