import { ListOrdered, Network, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type CollaboratorsSettingsSection = "usuarios" | "times" | "permissoes" | "fila";

const SECTIONS: {
  id: CollaboratorsSettingsSection;
  label: string;
  icon: typeof Users;
}[] = [
  { id: "usuarios", label: "Usuarios", icon: Users },
  { id: "times", label: "Times", icon: Network },
  { id: "permissoes", label: "Permissoes", icon: ShieldCheck },
  { id: "fila", label: "Fila de atendimento", icon: ListOrdered },
];

export function parseCollaboratorsSectionParam(
  value: string | null,
): CollaboratorsSettingsSection {
  if (value === "permissoes" || value === "fila" || value === "usuarios" || value === "times") {
    return value;
  }
  return "usuarios";
}

type CollaboratorsSectionNavProps = {
  value: CollaboratorsSettingsSection;
  onChange: (section: CollaboratorsSettingsSection) => void;
};

export function CollaboratorsSectionNav({ value, onChange }: CollaboratorsSectionNavProps) {
  return (
    <nav
      className="flex w-full shrink-0 flex-col gap-1 rounded-2xl border border-border/60 bg-card/80 p-1 lg:w-56"
      aria-label="Secoes de colaboradores"
    >
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const active = value === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onChange(section.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
