import { Clock, ListChecks, MessageSquare, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatConfigSettingsSection = "respostas" | "etiquetas" | "tarefas" | "horario";

const SECTIONS: {
  id: ChatConfigSettingsSection;
  label: string;
  icon: typeof MessageSquare;
}[] = [
  { id: "respostas", label: "Respostas rápidas", icon: MessageSquare },
  { id: "etiquetas", label: "Etiquetas", icon: Tag },
  { id: "tarefas", label: "Tarefas", icon: ListChecks },
  { id: "horario", label: "Horário & SLA", icon: Clock },
];

export function parseChatConfigSectionParam(
  value: string | null,
): ChatConfigSettingsSection {
  if (value === "etiquetas" || value === "respostas" || value === "tarefas" || value === "horario") {
    return value;
  }
  return "respostas";
}

type ChatConfigSectionNavProps = {
  value: ChatConfigSettingsSection;
  onChange: (section: ChatConfigSettingsSection) => void;
};

export function ChatConfigSectionNav({ value, onChange }: ChatConfigSectionNavProps) {
  return (
    <nav
      className="flex shrink-0 flex-row flex-wrap gap-1 rounded-2xl border border-border/60 bg-card/80 p-1 lg:w-60 lg:flex-col lg:flex-nowrap"
      aria-label="Secoes de configuracao do chat"
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
              "flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors lg:flex-none lg:w-full",
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
