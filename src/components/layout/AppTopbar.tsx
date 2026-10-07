import { Scale, Search, Moon, Sun } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useWhatsappInstances } from "@/lib/api/whatsapp";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const sections = [
  { title: "Clientes", url: "/clientes", permission: "clientes" },
  { title: "Oportunidades", url: "/crm", permission: "crm" },
  { title: "Agenda", url: "/agenda", permission: "agenda" },
  { title: "Casos", url: "/casos" },
  { title: "Relatórios", url: "/relatorios", permission: "relatorios" },
] as const;

export function AppTopbar() {
  const { can, isLoading } = useRolePermissions();
  const { resolvedTheme, setTheme } = useTheme();
  const { pathname } = useLocation();
  const isInbox = pathname === "/inbox" || pathname.startsWith("/inbox/");
  const instances = useWhatsappInstances({ enabled: isInbox });
  const connectedChannels = (instances.data ?? []).filter((instance) => instance.status === "connected");

  return (
    <header className="app-topbar">
      <NavLink to="/inbox" className="app-topbar-brand" aria-label="AdvocaCHAT, início">
        <Scale size={29} strokeWidth={1.5} aria-hidden /><span>AdvocaCHAT</span>
      </NavLink>
      <nav className="app-topbar-nav" aria-label="Áreas de trabalho">
        {!isLoading && sections.filter(item => !("permission" in item) || can(item.permission, "view")).map(item => (
          <NavLink key={item.url} to={item.url} className="app-topbar-link">{item.title}</NavLink>
        ))}
      </nav>
      {isInbox ? (
        <div className="app-topbar-channels" aria-label={`${connectedChannels.length} canais conectados`}>
          <span className="app-topbar-channels-label">Canais</span>
          <div className="app-topbar-channel-stack">
            {connectedChannels.slice(0, 6).map((channel) => {
              const initials = channel.displayName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join("") || "WA";
              const description = [channel.displayName, channel.phoneNumber].filter(Boolean).join(" · ");

              return (
                <Tooltip key={channel.id} delayDuration={150}>
                  <TooltipTrigger asChild>
                    <span className="app-topbar-channel-avatar" aria-label={`${description}, conectado`}>
                      <Avatar className="h-10 w-10 border-2 border-background bg-card shadow-sm">
                        {channel.avatarUrl ? <AvatarImage src={channel.avatarUrl} alt={channel.displayName} /> : null}
                        <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="app-topbar-channel-online" aria-hidden />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">{channel.displayName}</p>
                    <p className="text-xs opacity-80">{channel.phoneNumber || "Canal conectado"}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {connectedChannels.length > 6 ? (
              <span className="app-topbar-channel-more" aria-label={`Mais ${connectedChannels.length - 6} canais conectados`}>
                +{connectedChannels.length - 6}
              </span>
            ) : null}
            {!instances.isLoading && connectedChannels.length === 0 ? (
              <span className="app-topbar-channels-empty">Nenhum conectado</span>
            ) : null}
          </div>
        </div>
      ) : null}
      <button type="button" className="app-round-action" aria-label="Buscar no aplicativo" onClick={() => window.dispatchEvent(new CustomEvent("advocachat:open-search"))}>
        <Search size={20} strokeWidth={1.5} aria-hidden />
      </button>
      <button type="button" className="app-round-action" aria-label={resolvedTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
        {resolvedTheme === "dark" ? <Sun size={20} strokeWidth={1.5} aria-hidden /> : <Moon size={20} strokeWidth={1.5} aria-hidden />}
      </button>
    </header>
  );
}
