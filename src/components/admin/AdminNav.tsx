import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const ADMIN_TABS = [
  { to: "/admin/operacao", label: "Operação" },
  { to: "/admin/billing", label: "Assinaturas" },
  { to: "/admin/planos", label: "Planos" },
  { to: "/admin/ia", label: "IA" },
] as const;

export function AdminNav() {
  const { pathname } = useLocation();

  return (
    <nav className="flex flex-wrap gap-2 border-b pb-3">
      {ADMIN_TABS.map((tab) => {
        const active = pathname === tab.to || pathname.startsWith(`${tab.to}/`);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
