import { Scale, Search, Moon, Sun } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useTheme } from "next-themes";
import { useRolePermissions } from "@/hooks/useRolePermissions";

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
      <button type="button" className="app-round-action" aria-label="Buscar no aplicativo" onClick={() => window.dispatchEvent(new CustomEvent("advocachat:open-search"))}>
        <Search size={20} strokeWidth={1.5} aria-hidden />
      </button>
      <button type="button" className="app-round-action" aria-label={resolvedTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
        {resolvedTheme === "dark" ? <Sun size={20} strokeWidth={1.5} aria-hidden /> : <Moon size={20} strokeWidth={1.5} aria-hidden />}
      </button>
    </header>
  );
}
